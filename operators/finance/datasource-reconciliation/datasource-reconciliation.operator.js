/**
 * 数据源对账算子：同一数据源 ID，baselineName / targetName 映射为 POST name + 固定 isBaseline，再 matchRecords
 *
 * @category finance
 * @version 1.0.9
 */

module.exports = {
  info: {
    name: 'datasource-reconciliation',
    title: '数据源对账',
    description:
      '对同一数据源 ID 用 baselineName（isBaseline=1）、targetName（isBaseline=0）各 POST 一次拉取基准账与目标账，将响应中的记录传入对账脚本；须传 schema、taskName（响应原样回传）；baselineType、targetType 取自数据行首条记录的 type（如 ACCOUNTING_RECORD、BANK_STATEMENT）。拉取数据源 HTTP 超时见环境变量 GENISPACE_DATASOURCE_RECONCILIATION_TIMEOUT（毫秒，优先）或 GENISPACE_DATASOURCE_API_TIMEOUT，默认 60000',
    version: '1.0.9',
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
            '基址：GENISPACE_API_BASE_URL。请求体须含 datasourceId（UUID）、baselineName、targetName、schema、taskName；服务端将分别 POST { name: baselineName, isBaseline: 1 } 与 { name: targetName, isBaseline: 0 }。baselineType/targetType 来自各侧数据行 type 字段。数据源接口使用 Authorization: Bearer，令牌与请求头中通过 GeniSpace 认证提交的 API Key 相同。单次拉取数据源 HTTP 超时（毫秒）：环境变量 GENISPACE_DATASOURCE_RECONCILIATION_TIMEOUT（仅本算子，优先），否则 GENISPACE_DATASOURCE_API_TIMEOUT，默认 60000；两侧并行拉取，各自独立计时。',
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
                      description: '必填，trim 后写入响应 data.schema',
                    },
                    taskName: {
                      type: 'string',
                      description: '必填，trim 后写入响应 data.taskName',
                    },
                    matchConfig: {
                      type: 'object',
                      properties: {
                        amountTolerance: { type: 'number' },
                        dateTolerance: { type: 'number' },
                        minMatchScore: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '对账完成（data 内为 matchRecords 结果 + 元数据）',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          schema: { type: 'string', description: '与入参 schema 一致（已 trim）' },
                          taskName: { type: 'string', description: '与入参 taskName 一致（已 trim）' },
                          baselineType: {
                            type: 'string',
                            nullable: true,
                            enum: ['ACCOUNTING_RECORD', 'BANK_STATEMENT'],
                            description:
                              '基准侧数据行 type（取首条非空；无数据行时为 null；常见值为 ACCOUNTING_RECORD 或 BANK_STATEMENT）',
                          },
                          targetType: {
                            type: 'string',
                            nullable: true,
                            enum: ['ACCOUNTING_RECORD', 'BANK_STATEMENT'],
                            description:
                              '目标侧数据行 type（取首条非空；无数据行时为 null；常见值为 ACCOUNTING_RECORD 或 BANK_STATEMENT）',
                          },
                          baselineRecordCount: { type: 'integer' },
                          targetRecordCount: { type: 'integer' },
                          matchesCount: { type: 'integer' },
                          unmatchedBaselineAccountCount: { type: 'integer' },
                          unmatchedTargetAccountCount: { type: 'integer' },
                          matches: { type: 'array' },
                          unmatchedBaselineAccount: { type: 'array' },
                          unmatchedTargetAccount: { type: 'array' },
                          processingTimeMs: { type: 'integer' },
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
  },
};
