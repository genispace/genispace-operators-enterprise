/**
 * GeniSpace PDF Generator Operator
 * 
 * PDF生成算子配置文件
 * 支持HTML、Markdown模板和数据生成高质量PDF文档
 * 
 * @category document
 * @version 1.0.0
 * @author GeniSpace AI Team
 */

module.exports = {
  info: {
    name: 'pdf-generator',
    title: 'PDF 生成器',
    description: '基于HTML/Markdown模板和JSON数据生成高质量PDF文档，支持云存储上传',
    version: '1.0.0',
    category: 'document',
    tags: ['pdf', 'document', 'template', 'generator', 'html', 'markdown'],
    author: 'GeniSpace AI Team',
    license: 'MIT'
  },
  routes: './pdf-generator.routes.js',
  openapi: {
    paths: {
      '/generate-from-html': {
        post: {
          summary: '从HTML生成PDF',
          description: '根据HTML内容和可选的CSS样式生成PDF文档',
          tags: ['PDF生成'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['htmlContent'],
                  properties: {
                    htmlContent: {
                      type: 'string',
                      description: 'HTML内容，可以是HTML片段或完整的HTML文档，支持Mustache模板语法',
                      example: '<h1>{{title}}</h1><p>{{content}}</p>'
                    },
                    templateData: {
                      type: 'object',
                      description: '填充HTML模板的JSON数据（可选）',
                      example: {
                        title: '报告标题',
                        content: '这是一个示例报告。'
                      }
                    },
                    cssStyles: {
                      type: 'string',
                      description: '自定义CSS样式（可选）',
                      example: 'body { font-family: Arial; } h1 { color: blue; }'
                    },
                    fileName: {
                      type: 'string',
                      description: '输出文件名（不含扩展名）',
                      example: 'report-2025'
                    },
                    pdfOptions: {
                      type: 'object',
                      description: 'PDF生成选项',
                      properties: {
                        format: {
                          type: 'string',
                          enum: ['A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid'],
                          default: 'A4',
                          description: '页面格式'
                        },
                        margin: {
                          type: 'object',
                          properties: {
                            top: { type: 'string', example: '1cm' },
                            bottom: { type: 'string', example: '1cm' },
                            left: { type: 'string', example: '1cm' },
                            right: { type: 'string', example: '1cm' }
                          },
                          description: '页面边距'
                        },
                        printBackground: {
                          type: 'boolean',
                          default: true,
                          description: '是否打印背景'
                        },
                        displayHeaderFooter: {
                          type: 'boolean',
                          default: false,
                          description: '是否显示页眉页脚'
                        },
                        headerTemplate: {
                          type: 'string',
                          description: '页眉HTML模板'
                        },
                        footerTemplate: {
                          type: 'string',
                          description: '页脚HTML模板'
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'PDF生成成功',
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
                          pdfURL: {
                            type: 'string',
                            description: 'PDF文件访问URL',
                            example: 'https://storage.example.com/pdf/report.pdf'
                          },
                          fileName: {
                            type: 'string',
                            description: '生成的文件名',
                            example: 'report-2025.pdf'
                          },
                          fileSize: {
                            type: 'integer',
                            description: '文件大小（字节）',
                            example: 245760
                          },
                          pageCount: {
                            type: 'integer',
                            description: '页面数量',
                            example: 5
                          },
                          storageProvider: {
                            type: 'string',
                            description: '存储提供商',
                            example: 'local'
                          },
                          generatedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: '生成时间'
                          },
                          processingTimeMs: {
                            type: 'integer',
                            description: '处理时间（毫秒）',
                            example: 2500
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
                      success: { type: 'boolean', example: false },
                      error: { type: 'string', example: '缺少必需的HTML内容' }
                    }
                  }
                }
              }
            },
            500: {
              description: 'PDF生成失败',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: false },
                      error: { type: 'string', example: 'PDF生成过程中发生错误' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/generate-from-markdown': {
        post: {
          summary: '从Markdown模板生成PDF',
          description: '根据Markdown模板和JSON数据生成PDF文档，支持Mustache模板语法',
          tags: ['PDF生成'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['markdownTemplate'],
                  properties: {
                    markdownTemplate: {
                      type: 'string',
                      description: 'Markdown模板内容，支持Mustache语法',
                      example: '# {{title}}\n\n**作者**: {{author}}\n\n{{content}}'
                    },
                    templateData: {
                      type: 'object',
                      description: '填充模板的JSON数据（可选）',
                      example: {
                        title: '项目报告',
                        author: '张三',
                        content: '这是报告的主要内容。'
                      }
                    },
                    fileName: {
                      type: 'string',
                      description: '输出文件名（不含扩展名）',
                      example: 'project-report'
                    },
                    cssStyles: {
                      type: 'string',
                      description: '自定义CSS样式（可选）'
                    },
                    pdfOptions: {
                      type: 'object',
                      description: 'PDF生成选项',
                      properties: {
                        format: {
                          type: 'string',
                          enum: ['A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid'],
                          default: 'A4'
                        },
                        margin: {
                          type: 'object',
                          properties: {
                            top: { type: 'string', example: '1cm' },
                            bottom: { type: 'string', example: '1cm' },
                            left: { type: 'string', example: '1cm' },
                            right: { type: 'string', example: '1cm' }
                          }
                        },
                        printBackground: {
                          type: 'boolean',
                          default: true
                        },
                        displayHeaderFooter: {
                          type: 'boolean',
                          default: false
                        },
                        headerTemplate: { type: 'string' },
                        footerTemplate: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'PDF生成成功',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/paths/~1generate-from-html/post/responses/200/content/application~1json/schema'
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
                      error: { type: 'string', example: '缺少必需的模板或数据' }
                    }
                  }
                }
              }
            },
            500: {
              description: 'PDF生成失败',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/paths/~1generate-from-html/post/responses/500/content/application~1json/schema'
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
