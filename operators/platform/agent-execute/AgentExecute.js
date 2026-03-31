/**
 * 转发调用 GeniSpace 任务型智能体执行协议（POST /agents/{id}/execute）
 */

const axios = require('axios');

/** 未配置构造参数与环境变量时，POST /agents/{id}/execute 的 axios 超时（5 分钟） */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveExecuteTimeoutMs(configTimeout) {
  const fromConfig = Number(configTimeout);
  if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
  const fromEnv = parseInt(process.env.GENISPACE_AGENT_EXECUTE_TIMEOUT_MS || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_TIMEOUT_MS;
}

class AgentExecute {
  constructor(config = {}) {
    this.baseURL = (
      config.baseURL ||
      process.env.GENISPACE_API_BASE_URL ||
      'https://api.genispace.cn'
    ).replace(/\/$/, '');
    this.timeout = resolveExecuteTimeoutMs(config.timeout);
  }

  /** 与数据源算子一致：使用 GeniSpace 认证后的 apiKey 作为上游 Bearer */
  static resolveBearer(req) {
    const k = req?.genispace?.apiKey;
    if (k && String(k).trim()) return String(k).trim();
    return null;
  }

  static assertAgentId(agentId) {
    if (!agentId || typeof agentId !== 'string' || !UUID_RE.test(agentId.trim())) {
      throw new Error('agentId 须为合法 UUID');
    }
    return agentId.trim();
  }

  /**
   * @param {import('express').Request} req
   * @param {{ agentId: string, inputs?: object, settings?: object }} body
   */
  async execute(req, body = {}) {
    const token = AgentExecute.resolveBearer(req);
    if (!token) {
      throw new Error('无法取得用于智能体执行 API 的令牌，请通过 GeniSpace 认证提供 API Key');
    }

    const rawId = body.agentId != null ? String(body.agentId).trim() : '';
    if (!rawId) {
      throw new Error('agentId 为必填，请传入任务型智能体 UUID');
    }
    const agentId = AgentExecute.assertAgentId(rawId);

    const inputs =
      body.inputs != null && typeof body.inputs === 'object' && !Array.isArray(body.inputs)
        ? body.inputs
        : {};
    const settings =
      body.settings != null && typeof body.settings === 'object' && !Array.isArray(body.settings)
        ? { maxTokens: 8000, ...body.settings }
        : { maxTokens: 8000 };

    const url = `${this.baseURL}/agents/${agentId}/execute`;

    try {
      const res = await axios.post(
        url,
        { inputs, settings },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: this.timeout,
        }
      );
      return { agentId, result: res.data };
    } catch (err) {
      if (err.response) {
        const st = err.response.status;
        const data = err.response.data;
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        throw new Error(`智能体执行接口返回 ${st}: ${text}`);
      }
      throw err;
    }
  }
}

module.exports = AgentExecute;
