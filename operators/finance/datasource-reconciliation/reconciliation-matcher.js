/**
 * 财务对账 - 智能匹配算法（含预处理逻辑，单文件可独立运行于 JS 脚本执行器）
 * 源自《财务智能对账系统实现方案》4.3 节
 *
 * 匹配规则（入参顺序无关，基准/对账文件可任意放第一或第二参数）：
 * 1. 第一轮：精确匹配（金额完全一致，日期相近，得分≥95）
 * 2. 第二轮a：一对多（第一参1笔 = 第二参多笔金额之和）
 * 3. 第二轮b：多对一（第一参多笔金额之和 = 第二参1笔）
 * 4. 第三轮：模糊匹配（考虑容差，得分≥minMatchScore）
 * 5. 第四轮：在第三轮之后，同号且金额一致（±amountTolerance）、日期差≤dateTolerance 的剩余记录，
 *    记为 FUZZY，matchScore 固定为 minMatchScore（文本弱一致时的兜底）
 *
 * 记录格式要求（与 reconciliation-standardizer 输出一致）：
 * - id: 可选，用于追踪
 * - transactionDate: 日期，支持 Date 对象或 'YYYY-MM-DD' 字符串
 * - amount: 金额（正数=收入，负数=支出）
 * - counterpartyName: 对方户名
 * - summary: 摘要
 */

// ============ 预处理：从 summary 解析对方户名、ETC 车辆 ID ============
/** 全国各省车牌/通行费 ID：省简称 + 字母数字。含备选：滇(云)、秦(陕)、陇(甘)、台(台湾)。
 * 如：浙FQ1234、沪BJW108、京A12345、粤B12345 */
const ETC_VEHICLE_PATTERN = /([京津冀晋蒙辽吉黑沪苏浙皖闽赣鲁豫鄂湘粤桂琼川贵云滇藏陕秦甘陇青宁新渝台][A-Z0-9]{4,8})/;
/** 批量扣款类关键词：财务摘要多为"公积金XXX"，银行对方为公积金中心，双方摘要均含关键词即可视为同类；结息-农商/结息同理 */
/** 货款认领等：双方均含货款时视为同类（上海业丰纸盒货款认领 ↔ 上海业丰印务货款） */
const BATCH_DEDUCTION_KEYWORDS = ['公积金', '社保', '个税', '通讯费', '移动电话费', '工会经费', '税费', '平湖电力批扣', '平湖水费批扣', '结息', '货款'];
const SUMMARY_KEYWORDS = [
  '水、电费', '水电费', '电费', '房租', '房租费', '货款', '采购款', '工资', '工资发放',
  '公积金', '个税', '通讯费', '移动电话费', '工会经费', '社保', '税费', '结息', '结息-',
  '承兑', '承兑到期托收', '印花税', '蒸汽费', '水费', '彩盒', '消防证培训', '福利费',
  '平湖电力批扣', '平湖水费批扣', '代理ETC', '浙FQ', '浙FDM', '货款-', '汇票',
];

function extractCounterpartyFromSummary(summary, existingCounterparty) {
  const existing = String(existingCounterparty ?? '').trim();
  if (existing) return existing;
  const s = String(summary ?? '').trim();
  if (!s) return '';
  let cleaned = s.replace(/\s*\([0-9A-Za-z]+\)\s*$/, '').trim();
  if (!cleaned) return '';
  const slashMatch = cleaned.match(/^(.+?)\s*[／\/]\s*(.+)$/);
  if (slashMatch) {
    const left = slashMatch[1].trim();
    const right = slashMatch[2].trim();
    if (right.length >= 2 && right.length <= 50) return right;
    if (left.length >= 2 && left.length <= 50) return left;
  }
  for (const kw of SUMMARY_KEYWORDS) {
    const idx = cleaned.indexOf(kw);
    if (idx > 0) {
      const before = cleaned.slice(0, idx).trim();
      if (before.length >= 2 && before.length <= 50) {
        const result = before.replace(/[、,，\-]\s*$/, '');
        if (!/^[\d月份]+$/.test(result)) return result;
      }
    }
  }
  if (cleaned.length >= 2 && cleaned.length <= 40 && !/^\d/.test(cleaned)) {
    if (/(有限公司|股份|中心|分行|材料|包装|食品|动漫|纸箱)$/.test(cleaned)) return cleaned;
    if (cleaned.length <= 10 && !/[\d()（）]/.test(cleaned)) return cleaned;
  }
  return '';
}

function enrichCounterparty(record) {
  if (!record || typeof record !== 'object') return record;
  const name = record.counterpartyName ?? record.counterparty_name ?? '';
  const summary = record.summary ?? '';
  const extracted = extractCounterpartyFromSummary(summary, name);
  return {
    ...record,
    counterpartyName: extracted || name,
    counterparty_name: extracted || name,
  };
}

/**
 * 拼接记录中可能含 ETC 车牌的字段，用于 ONE_TO_MANY/MANY_TO_ONE 匹配。
 * 摘要、对方户名、流水号等任一字段包含车牌即视为匹配（OR 逻辑）。
 * 如：对方户名无沪BJW108、但摘要含 "2072,沪BJW108;上海市..." 即可匹配。
 */
function getEtcSearchText(record) {
  return [
    record?.summary ?? '',
    record?.counterpartyName ?? '',
    record?.counterparty_name ?? '',
    record?.reference_number ?? record?.referenceNumber ?? '',
  ].join(' ');
}

function extractEtcVehicleId(record, pattern = ETC_VEHICLE_PATTERN) {
  if (!record) return null;
  const text = getEtcSearchText(record);
  const m = text.match(pattern);
  return m ? m[1] : null;
}

function recordMatchesEtcVehicle(record, vehicleId) {
  if (!vehicleId) return true;
  const text = getEtcSearchText(record);
  return text.includes(vehicleId);
}

/** 基准账有 ETC 车牌时，对账侧候选：含车牌 或 含"通行费"（银行可能不写车牌） */
function recordMatchesEtcOrToll(record, vehicleId, baselineHasToll) {
  if (!vehicleId) return true;
  const text = getEtcSearchText(record);
  if (text.includes(vehicleId)) return true;
  if (baselineHasToll && text.includes('通行费')) return true;
  return false;
}

/**
 * 子集和搜索：从候选中找出金额之和等于目标（容差内）且数量>=minSize 的子集
 * 用于 ONE_TO_MANY：基准账 1 笔 = 对账侧多笔之和（如 ETC 沪BJW108通行费 = 多条沪BJW108 高速扣费之和）
 * 贪心顺序可能漏匹配，子集和可找到正确组合
 * @param {Array<{r: object, idx: number}>} candidates
 * @param {number} targetAmount
 * @param {number} tolerance
 * @param {number} minSize
 * @returns {Array<{r: object, idx: number}>|null}
 */
function popcount32(mask) {
  let c = 0;
  for (let t = mask >>> 0; t; t &= t - 1) c++;
  return c;
}

function findSubsetSum(candidates, targetAmount, tolerance, minSize = 2) {
  if (!candidates || candidates.length < minSize) return null;
  const n = candidates.length;
  // 快速路径：候选金额总和等于目标时直接返回（ETC 一对多常见：基准账1笔=对账侧多笔之和）
  const totalSum = candidates.reduce((s, c) => s + Math.abs(c.r?.amount ?? 0), 0);
  if (n >= minSize && Math.abs(totalSum - targetAmount) <= tolerance) return candidates;
  const maxIter = Math.min(1 << n, 65536); // 提高上限以支持更多候选（如 16 个候选=65536）
  for (let mask = (1 << minSize) - 1; mask < maxIter; mask++) {
    if (popcount32(mask) < minSize) continue;
    let sum = 0;
    const picked = [];
    for (let i = 0; i < n && picked.length < 20; i++) {
      if (mask & (1 << i)) {
        const item = candidates[i];
        sum += Math.abs(item.r?.amount ?? 0);
        picked.push(item);
      }
    }
    if (picked.length >= minSize && Math.abs(sum - targetAmount) <= tolerance) {
      return picked;
    }
  }
  return null;
}

// ============ 匹配核心 ============
/**
 * 计算两个日期的天数差（绝对值）
 * 使用 Date.parse 获取时间戳，兼容严格沙箱环境
 * @param {Date|string} date1
 * @param {Date|string} date2
 * @returns {number}
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysDiff(date1, date2) {
  let ts1;
  let ts2;
  if (date1 && typeof date1 === 'object' && Number.isFinite(date1.__tsMs)) {
    ts1 = date1.__tsMs;
  } else {
    ts1 = date1 instanceof Date ? date1.getTime() : Date.parse(String(date1));
  }
  if (date2 && typeof date2 === 'object' && Number.isFinite(date2.__tsMs)) {
    ts2 = date2.__tsMs;
  } else {
    ts2 = date2 instanceof Date ? date2.getTime() : Date.parse(String(date2));
  }
  return Math.abs(Math.floor((ts1 - ts2) / MS_PER_DAY));
}

/**
 * 标准化单条记录字段名，兼容 snake_case 与 camelCase
 * @param {object} record
 * @returns {object}
 */
function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    transactionDate: record.transactionDate ?? record.transaction_date,
    counterpartyName: record.counterpartyName ?? record.counterparty_name,
  };
}

/** 脚本执行器内匹配用：缓存日期时间戳，避免热路径反复 Date.parse */
function normalizeRecordForMatch(record) {
  const n = normalizeRecord(record);
  if (!n || typeof n !== 'object') return n;
  const td = n.transactionDate;
  const ts = td instanceof Date ? td.getTime() : Date.parse(String(td ?? ''));
  n.__tsMs = Number.isFinite(ts) ? ts : NaN;
  return n;
}

/** 双行 DP，结果与完整矩阵版 Levenshtein 一致 */
function levenshteinDistance(str1, str2) {
  const s1 = str1.length >= str2.length ? str1 : str2;
  const s2 = str1.length >= str2.length ? str2 : str1;
  const n = s1.length;
  const m = s2.length;
  if (m === 0) return n;
  let prev = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1);
    cur[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      cur[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
    prev = cur;
  }
  return prev[m];
}

function calculateTextSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  if (longer.length === 0) return 1.0;
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * 创建匹配器（纯函数实现，适用于严格沙箱环境）
 * @param {object} [config] - 配置 { amountTolerance, dateTolerance, minMatchScore }
 * @returns {{ matchRecords: function }}
 */
function createMatcher(config = {}) {
  const cfg = {
    amountTolerance: config.amountTolerance ?? 0.01,
    dateTolerance: config.dateTolerance ?? 32,
    minMatchScore: config.minMatchScore ?? 70,
    ...config,
  };

  function finalizeMatchScore(score) {
    return Math.round(Math.min(100, score));
  }

  /**
   * @param {{ mode?: 'exact'|'fuzzy', beatScore?: number }} [opts]
   */
  function calculateMatchScore(baselineRecord, targetRecord, opts) {
    const scoreMode = opts && opts.mode;
    const fuzzyBeatScore = opts && opts.beatScore;
    let score = 0;
    const amountDiff = Math.abs(
      Math.abs(baselineRecord.amount) - Math.abs(targetRecord.amount)
    );
    const sameSign =
      (baselineRecord.amount >= 0 && targetRecord.amount >= 0) ||
      (baselineRecord.amount < 0 && targetRecord.amount < 0);
    const amountScore = amountDiff <= cfg.amountTolerance ? 40
      : amountDiff <= cfg.amountTolerance * 10
        ? 40 * (1 - amountDiff / (cfg.amountTolerance * 10))
        : 0;
    score += sameSign ? amountScore : 0;
    const dateDiff = daysDiff(
      baselineRecord.transactionDate,
      targetRecord.transactionDate
    );
    if (dateDiff === 0) {
      score += 30;
    } else if (dateDiff <= cfg.dateTolerance) {
      score += 30 * (1 - dateDiff / cfg.dateTolerance);
    }

    // 批量扣款等加分（仅 includes，无 Levenshtein）提前算，便于剪枝
    if (
      amountDiff <= cfg.amountTolerance &&
      dateDiff <= cfg.dateTolerance &&
      sameSign
    ) {
      const bankText = `${baselineRecord.summary ?? ''} ${baselineRecord.counterpartyName ?? ''}`.trim();
      const accText = `${targetRecord.summary ?? ''} ${targetRecord.counterpartyName ?? ''}`.trim();
      for (const kw of BATCH_DEDUCTION_KEYWORDS) {
        if (bankText.includes(kw) && accText.includes(kw)) {
          score += 15;
          break;
        }
      }
      if ((bankText.includes('手续费') || bankText.includes('收费')) &&
          (accText.includes('手续费') || accText.includes('收费'))) score += 15;
      if ((bankText.includes('手续费') || bankText.includes('收费')) &&
          (accText.includes('手续费') || accText.includes('收费'))) score += 15;
      const bankCp = String(baselineRecord.counterpartyName ?? '').trim();
      const accCp = String(targetRecord.counterpartyName ?? '').trim();
      const bankSum = String(baselineRecord.summary ?? '').trim();
      const accSum = String(targetRecord.summary ?? '').trim();
      if (bankCp.length >= 2 && accSum.includes(bankCp)) score += 15;
      else if (accCp.length >= 2 && bankSum.includes(accCp)) score += 15;
      else if (accCp.length >= 2 && bankCp.includes(accCp)) score += 10;
      else if (bankCp.length >= 2 && accCp.includes(bankCp)) score += 10;
      else if (bankSum.length >= 2 && accSum.length >= 2 &&
          (bankSum.includes(accSum) || accSum.includes(bankSum))) score += 15;
      if ((bankText.includes('油卡') || bankText.includes('油卡充值')) &&
          (accText.includes('石化') || accText.includes('石油') || accText.includes('中石化'))) score += 15;
      else if ((accText.includes('油卡') || accText.includes('油卡充值')) &&
          (bankText.includes('石化') || bankText.includes('石油') || bankText.includes('中石化'))) score += 15;
      if (bankCp.length >= 3 && accCp.length >= 3) {
        const shorter = bankCp.length <= accCp.length ? bankCp : accCp;
        const longer = bankCp.length > accCp.length ? bankCp : accCp;
        for (let len = 3; len <= Math.min(6, shorter.length); len++) {
          let found = false;
          for (let i = 0; i <= shorter.length - len; i++) {
            if (longer.includes(shorter.slice(i, i + len))) { found = true; break; }
          }
          if (found) { score += 15; break; }
        }
      }
    }

    const textCap =
      (baselineRecord.counterpartyName && targetRecord.counterpartyName ? 20 : 0) +
      (baselineRecord.summary && targetRecord.summary ? 10 : 0);

    if (scoreMode === 'exact') {
      if (score >= 95) return finalizeMatchScore(score);
      if (score + textCap < 95) return finalizeMatchScore(score);
    }

    if (scoreMode === 'fuzzy') {
      if (score + textCap < cfg.minMatchScore) {
        return finalizeMatchScore(score);
      }
      if (fuzzyBeatScore != null && score + textCap <= fuzzyBeatScore) {
        return 0;
      }
    }

    if (baselineRecord.counterpartyName && targetRecord.counterpartyName) {
      score += 20 * calculateTextSimilarity(
        baselineRecord.counterpartyName,
        targetRecord.counterpartyName
      );
    }
    if (baselineRecord.summary && targetRecord.summary) {
      score += 10 * calculateTextSimilarity(
        baselineRecord.summary,
        targetRecord.summary
      );
    }

    return finalizeMatchScore(score);
  }

  function calculateOneToManyMatchScore(baselineRecord, targetRecords) {
    const totalAmount = targetRecords.reduce(
      (sum, r) => sum + Math.abs(r.amount),
      0
    );
    const amountDiff = Math.abs(Math.abs(baselineRecord.amount) - totalAmount);
    let score = 0;
    if (amountDiff <= cfg.amountTolerance) {
      score += 50;
    } else {
      score += 50 * (1 - amountDiff / Math.abs(baselineRecord.amount));
    }
    const dateScores = targetRecords.map((ar) => {
      const diff = daysDiff(baselineRecord.transactionDate, ar.transactionDate);
      return diff === 0 ? 1 : Math.max(0, 1 - diff / cfg.dateTolerance);
    });
    const avgDateScore =
      dateScores.reduce((a, b) => a + b, 0) / dateScores.length;
    score += 30 * avgDateScore;
    const nameScores = targetRecords.map((ar) => {
      if (!baselineRecord.counterpartyName || !ar.counterpartyName) return 0;
      return calculateTextSimilarity(
        baselineRecord.counterpartyName,
        ar.counterpartyName
      );
    });
    const avgNameScore =
      nameScores.reduce((a, b) => a + b, 0) / nameScores.length;
    score += 20 * avgNameScore;
    return Math.round(score);
  }

  function calculateManyToOneMatchScore(baselineRecords, targetRecord) {
    return calculateOneToManyMatchScore(targetRecord, baselineRecords);
  }

  /**
   * 判断是否为冲正交易
   * 规则：金额为负 且 (摘要含"冲正"或"撤销" 或 (摘要含关键词 且 存在原交易记录))
   */
  function isReversalTransaction(baselineRecord, targetRecord, allBaselineRecords, allTargetRecords) {
    const hasNegativeAmount = baselineRecord.amount < 0 || targetRecord.amount < 0;
    if (!hasNegativeAmount) return false;

    const bankSummary = String(baselineRecord.summary ?? '');
    const accountingSummary = String(targetRecord.summary ?? '');

    // 摘要含"冲正"或"撤销" → 视为冲正
    if (bankSummary.includes('冲正') || bankSummary.includes('撤销') ||
        accountingSummary.includes('冲正') || accountingSummary.includes('撤销')) {
      return true;
    }

    // 摘要含其他关键词(红字/冲销/取消) 且 存在原交易记录 → 视为冲正
    const otherKeywords = ['红字', '冲销', '取消'];
    const hasOtherKeyword = otherKeywords.some(
      (kw) => bankSummary.includes(kw) || accountingSummary.includes(kw)
    );
    if (!hasOtherKeyword) return false;

    const absAmount = Math.abs(baselineRecord.amount) || Math.abs(targetRecord.amount);
    const excludeIds = new Set([baselineRecord.id, targetRecord.id].filter((id) => id != null && id !== ''));
    const hasOriginalTransaction = (list) =>
      (list || []).some((r) => {
        if (excludeIds.has(r.id)) return false;
        const abs = Math.abs(parseFloat(r.amount) || 0);
        const amountMatch = Math.abs(abs - absAmount) <= (cfg.amountTolerance ?? 0.01);
        const oppositeSign =
          (baselineRecord.amount < 0 && r.amount > 0) || (targetRecord.amount < 0 && r.amount > 0);
        return amountMatch && oppositeSign;
      });
    return hasOriginalTransaction(allBaselineRecords) || hasOriginalTransaction(allTargetRecords);
  }

  function doMatchRecords(baselineRecords, targetRecords) {
    const matches = [];
    const unmatchedBaselineAccount = (baselineRecords || []).map(normalizeRecordForMatch);
    const unmatchedTargetAccount = (targetRecords || []).map(normalizeRecordForMatch);

    // 第一轮：精确匹配（金额完全一致，日期相近）
    for (let i = unmatchedBaselineAccount.length - 1; i >= 0; i--) {
      const baselineRecord = unmatchedBaselineAccount[i];
      for (let j = unmatchedTargetAccount.length - 1; j >= 0; j--) {
        const targetRecord = unmatchedTargetAccount[j];
        const matchScore = calculateMatchScore(baselineRecord, targetRecord, { mode: 'exact' });
        if (matchScore >= 95) {
          matches.push({
            baselineRecord,
            targetRecord,
            matchScore,
            matchType: 'EXACT',
          });
          unmatchedBaselineAccount.splice(i, 1);
          unmatchedTargetAccount.splice(j, 1);
          break;
        }
      }
    }

    // 第二轮a：一对多（第一参1笔 = 第二参多笔之和）
    // 优先处理有 ETC 车牌的基准账（沪BJW108通行费等），避免被 etcVehicleId=null 的同金额记录抢先
    const baselineToProcess = [...unmatchedBaselineAccount].sort((a, b) => {
      const va = extractEtcVehicleId(a);
      const vb = extractEtcVehicleId(b);
      return (vb ? 1 : 0) - (va ? 1 : 0); // 有车牌的排前面
    });
    for (const baselineRecord of baselineToProcess) {
      if (!unmatchedBaselineAccount.includes(baselineRecord)) continue; // 已被前面匹配消耗
      const targetAmount = Math.abs(baselineRecord.amount);
      const etcVehicleId = extractEtcVehicleId(baselineRecord);
      const baselineHasToll = (baselineRecord.summary ?? '').includes('通行费');
      // 有车牌时严格按车牌匹配；无车牌时才用 通行费 兜底，避免 沪BJW108通行费 误匹配 上海公共交通卡 等
      const useStrictVehicle = !!etcVehicleId;
      const candidates = unmatchedTargetAccount
        .map((r, idx) => ({ r, idx }))
        .filter((item) => useStrictVehicle
          ? recordMatchesEtcVehicle(item.r, etcVehicleId)
          : recordMatchesEtcOrToll(item.r, etcVehicleId, baselineHasToll))
        .filter((item) => daysDiff(baselineRecord.transactionDate, item.r.transactionDate) <= cfg.dateTolerance);
      const found = findSubsetSum(candidates, targetAmount, cfg.amountTolerance, 2);
      if (found && found.length >= 2) {
        const records = found.map((m) => m.r);
        const indices = found.map((m) => m.idx).sort((a, b) => b - a);
        matches.push({
          baselineRecord,
          targetRecords: records,
          matchScore: calculateOneToManyMatchScore(baselineRecord, records),
          matchType: 'ONE_TO_MANY',
        });
        unmatchedBaselineAccount.splice(unmatchedBaselineAccount.indexOf(baselineRecord), 1);
        indices.forEach((idx) => unmatchedTargetAccount.splice(idx, 1));
      }
    }

    // 第二轮b：多对一（第一参多笔之和 = 第二参1笔）- 基准为日记账时适用
    // 当对账侧有 ETC 车牌时，仅考虑基准账中摘要或对方户名含该车牌的记录（分别匹配，任一包含即可）
    for (let i = unmatchedTargetAccount.length - 1; i >= 0; i--) {
      const targetRecord = unmatchedTargetAccount[i];
      const targetAmount = Math.abs(targetRecord.amount);
      const targetVehicleId = extractEtcVehicleId(targetRecord);
      const indicesByAmount = unmatchedBaselineAccount
        .map((r, idx) => ({ r, idx }))
        .filter((item) => !targetVehicleId || recordMatchesEtcVehicle(item.r, targetVehicleId))
        .sort((a, b) => Math.abs(b.r.amount) - Math.abs(a.r.amount));
      const matchedBank = [];
      let totalAmount = 0;
      for (const { r: baselineRecord, idx: j } of indicesByAmount) {
        const dateDiff = daysDiff(
          baselineRecord.transactionDate,
          targetRecord.transactionDate
        );
        if (dateDiff <= cfg.dateTolerance) {
          totalAmount += Math.abs(baselineRecord.amount);
          matchedBank.push({ record: baselineRecord, index: j });
          if (totalAmount > targetAmount + cfg.amountTolerance) break;
          if (
            matchedBank.length >= 2 &&
            Math.abs(Math.abs(targetRecord.amount) - totalAmount) <=
              cfg.amountTolerance
          ) {
            const records = matchedBank.map((m) => m.record);
            matches.push({
              baselineRecords: records,
              targetRecord,
              matchScore: calculateManyToOneMatchScore(records, targetRecord),
              matchType: 'MANY_TO_ONE',
            });
            unmatchedTargetAccount.splice(i, 1);
            matchedBank
              .sort((a, b) => b.index - a.index)
              .forEach((m) => unmatchedBaselineAccount.splice(m.index, 1));
            break;
          }
        }
      }
    }

    // 第三轮：模糊匹配（考虑容差）
    for (let i = unmatchedBaselineAccount.length - 1; i >= 0; i--) {
      const baselineRecord = unmatchedBaselineAccount[i];
      let bestMatch = null;
      let bestScore = 0;
      let bestIndex = -1;
      for (let j = unmatchedTargetAccount.length - 1; j >= 0; j--) {
        const targetRecord = unmatchedTargetAccount[j];
        const matchScore = calculateMatchScore(baselineRecord, targetRecord, {
          mode: 'fuzzy',
          beatScore: bestScore,
        });
        if (
          matchScore > bestScore &&
          matchScore >= cfg.minMatchScore
        ) {
          bestScore = matchScore;
          bestMatch = targetRecord;
          bestIndex = j;
        }
      }
      if (bestMatch) {
        const isReversal = isReversalTransaction(baselineRecord, bestMatch, baselineRecords, targetRecords);
        matches.push({
          baselineRecord,
          targetRecord: bestMatch,
          matchScore: bestScore,
          matchType: isReversal ? 'REVERSAL' : 'FUZZY',
        });
        unmatchedBaselineAccount.splice(i, 1);
        unmatchedTargetAccount.splice(bestIndex, 1);
      }
    }

    // 第四轮：模糊匹配之后，同号+金额一致+日期在容差内 → FUZZY，得分固定 minMatchScore
    function isFuzzyAmountDateFallbackPair(b, t) {
      const nb = parseFloat(String(b.amount ?? ''));
      const nt = parseFloat(String(t.amount ?? ''));
      if (!Number.isFinite(nb) || !Number.isFinite(nt)) return false;
      const sameSign =
        (nb > 0 && nt > 0) || (nb < 0 && nt < 0) || (nb === 0 && nt === 0);
      if (!sameSign) return false;
      if (Math.abs(nb - nt) > cfg.amountTolerance) return false;
      if (daysDiff(b.transactionDate, t.transactionDate) > cfg.dateTolerance) return false;
      return true;
    }
    for (let i = unmatchedBaselineAccount.length - 1; i >= 0; i--) {
      const baselineRecord = unmatchedBaselineAccount[i];
      for (let j = unmatchedTargetAccount.length - 1; j >= 0; j--) {
        const targetRecord = unmatchedTargetAccount[j];
        if (!isFuzzyAmountDateFallbackPair(baselineRecord, targetRecord)) continue;
        const isReversal = isReversalTransaction(
          baselineRecord,
          targetRecord,
          baselineRecords,
          targetRecords
        );
        matches.push({
          baselineRecord,
          targetRecord,
          matchScore: cfg.minMatchScore,
          matchType: isReversal ? 'REVERSAL' : 'FUZZY',
        });
        unmatchedBaselineAccount.splice(i, 1);
        unmatchedTargetAccount.splice(j, 1);
        break;
      }
    }

    return {
      matches,
      unmatchedBaselineAccount,
      unmatchedTargetAccount,
    };
  }

  return { matchRecords: doMatchRecords };
}

/**
 * 便捷方法：直接调用匹配（适用于严格沙箱环境）
 * @param {object[]} baselineRecords - 基准账记录
 * @param {object[]} targetRecords - 对账账记录
 * @param {object} [config] - 可选配置 { amountTolerance, dateTolerance, minMatchScore }
 * @returns {{ matches: object[], unmatchedBaselineAccount: object[], unmatchedTargetAccount: object[] }}
 */
function matchRecords(baselineRecords, targetRecords, config = {}) {
  const matcher = createMatcher(config);
  return matcher.matchRecords(baselineRecords, targetRecords);
}

// Node / 算子引用：require 本文件得到下列导出（脚本执行器需在函数体末尾自行 return matchRecords(parameters[0], parameters[1])）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { matchRecords, createMatcher };
}
