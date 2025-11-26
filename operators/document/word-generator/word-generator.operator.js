/**
 * GeniSpace Word Generator Operator
 * 
 * Word文档生成算子配置文件
 * 支持HTML、Markdown模板和数据生成高质量Word文档
 * 
 * @category document
 * @version 1.0.0
 * @author GeniSpace AI Team
 */

module.exports = {
  info: {
    name: 'word-generator',
    title: 'Word 生成器',
    description: '基于HTML/Markdown模板和JSON数据生成高质量Word文档，支持云存储上传',
    version: '1.0.0',
    category: 'document',
    tags: ['word', 'docx', 'document', 'template', 'generator', 'html', 'markdown'],
    author: 'GeniSpace AI Team',
    license: 'MIT'
  },
  routes: './word-generator.routes.js',
  openapi: {
    paths: {
      '/generate-from-html': {
        post: {
          summary: '从HTML生成Word',
          description: '根据HTML内容和可选的CSS样式生成Word文档',
          tags: ['Word生成'],
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
                    wordOptions: {
                      type: 'object',
                      description: 'Word生成选项',
                      properties: {
                        orientation: {
                          type: 'string',
                          enum: ['portrait', 'landscape'],
                          default: 'portrait',
                          description: '页面方向'
                        },
                        margins: {
                          type: 'object',
                          properties: {
                            top: { type: 'number', example: 1440, description: '上边距（单位：twips，1英寸=1440 twips）' },
                            bottom: { type: 'number', example: 1440 },
                            left: { type: 'number', example: 1440 },
                            right: { type: 'number', example: 1440 }
                          },
                          description: '页面边距'
                        },
                        pageSize: {
                          type: 'object',
                          properties: {
                            width: { type: 'number', example: 12240, description: '页面宽度（单位：twips）' },
                            height: { type: 'number', example: 15840, description: '页面高度（单位：twips）' }
                          },
                          description: '页面尺寸'
                        },
                        coverPage: {
                          type: 'object',
                          description: '封面页配置（可选）',
                          properties: {
                            title: { type: 'string', example: '文档标题', description: '主标题' },
                            subtitle: { type: 'string', example: '副标题', description: '副标题（可选）' },
                            companyName: { type: 'string', example: '示例公司', description: '公司名称（可选）' },
                            version: { type: 'string', example: 'v1.0', description: '版本号（可选）' },
                            date: { type: 'string', example: '2025年1月24日', description: '日期' },
                            author: { type: 'string', example: '张三', description: '作者（可选）' },
                            department: { type: 'string', example: '技术部', description: '部门（可选）' }
                          }
                        },
                        includeTOC: {
                          type: 'boolean',
                          default: false,
                          description: '是否包含目录（Table of Contents），目录会自动从HTML中的标题提取'
                        },
                        styleConfig: {
                          type: 'object',
                          description: '样式配置（可选）',
                          properties: {
                            primaryColor: { type: 'string', example: '1a5490', description: '主色调（十六进制，不含#）' },
                            secondaryColor: { type: 'string', example: '2c5aa0', description: '次要色调' },
                            backgroundColor: { type: 'string', example: 'FFFFFF', description: '文档背景色' },
                            coverBackgroundColor: { type: 'string', example: '1a5490', description: '封面页背景色' },
                            textColor: { type: 'string', example: '333333', description: '文本颜色' },
                            textLightColor: { type: 'string', example: '666666', description: '浅文本颜色' },
                            coverTextColor: { type: 'string', example: 'FFFFFF', description: '封面页文字颜色' },
                            coverTextLightColor: { type: 'string', example: 'FFFFFF', description: '封面页浅文字颜色' },
                            linkColor: { type: 'string', example: '1a5490', description: '链接颜色' },
                            fontFamily: { type: 'string', example: 'Microsoft YaHei', description: '字体' }
                          }
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
              description: 'Word生成成功',
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
                          wordURL: {
                            type: 'string',
                            description: 'Word文件访问URL',
                            example: 'https://storage.example.com/word/report.docx'
                          },
                          fileName: {
                            type: 'string',
                            description: '生成的文件名',
                            example: 'report-2025.docx'
                          },
                          fileSize: {
                            type: 'integer',
                            description: '文件大小（字节）',
                            example: 245760
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
              description: 'Word生成失败',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: false },
                      error: { type: 'string', example: 'Word生成过程中发生错误' }
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
          summary: '从Markdown模板生成Word',
          description: '根据Markdown模板和JSON数据生成Word文档，支持Mustache模板语法',
          tags: ['Word生成'],
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
                    wordOptions: {
                      type: 'object',
                      description: 'Word生成选项',
                      properties: {
                        orientation: {
                          type: 'string',
                          enum: ['portrait', 'landscape'],
                          default: 'portrait'
                        },
                        margins: {
                          type: 'object',
                          properties: {
                            top: { type: 'number', example: 1440 },
                            bottom: { type: 'number', example: 1440 },
                            left: { type: 'number', example: 1440 },
                            right: { type: 'number', example: 1440 }
                          }
                        },
                        pageSize: {
                          type: 'object',
                          properties: {
                            width: { type: 'number', example: 12240 },
                            height: { type: 'number', example: 15840 }
                          }
                        },
                        coverPage: {
                          type: 'object',
                          description: '封面页配置（可选）',
                          properties: {
                            title: { type: 'string', example: '文档标题' },
                            subtitle: { type: 'string', example: '副标题' },
                            companyName: { type: 'string', example: '示例公司' },
                            version: { type: 'string', example: 'v1.0' },
                            date: { type: 'string', example: '2025年1月24日' },
                            author: { type: 'string', example: '张三' },
                            department: { type: 'string', example: '技术部' }
                          }
                        },
                        includeTOC: {
                          type: 'boolean',
                          default: false,
                          description: '是否包含目录'
                        },
                        styleConfig: {
                          type: 'object',
                          description: '样式配置（可选）',
                          properties: {
                            primaryColor: { type: 'string', example: '1a5490' },
                            coverBackgroundColor: { type: 'string', example: '1a5490' },
                            coverTextColor: { type: 'string', example: 'FFFFFF' },
                            fontFamily: { type: 'string', example: 'Microsoft YaHei' }
                          }
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
              description: 'Word生成成功',
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
              description: 'Word生成失败',
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

