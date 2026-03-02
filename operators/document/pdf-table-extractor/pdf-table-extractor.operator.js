/**
 * GeniSpace PDF Table Extractor Operator
 *
 * PDF 表格提取算子配置文件
 * 支持从 PDF 文件中提取表格信息，基于 pdfplumber
 *
 * @category document
 * @version 1.0.0
 * @author GeniSpace AI Team
 */

module.exports = {
  info: {
    name: 'pdf-table-extractor',
    title: 'PDF 表格提取器',
    description: '从平台存储的 PDF 文件中提取表格信息，支持结构化表格',
    version: '1.0.0',
    category: 'document',
    tags: ['pdf', 'table', 'extraction', 'document', 'pdfplumber'],
    author: 'GeniSpace AI Team',
    license: 'MIT'
  },
  routes: './pdf-table-extractor.routes.js',
  openapi: {
    paths: {
      '/extract': {
        post: {
          summary: '提取 PDF 表格',
          description: '从平台存储获取 PDF 文件并提取表格数据，支持结构化表格',
          tags: ['PDF 表格提取'],
          security: [{ GeniSpaceAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileId'],
                  properties: {
                    fileId: {
                      type: 'string',
                      description: '平台存储中的 PDF 文件 ID',
                      example: 'file_1234567890abcdef'
                    },
                    columnHeaders: {
                      type: 'string',
                      description: '前三列列头名称，逗号分隔，用于排除表头行不作为数据返回，如 "年,月,日"',
                      example: '年,月,日'
                    },
                    outputColumns: {
                      type: 'string',
                      description: '输出字段名，逗号分隔，按 PDF 列顺序映射。不传则使用默认结构',
                      example: 'year,month,day,voucher_no,summary,counterparty,debit,credit,direction,balance'
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: '表格提取成功',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean',
                        example: true
                      },
                      data: {
                        type: 'object',
                        properties: {
                          records: {
                            type: 'array',
                            description: '提取的记录列表，字段由 outputColumns 决定',
                            items: {
                              type: 'object',
                              additionalProperties: { type: 'string' }
                            }
                          },
                          fileId: { type: 'string' },
                          recordCount: { type: 'integer' },
                          extractedAt: { type: 'string', format: 'date-time' },
                          processingTimeMs: { type: 'integer' }
                        }
                      },
                      message: { type: 'string', example: '表格提取成功' }
                    }
                  }
                }
              }
            },
            400: {
              description: '请求参数错误',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: false },
                      error: { type: 'string', example: '缺少必需的 fileId 参数' },
                      code: { type: 'string', example: 'MISSING_FILE_ID' }
                    }
                  }
                }
              }
            },
            500: {
              description: '表格提取失败',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: false },
                      error: { type: 'string', example: 'PDF 表格提取失败' },
                      code: { type: 'string', example: 'PDF_TABLE_EXTRACTION_FAILED' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
