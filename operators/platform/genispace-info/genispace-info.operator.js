/**
 * GeniSpace 平台信息算子
 * 演示如何在算子中使用 GeniSpace SDK 获取平台信息
 */

module.exports = {
  // 算子基本信息
  info: {
    name: 'genispace-info',
    title: 'GeniSpace平台信息',
    description: '获取当前用户的GeniSpace平台信息，包括用户资料、团队、智能体等',
    version: '1.0.0',
    category: 'platform',
    tags: ['genispace', 'user', 'platform', 'info']
  },

  // 路由文件路径
  routes: './genispace-info.routes.js',

  // OpenAPI 文档定义
  openapi: {
    paths: {
      '/user-profile': {
      post: {
        summary: '获取用户资料',
        description: '获取当前认证用户的详细资料信息',
        tags: ['GeniSpace平台信息'],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  includeStatistics: {
                    type: 'boolean',
                    description: '是否包含统计信息',
                    default: true
                  },
                  includeTeams: {
                    type: 'boolean',
                    description: '是否包含团队信息',
                    default: true
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '成功获取用户资料',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            email: { type: 'string' },
                            name: { type: 'string' },
                            company: { type: 'string' },
                            createdAt: { type: 'string' }
                          }
                        },
                        statistics: {
                          type: 'object',
                          properties: {
                            tasksCreated: { type: 'number' },
                            tasksCompleted: { type: 'number' },
                            agentsCount: { type: 'number' },
                            teamsCount: { type: 'number' }
                          }
                        },
                        teams: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              role: { type: 'string' },
                              isActive: { type: 'boolean' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: {
            description: '认证失败',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse'
                }
              }
            }
          }
        }
      }
    },

      '/agents': {
      post: {
        summary: '获取用户智能体列表',
        description: '获取当前用户可访问的智能体列表',
        tags: ['GeniSpace平台信息'],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  page: {
                    type: 'number',
                    description: '页码',
                    default: 1,
                    minimum: 1
                  },
                  limit: {
                    type: 'number',
                    description: '每页数量',
                    default: 10,
                    minimum: 1,
                    maximum: 100
                  },
                  agentType: {
                    type: 'string',
                    description: '智能体类型',
                    enum: ['CHAT', 'TASK'],
                    nullable: true
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: '成功获取智能体列表',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        agents: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              description: { type: 'string' },
                              agentType: { type: 'string' },
                              model: { type: 'string' },
                              createdAt: { type: 'string' }
                            }
                          }
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            currentPage: { type: 'number' },
                            totalPages: { type: 'number' },
                            totalItems: { type: 'number' },
                            itemsPerPage: { type: 'number' }
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
    },


    }
  }
};
