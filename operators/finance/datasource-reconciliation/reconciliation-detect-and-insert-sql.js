/**
 * 财务对账 - 差异识别 + INSERT SQL 生成（单文件，适用于脚本执行器）
 *
 * 入参：reconciliation-matcher 的输出
 *   { matches, unmatchedBaselineAccount, unmatchedTargetAccount }
 *   （亦兼容 unmatchedBank / unmatchedAccounting 别名）
 *
 * 主入口 detectAndGenerateInsertSql 的返回值与 reconciliation-insert-sql.js 的
 * generateInsertSql 一致：{ sql: string, taskId: string }，供下游 SQL 执行器接收。
 *
 * @example
 *   // 执行器：仅 matcher 结果 + 任务元数据，一步得到 SQL
 *   return await detectAndGenerateInsertSql(parameters[0], {
 *     schema: 'team_xxx',
 *     name: '2024年1月对账',
 *     baseline_type: 'BANK_STATEMENT',
 *     target_type: 'ACCOUNTING_RECORD',
 *     ...
 *   });
 *
 *   // 若已自行算好 differences，仍可直接调用 generateInsertSql(matchResult, differences, opts)
 *
 * detectAndGenerateInsertSql 第二个参数在入口会规范化：支持数据源对账算子返回的 config
 *（taskName、baselineType、targetType、baselineName、targetName），与 snake_case 并存时
 * 以已显式传入的 snake 字段为准。生成真实 INSERT 时 schema 必填（非空字符串），无默认值。
 */

// =============================================================================
// 差异识别（原 reconciliation-difference-detector.js）
// =============================================================================

/**
 * 计算两个日期的天数差（绝对值）
 * @param {Date|string} date1
 * @param {Date|string} date2
 * @returns {number}
 */
function daysDiff(date1, date2) {
  const ts1 =
    date1 instanceof Date ? date1.getTime() : Date.parse(String(date1));
  const ts2 =
    date2 instanceof Date ? date2.getTime() : Date.parse(String(date2));
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Math.floor((ts1 - ts2) / msPerDay));
}

function getMonth(d) {
  const dt = d instanceof Date ? d : new Date(String(d));
  return dt.getMonth();
}

function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(String(d));
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMonth(d) {
  const dt = d instanceof Date ? d : new Date(String(d));
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function extractAmountsFromMatch(match) {
  if (match.baselineRecord && match.targetRecord) {
    return {
      bankAmount: Math.abs(match.baselineRecord.amount),
      accountingAmount: Math.abs(match.targetRecord.amount),
      bankRecords: [match.baselineRecord],
      accountingRecords: [match.targetRecord],
    };
  }
  if (match.baselineRecord && match.targetRecords?.length) {
    const sum = match.targetRecords.reduce(
      (s, r) => s + Math.abs(r.amount),
      0
    );
    return {
      bankAmount: Math.abs(match.baselineRecord.amount),
      accountingAmount: sum,
      bankRecords: [match.baselineRecord],
      accountingRecords: match.targetRecords,
    };
  }
  if (match.baselineRecords?.length && match.targetRecord) {
    const sum = match.baselineRecords.reduce((s, r) => s + Math.abs(r.amount), 0);
    return {
      bankAmount: sum,
      accountingAmount: Math.abs(match.targetRecord.amount),
      bankRecords: match.baselineRecords,
      accountingRecords: [match.targetRecord],
    };
  }
  return {
    bankAmount: 0,
    accountingAmount: 0,
    bankRecords: [],
    accountingRecords: [],
  };
}

function extractDatesAndRecordsFromMatch(match) {
  const dt = (r) => r?.transactionDate ?? r?.transaction_date;
  if (match.baselineRecord && match.targetRecord) {
    const bd = dt(match.baselineRecord);
    const ad = dt(match.targetRecord);
    return {
      bankItems: bd ? [{ date: bd, record: match.baselineRecord }] : [],
      accountingItems: ad ? [{ date: ad, record: match.targetRecord }] : [],
    };
  }
  if (match.baselineRecord && match.targetRecords?.length) {
    const bd = dt(match.baselineRecord);
    return {
      bankItems: bd ? [{ date: bd, record: match.baselineRecord }] : [],
      accountingItems: match.targetRecords
        .map((r) => (dt(r) ? { date: dt(r), record: r } : null))
        .filter(Boolean),
    };
  }
  if (match.baselineRecords?.length && match.targetRecord) {
    const ad = dt(match.targetRecord);
    return {
      bankItems: match.baselineRecords
        .map((r) => (dt(r) ? { date: dt(r), record: r } : null))
        .filter(Boolean),
      accountingItems: ad ? [{ date: ad, record: match.targetRecord }] : [],
    };
  }
  return { bankItems: [], accountingItems: [] };
}

function assignIdsByRecordType(record) {
  const t = record?.type || record?.account_type;
  if (t === 'BANK_STATEMENT' && record?.id) return { bankRecordId: record.id };
  if (t === 'ACCOUNTING_RECORD' && record?.id) return { accountingRecordId: record.id };
  return {};
}

function extractIdsFromMatch(match, opts = {}) {
  const side1 = [match.baselineRecord, ...(match.baselineRecords || [])].filter(Boolean);
  const side2 = [match.targetRecord, ...(match.targetRecords || [])].filter(Boolean);
  let bankId = null;
  let accountingId = null;
  for (const r of [...side1, ...side2]) {
    const t = r?.type || r?.account_type;
    if (t === 'BANK_STATEMENT') bankId = r?.id;
    if (t === 'ACCOUNTING_RECORD') accountingId = r?.id;
  }
  if (bankId != null && accountingId != null) {
    return { bankRecordId: bankId, accountingRecordId: accountingId };
  }
  const r1 = side1[0];
  const r2 = side2[0];
  const { baseline_type: bt, target_type: tt } = opts;
  if (bt === 'BANK_STATEMENT' && tt === 'ACCOUNTING_RECORD' && r1?.id && r2?.id) {
    return { bankRecordId: r1.id, accountingRecordId: r2.id };
  }
  if (bt === 'ACCOUNTING_RECORD' && tt === 'BANK_STATEMENT' && r1?.id && r2?.id) {
    return { bankRecordId: r2.id, accountingRecordId: r1.id };
  }
  return { bankRecordId: r1?.id ?? bankId, accountingRecordId: r2?.id ?? accountingId };
}

function createDifferenceDetector(config = {}) {
  const cfg = {
    amountTolerance: config.amountTolerance ?? 0.01,
    dateTolerance: config.dateTolerance ?? 3,
    feeThreshold: config.feeThreshold ?? 100,
    lowMatchScoreThreshold: config.lowMatchScoreThreshold ?? 80,
    ...config,
  };

  function detectAnomalies(records) {
    const anomalies = [];
    const validRecords = (records || []).filter((r) => r && r.amount != null);

    if (validRecords.length < 2) return anomalies;

    const amounts = validRecords.map((r) => Math.abs(r.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);
    const threshold = avg + 3 * stdDev;

    for (const record of validRecords) {
      if (Math.abs(record.amount) > threshold) {
        const ids = assignIdsByRecordType(record);
        anomalies.push({
          differenceType: 'LARGE_AMOUNT',
          ...ids,
          description: `大额异常交易：${record.amount}元（超过平均值${avg.toFixed(2)}元的3倍标准差）`,
          severity: 'WARNING',
        });
      }
    }

    const duplicates = findDuplicates(validRecords);
    for (const duplicate of duplicates) {
      const ids = assignIdsByRecordType(duplicate);
      anomalies.push({
        differenceType: 'DUPLICATE',
        ...ids,
        description: `疑似重复交易：${duplicate.summary ?? ''}`,
        severity: 'WARNING',
      });
    }

    return anomalies;
  }

  function findDuplicates(records) {
    const seen = new Map();
    const duplicates = [];

    for (const record of records) {
      const dateVal = record.transactionDate ?? record.transaction_date ?? '';
      const voucherNum = record.referenceNumber ?? record.reference_number ?? '';
      const key = `${record.amount}_${record.summary ?? ''}_${dateVal}_${voucherNum}`;
      if (seen.has(key)) {
        duplicates.push(record);
      } else {
        seen.set(key, record);
      }
    }
    return duplicates;
  }

  async function doDetectDifferences(matchResult) {
    const differences = [];
    const {
      matches = [],
      unmatchedBaselineAccount = [],
      unmatchedTargetAccount = [],
      unmatchedBank,
      unmatchedAccounting,
    } = matchResult;
    const baselineUnmatched = unmatchedBaselineAccount.length
      ? unmatchedBaselineAccount
      : (unmatchedBank || []);
    const targetUnmatched = unmatchedTargetAccount.length
      ? unmatchedTargetAccount
      : (unmatchedAccounting || []);

    const opts = { baseline_type: cfg.baseline_type, target_type: cfg.target_type };

    for (const record of baselineUnmatched) {
      let ids = assignIdsByRecordType(record);
      if (Object.keys(ids).length === 0 && record?.id) {
        const bt = cfg.baseline_type;
        const tt = cfg.target_type;
        if (bt === 'BANK_STATEMENT' && tt === 'ACCOUNTING_RECORD') {
          ids = { bankRecordId: record.id };
        } else if (bt === 'ACCOUNTING_RECORD' && tt === 'BANK_STATEMENT') {
          ids = { accountingRecordId: record.id };
        } else {
          ids = { bankRecordId: record.id };
        }
      }
      differences.push({
        differenceType: 'UNMATCHED_BANK',
        ...ids,
        description: `银行记录未匹配：${record.summary ?? ''}`,
        severity: 'WARNING',
      });
    }

    for (const record of targetUnmatched) {
      let ids = assignIdsByRecordType(record);
      if (Object.keys(ids).length === 0 && record?.id) {
        const bt = cfg.baseline_type;
        const tt = cfg.target_type;
        if (bt === 'BANK_STATEMENT' && tt === 'ACCOUNTING_RECORD') {
          ids = { accountingRecordId: record.id };
        } else if (bt === 'ACCOUNTING_RECORD' && tt === 'BANK_STATEMENT') {
          ids = { bankRecordId: record.id };
        } else {
          ids = { accountingRecordId: record.id };
        }
      }
      differences.push({
        differenceType: 'UNMATCHED_ACCOUNTING',
        ...ids,
        description: `财务记录未匹配：${record.summary ?? ''}`,
        severity: 'WARNING',
      });
    }

    for (const match of matches) {
      const { bankAmount, accountingAmount, bankRecords, accountingRecords } =
        extractAmountsFromMatch(match);
      const ids = extractIdsFromMatch(match, opts);
      const matchScore = match.matchScore ?? 0;

      const amountDiff = Math.abs(bankAmount - accountingAmount);
      if (amountDiff > cfg.amountTolerance) {
        const isFee =
          amountDiff < cfg.feeThreshold && amountDiff > 0;
        differences.push({
          differenceType: isFee ? 'FEE_ALLOCATION' : 'AMOUNT_MISMATCH',
          ...ids,
          differenceAmount: amountDiff,
          description: isFee
            ? `银行手续费：${amountDiff.toFixed(2)}元`
            : `金额不一致：银行${bankAmount}，财务${accountingAmount}`,
          severity: isFee ? 'NORMAL' : 'ERROR',
        });
      }

      const { bankItems, accountingItems } = extractDatesAndRecordsFromMatch(match);
      if (bankItems.length && accountingItems.length) {
        let maxDateDiff = 0;
        let isCrossMonth = false;
        let maxDiffSide1Rec = null;
        let maxDiffSide2Rec = null;
        let maxDiffDate1 = bankItems[0]?.date;
        let maxDiffDate2 = accountingItems[0]?.date;

        for (const bi of bankItems) {
          for (const aj of accountingItems) {
            const diff = daysDiff(bi.date, aj.date);
            if (diff > maxDateDiff) {
              maxDateDiff = diff;
              maxDiffSide1Rec = bi.record;
              maxDiffSide2Rec = aj.record;
              maxDiffDate1 = bi.date;
              maxDiffDate2 = aj.date;
            }
            if (getMonth(bi.date) !== getMonth(aj.date)) isCrossMonth = true;
          }
        }

        if (maxDateDiff > cfg.dateTolerance) {
          const dateIds = extractIdsFromMatch(
            { baselineRecord: maxDiffSide1Rec, targetRecord: maxDiffSide2Rec },
            opts
          );
          differences.push({
            differenceType: isCrossMonth ? 'CROSS_MONTH' : 'DATE_MISMATCH',
            ...dateIds,
            differenceDays: maxDateDiff,
            description: isCrossMonth
              ? `日期跨月差异${maxDateDiff}天（${formatMonth(maxDiffDate1)} vs ${formatMonth(maxDiffDate2)}）`
              : `日期差异${maxDateDiff}天`,
            severity: 'WARNING',
          });
        } else if (isCrossMonth && maxDateDiff > 0) {
          const dateIds = extractIdsFromMatch(
            { baselineRecord: maxDiffSide1Rec, targetRecord: maxDiffSide2Rec },
            opts
          );
          differences.push({
            differenceType: 'CROSS_MONTH',
            ...dateIds,
            differenceDays: maxDateDiff,
            description: `日期跨月：${formatDate(maxDiffDate1)} vs ${formatDate(maxDiffDate2)}`,
            severity: 'WARNING',
          });
        }
      }

      if (matchScore < cfg.lowMatchScoreThreshold) {
        differences.push({
          differenceType: 'LOW_MATCH_SCORE',
          ...ids,
          description: `匹配得分较低：${matchScore}`,
          severity: 'WARNING',
        });
      }
    }

    const allBankSideRecords = [
      ...matches.flatMap((m) => {
        if (m.baselineRecord) return [m.baselineRecord];
        if (m.baselineRecords?.length) return m.baselineRecords;
        return [];
      }),
      ...baselineUnmatched,
    ];
    differences.push(...detectAnomalies(allBankSideRecords));

    for (const match of matches) {
      if (match.matchType === 'REVERSAL') {
        const ids = extractIdsFromMatch(match, opts);
        differences.push({
          differenceType: 'REVERSAL',
          ...ids,
          description: '冲正交易',
          severity: 'NORMAL',
        });
      }
    }

    return differences;
  }

  return { detectDifferences: doDetectDifferences };
}

function detectDifferences(matchResult, config = {}) {
  const detector = createDifferenceDetector(config);
  return detector.detectDifferences(matchResult);
}

// =============================================================================
// INSERT SQL（原 reconciliation-insert-sql.js）
// =============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return value && typeof value === 'string' && UUID_REGEX.test(value);
}

function simpleHash32(str) {
  const s = String(str);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i);
    h = h | 0;
  }
  const part1 = (Math.abs(h) >>> 0).toString(16).padStart(8, '0');
  let h2 = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    h2 = Math.imul(31, h2) + s.charCodeAt(i);
    h2 = h2 | 0;
  }
  const part2 = (Math.abs(h2) >>> 0).toString(16).padStart(8, '0');
  return part1 + part2 + part1 + part2;
}

function toUuid(id) {
  if (!id) return null;
  if (isUuid(id)) return id;
  const hash = simpleHash32(id);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function randomUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function escapeSql(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/'/g, "''");
}

function formatIdentifier(name) {
  if (!name) return '';
  const s = String(name);
  return /^[a-z0-9_]+$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`;
}

function effectiveSchemaPrefix(opts = {}) {
  const raw = opts.schema != null && opts.schema !== '' ? String(opts.schema).trim() : '';
  if (!raw) {
    throw new Error('生成对账 INSERT SQL 须显式传入 opts.schema（非空字符串）');
  }
  return `${formatIdentifier(raw)}.`;
}

function sqlValue(value, asUuid = false) {
  if (value === null || value === undefined) return 'NULL';
  const escaped = escapeSql(value);
  if (asUuid) {
    const uuid = isUuid(value) ? value : toUuid(value);
    return uuid ? `'${uuid}'::uuid` : 'NULL';
  }
  if (typeof value === 'number') return String(value);
  return `'${escaped}'`;
}

/** bank_record_id / accounting_record_id（int8）：无引号整数字面量，避免 JS 大整数精度问题 */
function sqlBigintLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  const s = String(value).trim();
  if (/^-?\d+$/.test(s)) return s;
  return 'NULL';
}

function toBase64(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 128) {
      bytes.push(c);
    } else if (c < 2048) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      i++;
      const low = str.charCodeAt(i);
      const cp = 0x10000 + ((c & 0x3ff) << 10) + (low & 0x3ff);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ABC[a >> 2];
    out += ABC[((a & 3) << 4) | (b >> 4)];
    out += b === undefined ? '=' : ABC[((b & 15) << 2) | (c >> 6)];
    out += c === undefined ? '=' : ABC[c & 63];
  }
  return out;
}

function computeResultSummary(matchResult, differences = null) {
  const matches = matchResult.matches || [];
  const unmatchedBaselineAccount =
    matchResult.unmatchedBaselineAccount ?? matchResult.unmatchedBank ?? [];
  const unmatchedTargetAccount =
    matchResult.unmatchedTargetAccount ?? matchResult.unmatchedAccounting ?? [];

  const totalBankRecords =
    unmatchedBaselineAccount.length +
    matches.reduce(
      (sum, m) => sum + (m.baselineRecord ? 1 : m.baselineRecords?.length ?? 0),
      0
    );
  const totalAccountingRecords =
    unmatchedTargetAccount.length +
    matches.reduce(
      (sum, m) =>
        sum + (m.targetRecord ? 1 : m.targetRecords?.length ?? 0),
      0
    );

  const total =
    matches.length + unmatchedBaselineAccount.length + unmatchedTargetAccount.length;
  const matchRate = total > 0 ? parseFloat(((matches.length / total) * 100).toFixed(2)) : 0;

  return {
    matchCount: matches.length,
    unmatchedBankCount: unmatchedBaselineAccount.length,
    unmatchedAccountingCount: unmatchedTargetAccount.length,
    matchRate,
    totalRecords: totalBankRecords + totalAccountingRecords,
    differenceCount: (differences && Array.isArray(differences) ? differences : []).length,
  };
}

function generateTasksSql(taskId, name, description, matchResult, opts = {}) {
  const table = `${effectiveSchemaPrefix(opts)}${formatIdentifier('reconciliation_tasks')}`;

  const nameVal = sqlValue(name ?? '对账任务');
  const descriptionVal = description != null && description !== '' ? sqlValue(description) : 'NULL';
  const baselineName = opts.baseline_name != null && opts.baseline_name !== '' ? sqlValue(opts.baseline_name) : 'NULL';
  const baselineType = opts.baseline_type != null && opts.baseline_type !== '' ? sqlValue(opts.baseline_type) : 'NULL';
  const targetName = opts.target_name != null && opts.target_name !== '' ? sqlValue(opts.target_name) : 'NULL';
  const targetType = opts.target_type != null && opts.target_type !== '' ? sqlValue(opts.target_type) : 'NULL';
  const status = sqlValue('COMPLETED');
  const config = 'NULL';

  const summary = computeResultSummary(matchResult, opts.differences);
  const jsonStr = JSON.stringify(summary);
  const base64 = toBase64(jsonStr);
  const resultSummary = `convert_from(decode('${base64}', 'base64'), 'UTF8')::json`;

  return `-- reconciliation_tasks (task_id: ${taskId})\nINSERT INTO ${table} (id, name, description, baseline_name, baseline_type, target_name, target_type, status, config, result_summary) VALUES\n  (${sqlValue(taskId, true)}, ${nameVal}, ${descriptionVal}, ${baselineName}, ${baselineType}, ${targetName}, ${targetType}, ${status}, ${config}, ${resultSummary});\n\n`;
}

function resolveIdsByType(r1, r2, opts = {}) {
  const type1 = r1?.type || r1?.account_type;
  const type2 = r2?.type || r2?.account_type;
  if (type1 === 'BANK_STATEMENT' && type2 === 'ACCOUNTING_RECORD') {
    return { bankId: r1?.id, accountingId: r2?.id };
  }
  if (type1 === 'ACCOUNTING_RECORD' && type2 === 'BANK_STATEMENT') {
    return { bankId: r2?.id, accountingId: r1?.id };
  }
  const { baseline_type: baselineType, target_type: targetType } = opts;
  if (baselineType === 'BANK_STATEMENT' && targetType === 'ACCOUNTING_RECORD') {
    return { bankId: r1?.id, accountingId: r2?.id };
  }
  if (baselineType === 'ACCOUNTING_RECORD' && targetType === 'BANK_STATEMENT') {
    return { bankId: r2?.id, accountingId: r1?.id };
  }
  return { bankId: null, accountingId: null };
}

function generateMatchesSql(taskId, matchResult, opts = {}) {
  const table = `${effectiveSchemaPrefix(opts)}${formatIdentifier('reconciliation_matches')}`;
  const lines = [];

  for (const match of matchResult.matches || []) {
    const matchType = match.matchType || 'FUZZY';
    const matchScore = match.matchScore ?? 0;
    const matchGroupId = randomUuid();

    const collectSides = () => {
      const side1 = [match.baselineRecord, ...(match.baselineRecords || [])].filter(Boolean);
      const side2 = [match.targetRecord, ...(match.targetRecords || [])].filter(Boolean);
      return { side1, side2 };
    };

    const { side1, side2 } = collectSides();
    if (side1.length === 0 || side2.length === 0) continue;

    for (const r1 of side1) {
      for (const r2 of side2) {
        const { bankId, accountingId } = resolveIdsByType(r1, r2, opts);
        const bankVal = sqlBigintLiteral(bankId);
        const accVal = sqlBigintLiteral(accountingId);
        if (bankVal !== 'NULL' && accVal !== 'NULL') {
          const groupId = side1.length > 1 || side2.length > 1 ? `'${matchGroupId}'::uuid` : 'NULL';
          lines.push(
            `  (${sqlValue(taskId, true)}, ${bankVal}, ${accVal}, ${matchScore}, ${sqlValue(matchType)}, ${groupId})`
          );
        }
      }
    }
  }

  if (lines.length === 0) return `-- reconciliation_matches: 无匹配记录\n`;
  return `-- reconciliation_matches\nINSERT INTO ${table} (task_id, bank_record_id, accounting_record_id, match_score, match_type, match_group_id) VALUES\n${lines.join(',\n')};\n\n`;
}

function generateDifferencesSql(taskId, differences, opts = {}) {
  const table = `${effectiveSchemaPrefix(opts)}${formatIdentifier('reconciliation_differences')}`;
  const lines = [];
  const diffList = Array.isArray(differences) ? differences : [];

  for (const d of diffList) {
    const taskIdVal = sqlValue(taskId, true);
    const diffType = sqlValue(d.differenceType);
    const bankId =
      d.bankRecordId != null ? sqlBigintLiteral(d.bankRecordId) : 'NULL';
    const accountingId =
      d.accountingRecordId != null ? sqlBigintLiteral(d.accountingRecordId) : 'NULL';
    const diffAmount = d.differenceAmount != null ? String(d.differenceAmount) : 'NULL';
    const diffDays = d.differenceDays != null ? String(d.differenceDays) : 'NULL';
    const description = sqlValue(d.description);
    const severity = sqlValue(d.severity || 'NORMAL');

    lines.push(
      `  (${taskIdVal}, ${diffType}, ${accountingId}, ${bankId}, ${diffAmount}, ${diffDays}, ${description}, ${severity})`
    );
  }

  if (lines.length === 0) return `-- reconciliation_differences: 无差异记录\n`;
  return `-- reconciliation_differences\nINSERT INTO ${table} (task_id, difference_type, accounting_record_id, bank_record_id, difference_amount, difference_days, description, severity) VALUES\n${lines.join(',\n')};\n\n`;
}

const INSERT_SQL_FALLBACK_QUERY = 'SELECT 1;';

function shouldOmitTaskInserts(matchResult) {
  if (matchResult == null || typeof matchResult !== 'object' || Array.isArray(matchResult)) {
    return true;
  }
  const matches = matchResult.matches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return true;
  }
  return false;
}

function shouldOmitForMissingName(opts = {}) {
  if (opts.name == null) return true;
  return String(opts.name).trim() === '';
}

function generateInsertSql(matchResult, differences, opts = {}) {
  if (shouldOmitTaskInserts(matchResult)) {
    return { sql: INSERT_SQL_FALLBACK_QUERY, taskId: '' };
  }
  if (shouldOmitForMissingName(opts)) {
    return { sql: INSERT_SQL_FALLBACK_QUERY, taskId: '' };
  }

  const taskId = randomUuid();
  const name = String(opts.name).trim();
  const description = opts.description ?? '';

  const tasksSql = generateTasksSql(taskId, name, description, matchResult, {
    ...opts,
    differences,
  });
  const matchesSql = generateMatchesSql(taskId, matchResult, opts);
  const diffSql = generateDifferencesSql(taskId, differences, opts);

  const rawSql = tasksSql + matchesSql + diffSql;
  const sql = rawSql
    .replace(/--[^\n]*\n?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { sql, taskId };
}

/**
 * 将算子/API 侧 camelCase 映射为差异检测与 INSERT SQL 使用的字段；snake 已存在且非空时不覆盖。
 * @param {object} opts
 * @returns {object}
 */
function normalizeDetectAndInsertOpts(opts = {}) {
  const o =
    opts && typeof opts === 'object' && !Array.isArray(opts) ? { ...opts } : {};
  if ((o.name == null || String(o.name).trim() === '') && o.taskName != null) {
    const tn = String(o.taskName).trim();
    if (tn !== '') o.name = tn;
  }
  if (o.baseline_type == null || String(o.baseline_type).trim() === '') {
    if (o.baselineType != null && String(o.baselineType).trim() !== '') {
      o.baseline_type = String(o.baselineType).trim();
    }
  }
  if (o.target_type == null || String(o.target_type).trim() === '') {
    if (o.targetType != null && String(o.targetType).trim() !== '') {
      o.target_type = String(o.targetType).trim();
    }
  }
  if (o.baseline_name == null || String(o.baseline_name).trim() === '') {
    if (o.baselineName != null && String(o.baselineName).trim() !== '') {
      o.baseline_name = String(o.baselineName).trim();
    }
  }
  if (o.target_name == null || String(o.target_name).trim() === '') {
    if (o.targetName != null && String(o.targetName).trim() !== '') {
      o.target_name = String(o.targetName).trim();
    }
  }
  return o;
}

/**
 * 对 matcher 输出先做差异检测，再生成与 reconciliation-insert-sql 相同结构的 SQL 结果。
 *
 * @param {object} matchResult - reconciliation-matcher 输出
 * @param {object} opts - 合并差异检测配置与 generateInsertSql 的 opts（name / taskName、schema、baseline_type / baselineType 等）
 * @returns {Promise<{ sql: string, taskId: string }>}
 */
async function detectAndGenerateInsertSql(matchResult, opts = {}) {
  const normalizedOpts = normalizeDetectAndInsertOpts(opts);
  const differences = await detectDifferences(matchResult, normalizedOpts);
  return generateInsertSql(matchResult, differences, normalizedOpts);
}

export {
  createDifferenceDetector as DifferenceDetector,
  computeResultSummary,
  detectAndGenerateInsertSql,
  detectDifferences,
  daysDiff,
  formatDate,
  formatMonth,
  generateDifferencesSql,
  generateInsertSql,
  generateMatchesSql,
  generateTasksSql,
  isUuid,
  shouldOmitTaskInserts,
  toUuid,
};
