/**
 * GeniSpace Custom Operators API Server
 * 
 * GeniSpace AI 平台的轻量级自定义算子组件库
 * 重构后的清晰分层架构
 * 
 * @copyright © 2025 genispace.com Dev Team
 * @license MIT
 */

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

// 加载环境变量
require('dotenv').config();

// 导入配置和服务
const config = require('./config/env');
const ApplicationService = require('./services/app-service');
const { setupMiddlewares } = require('./middleware');
const { setupRoutes } = require('./routes');
const logger = require('./utils/logger');

// 创建Express应用
const app = express();

// 创建应用服务
const appService = new ApplicationService(config);

/**
 * 应用启动函数
 */
async function startApp() {
  try {
    logger.info('🚀 启动 GeniSpace Custom Operators API...');
    
    // 1. 设置中间件
    setupMiddlewares(app, config);
    
    // 2. 初始化应用服务
    const operatorsDir = path.join(__dirname, '../operators');
    await appService.initialize(operatorsDir);
    
    // 3. 设置基础路由
    setupRoutes(app, appService, config);
    
    // 4. 应用算子路由
    appService.applyTo(app);
    
    // 5. 设置API文档
    setupApiDocs(app, appService, config);
    
    // 6. 设置错误处理（必须在所有路由之后）
    const { errorHandler, notFoundHandler } = require('./middleware/error');
    app.use(notFoundHandler);
    app.use(errorHandler);
    
    // 7. 启动服务器
    const server = app.listen(config.port, config.host, () => {
      const stats = appService.getStats();
      
      logger.info('✅ 服务器启动成功', {
        port: config.port,
        host: config.host,
        environment: config.env,
        nodeVersion: process.version,
        operators: stats.totalOperators,
        endpoints: stats.totalEndpoints
      });
      
      logger.info(`📚 API 文档: http://${config.host}:${config.port}${config.apiPrefix}/docs`);
      logger.info(`🔗 OpenAPI Schema: http://${config.host}:${config.port}${config.apiPrefix}/docs.json`);
      logger.info(`🏥 健康检查: http://${config.host}:${config.port}/health`);
    });

    // 优雅关闭处理
    setupGracefulShutdown(server);

    return { app, server, appService };
    
  } catch (error) {
    logger.error('❌ 服务器启动失败', { error: error.stack });
    process.exit(1);
  }
}

/**
 * 设置API文档
 */
function setupApiDocs(app, appService, config) {
  const swaggerSpec = appService.getSwaggerSpec();
  const apiPrefix = config.apiPrefix || '/api';
  
  // Swagger UI
  app.use(`${apiPrefix}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'GeniSpace Custom Operators API',
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestHeaders: true,
      tryItOutEnabled: true
    }
  }));

  // Swagger JSON端点
  app.get(`${apiPrefix}/docs.json`, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.json(swaggerSpec);
  });
}

/**
 * 设置优雅关闭
 */
function setupGracefulShutdown(server) {
  const gracefulShutdown = (signal) => {
    logger.info(`收到 ${signal} 信号，开始优雅关闭...`);
    server.close(() => {
      logger.info('HTTP 服务器已关闭');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 异常处理
  process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常', { error: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝', { 
      reason: reason,
      promise: promise
    });
    process.exit(1);
  });
}

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  startApp();
}

module.exports = { app, startApp, appService };