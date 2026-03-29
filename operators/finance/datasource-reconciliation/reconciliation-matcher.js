/**
 * 财务对账 - 智能匹配算法（含预处理逻辑，单文件可独立运行于 JS 脚本执行器）
 * 源自《财务智能对账系统实现方案》4.3 节
 *
 * 匹配规则（数据源对账算子会将两侧规范为「日记账 baseline、银行 target」再调用；直接调用本模块时建议保持该顺序，否则聚合轮次结果可能不同）：
 * 1. 第一轮：精确匹配（金额完全一致，日期相近，得分≥95）
 * 2. 第二轮：模糊匹配（考虑容差，得分≥minMatchScore）
 * 3. 第三轮：同号且金额一致（±amountTolerance）、日期差≤dateTolerance 的剩余记录 → FUZZY 兜底
 * 4. 第四轮a：一对多（子集和 + 分数/日期跨度门槛；非尾部时 maxSpread=min(dateTolerance, aggregateMaxDateSpreadDays)）
 * 5. 第四轮b：多对一，与第四轮 a 对称
 * 6. 第五轮：宽松一对多/多对一（门槛见 lateAggregate*，在未匹配池不超过 lateAggregateMaxUnmatched* 时执行）
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
const BATCH_DEDUCTION_KEYWORDS = ['公积金', '社保', '个税', '通讯费', '移动电话费', '工会经费', '税费', '平湖电力批扣', '平湖水费批扣', '结息', '货款', '通行费', '高速'];
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
    record?.referenceNumber ?? '',
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

/** 银行侧常见高速/ETC 扣款描述（无车牌时的宽松兜底，仍靠金额子集和约束） */
function recordLooksLikeHighwayToll(record) {
  const text = getEtcSearchText(record);
  return (
    text.includes('通行费') ||
    text.includes('高速') ||
    text.includes('ETC') ||
    text.includes('路网')
  );
}

function isEtcLikeBankRecord(record) {
  const t = getEtcSearchText(record);
  if (t.includes('代理ETC')) return true;
  return recordLooksLikeHighwayToll(record);
}

/**
 * 财务账 vs 银行流水：若银行明显为 ETC/高速扣款，则财务摘要须含车牌或通行费等。
 * ONE_TO_MANY（基准=账、目标=银行）与 MANY_TO_ONE（基准=银行、目标=账）对称使用，防止「结息」等多笔 ETC 凑金额。
 */
function accountingAllowsEtcBankRecord(accountingRecord, bankRecord) {
  if (!isEtcLikeBankRecord(bankRecord)) return true;
  const s = String(accountingRecord?.summary ?? '');
  if (s.includes('通行费') || s.includes('ETC') || s.includes('代理ETC')) return true;
  return !!extractEtcVehicleId(accountingRecord);
}

/**
 * 将金额规范为数字（兼容字符串）
 * @param {unknown} v
 * @returns {number}
 */
function toAmountNumber(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 子集和（DFS + 剪枝）。用于 ONE_TO_MANY / MANY_TO_ONE；避免旧版 1<<n 在 n 较大时溢出或漏枚举。
 * 典型场景：基准账 1 笔 = 银行多笔之和，或多笔记账之和 = 银行 1 笔（如 ETC、货款拆分）。
 * 使用绝对值之和与 targetAmount（正数）比较，调用方需保证候选与基准同号。
 * @param {Array<{r: object, idx: number}>} candidates
 * @param {number} targetAmount
 * @param {number} tolerance
 * @param {number} minSize
 * @param {number} maxSize
 * @returns {Array<{r: object, idx: number}>|null}
 */
function popcountMask(mask) {
  let c = 0;
  for (let t = mask >>> 0; t; t &= t - 1) c++;
  return c;
}

function findSubsetSumDfs(candidates, targetAmount, tolerance, minSize, maxSize) {
  if (!candidates || candidates.length < minSize) return null;
  const n = candidates.length;
  const absAmt = (item) => Math.abs(toAmountNumber(item.r?.amount));
  // 快速路径：全体候选条数>=minSize 且总和命中
  const totalSum = candidates.reduce((s, c) => s + absAmt(c), 0);
  if (
    n >= minSize &&
    n <= maxSize &&
    Math.abs(totalSum - targetAmount) <= tolerance
  ) {
    return [...candidates];
  }
  const sorted = [...candidates].sort((a, b) => absAmt(b) - absAmt(a));
  let best = null;

  function dfs(start, picked, sum) {
    if (picked.length > maxSize) return;
    if (sum - targetAmount > tolerance) return;
    if (picked.length >= minSize && Math.abs(sum - targetAmount) <= tolerance) {
      best = [...picked];
      return;
    }
    if (start >= n) return;
    // 上界剪枝：剩余全加也达不到目标
    let restMax = 0;
    for (let i = start; i < n; i++) restMax += absAmt(sorted[i]);
    if (sum + restMax + tolerance < targetAmount) return;

    for (let i = start; i < n; i++) {
      const item = sorted[i];
      const a = absAmt(item);
      picked.push(item);
      dfs(i + 1, picked, sum + a);
      picked.pop();
      if (best) return;
    }
  }

  dfs(0, [], 0);
  return best;
}

/**
 * 子集和命中目标时，在多个合法子集中取 evaluate 认可且 score 最高者（解决「先搜到子集被拒后不再尝试」）
 * n≤22 用位掩码枚举；更大则用 DFS 全量搜（依赖剪枝，仅用于候选已被截断的场景）
 * @param {(picked: Array<{r: object, idx: number}>) => { ok: boolean, score: number }} evaluate
 */
function findBestAggregateSubset(candidates, targetAmount, tolerance, minSize, maxSize, evaluate) {
  if (!candidates || candidates.length < minSize) return null;
  const n = candidates.length;
  const absAmt = (item) => Math.abs(toAmountNumber(item.r?.amount));

  let bestPick = null;
  let bestScore = -Infinity;

  // 全体候选条数在范围内且金额总和即目标（如某车整月 ETC 未匹配条之和）
  if (n >= minSize && n <= maxSize) {
    const totalSum = candidates.reduce((s, c) => s + absAmt(c), 0);
    if (Math.abs(totalSum - targetAmount) <= tolerance) {
      const ev = evaluate(candidates);
      if (ev.ok) return [...candidates];
    }
  }

  if (n <= 22) {
    const limit = 1 << n;
    for (let mask = 0; mask < limit; mask++) {
      const k = popcountMask(mask);
      if (k < minSize || k > maxSize) continue;
      const picked = [];
      let sum = 0;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          picked.push(candidates[i]);
          sum += absAmt(candidates[i]);
        }
      }
      if (Math.abs(sum - targetAmount) > tolerance) continue;
      const ev = evaluate(picked);
      if (ev.ok && ev.score > bestScore) {
        bestScore = ev.score;
        bestPick = picked;
      }
    }
    return bestPick;
  }

  const sorted = [...candidates].sort((a, b) => absAmt(b) - absAmt(a));
  function dfs(i, picked, sum) {
    if (picked.length > maxSize || sum - targetAmount > tolerance) return;
    if (i === sorted.length) {
      if (picked.length >= minSize && Math.abs(sum - targetAmount) <= tolerance) {
        const ev = evaluate(picked);
        if (ev.ok && ev.score > bestScore) {
          bestScore = ev.score;
          bestPick = [...picked];
        }
      }
      return;
    }
    let restMax = 0;
    for (let j = i; j < sorted.length; j++) restMax += absAmt(sorted[j]);
    if (sum + restMax + tolerance < targetAmount) return;
    dfs(i + 1, picked, sum);
    const item = sorted[i];
    picked.push(item);
    dfs(i + 1, picked, sum + absAmt(item));
    picked.pop();
  }
  dfs(0, [], 0);
  return bestPick;
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
 * 按与 anchor 日期接近程度排序后截断候选，减少一对多/多对一的搜索空间
 * @param {Array<{r: object, idx: number}>} items
 * @param {object} anchorRecord
 * @param {number} maxKeep
 */
function limitCandidatesByDateProximity(items, anchorRecord, maxKeep) {
  if (!items || items.length <= maxKeep) return items;
  const withDist = items.map((item) => ({
    item,
    d: daysDiff(anchorRecord.transactionDate, item.r.transactionDate),
  }));
  withDist.sort((a, b) => a.d - b.d);
  return withDist.slice(0, maxKeep).map((x) => x.item);
}

/** 基准与候选记录借贷方向一致（同为收入或同为支出） */
function sameAmountSign(baselineRecord, otherRecord) {
  const b = toAmountNumber(baselineRecord?.amount);
  const o = toAmountNumber(otherRecord?.amount);
  if (b === 0 || o === 0) return b === o;
  return (b > 0 && o > 0) || (b < 0 && o < 0);
}

/**
 * 标准化单条记录：读取时兼容 snake_case，输出为驼峰主字段，不附带 transaction_date、counterparty_name、reference_number、name、is_baseline
 * @param {object} record
 * @returns {object}
 */
function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const {
    transaction_date,
    counterparty_name,
    reference_number,
    name,
    is_baseline,
    ...rest
  } = record;
  return {
    ...rest,
    transactionDate: record.transactionDate ?? transaction_date,
    counterpartyName: record.counterpartyName ?? counterparty_name,
    referenceNumber: record.referenceNumber ?? reference_number,
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
 * @param {object} [config] - 配置 { amountTolerance, dateTolerance, minMatchScore,
 *   aggregateMaxSubsetSize, aggregateMaxCandidates, aggregateMinMatchScore, aggregateMaxDateSpreadDays,
 *   tailAggregateMaxUnmatchedBaseline, tailAggregateMaxUnmatchedTarget, tailAggregateMinMatchScore,
 *   tailAggregateMaxDateSpreadDays, aggregateBestPickMaxCandidates,
 *   enableLateAggregate, lateAggregateMinMatchScore, lateAggregateMaxDateSpreadDays,
 *   lateAggregateMaxUnmatchedBaseline, lateAggregateMaxUnmatchedTarget,
 *   etcAggregateDateTolerance, etcAggregateMinMatchScore,
 *   etcAggregateMaxSubsetSize, etcAggregateCandidateCap, lateAggregateTinyBaselineLe }
 * @returns {{ matchRecords: function }}
 */
function createMatcher(config = {}) {
  const cfg = {
    amountTolerance: config.amountTolerance ?? 0.01,
    dateTolerance: config.dateTolerance ?? 32,
    minMatchScore: config.minMatchScore ?? 70,
    /** 一对多/多对一时，子集最多包含几条对侧记录（防组合爆炸） */
    aggregateMaxSubsetSize: config.aggregateMaxSubsetSize ?? 12,
    /** 进入子集和搜索前，按与基准日期接近程度截断候选条数 */
    aggregateMaxCandidates: config.aggregateMaxCandidates ?? 28,
    /** 聚合匹配最低分（聚合在模糊之后执行时可略低；仍建议 ≥75 抑制纯金额巧合） */
    aggregateMinMatchScore: config.aggregateMinMatchScore ?? 76,
    /**
     * 非 ETC 场景下，子集内各笔相对锚点记录的最大允许天数差（过宽则多为巧合）
     * ETC/通行费仍用 dateTolerance 筛候选，此处不额外收紧
     */
    aggregateMaxDateSpreadDays: config.aggregateMaxDateSpreadDays ?? 12,
    /** 剩余未匹配条数较少时启用「尾部聚合」：放宽日期跨度至 dateTolerance、略降 aggregate 最低分，并枚举最优子集 */
    tailAggregateMaxUnmatchedBaseline: config.tailAggregateMaxUnmatchedBaseline ?? 15,
    tailAggregateMaxUnmatchedTarget: config.tailAggregateMaxUnmatchedTarget ?? 50,
    tailAggregateMinMatchScore: config.tailAggregateMinMatchScore ?? 68,
    /**
     * 尾部聚合时子集最大日期跨度上限（相对锚点）；未设置时沿用 dateTolerance（与仅设 aggregateMaxDateSpreadDays 时的旧行为一致）
     */
    tailAggregateMaxDateSpreadDays: config.tailAggregateMaxDateSpreadDays,
    /** 候选不超过该条数时用 findBestAggregateSubset，避免「第一个金额命中子集」被拒后漏掉正确组合 */
    aggregateBestPickMaxCandidates: config.aggregateBestPickMaxCandidates ?? 20,
    /** 第四轮聚合之后再跑一轮宽松一对多/多对一（仍要求金额子集和命中） */
    enableLateAggregate: config.enableLateAggregate !== false,
    lateAggregateMinMatchScore: config.lateAggregateMinMatchScore ?? 58,
    /** 未设置则等于 dateTolerance */
    lateAggregateMaxDateSpreadDays: config.lateAggregateMaxDateSpreadDays,
    lateAggregateMaxUnmatchedBaseline: config.lateAggregateMaxUnmatchedBaseline ?? 25,
    lateAggregateMaxUnmatchedTarget: config.lateAggregateMaxUnmatchedTarget ?? 60,
    /**
     * 摘要含 ETC 车牌时，一对多/多对一候选与锚点的最大允许天数差（记账日晚于通行日常见）。
     * 不设则 max(dateTolerance, 60)，避免 8 月底通行 vs 9 月底入账超过 32 天被整批滤掉。
     */
    etcAggregateDateTolerance: config.etcAggregateDateTolerance,
    /** ETC 聚合在金额子集已命中时的最低综合分（低于 aggregateMinMatchScore，因通行日与入账日跨月拉低日期分） */
    etcAggregateMinMatchScore: config.etcAggregateMinMatchScore ?? 52,
    /** ETC 一对多允许的最大银行条数（单车整月可远多于 12） */
    etcAggregateMaxSubsetSize: config.etcAggregateMaxSubsetSize ?? 120,
    /** ETC 一对多进入子集搜索前最多保留几条候选（按日期贴近锚点截断） */
    etcAggregateCandidateCap: config.etcAggregateCandidateCap ?? 150,
    /** 剩余未匹配基准很少时，第五轮不再受 lateAggregateMaxUnmatchedTarget 限制（否则 ETC 池子上百笔时第五轮永不执行） */
    lateAggregateTinyBaselineLe: config.lateAggregateTinyBaselineLe ?? 8,
    ...config,
  };

  /** 聚合筛选用：锚点记录是否带车牌 → 放宽日历窗口 */
  function aggregateDateToleranceDays(anchorRecord) {
    if (extractEtcVehicleId(anchorRecord)) {
      if (
        cfg.etcAggregateDateTolerance != null &&
        Number.isFinite(cfg.etcAggregateDateTolerance)
      ) {
        return cfg.etcAggregateDateTolerance;
      }
      return Math.max(cfg.dateTolerance, 60);
    }
    return cfg.dateTolerance;
  }

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
    const pairDateTol =
      extractEtcVehicleId(baselineRecord) || extractEtcVehicleId(targetRecord)
        ? aggregateDateToleranceDays(
            extractEtcVehicleId(baselineRecord) ? baselineRecord : targetRecord
          )
        : cfg.dateTolerance;
    if (dateDiff === 0) {
      score += 30;
    } else if (dateDiff <= pairDateTol) {
      score += 30 * (1 - dateDiff / pairDateTol);
    }

    // 批量扣款等加分（仅 includes，无 Levenshtein）提前算，便于剪枝
    if (
      amountDiff <= cfg.amountTolerance &&
      dateDiff <= pairDateTol &&
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
      (sum, r) => sum + Math.abs(toAmountNumber(r.amount)),
      0
    );
    const baseAmt = Math.abs(toAmountNumber(baselineRecord.amount));
    const amountDiff = Math.abs(baseAmt - totalAmount);
    let score = 0;
    if (amountDiff <= cfg.amountTolerance) {
      score += 50;
    } else if (baseAmt > 0) {
      score += 50 * (1 - amountDiff / baseAmt);
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

    const bankText = `${baselineRecord.summary ?? ''} ${baselineRecord.counterpartyName ?? ''}`.trim();
    let textExtra = 0;
    let bestSumSim = 0;
    for (const ar of targetRecords) {
      const accText = `${ar.summary ?? ''} ${ar.counterpartyName ?? ''}`.trim();
      for (const kw of BATCH_DEDUCTION_KEYWORDS) {
        if (bankText.includes(kw) && accText.includes(kw)) {
          textExtra = Math.max(textExtra, 12);
          break;
        }
      }
      if (
        (bankText.includes('手续费') || bankText.includes('收费')) &&
        (accText.includes('手续费') || accText.includes('收费'))
      ) {
        textExtra = Math.max(textExtra, 12);
      }
      if (baselineRecord.summary && ar.summary) {
        bestSumSim = Math.max(
          bestSumSim,
          calculateTextSimilarity(
            String(baselineRecord.summary),
            String(ar.summary)
          )
        );
      }
    }
    score += textExtra + Math.round(10 * bestSumSim);
    return Math.round(Math.min(100, score));
  }

  function calculateManyToOneMatchScore(baselineRecords, targetRecord) {
    return calculateOneToManyMatchScore(targetRecord, baselineRecords);
  }

  /** 子集内各条相对 anchor 的最大日历差 */
  function maxDaysSpreadFromAnchor(anchorRecord, sideRecords) {
    let m = 0;
    for (const r of sideRecords) {
      m = Math.max(m, daysDiff(anchorRecord.transactionDate, r.transactionDate));
    }
    return m;
  }

  /**
   * 一对多是否接受：金额已由子集和保证；再卡分数 + 非 ETC 时卡日期集中度
   * @param {{ minScore?: number, maxSpreadDays?: number }} [overrides] - 尾部聚合时放宽
   */
  function acceptOneToManyAggregate(baselineRecord, targetRecords, overrides) {
    const minScore = overrides?.minScore ?? cfg.aggregateMinMatchScore;
    const maxSpread = overrides?.maxSpreadDays ?? cfg.aggregateMaxDateSpreadDays;
    const score = calculateOneToManyMatchScore(baselineRecord, targetRecords);
    const effectiveMin = extractEtcVehicleId(baselineRecord)
      ? Math.min(minScore, cfg.etcAggregateMinMatchScore)
      : minScore;
    if (score < effectiveMin) return false;
    if (extractEtcVehicleId(baselineRecord)) return true;
    if ((baselineRecord.summary ?? '').includes('通行费')) return true;
    return maxDaysSpreadFromAnchor(baselineRecord, targetRecords) <= maxSpread;
  }

  /**
   * 多对一是否接受：锚点为对账侧单笔
   * @param {{ minScore?: number, maxSpreadDays?: number }} [overrides]
   */
  function acceptManyToOneAggregate(baselineRecords, targetRecord, overrides) {
    const minScore = overrides?.minScore ?? cfg.aggregateMinMatchScore;
    const maxSpread = overrides?.maxSpreadDays ?? cfg.aggregateMaxDateSpreadDays;
    const score = calculateManyToOneMatchScore(baselineRecords, targetRecord);
    const effectiveMin = extractEtcVehicleId(targetRecord)
      ? Math.min(minScore, cfg.etcAggregateMinMatchScore)
      : minScore;
    if (score < effectiveMin) return false;
    if (extractEtcVehicleId(targetRecord)) return true;
    if ((targetRecord.summary ?? '').includes('通行费')) return true;
    return maxDaysSpreadFromAnchor(targetRecord, baselineRecords) <= maxSpread;
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

    /**
     * 一对多：目标侧候选（银行常不写车牌时，严格匹配空则用「通行费」兜底）
     */
    function collectOneToManyTargetCandidates(baselineRecord) {
      const etcVehicleId = extractEtcVehicleId(baselineRecord);
      const baselineHasToll = (baselineRecord.summary ?? '').includes('通行费');
      const useStrictVehicle = !!etcVehicleId;
      const dtol = aggregateDateToleranceDays(baselineRecord);
      const byDate = (item) =>
        daysDiff(baselineRecord.transactionDate, item.r.transactionDate) <= dtol;
      let list = unmatchedTargetAccount
        .map((r, idx) => ({ r, idx }))
        .filter((item) => sameAmountSign(baselineRecord, item.r))
        .filter(byDate)
        .filter((item) => useStrictVehicle
          ? recordMatchesEtcVehicle(item.r, etcVehicleId)
          : recordMatchesEtcOrToll(item.r, etcVehicleId, baselineHasToll));
      if (etcVehicleId && list.length === 0) {
        list = unmatchedTargetAccount
          .map((r, idx) => ({ r, idx }))
          .filter((item) => sameAmountSign(baselineRecord, item.r))
          .filter(byDate)
          .filter((item) => recordMatchesEtcOrToll(item.r, etcVehicleId, true));
      }
      if (etcVehicleId && list.length === 0) {
        list = unmatchedTargetAccount
          .map((r, idx) => ({ r, idx }))
          .filter((item) => sameAmountSign(baselineRecord, item.r))
          .filter(byDate)
          .filter((item) => recordLooksLikeHighwayToll(item.r));
      }
      return list.filter((item) =>
        accountingAllowsEtcBankRecord(baselineRecord, item.r)
      );
    }

    function collectManyToOneBaselineCandidates(targetRecord) {
      const targetVehicleId = extractEtcVehicleId(targetRecord);
      const dtol = aggregateDateToleranceDays(targetRecord);
      return unmatchedBaselineAccount
        .map((r, idx) => ({ r, idx }))
        .filter((item) => !targetVehicleId || recordMatchesEtcVehicle(item.r, targetVehicleId))
        .filter((item) => sameAmountSign(item.r, targetRecord))
        .filter(
          (item) =>
            daysDiff(item.r.transactionDate, targetRecord.transactionDate) <= dtol
        )
        .filter((item) => accountingAllowsEtcBankRecord(targetRecord, item.r));
    }

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

    // 第二轮：模糊匹配（考虑容差）
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

    // 第三轮：模糊匹配之后，同号+金额一致+日期在容差内 → FUZZY，得分固定 minMatchScore
    function isFuzzyAmountDateFallbackPair(b, t) {
      const nb = parseFloat(String(b.amount ?? ''));
      const nt = parseFloat(String(t.amount ?? ''));
      if (!Number.isFinite(nb) || !Number.isFinite(nt)) return false;
      const sameSign =
        (nb > 0 && nt > 0) || (nb < 0 && nt < 0) || (nb === 0 && nt === 0);
      if (!sameSign) return false;
      if (Math.abs(nb - nt) > cfg.amountTolerance) return false;
      const fallbackDateTol =
        extractEtcVehicleId(b) || extractEtcVehicleId(t)
          ? aggregateDateToleranceDays(extractEtcVehicleId(b) ? b : t)
          : cfg.dateTolerance;
      if (daysDiff(b.transactionDate, t.transactionDate) > fallbackDateTol) return false;
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

    // 第四轮a：一对多（仅在剩余未匹配上执行，避免与已完成的 1:1 模糊抢流水）
    const ubAgg = unmatchedBaselineAccount.length;
    const utAgg = unmatchedTargetAccount.length;
    const tailAggregate =
      ubAgg <= cfg.tailAggregateMaxUnmatchedBaseline &&
      utAgg <= cfg.tailAggregateMaxUnmatchedTarget;
    /** 非尾部：aggregateMaxDateSpreadDays 与 dateTolerance 取小，配置即可生效 */
    const normalAggOverrides = {
      minScore: cfg.aggregateMinMatchScore,
      maxSpreadDays: Math.min(cfg.dateTolerance, cfg.aggregateMaxDateSpreadDays),
    };
    /** 尾部：默认同 dateTolerance；可单独设 tailAggregateMaxDateSpreadDays */
    const tailOverrides = tailAggregate
      ? {
        minScore: Math.min(
          cfg.aggregateMinMatchScore,
          cfg.tailAggregateMinMatchScore
        ),
        maxSpreadDays:
          cfg.tailAggregateMaxDateSpreadDays != null
            ? Math.min(cfg.dateTolerance, cfg.tailAggregateMaxDateSpreadDays)
            : cfg.dateTolerance,
      }
      : null;
    const oneToManyAggOverrides = tailAggregate ? tailOverrides : normalAggOverrides;

    const baselineToProcessAgg = [...unmatchedBaselineAccount].sort((a, b) => {
      const va = extractEtcVehicleId(a);
      const vb = extractEtcVehicleId(b);
      return (vb ? 1 : 0) - (va ? 1 : 0);
    });
    for (const baselineRecord of baselineToProcessAgg) {
      if (!unmatchedBaselineAccount.includes(baselineRecord)) continue;
      const targetAmount = Math.abs(toAmountNumber(baselineRecord.amount));
      const candidates = collectOneToManyTargetCandidates(baselineRecord);
      const hasEtcBase =
        !!extractEtcVehicleId(baselineRecord) ||
        String(baselineRecord.summary ?? '').includes('通行费');
      const subsetMax = hasEtcBase
        ? cfg.etcAggregateMaxSubsetSize
        : cfg.aggregateMaxSubsetSize;
      const capKeep = tailAggregate
        ? Math.min(
          Math.max(utAgg, cfg.aggregateMaxCandidates),
          40
        )
        : cfg.aggregateMaxCandidates;
      const etcCap = cfg.etcAggregateCandidateCap;
      const capForLimit = hasEtcBase
        ? Math.max(capKeep, etcCap)
        : capKeep;
      const capped = limitCandidatesByDateProximity(
        candidates,
        baselineRecord,
        capForLimit
      );
      const useBestPick =
        tailAggregate || capped.length <= cfg.aggregateBestPickMaxCandidates;

      let found = null;
      if (useBestPick) {
        found = findBestAggregateSubset(
          capped,
          targetAmount,
          cfg.amountTolerance,
          2,
          subsetMax,
          (picked) => {
            const records = picked.map((p) => p.r);
            const score = calculateOneToManyMatchScore(baselineRecord, records);
            const ok = acceptOneToManyAggregate(
              baselineRecord,
              records,
              oneToManyAggOverrides
            );
            return { ok, score };
          }
        );
      } else {
        found = findSubsetSumDfs(
          capped,
          targetAmount,
          cfg.amountTolerance,
          2,
          subsetMax
        );
        if (
          found &&
          !acceptOneToManyAggregate(
            baselineRecord,
            found.map((x) => x.r),
            oneToManyAggOverrides
          )
        ) {
          found = null;
        }
      }

      if (found && found.length >= 2) {
        const records = found.map((m) => m.r);
        const indices = found.map((m) => m.idx).sort((a, b) => b - a);
        const aggScore = calculateOneToManyMatchScore(baselineRecord, records);
        matches.push({
          baselineRecord,
          targetRecords: records,
          matchScore: aggScore,
          matchType: 'ONE_TO_MANY',
        });
        unmatchedBaselineAccount.splice(unmatchedBaselineAccount.indexOf(baselineRecord), 1);
        indices.forEach((idx) => unmatchedTargetAccount.splice(idx, 1));
      }
    }

    // 第四轮b：多对一（尾部参数与第四轮 a 一致，在第四轮 a 之后会再次缩小池子，此处按当前池重算 tail）
    const ubAgg2 = unmatchedBaselineAccount.length;
    const utAgg2 = unmatchedTargetAccount.length;
    const tailAggregate2 =
      ubAgg2 <= cfg.tailAggregateMaxUnmatchedBaseline &&
      utAgg2 <= cfg.tailAggregateMaxUnmatchedTarget;
    const tailOverrides2 = tailAggregate2
      ? {
        minScore: Math.min(
          cfg.aggregateMinMatchScore,
          cfg.tailAggregateMinMatchScore
        ),
        maxSpreadDays:
          cfg.tailAggregateMaxDateSpreadDays != null
            ? Math.min(cfg.dateTolerance, cfg.tailAggregateMaxDateSpreadDays)
            : cfg.dateTolerance,
      }
      : null;
    const manyToOneAggOverrides = tailAggregate2 ? tailOverrides2 : normalAggOverrides;

    for (let i = unmatchedTargetAccount.length - 1; i >= 0; i--) {
      const targetRecord = unmatchedTargetAccount[i];
      const targetAmount = Math.abs(toAmountNumber(targetRecord.amount));
      const candidates = collectManyToOneBaselineCandidates(targetRecord);
      const hasEtcTarget =
        !!extractEtcVehicleId(targetRecord) ||
        String(targetRecord.summary ?? '').includes('通行费');
      const subsetMaxM2o = hasEtcTarget
        ? cfg.etcAggregateMaxSubsetSize
        : cfg.aggregateMaxSubsetSize;
      const capKeep2 = tailAggregate2
        ? Math.min(Math.max(ubAgg2, cfg.aggregateMaxCandidates), 40)
        : cfg.aggregateMaxCandidates;
      const capForLimitM2o = hasEtcTarget
        ? Math.max(capKeep2, cfg.etcAggregateCandidateCap)
        : capKeep2;
      const capped = limitCandidatesByDateProximity(
        candidates,
        targetRecord,
        capForLimitM2o
      );
      const useBestPick2 =
        tailAggregate2 || capped.length <= cfg.aggregateBestPickMaxCandidates;

      let found = null;
      if (useBestPick2) {
        found = findBestAggregateSubset(
          capped,
          targetAmount,
          cfg.amountTolerance,
          2,
          subsetMaxM2o,
          (picked) => {
            const records = picked.map((p) => p.r);
            const score = calculateManyToOneMatchScore(records, targetRecord);
            const ok = acceptManyToOneAggregate(
              records,
              targetRecord,
              manyToOneAggOverrides
            );
            return { ok, score };
          }
        );
      } else {
        found = findSubsetSumDfs(
          capped,
          targetAmount,
          cfg.amountTolerance,
          2,
          subsetMaxM2o
        );
        if (
          found &&
          !acceptManyToOneAggregate(
            found.map((x) => x.r),
            targetRecord,
            manyToOneAggOverrides
          )
        ) {
          found = null;
        }
      }

      if (found && found.length >= 2) {
        const records = found.map((m) => m.r);
        const indices = found.map((m) => m.idx).sort((a, b) => b - a);
        const aggScore = calculateManyToOneMatchScore(records, targetRecord);
        matches.push({
          baselineRecords: records,
          targetRecord,
          matchScore: aggScore,
          matchType: 'MANY_TO_ONE',
        });
        unmatchedTargetAccount.splice(i, 1);
        indices.forEach((idx) => unmatchedBaselineAccount.splice(idx, 1));
      }
    }

    // 第五轮：宽松一对多 / 多对一（第四轮未配上的「金额可对、文本弱」场景；与 tail 池大小无关）
    const ubLate = unmatchedBaselineAccount.length;
    const utLate = unmatchedTargetAccount.length;
    const lateSpread =
      cfg.lateAggregateMaxDateSpreadDays != null
        ? Math.min(cfg.dateTolerance, cfg.lateAggregateMaxDateSpreadDays)
        : cfg.dateTolerance;
    const lateOverrides = {
      minScore: cfg.lateAggregateMinMatchScore,
      maxSpreadDays: lateSpread,
    };
    const lateTargetOk =
      ubLate <= cfg.lateAggregateTinyBaselineLe ||
      utLate <= cfg.lateAggregateMaxUnmatchedTarget;
    if (
      cfg.enableLateAggregate &&
      ubLate >= 1 &&
      utLate >= 2 &&
      ubLate <= cfg.lateAggregateMaxUnmatchedBaseline &&
      lateTargetOk
    ) {
      const baselineLate = [...unmatchedBaselineAccount].sort((a, b) => {
        const va = extractEtcVehicleId(a);
        const vb = extractEtcVehicleId(b);
        return (vb ? 1 : 0) - (va ? 1 : 0);
      });
      for (const baselineRecord of baselineLate) {
        if (!unmatchedBaselineAccount.includes(baselineRecord)) continue;
        const targetAmount = Math.abs(toAmountNumber(baselineRecord.amount));
        const candidates = collectOneToManyTargetCandidates(baselineRecord);
        const hasEtcBaseLate =
          !!extractEtcVehicleId(baselineRecord) ||
          String(baselineRecord.summary ?? '').includes('通行费');
        const subsetMaxLate = hasEtcBaseLate
          ? cfg.etcAggregateMaxSubsetSize
          : cfg.aggregateMaxSubsetSize;
        const capLate = Math.min(Math.max(utLate, cfg.aggregateMaxCandidates), 40);
        const etcCapLate = cfg.etcAggregateCandidateCap;
        const capLateLimit = hasEtcBaseLate
          ? Math.max(capLate, etcCapLate)
          : capLate;
        const capped = limitCandidatesByDateProximity(
          candidates,
          baselineRecord,
          capLateLimit
        );
        const foundLate = findBestAggregateSubset(
          capped,
          targetAmount,
          cfg.amountTolerance,
          2,
          subsetMaxLate,
          (picked) => {
            const records = picked.map((p) => p.r);
            const score = calculateOneToManyMatchScore(baselineRecord, records);
            const ok = acceptOneToManyAggregate(
              baselineRecord,
              records,
              lateOverrides
            );
            return { ok, score };
          }
        );
        if (foundLate && foundLate.length >= 2) {
          const records = foundLate.map((m) => m.r);
          const indices = foundLate.map((m) => m.idx).sort((a, b) => b - a);
          const aggScore = calculateOneToManyMatchScore(baselineRecord, records);
          matches.push({
            baselineRecord,
            targetRecords: records,
            matchScore: aggScore,
            matchType: 'ONE_TO_MANY',
          });
          unmatchedBaselineAccount.splice(unmatchedBaselineAccount.indexOf(baselineRecord), 1);
          indices.forEach((idx) => unmatchedTargetAccount.splice(idx, 1));
        }
      }

      for (let i = unmatchedTargetAccount.length - 1; i >= 0; i--) {
        const targetRecord = unmatchedTargetAccount[i];
        const targetAmount = Math.abs(toAmountNumber(targetRecord.amount));
        const candidates = collectManyToOneBaselineCandidates(targetRecord);
        const hasEtcTargetLate =
          !!extractEtcVehicleId(targetRecord) ||
          String(targetRecord.summary ?? '').includes('通行费');
        const subsetMaxLateM2o = hasEtcTargetLate
          ? cfg.etcAggregateMaxSubsetSize
          : cfg.aggregateMaxSubsetSize;
        const capLate2 = Math.min(Math.max(ubLate, cfg.aggregateMaxCandidates), 40);
        const capLateLimitM2o = hasEtcTargetLate
          ? Math.max(capLate2, cfg.etcAggregateCandidateCap)
          : capLate2;
        const capped = limitCandidatesByDateProximity(
          candidates,
          targetRecord,
          capLateLimitM2o
        );
        const foundLate2 = findBestAggregateSubset(
          capped,
          targetAmount,
          cfg.amountTolerance,
          2,
          subsetMaxLateM2o,
          (picked) => {
            const records = picked.map((p) => p.r);
            const score = calculateManyToOneMatchScore(records, targetRecord);
            const ok = acceptManyToOneAggregate(
              records,
              targetRecord,
              lateOverrides
            );
            return { ok, score };
          }
        );
        if (foundLate2 && foundLate2.length >= 2) {
          const records = foundLate2.map((m) => m.r);
          const indices = foundLate2.map((m) => m.idx).sort((a, b) => b - a);
          const aggScore = calculateManyToOneMatchScore(records, targetRecord);
          matches.push({
            baselineRecords: records,
            targetRecord,
            matchScore: aggScore,
            matchType: 'MANY_TO_ONE',
          });
          unmatchedTargetAccount.splice(i, 1);
          indices.forEach((idx) => unmatchedBaselineAccount.splice(idx, 1));
        }
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
