/**
 * GeniSpace Text Extractor Operator
 * 
 * 文本提取算子配置文件
 * 支持从平台存储提取各种格式文件的文本内容
 * 
 * @category document
 * @version 1.0.0
 * @author GeniSpace AI Team
 */

module.exports = {
  info: {
    name: 'text-extractor',
    title: '文本提取器',
    description: '从平台存储提取各种格式文件的文本内容，支持 PDF、DOC、DOCX、XLS、XLSX、TXT 格式',
    version: '1.0.0',
    category: 'document',
    tags: ['text', 'extraction', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'document'],
    author: 'GeniSpace AI Team',
    license: 'MIT'
  },
  routes: './text-extractor.routes.js',
  openapi: {
    paths: {
      '/extract': {
        post: {
          summary: '提取文本内容',
          description: '从平台存储获取文件并提取文本内容，根据文件扩展名自动识别文件格式',
          tags: ['文本提取'],
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
                      description: '平台存储中的文件 ID，支持 PDF、DOC、DOCX、XLS、XLSX、TXT 格式',
                      example: 'file_1234567890abcdef'
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: '文本提取成功',
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
                          text: {
                            type: 'string',
                            description: '提取的文本内容',
                            example: '这是从文件中提取的文本内容...'
                          },
                          fileId: {
                            type: 'string',
                            description: '文件 ID',
                            example: 'file_1234567890abcdef'
                          },
                          textLength: {
                            type: 'integer',
                            description: '文本长度（字符数）',
                            example: 1234
                          },
                          extractedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: '提取时间'
                          },
                          processingTimeMs: {
                            type: 'integer',
                            description: '处理时间（毫秒）',
                            example: 1500
                          }
                        }
                      },
                      message: {
                        type: 'string',
                        example: '文本提取成功'
                      }
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
                      success: {
                        type: 'boolean',
                        example: false
                      },
                      error: {
                        type: 'string',
                        example: '缺少必需的 fileId 参数'
                      },
                      code: {
                        type: 'string',
                        example: 'MISSING_FILE_ID'
                      }
                    }
                  }
                }
              }
            },
            500: {
              description: '文本提取失败',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean',
                        example: false
                      },
                      error: {
                        type: 'string',
                        example: '文本提取失败: 不支持的文件格式'
                      },
                      code: {
                        type: 'string',
                        example: 'TEXT_EXTRACTION_FAILED'
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
  }
};

