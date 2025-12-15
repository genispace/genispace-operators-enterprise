/**
 * 环境配置管理
 * 
 * 集中管理所有环境变量和配置项
 */

const path = require('path');

const config = {
  // 服务器配置
  port: parseInt(process.env.PORT) || 8080,
  host: process.env.HOST || '0.0.0.0',
  
  // 环境配置
  env: process.env.NODE_ENV || 'development',
  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // API配置
  apiPrefix: process.env.API_PREFIX || '/api',
  
  // CORS配置
  corsOrigin: process.env.CORS_ORIGIN ? 
    process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : 
    '*',
  
  // 请求配置
  maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  
  // 速率限制
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15分钟
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // 最大请求数
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true'
  },
  
  // 日志配置
  log: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    console: process.env.LOG_CONSOLE !== 'false' // 默认启用控制台输出
  },
  
  // 算子配置
  operators: {
    directory: process.env.OPERATORS_DIR || path.join(process.cwd(), 'operators'),
    cacheEnabled: process.env.OPERATORS_CACHE_ENABLED !== 'false',
    cacheTTL: parseInt(process.env.OPERATORS_CACHE_TTL) || 3600, // 1小时
    autoReload: process.env.OPERATORS_AUTO_RELOAD === 'true'
  },
  
  // 监控配置
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    metricsPath: process.env.METRICS_PATH || '/metrics',
    healthPath: process.env.HEALTH_PATH || '/health'
  },
  
  // 安全配置
  security: {
    enableCors: process.env.SECURITY_CORS !== 'false',
    enableRateLimit: process.env.SECURITY_RATE_LIMIT !== 'false',
    trustProxy: process.env.TRUST_PROXY === 'true'
  },
  
  // GeniSpace API KEY 认证配置
  genispace: {
    auth: {
      enabled: process.env.GENISPACE_AUTH_ENABLED === 'true',
      baseUrl: process.env.GENISPACE_API_BASE_URL || 'https://api.genispace.com',
      timeout: parseInt(process.env.GENISPACE_AUTH_TIMEOUT) || 10000,
      cacheTTL: parseInt(process.env.GENISPACE_AUTH_CACHE_TTL) || 300 // 5分钟缓存
    }
  },
  
  // 缓存配置（如果需要Redis等）
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0
    }
  },
  
  // 外部服务配置
  services: {
    // 可以在这里配置外部API、数据库等服务
  }
};

/**
 * 获取服务的基础URL
 * 优先级：OPERATORS_BASE_URL > PROTOCOL://HOST:PORT
 * @returns {string} 服务基础URL（不包含路径）
 */
function getServiceBaseUrl() {
  // 优先使用 OPERATORS_BASE_URL，因为服务启动配置往往跟最终配置的URL不一致
  if (process.env.OPERATORS_BASE_URL) {
    return process.env.OPERATORS_BASE_URL;
  }
  
  // 降级使用服务器启动配置
  const protocol = process.env.PROTOCOL || 'http';
  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || 8080;
  return `${protocol}://${host}:${port}`;
}

/**
 * 获取完整的API基础URL（包含API前缀）
 * @returns {string} API基础URL（包含API前缀，不包含具体路径）
 */
function getApiBaseUrl() {
  const baseUrl = getServiceBaseUrl();
  const apiPrefix = config.apiPrefix;
  return `${baseUrl}${apiPrefix}`;
}

// 将方法添加到config对象
config.getServiceBaseUrl = getServiceBaseUrl;
config.getApiBaseUrl = getApiBaseUrl;

// 验证必要的配置
function validateConfig() {
  const required = [];
  
  if (!config.port || config.port < 1 || config.port > 65535) {
    required.push('PORT must be a valid port number (1-65535)');
  }
  
  if (required.length > 0) {
    throw new Error(`配置验证失败:\n${required.join('\n')}`);
  }
}

// 导出配置前进行验证
try {
  validateConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}

module.exports = config;
