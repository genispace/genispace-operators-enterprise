/**
 * GeniSpace 平台信息算子路由实现
 * 演示如何在算子中使用 GeniSpace SDK
 * 更新时间: 2025-09-24
 */

const express = require('express');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');
const logger = require('../../../src/utils/logger');

const router = express.Router();

/**
 * 获取用户资料
 */
router.post('/user-profile', asyncHandler(async (req, res) => {
  try {
    // 调试信息
    logger.info('用户资料请求调试', {
      hasGenispace: !!req.genispace,
      hasClient: !!(req.genispace && req.genispace.client),
      headers: Object.keys(req.headers),
      authHeader: req.headers.authorization ? req.headers.authorization.substring(0, 20) + '...' : 'None'
    });

    // 检查是否已认证
    if (!req.genispace || !req.genispace.client) {
      return sendErrorResponse(res, '需要认证才能访问此功能', 'AUTHENTICATION_REQUIRED', null, 401);
    }

    const { user, client } = req.genispace;
    const { includeStatistics = true, includeTeams = true } = req.body || {};

    const responseData = {
      user: user,
      platform: {
        authenticated: true,
        apiKeyStatus: 'valid',
        connection: 'GeniSpace SDK',
        version: '1.0.0'
      }
    };

    // 如果需要包含统计信息
    if (includeStatistics) {
      try {
        const statistics = await client.users.getStatistics();
        responseData.statistics = statistics;
      } catch (error) {
        logger.warn('获取用户统计失败', { error: error ? (error ? (error.message || String(error)) : "Unknown error" || String(error)) : 'Unknown error' });
        responseData.statistics = null;
      }
    }

    // 如果需要包含团队信息
    if (includeTeams) {
      try {
        const teams = await client.users.getTeams();
        responseData.teams = teams;
      } catch (error) {
        logger.warn('获取用户团队失败', { error: error ? (error ? (error.message || String(error)) : "Unknown error" || String(error)) : 'Unknown error' });
        responseData.teams = [];
      }
    }

    logger.info('用户资料获取成功', {
      userId: user.id,
      userName: user.name,
      includeStatistics,
      includeTeams
    });

    return sendSuccessResponse(res, responseData);

  } catch (error) {
    logger.error('获取用户资料失败', {
      error: error ? (error ? (error.message || String(error)) : "Unknown error" || String(error)) : 'Unknown error',
      stack: error ? error ? error.stack : "No stack trace" : 'No stack trace'
    });

    return sendErrorResponse(res, '获取用户资料失败', 'GET_USER_PROFILE_ERROR', null, 500);
  }
}));

/**
 * 获取用户智能体列表
 */
router.post('/agents', asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, agentType } = req.body || {};

    // 检查是否已认证
    if (!req.genispace || !req.genispace.client) {
      return sendErrorResponse(res, '需要认证才能访问此功能', 401, 'AUTHENTICATION_REQUIRED');
    }

    const { client, user } = req.genispace;

    try {
      // 调用 SDK 获取智能体列表
      // 注意：新版SDK的list方法可能需要使用不同的参数格式
      const agentsResponse = await client.agents.list({
        page,
        limit,
        agentType
      });

      // 处理响应数据，适配前端期望的格式
      let responseData;
      
      if (agentsResponse.data && Array.isArray(agentsResponse.data)) {
        // 如果返回的是分页格式 {data: [...], pagination: {...}}
        responseData = {
          agents: agentsResponse.data,
          pagination: agentsResponse.pagination || {
            currentPage: page,
            totalPages: Math.ceil(agentsResponse.data.length / limit),
            totalItems: agentsResponse.data.length,
            itemsPerPage: limit
          }
        };
      } else if (Array.isArray(agentsResponse)) {
        // 如果直接返回数组
        responseData = {
          agents: agentsResponse,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(agentsResponse.length / limit),
            totalItems: agentsResponse.length,
            itemsPerPage: limit
          }
        };
      } else {
        // 其他格式，尝试直接使用
        responseData = agentsResponse;
      }

      logger.info('智能体列表获取成功', {
        userId: user.id,
        page,
        limit,
        agentType,
        totalAgents: responseData.pagination?.totalItems || responseData.agents?.length || 0
      });

      return sendSuccessResponse(res, responseData);

    } catch (error) {
      logger.error('调用 SDK 获取智能体列表失败', {
        error: error ? (error.message || String(error)) : "Unknown error",
        userId: user.id,
        page,
        limit,
        agentType
      });

      return sendErrorResponse(res, '获取智能体列表失败', 500, 'GET_AGENTS_ERROR');
    }

  } catch (error) {
    logger.error('获取智能体列表失败', {
      error: error ? (error.message || String(error)) : "Unknown error",
      stack: error ? error.stack : "No stack trace"
    });

    return sendErrorResponse(res, '获取智能体列表失败', 500, 'GET_AGENTS_ERROR');
  }
}));


module.exports = router;
