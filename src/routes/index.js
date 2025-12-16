/**
 * 基础路由设置
 * 
 * 管理平台基础API路由（非算子路由）
 */

const express = require('express');

/**
 * 设置基础路由
 * @param {object} app - Express应用
 * @param {object} appService - 应用服务
 * @param {object} config - 配置对象
 */
function setupRoutes(app, appService, config) {
  const apiPrefix = config.apiPrefix || '/api';
  // 首页 - 使用 apiPrefix
  app.get(apiPrefix, (req, res) => {
    const stats = appService.getStats();
    const operators = appService.getOperators();
    const packageInfo = require('../../package.json');
    
    // 构建基础URL
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host || `${process.env.HOST || 'localhost'}:${process.env.PORT || 8080}`;
    const baseUrl = `${protocol}://${host}`;
    
    // 生成HTML首页
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GeniSpace 自定义算子服务</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6; 
            color: #333; 
            background: #f8fafc;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .title { color: #1e293b; font-size: 2rem; font-weight: bold; margin-bottom: 10px; }
        .subtitle { color: #64748b; font-size: 1.1rem; }
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px;
        }
        .stat-card { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-number { font-size: 2rem; font-weight: bold; color: #3b82f6; }
        .stat-label { color: #64748b; margin-top: 5px; }
        .section { 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .section-title { font-size: 1.5rem; font-weight: bold; margin-bottom: 20px; color: #1e293b; }
        .operator-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); 
            gap: 20px;
        }
        .operator-card { 
            border: 1px solid #e2e8f0; 
            border-radius: 8px; 
            padding: 20px;
            transition: all 0.2s;
        }
        .operator-card:hover { border-color: #3b82f6; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1); }
        .operator-name { font-weight: bold; color: #1e293b; margin-bottom: 8px; }
        .operator-desc { color: #64748b; margin-bottom: 12px; font-size: 0.9rem; }
        .operator-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
        .tag { 
            background: #e0f2fe; 
            color: #0369a1; 
            padding: 2px 8px; 
            border-radius: 4px; 
            font-size: 0.8rem;
        }
        .methods-count { color: #059669; font-weight: 500; }
        .copy-btn { 
            background: #3b82f6; 
            color: white; 
            border: none; 
            padding: 6px 12px; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 0.85rem;
            transition: background 0.2s;
        }
        .copy-btn:hover { background: #2563eb; }
        .copy-btn.copied { background: #059669; }
        .api-links { margin-top: 20px; }
        .api-link { 
            display: block; 
            color: #3b82f6; 
            text-decoration: none; 
            padding: 8px 0; 
            border-bottom: 1px solid #f1f5f9;
        }
        .api-link:hover { background: #f8fafc; }
        .copy-url { 
            font-family: monospace; 
            background: #f1f5f9; 
            padding: 8px; 
            border-radius: 4px; 
            font-size: 0.85rem;
            word-break: break-all;
            margin: 5px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">🚀 GeniSpace 自定义算子服务</h1>
            <p class="subtitle">自定义算子管理和API服务平台 - v${packageInfo.version}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${stats.totalOperators || 0}</div>
                <div class="stat-label">已注册算子</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.totalEndpoints || 0}</div>
                <div class="stat-label">API 端点</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.routesCount || 0}</div>
                <div class="stat-label">注册路由</div>
            </div>
        </div>
        
        <div class="section">
            <h2 class="section-title">📋 已注册算子</h2>
            <div class="operator-grid">
                ${operators.map(op => `
                    <div class="operator-card">
                        <div class="operator-name">${op.title}</div>
                        <div class="operator-desc">${op.description}</div>
                        <div class="operator-meta">
                            <span class="tag">${op.category}</span>
                            <span class="methods-count">${op.endpointCount} 个方法</span>
                        </div>
                        <div class="copy-url">
                            <code>${baseUrl}${apiPrefix}/operators/${op.category}/${op.name}/definition</code>
                            <button class="copy-btn" onclick="copyToClipboard('${baseUrl}${apiPrefix}/operators/${op.category}/${op.name}/definition', this)">复制</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="section">
            <h2 class="section-title">🔗 常用API链接</h2>
            <div class="api-links">
                <div class="copy-url">
                    <code>${baseUrl}${apiPrefix}/docs</code>
                    <button class="copy-btn" onclick="copyToClipboard('${baseUrl}${apiPrefix}/docs', this)">复制</button>
                </div>
                <div style="margin: 5px 0; color: #64748b;">Swagger API 文档</div>
                
                <div class="copy-url">
                    <code>${baseUrl}${apiPrefix}/operators</code>
                    <button class="copy-btn" onclick="copyToClipboard('${baseUrl}${apiPrefix}/operators', this)">复制</button>
                </div>
                <div style="margin: 5px 0; color: #64748b;">算子列表 API</div>
                
            </div>
        </div>
    </div>
    
    <script>
        function copyToClipboard(text, button) {
            navigator.clipboard.writeText(text).then(() => {
                const originalText = button.textContent;
                button.textContent = '已复制';
                button.classList.add('copied');
                setTimeout(() => {
                    button.textContent = originalText;
                    button.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('复制失败:', err);
                // 降级处理：选择文本
                const range = document.createRange();
                range.selectNodeContents(button.previousElementSibling);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            });
        }
    </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // 健康检查
  app.get('/health', (req, res) => {
    const stats = appService.getStats();
    const packageInfo = require('../../package.json');
    
    res.json({
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: packageInfo.version,
        environment: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        operators: {
          loaded: stats.totalOperators,
          categories: stats.categories,
          endpoints: stats.totalEndpoints
        }
      }
    });
  });

  // 算子列表API
  app.get(`${apiPrefix}/operators`, (req, res) => {
    const operators = appService.getOperators();
    const stats = appService.getStats();
    
    res.json({
      success: true,
      data: {
        operators,
        total: stats.totalOperators,
        categories: stats.categories,
        endpoints: stats.totalEndpoints
      }
    });
  });


  // 获取单个算子的完整定义（用于导出和导入）
  app.get(`${apiPrefix}/operators/:category/:name/definition`, (req, res) => {
    try {
      const { category, name } = req.params;
      const operatorId = `${category}/${name}`;
      
      const operatorDefinition = appService.getOperatorDefinition(operatorId, req);
      
      if (!operatorDefinition) {
        return res.status(404).json({
          success: false,
          error: '算子不存在',
          code: 'OPERATOR_NOT_FOUND'
        });
      }
      
      res.json({
        success: true,
        data: operatorDefinition
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '获取算子定义失败',
        code: 'INTERNAL_ERROR'
      });
    }
  });

  // 按分类获取算子
  app.get(`${apiPrefix}/operators/:category`, (req, res) => {
    const { category } = req.params;
    const operators = appService.getOperatorsByCategory(category);
    
    if (operators.length === 0) {
      return res.status(404).json({
        success: false,
        error: `分类 "${category}" 不存在或没有算子`,
        code: 'CATEGORY_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        category,
        operators,
        total: operators.length
      }
    });
  });

  // 算子统计信息
  app.get(`${apiPrefix}/stats`, (req, res) => {
    const stats = appService.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        timestamp: new Date().toISOString()
      }
    });
  });

}

module.exports = { setupRoutes };
