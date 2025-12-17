/**
 * Markdown 生成服务
 * 
 * 核心功能：
 * 1. Markdown 文本处理和文件生成
 * 2. 模板数据填充（Mustache 语法）
 * 3. 多平台换行符支持
 * 4. 平台存储上传（通过 GeniSpace SDK）
 * 5. 临时文件管理
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Mustache = require('mustache');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../../src/utils/logger');
const config = require('../../../src/config/env');

class MarkdownGenerator {
  constructor(config = {}) {
    this.config = {
      // 临时目录：使用系统临时目录，文件生成后立即上传并删除
      tempDir: config.tempDir || path.join(os.tmpdir(), 'markdown-generator'),
      outputDir: config.outputDir || path.join(os.tmpdir(), 'markdown-generator'),
      
      // Markdown 默认选项
      defaultOptions: {
        encoding: 'utf8',
        lineEnding: '\n', // 支持 '\n', '\r\n', '\r'
        ensureTrailingNewline: true,
        ...config.defaultOptions
      },
      
      // 默认 Markdown 处理选项
      defaultMarkdownOptions: {
        trimTrailingWhitespace: true,
        normalizeLineEndings: true,
        preserveCodeBlocks: true,
        ...config.defaultMarkdownOptions
      },
      
      ...config
    };
    
    // 确保目录存在
    this.ensureDirectories();
  }
  
  /**
   * 确保必要的目录存在
   */
  ensureDirectories() {
    [this.config.tempDir, this.config.outputDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * 检查认证（必须提供 GeniSpace API Key）
   * @param {Object} req - Express 请求对象
   * @throws {Error} 如果缺少认证信息
   */
  checkAuth(req) {
    // 开发环境下提供测试模式
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
      logger.info('开发模式：跳过认证检查');
      // 创建一个模拟的 genispace 对象用于测试
      req.genispace = {
        client: {
          storage: {
            uploadFile: async (file, options) => {
              // 模拟上传返回结果
              return {
                id: `test-${Date.now()}`,
                publicUrl: `https://storage.example.com/test/${file.originalname}`,
                url: `https://storage.example.com/test/${file.originalname}`
              };
            }
          }
        }
      };
      return;
    }
    
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，请在请求头中提供 GeniSpace API Key');
    }
  }
  
  /**
   * 生成 Markdown 文件
   * @param {Object} options - 生成选项
   * @param {string} options.markdownContent - Markdown 内容
   * @param {Object} options.templateData - 填充模板的 JSON 数据（可选）
   * @param {string} options.fileName - 输出文件名（可选）
   * @param {string} options.lineEnding - 换行符类型（可选）
   * @param {Object} options.req - Express 请求对象（用于认证和 SDK 上传）
   * @returns {Promise<Object>} - 生成结果
   */
  async generateMarkdown(options) {
    const {
      markdownContent,
      templateData,
      fileName,
      lineEnding = '\n',
      req
    } = options;
    
    // 检查认证
    this.checkAuth(req);
    
    logger.info('开始生成 Markdown 文件', {
      hasContent: !!markdownContent,
      hasTemplateData: !!templateData,
      fileName,
      lineEnding
    });
    
    if (!markdownContent || typeof markdownContent !== 'string') {
      throw new Error('必须提供 Markdown 内容');
    }
    
    if (templateData !== undefined && templateData !== null && 
        (typeof templateData !== 'object' || Array.isArray(templateData))) {
      throw new Error('templateData 必须是对象格式');
    }
    
    try {
      // 生成唯一文件名
      const uniqueId = uuidv4().substring(0, 8);
      const finalFileName = fileName ? 
        `${fileName}_${uniqueId}` : 
        `markdown_${Date.now()}_${uniqueId}`;
      
      // 获取模板内容
      const templateContent = await this.getTemplateContent(markdownContent);
      
      // 填充模板数据
      const filledMarkdown = templateData ? 
        Mustache.render(templateContent, templateData) : 
        templateContent;
      
      // 处理换行符和格式
      const processedMarkdown = this.processMarkdown(filledMarkdown, lineEnding);
      
      // 生成 Markdown 文件
      const mdPath = await this.generateMarkdownFile(processedMarkdown, finalFileName);
      
      // 获取文件信息
      const fileStats = fs.statSync(mdPath);
      const lineCount = this.getLineCount(processedMarkdown);
      
      // 上传到平台存储
      const mdURL = await this.uploadToPlatformStorage(mdPath, finalFileName, req);
      
      // 清理临时文件
      this.cleanupFiles(mdPath);
      
      const result = {
        success: true,
        mdURL,
        lineCount,
        fileSize: fileStats.size,
        fileName: `${finalFileName}.md`,
        storageProvider: 'platform',
        generatedAt: new Date().toISOString()
      };
      
      logger.info('Markdown 文件生成成功', result);
      return result;
      
    } catch (error) {
      logger.error('Markdown 生成失败', { error: error.stack });
      throw new Error(`Markdown 生成失败: ${error.message}`);
    }
  }
  
  /**
   * 获取模板内容
   * @param {string} template - 模板内容或 URL
   * @returns {Promise<string>} - 模板内容
   */
  async getTemplateContent(template) {
    // 如果是 URL，下载内容
    if (template.startsWith('http://') || template.startsWith('https://')) {
      const axios = require('axios');
      try {
        const response = await axios.get(template, { 
          responseType: 'text',
          timeout: 10000 
        });
        return response.data;
      } catch (error) {
        throw new Error(`无法下载模板文件: ${error.message}`);
      }
    }
    
    // 如果是本地文件路径（不包含换行符和 Markdown 语法），读取文件
    if (!template.includes('\n') && !template.includes('#') && (template.includes('/') || template.includes('\\'))) {
      try {
        return fs.readFileSync(template, 'utf8');
      } catch (error) {
        // 如果文件不存在，当作模板内容处理
        logger.warn('文件不存在，将作为模板内容处理', { 
          template: template.substring(0, 50) + '...' 
        });
        return template;
      }
    }
    
    // 直接返回模板内容
    return template;
  }
  
  /**
   * 处理 Markdown 内容
   * @param {string} markdown - Markdown 内容
   * @param {string} lineEnding - 换行符类型
   * @returns {string} - 处理后的 Markdown 内容
   */
  processMarkdown(markdown, lineEnding = '\n') {
    let processed = markdown;
    
    // 处理换行符
    processed = this.processLineEndings(processed, lineEnding);
    
    // 去除行尾空格
    if (this.config.defaultMarkdownOptions.trimTrailingWhitespace) {
      processed = processed.split('\n')
        .map(line => line.replace(/\s+$/g, ''))
        .join('\n');
    }
    
    // 确保文件以换行符结尾
    if (this.config.defaultOptions.ensureTrailingNewline && 
        !processed.endsWith(lineEnding)) {
      processed += lineEnding;
    }
    
    // 规范化行结束符
    if (this.config.defaultMarkdownOptions.normalizeLineEndings) {
      processed = this.normalizeLineEndings(processed);
    }
    
    return processed;
  }
  
  /**
   * 处理换行符
   * @param {string} content - 内容
   * @param {string} lineEnding - 目标换行符
   * @returns {string} - 处理后的内容
   */
  processLineEndings(content, lineEnding) {
    // 先统一转换为 \n，然后转换为目标换行符
    return content
      .replace(/\r\n/g, '\n')  // Windows CRLF -> LF
      .replace(/\r/g, '\n')    // Mac CR -> LF
      .replace(/\n/g, lineEnding); // LF -> 目标换行符
  }
  
  /**
   * 规范化行结束符为 LF
   * @param {string} content - 内容
   * @returns {string} - 规范化后的内容
   */
  normalizeLineEndings(content) {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }
  
  /**
   * 生成 Markdown 文件
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名（不含扩展名）
   * @returns {Promise<string>} - 文件路径
   */
  async generateMarkdownFile(content, fileName) {
    const outputPath = path.join(this.config.outputDir, `${fileName}.md`);
    
    try {
      fs.writeFileSync(outputPath, content, this.config.defaultOptions.encoding);
      logger.info('Markdown 文件生成完成', { outputPath });
      return outputPath;
    } catch (error) {
      logger.error('Markdown 文件写入失败', { error: error.stack });
      throw new Error(`文件写入失败: ${error.message}`);
    }
  }
  
  /**
   * 获取文件行数
   * @param {string} content - 文件内容
   * @returns {number} - 行数
   */
  getLineCount(content) {
    if (!content) return 0;
    return content.split('\n').length;
  }
  
  /**
   * 上传文件到平台存储（通过 GeniSpace SDK）
   * @param {string} filePath - 文件路径
   * @param {string} fileName - 文件名（不含扩展名）
   * @param {Object} req - Express 请求对象（包含认证信息）
   * @returns {Promise<string>} - 文件 URL
   */
  async uploadToPlatformStorage(filePath, fileName, req) {
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，无法上传文件到平台存储');
    }
    
    try {
      const client = req.genispace.client;
      const folderPath = `/tmp/operators/markdown-documents/${new Date().getFullYear()}/${new Date().getMonth() + 1}`;
      
      logger.info('上传文件到平台存储', {
        fileName,
        folderPath,
        filePath
      });
      
      // 使用 SDK 上传文件
      const file = {
        path: filePath,
        mimetype: 'text/markdown',
        originalname: `${fileName}.md`
      };
      
      const uploadedFile = await client.storage.uploadFile(file, {
        folderPath,
        fileName: `${fileName}.md`
      });
      
      // 返回文件的 publicUrl 或 url
      const fileUrl = uploadedFile.publicUrl || uploadedFile.url;
      
      logger.info('文件上传到平台存储成功', { 
        fileId: uploadedFile.id,
        url: fileUrl 
      });
      
      return fileUrl;
    } catch (error) {
      logger.error('平台存储上传失败', { error: error.stack });
      throw new Error(`平台存储上传失败: ${error.message}`);
    }
  }
  
  /**
   * 清理临时文件
   * @param {...string} filePaths - 文件路径
   */
  cleanupFiles(...filePaths) {
    for (const filePath of filePaths) {
      try {
        // 检查文件是否在临时目录中（安全措施：只删除临时目录中的文件）
        if (fs.existsSync(filePath) && 
            (filePath.includes(this.config.tempDir) || filePath.includes(this.config.outputDir))) {
          fs.unlinkSync(filePath);
          logger.debug('已删除临时文件', { filePath });
        }
      } catch (error) {
        logger.warn('删除临时文件失败', { filePath, error: error.message });
      }
    }
  }
}

module.exports = MarkdownGenerator;
