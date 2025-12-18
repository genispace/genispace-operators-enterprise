/**
 * GeniSpace Markdown Generator Operator
 * 
 * Markdown文件生成算子配置文件
 * 支持Markdown文本和模板生成高质量.md文档
 * 
 * @category document
 * @version 1.0.0
 * @author GeniSpace AI Team
 */

module.exports = {
  info: {
    name: 'markdown-generator',
    title: 'Markdown文件生成器',
    description: '将Markdown文本转换为.md文件，支持模板填充和多种换行符格式',
    version: '1.0.0',
    category: 'document',
    tags: ['markdown', 'document', 'generator', 'file', 'template'],
    author: 'GeniSpace AI Team',
    license: 'MIT'
  },
  routes: './markdown-generator.routes.js',
  openapi: {
    paths: {
      '/generate': {
        post: {
          summary: '生成Markdown文件',
          description: '将Markdown文本转换为.md文件，支持Mustache模板语法和自定义换行符',
          tags: ['Markdown生成'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['markdownContent'],
                  properties: {
                    markdownContent: {
                      type: 'string',
                      description: 'Markdown内容，支持Mustache模板语法',
                      example: '# {{title}}\n\n**作者**: {{author}}\n\n{{content}}'
                    },
                    templateData: {
                      type: 'object',
                      description: '填充模板的JSON数据（可选）',
                      example: {
                        title: '项目文档',
                        author: '张三',
                        content: '这是文档的主要内容。'
                      }
                    },
                    fileName: {
                      type: 'string',
                      description: '输出文件名（不含扩展名）',
                      example: 'project-doc'
                    },
                    lineEnding: {
                      type: 'string',
                      enum: ['\n', '\r\n', '\r'],
                      default: '\n',
                      description: '换行符类型：Unix(LF)、Windows(CRLF)或Mac(CR)'
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Markdown文件生成成功',
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
                          mdURL: {
                            type: 'string',
                            description: 'Markdown文件访问URL',
                            example: 'https://storage.example.com/markdown/doc.md'
                          },
                          fileName: {
                            type: 'string',
                            description: '生成的文件名',
                            example: 'project-doc.md'
                          },
                          fileSize: {
                            type: 'integer',
                            description: '文件大小（字节）',
                            example: 2048
                          },
                          lineCount: {
                            type: 'integer',
                            description: '行数',
                            example: 25
                          },
                          storageProvider: {
                            type: 'string',
                            description: '存储提供商',
                            example: 'platform'
                          },
                          generatedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: '生成时间'
                          },
                          processingTimeMs: {
                            type: 'integer',
                            description: '处理时间（毫秒）',
                            example: 150
                          }
                        }
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
                        example: '缺少必需的markdownContent参数' 
                      }
                    }
                  }
                }
              }
            },
            500: {
              description: 'Markdown文件生成失败',
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
                        example: 'Markdown生成过程中发生错误' 
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
