/**
 * 算子发现服务
 * 
 * 负责扫描文件系统并发现算子模块
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class OperatorDiscovery {
  constructor(options = {}) {
    this.options = {
      // 只扫描算子注册文件
      operatorPattern: '*.operator.js',
      excludePatterns: ['node_modules', '.git', 'test', '__test__'],
      ...options
    };
    this.discovered = new Set();
  }

  /**
   * 扫描目录发现算子
   * @param {string} directory - 扫描目录
   * @returns {Array} 发现的算子列表
   */
  async scan(directory) {
    try {
      // 确保目录路径是绝对路径
      const absoluteDir = path.isAbsolute(directory) ? directory : path.resolve(process.cwd(), directory);
      logger.info(`开始扫描算子目录: ${absoluteDir}`);
      
      await this._checkDirectory(absoluteDir);
      
      const operators = [];
      await this._scanRecursive(absoluteDir, operators);
      
      logger.info(`算子发现完成，共发现 ${operators.length} 个算子`);
      return operators;
      
    } catch (error) {
      logger.error(`算子发现失败: ${directory}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 加载单个算子注册文件
   * @param {string} filePath - 文件路径
   * @returns {object|null} 算子配置
   */
  async loadOperator(filePath) {
    try {
      if (this.discovered.has(filePath)) {
        logger.debug(`跳过已加载的算子: ${filePath}`);
        return null;
      }

      // 清除缓存支持热重载
      // 如果 filePath 是绝对路径，直接使用；否则使用 require.resolve
      const resolvedPath = path.isAbsolute(filePath) ? filePath : require.resolve(filePath);
      if (require.cache[resolvedPath]) {
        delete require.cache[resolvedPath];
      }
      
      const operatorConfig = require(filePath);
      const category = this._extractCategory(filePath);
      
      // 验证算子配置结构
      if (!this._validateOperatorConfig(operatorConfig)) {
        logger.error(`算子配置格式错误: ${filePath}`);
        return null;
      }
      
      // 设置默认分类
      if (!operatorConfig.info?.category && category) {
        operatorConfig.info = { ...operatorConfig.info, category };
      }

      // 加载路由文件
      const routesPath = path.resolve(path.dirname(filePath), operatorConfig.routes);
      let routes = null;
      
      try {
        // 清除路由文件缓存
        if (require.cache[routesPath]) {
          delete require.cache[routesPath];
        }
        routes = require(routesPath);
      } catch (error) {
        logger.error(`路由文件加载失败: ${routesPath}`, { error: error.message });
        return null;
      }

      this.discovered.add(filePath);
      
      logger.debug(`算子加载成功: ${operatorConfig.info?.name}`, {
        file: path.basename(filePath),
        routes: operatorConfig.routes,
        category
      });

      return {
        config: operatorConfig,
        routes,
        metadata: {
          filePath,
          routesPath,
          category,
          fileName: path.basename(filePath)
        }
      };

    } catch (error) {
      logger.error(`算子加载失败: ${filePath}`, { error: error.message });
      return null;
    }
  }

  /**
   * 重置发现状态
   */
  reset() {
    this.discovered.clear();
  }

  /**
   * 检查目录是否存在
   * @private
   */
  async _checkDirectory(directory) {
    try {
      await fs.access(directory);
    } catch {
      throw new Error(`算子目录不存在: ${directory}`);
    }
  }

  /**
   * 递归扫描目录
   * @private
   */
  async _scanRecursive(directory, operators, category = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (this._shouldExclude(entry.name)) {
        continue;
      }

      // 确保路径是绝对路径
      const fullPath = path.isAbsolute(directory) 
        ? path.join(directory, entry.name)
        : path.resolve(directory, entry.name);

      if (entry.isDirectory()) {
        const subCategory = category ? `${category}/${entry.name}` : entry.name;
        await this._scanRecursive(fullPath, operators, subCategory);
      } else if (this._isOperatorFile(entry.name)) {
        const result = await this.loadOperator(fullPath);
        if (result) {
          operators.push(result);
        }
      }
    }
  }

  /**
   * 判断是否应该排除
   * @private
   */
  _shouldExclude(name) {
    return this.options.excludePatterns.some(pattern => 
      name.includes(pattern) || name.startsWith('.')
    );
  }

  /**
   * 判断是否为算子注册文件
   * @private
   */
  _isOperatorFile(fileName) {
    return fileName.endsWith('.operator.js');
  }

  /**
   * 从文件路径提取分类
   * @private
   */
  _extractCategory(filePath) {
    const relativePath = path.relative(process.cwd(), filePath);
    const segments = relativePath.split(path.sep);
    
    // 假设结构: operators/category/operator.js
    if (segments.length >= 3 && segments[0] === 'operators') {
      return segments[1];
    }
    
    return '';
  }
  
  /**
   * 验证算子配置格式
   * @private
   */
  _validateOperatorConfig(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }
    
    // 必需字段验证
    if (!config.info || !config.info.name) {
      return false;
    }
    
    if (!config.routes || typeof config.routes !== 'string') {
      return false;
    }
    
    if (!config.openapi || !config.openapi.paths) {
      return false;
    }
    
    return true;
  }
}

module.exports = OperatorDiscovery;
