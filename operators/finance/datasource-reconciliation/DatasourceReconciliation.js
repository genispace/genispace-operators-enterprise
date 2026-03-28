/**
 * 单一数据源：POST { name, isBaseline } 拉取基准账 / 目标账，再调用 reconciliation-matcher
 */

const axios = require('axios');
const logger = require('../../../src/utils/logger');
const { matchRecords } = require('./reconciliation-matcher.js');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_DATASOURCE_HTTP_TIMEOUT_MS = 60000;

/** 对账算子拉取数据源时 axios 超时：构造参数 config.timeout > GENISPACE_DATASOURCE_RECONCILIATION_TIMEOUT > GENISPACE_DATASOURCE_API_TIMEOUT > 默认 60000 */
function resolveDatasourceHttpTimeoutMs(configTimeout) {
  const fromConfig = Number(configTimeout);
  if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
  const fromReconcile = parseInt(process.env.GENISPACE_DATASOURCE_RECONCILIATION_TIMEOUT || '', 10);
  if (Number.isFinite(fromReconcile) && fromReconcile > 0) return fromReconcile;
  const fromGeneric = parseInt(process.env.GENISPACE_DATASOURCE_API_TIMEOUT || '', 10);
  if (Number.isFinite(fromGeneric) && fromGeneric > 0) return fromGeneric;
  return DEFAULT_DATASOURCE_HTTP_TIMEOUT_MS;
}

/** reconciliation-matcher 在匹配阶段写入的日期缓存，仅内部使用，不应出现在 API 响应中 */
function stripRecordTsMs(record) {
  if (record && typeof record === 'object' && Object.prototype.hasOwnProperty.call(record, '__tsMs')) {
    delete record.__tsMs;
  }
}

function stripMatchEntryTsMs(entry) {
  if (!entry || typeof entry !== 'object') return;
  stripRecordTsMs(entry.baselineRecord);
  stripRecordTsMs(entry.targetRecord);
  if (Array.isArray(entry.baselineRecords)) entry.baselineRecords.forEach(stripRecordTsMs);
  if (Array.isArray(entry.targetRecords)) entry.targetRecords.forEach(stripRecordTsMs);
}

function stripReconciliationTsMs(matches, unmatchedBaseline, unmatchedTarget) {
  (matches || []).forEach(stripMatchEntryTsMs);
  (unmatchedBaseline || []).forEach(stripRecordTsMs);
  (unmatchedTarget || []).forEach(stripRecordTsMs);
}

/** 取数据行首条非空 type（如 ACCOUNTING_RECORD、BANK_STATEMENT） */
function extractRowType(rows) {
  for (const r of rows || []) {
    if (r && typeof r === 'object' && r.type != null && String(r.type).trim() !== '') {
      return String(r.type).trim();
    }
  }
  return null;
}

class DatasourceReconciliation {
  constructor(config = {}) {
    this.config = {
      baseURL:
        config.baseURL ||
        process.env.GENISPACE_API_BASE_URL ||
        'https://api.genispace.com',
      timeout: resolveDatasourceHttpTimeoutMs(config.timeout),
      ...config,
    };
  }

  checkAuth(req) {
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，请在请求头中提供 GeniSpace API Key');
    }
  }

  /**
   * 数据源接口要求 Authorization: Bearer。
   * 使用请求通过 GeniSpace 中间件后得到的 apiKey（与请求头 GeniSpace / Authorization: GeniSpace 中为同一串），不再读环境变量。
   */
  static resolveDatasourceBearer(req) {
    const k = req?.genispace?.apiKey;
    if (k && String(k).trim()) return String(k).trim();
    return null;
  }

  static assertDatasourceId(id) {
    if (!id || typeof id !== 'string' || !UUID_RE.test(id.trim())) {
      throw new Error('datasourceId 须为合法 UUID');
    }
    return id.trim();
  }

  /**
   * @param {object} side - { name, isBaseline }
   * @param {string} label - 用于错误信息
   */
  static assertPostSide(side, label) {
    if (!side || typeof side !== 'object') {
      throw new Error(`缺少 ${label}，须为对象 { name, isBaseline }`);
    }
    const name = side.name;
    if (name == null || String(name).trim() === '') {
      throw new Error(`${label}.name 为必填（任务名称）`);
    }
    const isBaseline = side.isBaseline;
    if (
      isBaseline === undefined ||
      isBaseline === null ||
      Number.isNaN(Number(isBaseline))
    ) {
      throw new Error(`${label}.isBaseline 须为数字（用于区分基准账 / 目标账）`);
    }
    const body = {
      name: String(name).trim(),
      isBaseline: Number(isBaseline),
    };
    if (side.extra && typeof side.extra === 'object') {
      Object.assign(body, side.extra);
    }
    return body;
  }

  extractRows(payload) {
    if (payload == null) return [];
    if (Array.isArray(payload)) return payload;
    // 平台常见：{ success, data: { data: [...], metadata } }
    if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.records)) return payload.data.records;
    return [];
  }

  /**
   * POST /datasources/:id/data ，body 为 { name, isBaseline }（及 side.extra）
   */
  async fetchDatasourcePost(datasourceId, bearerToken, postBody) {
    const base = this.config.baseURL.replace(/\/$/, '');
    const url = `${base}/datasources/${encodeURIComponent(datasourceId)}/data`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    };
    let data;
    try {
      ({ data } = await axios.post(url, postBody, {
        headers,
        timeout: this.config.timeout,
      }));
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.response?.data?.error ||
        (typeof e.response?.data === 'string' ? e.response.data : null);
      throw new Error(msg || e.message || '数据源 POST 请求失败');
    }
    if (data && data.error && !Array.isArray(data.data)) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }
    return { rows: this.extractRows(data), raw: data };
  }

  /**
   * @param {import('express').Request} req
   * @param {object} body
   */
  async reconcile(req, body) {
    this.checkAuth(req);

    if (!body.datasourceId || typeof body.datasourceId !== 'string') {
      throw new Error('请求体须包含 datasourceId（字符串 UUID）');
    }
    const datasourceId = DatasourceReconciliation.assertDatasourceId(body.datasourceId);

    if (body.schema == null || typeof body.schema !== 'string' || body.schema.trim() === '') {
      throw new Error('缺少必需的 schema（非空字符串）');
    }
    if (body.taskName == null || typeof body.taskName !== 'string' || body.taskName.trim() === '') {
      throw new Error('缺少必需的 taskName（非空字符串）');
    }
    const schema = body.schema.trim();
    const taskName = body.taskName.trim();

    const baselineBody = DatasourceReconciliation.assertPostSide(
      { name: body.baselineName, isBaseline: 1 },
      'baseline'
    );
    const targetBody = DatasourceReconciliation.assertPostSide(
      { name: body.targetName, isBaseline: 0 },
      'target'
    );

    const bearerToken = DatasourceReconciliation.resolveDatasourceBearer(req);
    if (!bearerToken) {
      throw new Error(
        '无法取得用于数据源 API 的密钥：请使用 GeniSpace 头通过算子认证（与数据源 Bearer 使用同一 API Key）'
      );
    }

    const [b, t] = await Promise.all([
      this.fetchDatasourcePost(datasourceId, bearerToken, baselineBody),
      this.fetchDatasourcePost(datasourceId, bearerToken, targetBody),
    ]);

    const baselineRecords = b.rows;
    const targetRecords = t.rows;

    const matchConfig =
      body.matchConfig && typeof body.matchConfig === 'object' ? body.matchConfig : {};

    logger.info('数据源对账：POST 拉取完成，开始匹配', {
      datasourceId,
      baselineCount: baselineRecords.length,
      targetCount: targetRecords.length,
    });

    const { matches, unmatchedBaselineAccount, unmatchedTargetAccount } = matchRecords(
      baselineRecords,
      targetRecords,
      matchConfig
    );

    stripReconciliationTsMs(matches, unmatchedBaselineAccount, unmatchedTargetAccount);

    const baselineType = extractRowType(baselineRecords);
    const targetType = extractRowType(targetRecords);

    return {
      schema,
      taskName,
      baselineType,
      targetType,
      baselineRecordCount: baselineRecords.length,
      targetRecordCount: targetRecords.length,
      matchesCount: matches.length,
      unmatchedBaselineAccountCount: unmatchedBaselineAccount.length,
      unmatchedTargetAccountCount: unmatchedTargetAccount.length,
      matches,
      unmatchedBaselineAccount,
      unmatchedTargetAccount,
    };
  }
}

module.exports = DatasourceReconciliation;
