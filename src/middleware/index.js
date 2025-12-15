/**
 * 中间件设置
 * 
 * 统一管理所有Express中间件的配置
 */

const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const express = require('express');

const { requestLogger } = require('./logger');
const logger = require('../utils/logger');

/**
 * 设置所有中间件
 * @param {object} app - Express应用
 * @param {object} config - 配置对象
 */
function setupMiddlewares(app, config) {
  logger.debug('设置应用中间件...');

  // 1. 基础安全头（轻量级）
  app.use((req, res, next) => {
    // 基本安全头，适用于内网微服务
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // 2. CORS配置 - 强制启用并允许开发环境跨域
  app.use(cors({
    origin: function (origin, callback) {
      // 允许没有origin的请求（比如移动应用程序或curl）
      if (!origin) return callback(null, true);
      
      // 开发环境允许所有来源
      if (config.isDevelopment) {
        return callback(null, true);
      }
      
      // 生产环境使用配置的origin
      const allowedOrigins = Array.isArray(config.corsOrigin) ? config.corsOrigin : [config.corsOrigin];
      if (config.corsOrigin === '*' || allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Length', 'X-Total-Count']
  }));

  // 3. 压缩响应
  app.use(compression());

  // 4. 请求解析
  app.use(express.json({ 
    limit: config.maxRequestSize,
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));

  app.use(express.urlencoded({ 
    extended: true, 
    limit: config.maxRequestSize 
  }));

  // 5. 速率限制
  if (config.security.enableRateLimit) {
    const limiter = createRateLimiter(config.rateLimit);
    app.use('/api/', limiter);
  }

  // 6. 请求日志
  app.use(requestLogger);

  // 7. GeniSpace API Key 认证中间件
  const { auth } = require('./auth');
  app.use(auth());

  // 注意：错误处理中间件应该在所有路由注册后才设置
  // 这里不设置错误处理，会在主应用中设置

  logger.debug('中间件设置完成');
}

/**
 * 创建速率限制器
 * @param {object} rateLimitConfig - 速率限制配置
 * @returns {Function} 速率限制中间件
 */
function createRateLimiter(rateLimitConfig) {
  return rateLimit({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.max,
    message: {
      success: false,
      error: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('触发速率限制', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString()
      });
    }
  });
}

module.exports = { setupMiddlewares };
