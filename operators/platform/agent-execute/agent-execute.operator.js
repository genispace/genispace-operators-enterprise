/**
 * 调用 GeniSpace 任务型智能体执行 API（专用协议：inputs + settings，Bearer 认证）
 *
 * @category platform
 * @version 1.0.1
 */

module.exports = {
  info: {
    name: 'agent-execute',
    title: '智能体执行',
    description:
      '转发调用 GeniSpace 智能体执行端点 POST /agents/{agentId}/execute（任务型专用协议，支持记忆、知识库等）。须在请求体传入 agentId（任务型智能体 UUID），不在算子内写死默认 ID。基址：GENISPACE_API_BASE_URL，未设置时默认 https://api.genispace.cn。上游使用 Authorization: Bearer，令牌与 GeniSpace 认证提交的 API Key 相同。HTTP 超时：GENISPACE_AGENT_EXECUTE_TIMEOUT_MS（毫秒），默认 5 分钟（300000）。',
    version: '1.0.1',
    category: 'platform',
    tags: ['genispace', 'agent', 'execute', 'task'],
    author: 'GeniSpace AI Team',
    license: 'MIT',
  },
  routes: './agent-execute.routes.js',
  openapi: {
    paths: {
      '/execute': {
        post: {
          summary: '执行任务型智能体（专用协议）',
          description:
            '请求体须含 `agentId`（任务型智能体 UUID）。`inputs`（如 session_id、unmatchedTargetAccount、unmatchedBaselineAccount 等）、`settings`（如 maxTokens）与平台文档一致。未传 `settings` 时默认 `{ "maxTokens": 8000 }`。',
          tags: ['智能体执行'],
          security: [{ GeniSpaceAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['agentId'],
                  properties: {
                    agentId: {
                      type: 'string',
                      format: 'uuid',
                      description: '必填，任务型智能体 UUID',
                    },
                    inputs: {
                      type: 'object',
                      description: '智能体入参，与平台「智能体执行协议」一致',
                      properties: {
                        session_id: {
                          type: 'string',
                          description: '会话 ID，用于记忆能力',
                        },
                        unmatchedTargetAccount: {
                          type: 'array',
                          description: '未匹配目标账记录列表',
                          items: { type: 'object' },
                        },
                        unmatchedBaselineAccount: {
                          type: 'array',
                          description: '未匹配基准账记录列表',
                          items: { type: 'object' },
                        },
                      },
                      additionalProperties: true,
                    },
                    settings: {
                      type: 'object',
                      description: '执行设置；与 inputs 合并时默认带 maxTokens: 8000，可被覆盖',
                      properties: {
                        maxTokens: { type: 'integer', example: 8000 },
                      },
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '上游智能体接口成功响应（result 为平台返回 JSON）',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          agentId: { type: 'string', format: 'uuid' },
                          result: { type: 'object', description: 'GeniSpace /execute 原始响应体' },
                          processingTimeMs: { type: 'integer' },
                        },
                      },
                      message: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
