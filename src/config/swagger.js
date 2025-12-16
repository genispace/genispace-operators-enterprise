/**
 * Swagger/OpenAPI 配置
 * 
 * 定义API文档的基础配置和通用组件
 */

const config = require('./env');

const swaggerConfig = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GeniSpace Custom Operators API',
      version: '1.0.0',
      description: `
GeniSpace AI 平台的轻量级自定义算子组件库 API

## 功能特性

- 🚀 **算子自动发现**: 自动扫描和加载算子组件
- 📚 **标准化文档**: 符合OpenAPI 3.0规范的API文档
- 🔧 **即插即用**: 支持热插拔式算子开发
- 🐳 **容器化**: 支持Docker容器化部署
- 🔗 **平台集成**: 完全兼容GeniSpace平台导入功能

## 算子分类

- **text-processing**: 文本处理算子
- **data-transform**: 数据转换算子  
- **notification**: 通知服务算子
- **file-processing**: 文件处理算子
- **api-integration**: API集成算子
- **validation**: 数据验证算子
- **utility**: 通用工具算子

## 认证方式

### GeniSpace 平台认证

需要认证的算子需要提供有效的 GeniSpace API Key：

\`\`\`
Authorization: GeniSpace <your-api-key>
\`\`\`

### 公共接口

以下接口无需认证即可访问：
- \`${config.apiPrefix}\` - 首页
- \`/health\` - 健康检查
- \`${config.apiPrefix}/docs\` - API 文档
- \`${config.apiPrefix}/docs.json\` - API 文档 JSON
- \`${config.apiPrefix}/operators\` - 算子列表
- \`${config.apiPrefix}/operators/:category/:operator/definition\` - 算子定义文件

## 错误处理

所有API都遵循统一的错误响应格式，包含错误码、错误信息和时间戳。

## 速率限制

为了保护服务稳定性，API调用受到速率限制：
- 窗口时间: 15分钟
- 最大请求数: 100次/IP

超过限制将返回 429 状态码。
      `,
      termsOfService: 'https://genispace.com/terms',
      contact: {
        name: 'genispace.com Dev Team',
        url: 'https://genispace.com',
        email: 'dev@genispace.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || `http://localhost:${config.port}`,
        description: '开发服务器'
      }
    ],
    components: {
      securitySchemes: {
        GeniSpaceAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'GeniSpace API Key 认证，格式：GeniSpace <your-api-key>'
        }
      },
      
      schemas: {
        // 通用响应Schema
        SuccessResponse: {
          type: 'object',
          required: ['success', 'data', 'timestamp'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
              description: '请求是否成功'
            },
            data: {
              type: 'object',
              description: '响应数据'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: '响应时间',
              example: '2025-01-01T12:00:00.000Z'
            }
          }
        },
        
        // 错误响应Schema
        ErrorResponse: {
          type: 'object',
          required: ['success', 'error', 'timestamp'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
              description: '请求是否成功'
            },
            error: {
              type: 'string',
              description: '错误信息',
              example: '参数验证失败'
            },
            code: {
              type: 'string',
              description: '错误代码',
              example: 'VALIDATION_ERROR'
            },
            details: {
              type: 'object',
              description: '错误详情'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: '错误发生时间',
              example: '2025-01-01T12:00:00.000Z'
            }
          }
        },
        
        // 健康检查响应Schema
        HealthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  example: 'healthy',
                  description: '服务状态'
                },
                uptime: {
                  type: 'number',
                  description: '运行时间（秒）',
                  example: 3600
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: '检查时间'
                },
                version: {
                  type: 'string',
                  description: '服务版本',
                  example: '1.0.0'
                },
                environment: {
                  type: 'string',
                  description: '运行环境',
                  example: 'production'
                },
                memory: {
                  type: 'object',
                  description: '内存使用情况',
                  properties: {
                    rss: { type: 'number' },
                    heapTotal: { type: 'number' },
                    heapUsed: { type: 'number' },
                    external: { type: 'number' }
                  }
                },
                operators: {
                  type: 'object',
                  description: '算子统计信息',
                  properties: {
                    loaded: {
                      type: 'integer',
                      description: '已加载的算子数量'
                    },
                    categories: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '算子分类列表'
                    },
                    endpoints: {
                      type: 'integer',
                      description: 'API端点数量'
                    }
                  }
                }
              }
            }
          }
        },
        
        // 算子信息Schema
        OperatorInfo: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '算子名称',
              example: 'string-utils'
            },
            title: {
              type: 'string',
              description: '算子标题',
              example: '字符串工具'
            },
            description: {
              type: 'string',
              description: '算子描述',
              example: '提供字符串处理相关功能'
            },
            version: {
              type: 'string',
              description: '算子版本',
              example: '1.0.0'
            },
            category: {
              type: 'string',
              description: '算子分类',
              example: 'text-processing'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '算子标签',
              example: ['string', 'text', 'utility']
            },
            author: {
              type: 'string',
              description: '算子作者',
              example: 'genispace.com Dev Team'
            },
            endpoints: {
              type: 'array',
              items: { type: 'string' },
              description: 'API端点列表',
              example: [`${config.apiPrefix}/text-processing/string-utils/format`]
            }
          }
        },
        
        // 算子列表响应Schema
        OperatorListResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              properties: {
                operators: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/OperatorInfo' },
                  description: '算子列表'
                },
                total: {
                  type: 'integer',
                  description: '算子总数',
                  example: 8
                },
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '分类列表',
                  example: ['text-processing', 'data-transform', 'notification']
                },
                endpoints: {
                  type: 'integer',
                  description: 'API端点总数',
                  example: 15
                }
              }
            }
          }
        }
      },
      
      responses: {
        // 通用错误响应
        BadRequest: {
          description: '请求参数错误',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: '请求参数不完整或格式错误',
                code: 'BAD_REQUEST',
                timestamp: '2025-01-01T12:00:00.000Z'
              }
            }
          }
        },
        
        NotFound: {
          description: '资源不存在',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: '请求的资源不存在',
                code: 'NOT_FOUND',
                timestamp: '2025-01-01T12:00:00.000Z'
              }
            }
          }
        },
        
        InternalServerError: {
          description: '内部服务器错误',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: '服务器内部错误，请稍后重试',
                code: 'INTERNAL_ERROR',
                timestamp: '2025-01-01T12:00:00.000Z'
              }
            }
          }
        },
        
        RateLimitExceeded: {
          description: '请求频率超限',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: '请求过于频繁，请稍后再试',
                code: 'RATE_LIMIT_EXCEEDED',
                timestamp: '2025-01-01T12:00:00.000Z'
              }
            }
          }
        },
        
        Unauthorized: {
          description: 'GeniSpace API Key 认证失败',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: '缺少 GeniSpace API Key',
                code: 'MISSING_GENISPACE_API_KEY',
                message: '请在 Authorization 头中提供 GeniSpace API Key，格式：Authorization: GeniSpace <your-api-key>',
                timestamp: '2025-01-01T12:00:00.000Z'
              }
            }
          }
        }
      },
      
      parameters: {
        // 通用参数
        CategoryParam: {
          name: 'category',
          in: 'path',
          required: true,
          description: '算子分类',
          schema: {
            type: 'string',
            enum: ['text-processing', 'data-transform', 'notification', 'file-processing', 'api-integration', 'validation', 'utility']
          },
          example: 'text-processing'
        }
      }
    },
    
    tags: [
      {
        name: 'System',
        description: '系统相关API'
      },
      {
        name: 'Operators',
        description: '算子管理API'
      },
      {
        name: 'Text Processing',
        description: '文本处理算子'
      },
      {
        name: 'Data Transform',
        description: '数据转换算子'
      },
      {
        name: 'Notification',
        description: '通知服务算子'
      },
      {
        name: 'File Processing',
        description: '文件处理算子'
      },
      {
        name: 'API Integration',
        description: 'API集成算子'
      },
      {
        name: 'Validation',
        description: '数据验证算子'
      },
      {
        name: 'Utility',
        description: '通用工具算子'
      }
    ]
  },
  
  apis: [
    './src/index.js',
    './operators/**/*.js'
  ]
};

module.exports = swaggerConfig;
