/**
 * 文档生成器
 * 
 * 基于算子配置生成 Swagger/OpenAPI 文档
 * 支持新的分离式架构
 */

const logger = require('../utils/logger');

class DocumentGenerator {
  constructor(config = {}) {
    this.config = config;
    this.apiPrefix = config.apiPrefix || '/api';
    this.baseConfig = {
      openapi: '3.0.0',
      info: {
        title: 'GeniSpace Custom Operators API',
        version: '1.0.0',
        description: 'GeniSpace AI 平台自定义算子集合',
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
          url: 'http://localhost:8080',
          description: '开发服务器'
        }
      ]
    };
  }

  /**
   * 生成完整的 OpenAPI 文档
   */
  generate(registry) {
    try {
      const doc = {
        ...this.baseConfig,
        paths: this._generatePaths(registry),
        components: this._generateComponents(registry),
        tags: this._generateTags(registry)
      };
      
      logger.debug('OpenAPI 文档生成成功', {
        operatorsCount: registry.getStats().totalOperators,
        pathsCount: Object.keys(doc.paths).length
      });
      
      return doc;
    } catch (error) {
      logger.error('OpenAPI 文档生成失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 生成路径文档
   * @private
   */
  _generatePaths(registry) {
    const paths = {};
    const operators = registry.getAll();
    
    operators.forEach(operatorData => {
      const { config } = operatorData;
      if (!config.openapi?.paths) {
        return;
      }
      
      // 处理OpenAPI格式的路径定义
      Object.entries(config.openapi.paths).forEach(([path, methods]) => {
        const basePath = `${this.apiPrefix}/${config.info.category}/${config.info.name}`;
        const fullPath = basePath + path;
        
        if (!paths[fullPath]) {
          paths[fullPath] = {};
        }
        
        Object.entries(methods).forEach(([method, spec]) => {
          paths[fullPath][method] = {
            ...spec,
            tags: spec.tags || [this._getTagName(config.info.category)],
            operationId: spec.operationId || `${config.info.name}_${method}_${path.replace(/[\/\{\}]/g, '_')}`
          };
        });
      });
    });
    
    return paths;
  }

  /**
   * 生成组件定义
   * @private
   */
  _generateComponents(registry) {
    const components = {
      securitySchemes: {
        GeniSpaceAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'GeniSpace API Key 认证，格式：GeniSpace <your-api-key>'
        }
      },
      schemas: {
        // 标准响应格式
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      },
      responses: {
        BadRequest: {
          description: '请求参数错误',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        InternalServerError: {
          description: '内部服务器错误',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
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
      }
    };

    // 合并算子定义的组件
    const operators = registry.getAll();
    operators.forEach(operatorData => {
      const { config } = operatorData;
      if (config.openapi?.components) {
        // 合并 schemas
        if (config.openapi.components.schemas) {
          Object.assign(components.schemas, config.openapi.components.schemas);
        }
        // 合并 responses
        if (config.openapi.components.responses) {
          Object.assign(components.responses, config.openapi.components.responses);
        }
      }
    });

    return components;
  }

  /**
   * 生成标签定义 - 按算子分组
   * @private
   */
  _generateTags(registry) {
    const operators = registry.getAll();
    
    // 每个算子生成一个标签
    return operators.map(operatorData => {
      const { config } = operatorData;
      const info = config.info;
      
      return {
        name: info.title || info.name,
        description: info.description || `${info.title || info.name}算子`
      };
    });
  }

}

module.exports = DocumentGenerator;