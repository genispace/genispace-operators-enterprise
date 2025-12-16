/**
 * 应用服务编排
 * 
 * 协调各个核心组件，实现算子平台的核心功能
 */

const path = require('path');
// const swaggerJsDoc = require('swagger-jsdoc'); // 不再需要，直接使用自定义文档生成器
const OperatorRegistry = require('../core/registry');
const OperatorDiscovery = require('../core/discovery');
const RouterBuilder = require('../core/router');
const DocumentGenerator = require('./docs-generator');
const logger = require('../utils/logger');

class ApplicationService {
  constructor(config = {}) {
    this.config = config;
    this.registry = new OperatorRegistry();
    this.discovery = new OperatorDiscovery();
    this.router = new RouterBuilder(config);
    this.docsGenerator = new DocumentGenerator(config);
    this.initialized = false;
  }

  /**
   * 初始化应用服务
   * @param {string} operatorsDir - 算子目录
   */
  async initialize(operatorsDir) {
    try {
      logger.info('开始初始化应用服务...');
      
      // 1. 发现和加载算子
      await this._loadOperators(operatorsDir);
      
      // 2. 生成API文档
      this._generateDocs();
      
      this.initialized = true;
      logger.info('应用服务初始化完成');
      
    } catch (error) {
      logger.error('应用服务初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 应用到Express应用
   * @param {object} app - Express应用实例
   */
  applyTo(app) {
    if (!this.initialized) {
      throw new Error('应用服务未初始化，请先调用 initialize()');
    }

    // 构建路由
    this.router.applyRoutes(app, this.registry);
    return this;
  }

  /**
   * 获取Swagger文档
   * @returns {object} Swagger规范
   */
  getSwaggerSpec() {
    return this.swaggerSpec;
  }

  /**
   * 获取统计信息
   * @returns {object} 统计数据
   */
  getStats() {
    const registryStats = this.registry.getStats();
    const routerStats = this.router.getStats();
    
    return {
      ...registryStats,
      ...routerStats,
      initialized: this.initialized
    };
  }

  /**
   * 获取算子列表
   * @returns {Array} 算子列表
   */
  getOperators() {
    return this.registry.getAll().map(operatorData => {
      const { config, metadata } = operatorData;
      const endpoints = config.openapi?.paths ? Object.keys(config.openapi.paths) : [];
      
      return {
        id: metadata.id,
        name: config.info.name,
        title: config.info.title,
        description: config.info.description,
        version: config.info.version,
        category: config.info.category,
        endpoints: endpoints.map(path => `${this.config.apiPrefix || '/api'}/${config.info.category}/${config.info.name}${path}`),
        endpointCount: endpoints.length,
        registeredAt: metadata.registeredAt
      };
    });
  }

  /**
   * 按分类获取算子
   * @param {string} category - 分类名称
   * @returns {Array} 算子列表
   */
  getOperatorsByCategory(category) {
    return this.getOperators().filter(op => op.category === category);
  }

  /**
   * 获取单个算子的完整定义
   * @param {string} operatorId - 算子ID
   * @param {object} req - 请求对象（用于构建完整URL）
   * @returns {object|null} 算子定义
   */
  getOperatorDefinition(operatorId, req = null) {
    const operatorData = this.registry.get(operatorId);
    if (!operatorData) {
      return null;
    }

    const { config, metadata } = operatorData;
    
    // 构建基础URL（如果提供了请求对象）
    let baseUrl = '';
    if (req) {
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || `${process.env.HOST || 'localhost'}:${process.env.PORT || 8080}`;
      baseUrl = `${protocol}://${host}`;
    }
    
    // 构建GeniSpace算子定义格式
    return {
      type: 'genispace-operator',
      version: '1.0.0',
      operator: {
        identifier: config.info.name,
        name: config.info.title,
        description: config.info.description,
        version: config.info.version,
        category: config.info.category,
        tags: config.info.tags || [],
        author: config.info.author || 'genispace.com Dev Team',
        
        // 基础配置
        configuration: {
          schema: {
            type: 'api',
            properties: {
              serverUrl: {
                type: 'string',
                title: '服务器地址',
                required: true,
                description: 'API 服务器的基础地址',
                default: baseUrl // 使用动态生成的基础URL作为默认值
              },
              timeout: {
                type: 'number',
                title: '全局超时时间',
                default: 30000,
                description: '请求超时时间（毫秒）'
              },
              headers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    value: { type: 'string' }
                  }
                },
                title: '全局请求头',
                description: '应用于所有请求的全局请求头'
              },
              retryPolicy: {
                type: 'object',
                title: '全局重试策略',
                properties: {
                  intervalMs: {
                    type: 'number',
                    title: '重试间隔',
                    default: 1000
                  },
                  maxAttempts: {
                    type: 'number',
                    title: '最大重试次数',
                    default: 3
                  }
                }
              }
            }
          }
        },

        // 方法定义
        methods: this._convertPathsToMethods(config.openapi.paths, config.info.name, config.info.category, baseUrl, config.openapi),
        
        // 元数据
        metadata: {
          source: 'genispace-custom-operators',
          exportedAt: new Date().toISOString(),
          exportedBy: 'GeniSpace Custom Operators API',
          originalOperatorId: operatorId,
          registeredAt: metadata.registeredAt
        }
      }
    };
  }


  /**
   * 将OpenAPI paths转换为GeniSpace方法格式
   * @param {object} paths - OpenAPI paths
   * @param {string} operatorName - 算子名称
   * @param {string} category - 算子分类
   * @param {string} baseUrl - 基础URL
   * @param {object} fullOpenApiDoc - 完整的OpenAPI文档，用于解析$ref
   * @returns {Array} 方法列表
   */
  _convertPathsToMethods(paths, operatorName, category, baseUrl = '', fullOpenApiDoc = null) {
    const methods = [];
    
    Object.entries(paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([httpMethod, operation]) => {
        const methodName = operation.operationId || 
          `${httpMethod}${path.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        methods.push({
          name: operation.summary || methodName,
          identifier: methodName.toLowerCase(),
          description: operation.description || '',
          
          // 输入Schema（从requestBody提取）
          inputSchema: this._extractInputSchema(operation.requestBody),
          
          // 输出Schema（从responses提取）
          outputSchema: this._extractOutputSchema(operation.responses, fullOpenApiDoc),
          
          // 方法配置
          configuration: {
            schema: {
              type: 'object',
              properties: {
                method: {
                  type: 'string',
                  enum: [httpMethod.toUpperCase()],
                  default: httpMethod.toUpperCase()
                },
                endpoint: {
                  type: 'string',
                  default: `${this.config.apiPrefix || '/api'}/${category}/${operatorName}${path}`
                },
                headers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      value: { type: 'string' }
                    }
                  },
                  title: '请求头',
                  default: []
                },
                caching: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean', default: false },
                    ttlSeconds: { type: 'number', default: 3600 }
                  }
                }
              }
            },
            values: {
              method: httpMethod.toUpperCase(),
              endpoint: `${this.config.apiPrefix || '/api'}/${category}/${operatorName}${path}`,
              headers: [],
              caching: {
                enabled: false,
                ttlSeconds: 3600
              }
            }
          },
          
          isDefault: methods.length === 0, // 第一个方法设为默认
          order: methods.length,
          status: 'ACTIVE'
        });
      });
    });
    
    return methods;
  }

  /**
   * 从requestBody提取输入Schema
   * @param {object} requestBody - OpenAPI requestBody
   * @returns {object} 输入Schema
   */
  _extractInputSchema(requestBody) {
    if (!requestBody) {
      return { type: 'object', properties: {} };
    }

    const jsonContent = requestBody.content?.['application/json'];
    if (jsonContent?.schema) {
      return jsonContent.schema;
    }

    return { type: 'object', properties: {} };
  }

  /**
   * 从responses提取输出Schema
   * @param {object} responses - OpenAPI responses
   * @param {object} fullOpenApiDoc - 完整的OpenAPI文档，用于解析$ref
   * @returns {object} 输出Schema
   */
  _extractOutputSchema(responses, fullOpenApiDoc = null) {
    // 优先查找200响应
    const successResponse = responses['200'] || responses['201'] || responses['default'];
    
    if (!successResponse) {
      return { type: 'object', properties: {} };
    }

    const jsonContent = successResponse.content?.['application/json'];
    if (jsonContent?.schema) {
      // 如果包含$ref，尝试解析
      if (jsonContent.schema.$ref && fullOpenApiDoc) {
        return this._resolveRef(jsonContent.schema.$ref, fullOpenApiDoc);
      }
      return jsonContent.schema;
    }

    return { type: 'object', properties: {} };
  }

  /**
   * 解析OpenAPI中的$ref引用
   * @param {string} ref - $ref字符串
   * @param {object} openApiDoc - 完整的OpenAPI文档
   * @returns {object} 解析后的schema
   */
  _resolveRef(ref, openApiDoc) {
    try {
      // 解析类似 "#/paths/~1generate-from-html/post/responses/200/content/application~1json/schema" 的引用
      if (ref.startsWith('#/')) {
        const pathParts = ref.substring(2).split('/');
        let current = openApiDoc;
        
        for (const part of pathParts) {
          // 处理URL编码的字符，如 ~1 代表 /
          const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
          
          if (current && typeof current === 'object' && decodedPart in current) {
            current = current[decodedPart];
          } else {
            console.warn(`无法解析$ref路径: ${ref}`);
            return { type: 'object', properties: {} };
          }
        }
        
        return current || { type: 'object', properties: {} };
      }
      
      console.warn(`不支持的$ref格式: ${ref}`);
      return { type: 'object', properties: {} };
    } catch (error) {
      console.error(`解析$ref失败: ${ref}`, error);
      return { type: 'object', properties: {} };
    }
  }

  /**
   * 重新加载算子
   * @param {string} operatorsDir - 算子目录
   */
  async reload(operatorsDir) {
    logger.info('开始重新加载算子...');
    
    // 清空状态
    this.registry.clear();
    this.discovery.reset();
    
    // 重新初始化
    await this.initialize(operatorsDir);
    
    logger.info('算子重新加载完成');
  }

  /**
   * 加载算子
   * @private
   */
  async _loadOperators(operatorsDir) {
    const discovered = await this.discovery.scan(operatorsDir);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const operatorData of discovered) {
      try {
        if (operatorData) {
          this.registry.register(operatorData);
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        logger.error(`算子注册失败: ${operatorData?.config?.info?.name || 'unknown'}`, { 
          error: error.message 
        });
      }
    }
    
    logger.info(`算子加载完成: 成功 ${successCount} 个，失败 ${errorCount} 个`);
    
    if (successCount === 0) {
      logger.warn('没有成功加载任何算子');
    }
  }

  /**
   * 生成API文档
   * @private
   */
  _generateDocs() {
    // 直接使用文档生成器生成完整的OpenAPI文档
    this.swaggerSpec = this.docsGenerator.generate(this.registry);
    
    logger.debug('API文档生成完成');
  }
}

module.exports = ApplicationService;
