/**
 * 数据源对账算子：同一数据源 ID，baselineName / targetName 映射为 POST name + 固定 isBaseline，再 matchRecords
 *
 * @category finance
 * @version 1.1.0
 */

module.exports = {
  info: {
    name: 'datasource-reconciliation',
    title: '数据源对账',
    description:
      '对同一数据源 ID 用 baselineName（isBaseline=1）、targetName（isBaseline=0）各 POST 一次拉取基准账与目标账并匹配；须传 schema、taskName。HTTP 响应 data 仅含 sql、taskId（reconciliation-detect-and-insert-sql 输出；无匹配等场景见脚本说明）。完整中间结果（config、matches、未匹配列表等）请用仓库内 test/script/datasource-reconcile-diagnostics.js 本地调用 reconcileDiagnostics。可选 enableAgentMatching（默认 false）：为 true 且两侧均有未匹配记录时须传 agentId；仅一侧未匹配时不调智能体。拉取超时见 GENISPACE_DATASOURCE_RECONCILIATION_TIMEOUT 或 GENISPACE_DATASOURCE_API_TIMEOUT，默认 5 分钟（300000ms）',
    version: '1.1.0',
    category: 'finance',
    tags: ['reconciliation', 'datasource', 'finance', 'matching'],
    author: 'GeniSpace AI Team',
    license: 'MIT',
  },
  routes: './datasource-reconciliation.routes.js',
  openapi: {
    paths: {
      '/reconcile': {
        post: {
          summary: '同一数据源 POST 双次拉取并执行对账匹配',
          description:
            '基址：GENISPACE_API_BASE_URL。请求体须含 datasourceId（UUID）、baselineName、targetName、schema、taskName；服务端将分别 POST { name: baselineName, isBaseline: 1 } 与 { name: targetName, isBaseline: 0 }。成功时响应 data 仅含 sql、taskId。可选 enableAgentMatching、agentId、matchConfig 等同前。完整诊断输出见 test/script/datasource-reconcile-diagnostics.js。',
          tags: ['数据源对账'],
          security: [{ GeniSpaceAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
                    'datasourceId',
                    'baselineName',
                    'targetName',
                    'schema',
                    'taskName',
                  ],
                  properties: {
                    datasourceId: {
                      type: 'string',
                      format: 'uuid',
                      description: '数据源 UUID，对应 /datasources/{id}/data',
                    },
                    baselineName: {
                      type: 'string',
                      description: '基准账任务名称，对应 POST body 的 name，isBaseline 固定为 1',
                    },
                    targetName: {
                      type: 'string',
                      description: '目标账任务名称，对应 POST body 的 name，isBaseline 固定为 0',
                    },
                    schema: {
                      type: 'string',
                      description: '必填，trim 后写入响应 data.config.schema',
                    },
                    taskName: {
                      type: 'string',
                      description: '必填，trim 后写入响应 data.config.taskName',
                    },
                    enableAgentMatching: {
                      type: 'boolean',
                      default: false,
                      description:
                        '是否启用智能体二次匹配；默认 false；为 true 且基准侧与目标侧均有未匹配记录时才调用 GeniSpace 任务型智能体 execute；仅一侧未匹配时不调用',
                    },
                    agentId: {
                      type: 'string',
                      format: 'uuid',
                      description:
                        '当 enableAgentMatching 为 true 且两侧均存在未匹配记录时必填：任务型智能体 UUID',
                    },
                    matchConfig: {
                      type: 'object',
                      description:
                        '传入 reconciliation-matcher；除 amountTolerance、dateTolerance、minMatchScore 外还可设 aggregateMinMatchScore、aggregateMaxDateSpreadDays、tailAggregate*、lateAggregate* 等',
                      properties: {
                        amountTolerance: { type: 'number' },
                        dateTolerance: { type: 'number' },
                        minMatchScore: { type: 'number' },
                        aggregateMinMatchScore: { type: 'number' },
                        aggregateMaxDateSpreadDays: { type: 'number' },
                        tailAggregateMinMatchScore: { type: 'number' },
                        tailAggregateMaxDateSpreadDays: { type: 'number' },
                        lateAggregateMinMatchScore: { type: 'number' },
                        lateAggregateMaxDateSpreadDays: { type: 'number' },
                        lateAggregateMaxUnmatchedBaseline: { type: 'number' },
                        lateAggregateMaxUnmatchedTarget: { type: 'number' },
                        enableLateAggregate: { type: 'boolean' },
                        etcAggregateDateTolerance: { type: 'number' },
                        etcAggregateMinMatchScore: { type: 'number' },
                        etcAggregateMaxSubsetSize: { type: 'number' },
                        etcAggregateCandidateCap: { type: 'number' },
                        lateAggregateTinyBaselineLe: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description:
                '对账完成：data 仅含 sql、taskId，与 reconciliation-detect-and-insert-sql.detectAndGenerateInsertSql 一致',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      timestamp: { type: 'string', format: 'date-time' },
                      message: { type: 'string', example: '数据源对账完成' },
                      data: {
                        type: 'object',
                        properties: {
                          sql: {
                            type: 'string',
                            description:
                              '写入 reconciliation_* 表的 INSERT 语句（已压成单行）；无匹配或缺任务名时为 SELECT 1;',
                          },
                          taskId: {
                            type: 'string',
                            description:
                              '本次对账任务 UUID；未生成真实 INSERT 时为空字符串',
                          },
                        },
                        required: ['sql', 'taskId'],
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
  },
};
