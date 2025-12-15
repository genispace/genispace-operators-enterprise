/**
 * 路由构建器
 * 
 * 负责将算子路由注册到Express应用中
 * 支持新的分离式架构
 */

const logger = require('../utils/logger');

class RouterBuilder {
  constructor(config = {}) {
    this.config = config;
    this.apiPrefix = config.apiPrefix || '/api';
    this.handlerCache = new Map(); // 缓存包装后的处理器
    this.stats = {
      routesCount: 0,
      operatorsCount: 0,
      errors: 0
    };
  }

  /**
   * 应用算子路由到Express应用
   * @param {object} app - Express应用实例
   * @param {OperatorRegistry} registry - 算子注册中心
   */
  applyRoutes(app, registry) {
    const operators = registry.getAll();
    
    logger.info(`开始应用 ${operators.length} 个算子的路由`);
    
    operators.forEach(operatorData => {
      this._registerOperatorRoutes(app, operatorData, registry);
    });
    
    logger.info(`路由应用完成，共注册 ${this.stats.routesCount} 个路由`);
  }

  /**
   * 注册单个算子的路由
   * @private
   */
  _registerOperatorRoutes(app, operatorData, registry) {
    try {
      const { config, metadata } = operatorData;
      const routes = registry.getRoutes(metadata.id);
      
      if (!routes) {
        logger.warn(`算子路由未找到: ${config.info.name}`);
        return;
      }

      const basePath = `${this.apiPrefix}/${config.info.category}/${config.info.name}`;
      
      // 应用路由到Express应用
      app.use(basePath, this._wrapRouter(routes, config));
      
      this.stats.routesCount++;
      this.stats.operatorsCount++;
      
      logger.debug(`算子路由已注册: ${config.info.name}`, {
        basePath,
        category: config.info.category
      });
      
    } catch (error) {
      this.stats.errors++;
      logger.error(`算子路由注册失败: ${operatorData.config?.info?.name}`, {
        error: error.message
      });
    }
  }

  /**
   * 包装路由以添加性能监控
   * @private
   */
  _wrapRouter(router, config) {
    // 检查缓存
    const cacheKey = `${config.info.name}-${config.info.version}`;
    if (this.handlerCache.has(cacheKey)) {
      return this.handlerCache.get(cacheKey);
    }

    // 添加中间件
    router.use((req, res, next) => {
      const startTime = process.hrtime.bigint();
      req.operatorInfo = config.info;
      
      res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // 转换为毫秒
        
        if (logger.level === 'debug') {
          logger.debug(`算子请求完成: ${config.info.name}`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration.toFixed(2)}ms`
          });
        }
      });
      
      next();
    });

    // 缓存包装后的路由
    this.handlerCache.set(cacheKey, router);
    return router;
  }

  /**
   * 获取路由统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.handlerCache.clear();
    logger.debug('路由缓存已清除');
  }
}

module.exports = RouterBuilder;