/**
 * GeniSpace 智能体执行（专用协议）转发路由
 */

const express = require('express');
const AgentExecute = require('./AgentExecute');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');

const router = express.Router();
const service = new AgentExecute();

router.post(
  '/execute',
  asyncHandler(async (req, res) => {
    const start = Date.now();
    try {
      const { agentId, result } = await service.execute(req, req.body || {});
      sendSuccessResponse(
        res,
        {
          agentId,
          result,
          processingTimeMs: Date.now() - start,
        },
        '智能体执行完成'
      );
    } catch (error) {
      const msg = error.message || String(error);
      let code = 'AGENT_EXECUTE_FAILED';
      let status = 500;
      if (
        msg.includes('须为合法 UUID') ||
        msg.includes('agentId') ||
        msg.includes('inputs') ||
        msg.includes('settings')
      ) {
        code = 'INVALID_REQUEST';
        status = 400;
      } else if (msg.includes('无法取得用于智能体执行 API')) {
        code = 'MISSING_API_KEY_FOR_AGENT_EXECUTE';
        status = 401;
      } else if (msg.includes('返回 401') || msg.includes('返回 403')) {
        code = 'AGENT_EXECUTE_AUTH_ERROR';
        status = 502;
      } else if (msg.includes('返回 4')) {
        code = 'AGENT_EXECUTE_UPSTREAM_ERROR';
        status = 502;
      } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        code = 'AGENT_EXECUTE_TIMEOUT';
        status = 504;
      }
      sendErrorResponse(res, msg, code, { originalError: msg }, status);
    }
  })
);

module.exports = router;
