/**
 * 极简 GeniSpace 认证中间件
 * 确保绝对不会崩溃
 * 
 * 支持的认证头格式：
 * - Authorization: GeniSpace <api_key>  
 * - GeniSpace: <api_key>
 * 
 * 使用说明：
 * 1. API类型算子在运行配置中启用"GeniSpace认证"选项
 * 2. 算子执行时会自动传递System API Key用于身份验证
 * 3. 验证成功后可通过 req.genispace 获取用户信息和API Key信息
 * 4. 需要认证的算子需要自己调用 checkAuth() 方法进行验证
 * 
 * 示例：
 * ```javascript
 * // 在算子中获取执行人信息
 * app.post('/my-operator', auth(), (req, res) => {
 *   if (req.genispace) {
 *     console.log('执行人:', req.genispace.user.name);
 *     console.log('团队ID:', req.genispace.keyInfo.teamId);
 *     console.log('API Key:', req.genispace.apiKey);
 *   }
 *   // 算子逻辑...
 * });
 * ```
 */

const GeniSpace = require('genispace');
const config = require('../config/env');
const logger = require('../utils/logger');

// 简单缓存（可使用Redis等）
const authCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 清理过期缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of authCache.entries()) {
    if (item.expiresAt <= now) {
      authCache.delete(key);
    }
  }
}, CACHE_TTL);

/**
 * 提取 API Key
 * 支持以下格式：
 * - Authorization: GeniSpace <api_key>  
 * - GeniSpace: <api_key>
 * 
 * 注意：不支持 Authorization: Bearer <api_key> 格式，
 * 避免与用户自定义算子的认证头产生冲突
 */
function extractApiKey(req) {
  try {
    // 优先检查 GeniSpace 头
    const geniSpaceHeader = req.headers.genispace;
    if (geniSpaceHeader) {
      return geniSpaceHeader;
    }
    
    // 检查 Authorization 头中的 GeniSpace 格式
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('GeniSpace ')) {
      return authHeader.substring(10);
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 通过SDK验证 API Key
 */
async function validateApiKeyViaSDK(apiKey) {
  try {
    const baseUrl = config.genispace?.auth?.baseUrl || 'https://api.genispace.com';
    const timeout = config.genispace?.auth?.timeout || 10000;
    
    logger.debug('创建 GeniSpace SDK 客户端', {
      baseUrl,
      timeout,
      envBaseUrl: process.env.GENISPACE_API_BASE_URL,
      configBaseUrl: config.genispace?.auth?.baseUrl
    });
    
    // 创建SDK客户端实例，使用被验证的API Key
    const client = new GeniSpace({
      apiKey: apiKey,
      baseURL: baseUrl,
      timeout: timeout
    });

    // 使用SDK的验证方法验证API Key
    if (client.apiKeys && typeof client.apiKeys.validate === 'function') {
      // 使用SDK的验证接口
      const validationResult = await client.apiKeys.validate(apiKey);
      
      if (validationResult.success && validationResult.data.valid) {
        return {
          success: true,
          user: {
            id: validationResult.data.keyInfo.owner.id,
            email: validationResult.data.keyInfo.owner.email,
            name: validationResult.data.keyInfo.owner.name,
            company: null
          },
          keyInfo: {
            id: validationResult.data.keyInfo.id,
            name: validationResult.data.keyInfo.name,
            application: validationResult.data.keyInfo.application,
            permissions: validationResult.data.keyInfo.permissions || []
          },
          client: client
        };
      } else {
        return {
          success: false,
          error: validationResult.data?.reason || 'API Key 验证失败'
        };
      }
    } else {
      // 备用方案：通过获取用户资料来验证API Key
      const user = await client.users.getProfile();
      
      return {
        success: true,
        user: {
          id: user.id || 'unknown',
          email: user.email || 'unknown',
          name: user.name || 'unknown',
          company: user.company || null
        },
        client: client
      };
    }

  } catch (e) {
    logger.error('SDK API Key验证失败', {
      error: e.message,
      code: e.code
    });
    
    return {
      success: false,
      error: 'API Key 验证失败'
    };
  }
}

/**
 * 验证 API Key (使用SDK)
 */
async function validateApiKey(apiKey) {
  try {
    // 直接使用SDK验证API Key
    return await validateApiKeyViaSDK(apiKey);

  } catch (e) {
    logger.error('API Key验证异常', {
      error: e.message
    });
    
    return {
      success: false,
      error: 'API Key验证服务异常'
    };
  }
}

/**
 * 获取缓存
 */
function getCache(apiKey) {
  try {
    const key = `auth:${apiKey.substring(0, 8)}`;
    const cached = authCache.get(key);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 设置缓存
 */
function setCache(apiKey, result) {
  try {
    const key = `auth:${apiKey.substring(0, 8)}`;
    authCache.set(key, {
      result,
      expiresAt: Date.now() + CACHE_TTL
    });
  } catch (e) {
    // 忽略缓存错误
  }
}

/**
 * 认证中间件
 */
function auth() {
  return async (req, res, next) => {
    try {
      const apiPrefix = config.apiPrefix || '/api';
      
      // 公开路径
      const publicPaths = [
        apiPrefix,
        '/health',
        `${apiPrefix}/docs`,
        `${apiPrefix}/docs.json`,
        `${apiPrefix}/operators`
      ];

      if (publicPaths.includes(req.path) || 
          req.path.startsWith(`${apiPrefix}/docs/`) ||
          new RegExp(`^${apiPrefix}/operators/[^/]+/[^/]+/definition$`).test(req.path)) {
        return next();
      }

      // 只对 API 前缀路径处理
      if (!req.path.startsWith(apiPrefix)) {
        return next();
      }

      // 提取 API Key
      const apiKey = extractApiKey(req);

      // 如果存在 API Key，尝试验证并设置 req.genispace
      // 算子自己会通过 checkAuth 方法判断是否需要认证
      if (apiKey) {
        try {
          // 记录验证开始
          logger.debug('开始验证 API Key', {
            path: req.path,
            apiKeyPrefix: apiKey.substring(0, 8) + '...',
            baseUrl: config.genispace?.auth?.baseUrl,
            timeout: config.genispace?.auth?.timeout
          });
          
          // 检查缓存
          let authResult = getCache(apiKey);
          
          if (!authResult) {
            authResult = await validateApiKey(apiKey);
            
            if (authResult && authResult.success) {
              setCache(apiKey, authResult);
              logger.debug('API Key 验证成功', {
                path: req.path,
                userId: authResult.user?.id
              });
            } else {
              logger.warn('API Key 验证失败', {
                path: req.path,
                apiKeyPrefix: apiKey.substring(0, 8) + '...',
                error: authResult?.error || '未知错误',
                baseUrl: config.genispace?.auth?.baseUrl
              });
            }
          } else {
            logger.debug('使用缓存的 API Key 验证结果', {
              path: req.path,
              userId: authResult.user?.id
            });
          }

          if (authResult && authResult.success) {
            req.genispace = {
              user: authResult.user,
              client: authResult.client,
              apiKey: apiKey,
              keyInfo: authResult.keyInfo
            };
            logger.debug('req.genispace 已设置', {
              path: req.path,
              hasClient: !!req.genispace.client,
              userId: req.genispace.user?.id
            });
          } else {
            logger.warn('req.genispace 未设置，验证失败', {
              path: req.path,
              hasAuthResult: !!authResult,
              authSuccess: authResult?.success,
              error: authResult?.error
            });
          }
        } catch (error) {
          // 记录验证错误，但继续执行，让算子自己判断
          logger.error('API Key 验证异常', {
            path: req.path,
            error: error.message,
            stack: error.stack,
            baseUrl: config.genispace?.auth?.baseUrl
          });
        }
      } else {
        logger.debug('请求中未找到 API Key', {
          path: req.path,
          headers: Object.keys(req.headers).filter(h => {
            const lower = h.toLowerCase();
            return lower.includes('genispace') || lower.includes('authorization');
          })
        });
      }

      next();

    } catch (error) {
      // 绝对安全的错误处理
      logger.error('认证中间件错误', {
        error: error ? (error.message || String(error)) : 'Unknown error',
        endpoint: req.path,
        stack: error ? error.stack : 'No stack trace'
      });
      
      return res.status(500).json({
        success: false,
        error: '认证服务错误'
      });
    }
  };
}

module.exports = {
  auth,
  extractApiKey,
  validateApiKey,
  validateApiKeyViaSDK
};
