/**
 * Text Extractor 服务
 * 
 * 核心功能：
 * 1. 通过 GeniSpace SDK 从平台存储获取文件
 * 2. 根据文件扩展名识别文件类型
 * 3. 提取各种格式文件的文本内容
 * 4. 支持格式：PDF, DOC, DOCX, XLS, XLSX, TXT
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../../../src/utils/logger');

class TextExtractor {
  constructor(config = {}) {
    this.config = {
      // 临时目录：用于存储下载的文件
      tempDir: config.tempDir || path.join(os.tmpdir(), 'text-extractor'),
      // 请求超时时间（毫秒）
      timeout: config.timeout || 30000,
      // 最大文件大小（字节），默认 50MB
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024,
      // SSL 验证：是否验证 SSL 证书（默认 true，但对于某些云存储服务可能需要设为 false）
      rejectUnauthorized: config.rejectUnauthorized !== undefined ? config.rejectUnauthorized : true,
      ...config
    };
    
    // 确保临时目录存在
    this.ensureDirectories();
    
    // 初始化解析器（延迟加载）
    this.parsers = {};
  }
  
  /**
   * 确保必要的目录存在
   */
  ensureDirectories() {
    if (!fs.existsSync(this.config.tempDir)) {
      fs.mkdirSync(this.config.tempDir, { recursive: true });
    }
  }
  
  /**
   * 检查认证（必须提供 GeniSpace API Key）
   * @param {Object} req - Express 请求对象
   * @throws {Error} 如果缺少认证信息
   */
  checkAuth(req) {
    if (!req || !req.genispace || !req.genispace.client) {
      throw new Error('缺少认证信息，请在请求头中提供 GeniSpace API Key');
    }
  }
  
  /**
   * 从平台存储提取文本内容
   * @param {string} fileId - 文件 ID
   * @param {Object} req - Express 请求对象（包含认证信息和 SDK 客户端）
   * @returns {Promise<string>} - 提取的文本内容
   */
  async extractText(fileId, req) {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('fileId 参数是必需的，且必须是字符串');
    }
    
    // 检查认证
    this.checkAuth(req);
    
    const client = req.genispace.client;
    let tempFilePath = null;
    
    try {
      // 先获取文件信息以确定文件扩展名
      const fileInfoResponse = await client.storage.getFile(fileId);
      // 处理 API 返回的数据结构：可能是 { success: true, data: {...} } 或直接的文件对象
      const fileInfo = fileInfoResponse.data || fileInfoResponse;
      const fileName = fileInfo.name || fileInfo.fileName || '';
      const extension = this.getFileExtension(fileName);
      
      if (!this.isSupportedFormat(extension)) {
        throw new Error(`不支持的文件格式: ${extension}。支持的格式: pdf, doc, docx, xls, xlsx, txt`);
      }
      
      logger.info('开始获取文件内容', {
        fileId,
        fileName,
        extension
      });
      
      // 从平台存储获取文件内容
      tempFilePath = await this.getFileFromStorage(fileId, client, extension);
      
      logger.info('开始提取文本', {
        fileId,
        fileName,
        extension,
        tempFilePath
      });
      
      // 根据文件类型提取文本
      const text = await this.extractTextByFormat(tempFilePath, extension);
      
      logger.info('文本提取成功', {
        fileId,
        fileName,
        extension,
        textLength: text.length
      });
      
      return text;
      
    } catch (error) {
      logger.error('文本提取失败', {
        fileId,
        error: error.stack
      });
      throw new Error(`文本提取失败: ${error.message}`);
    } finally {
      // 清理临时文件
      if (tempFilePath) {
        this.cleanupFiles(tempFilePath);
      }
    }
  }
  
  /**
   * 获取文件扩展名
   * @param {string} fileName - 文件名或文件路径
   * @returns {string} - 文件扩展名（小写，不含点号）
   */
  getFileExtension(fileName) {
    try {
      const ext = path.extname(fileName).toLowerCase();
      return ext.replace('.', '') || '';
    } catch (error) {
      logger.warn('无法获取文件扩展名', { fileName, error: error.message });
      return '';
    }
  }
  
  /**
   * 检查是否为支持的文件格式
   * @param {string} extension - 文件扩展名
   * @returns {boolean}
   */
  isSupportedFormat(extension) {
    const supportedFormats = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'];
    return supportedFormats.includes(extension.toLowerCase());
  }
  
  /**
   * 从平台存储获取文件内容并保存到临时目录
   * @param {string} fileId - 文件 ID
   * @param {Object} client - GeniSpace SDK 客户端实例
   * @param {string} extension - 文件扩展名
   * @returns {Promise<string>} - 临时文件路径
   */
  async getFileFromStorage(fileId, client, extension) {
    try {
      logger.info('开始从平台存储获取文件', { fileId, extension });
      
      // 使用 SDK 获取文件内容
      const fileBuffer = await client.storage.getFileContent(fileId);
      
      // 检查文件大小
      if (fileBuffer.length > this.config.maxFileSize) {
        throw new Error(`文件大小超过限制: ${this.config.maxFileSize} 字节`);
      }
      
      // 生成临时文件名
      const tempFileName = `extract_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
      const tempFilePath = path.join(this.config.tempDir, tempFileName);
      
      // 将 Buffer 写入文件
      fs.writeFileSync(tempFilePath, fileBuffer);
      
      logger.info('文件获取完成', {
        fileId,
        tempFilePath,
        fileSize: fileBuffer.length
      });
      
      return tempFilePath;
      
    } catch (error) {
      logger.error('从平台存储获取文件失败', {
        fileId,
        error: error.message,
        stack: error.stack
      });
      
      if (error.response) {
        throw new Error(`获取文件失败: HTTP ${error.response.status} - ${error.response.statusText}`);
      } else {
        throw new Error(`获取文件失败: ${error.message}`);
      }
    }
  }
  
  /**
   * 根据文件格式提取文本
   * @param {string} filePath - 文件路径
   * @param {string} extension - 文件扩展名
   * @returns {Promise<string>} - 提取的文本内容
   */
  async extractTextByFormat(filePath, extension) {
    const ext = extension.toLowerCase();
    
    switch (ext) {
      case 'pdf':
        return await this.extractFromPDF(filePath);
      case 'docx':
        return await this.extractFromDOCX(filePath);
      case 'doc':
        return await this.extractFromDOC(filePath);
      case 'xlsx':
        return await this.extractFromXLSX(filePath);
      case 'xls':
        return await this.extractFromXLS(filePath);
      case 'txt':
        return await this.extractFromTXT(filePath);
      default:
        throw new Error(`不支持的文件格式: ${extension}`);
    }
  }
  
  /**
   * 从 PDF 文件提取文本
   * @param {string} filePath - PDF 文件路径
   * @returns {Promise<string>}
   */
  async extractFromPDF(filePath) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text || '';
    } catch (error) {
      throw new Error(`PDF 文本提取失败: ${error.message}`);
    }
  }
  
  /**
   * 从 DOCX 文件提取文本
   * @param {string} filePath - DOCX 文件路径
   * @returns {Promise<string>}
   */
  async extractFromDOCX(filePath) {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (error) {
      throw new Error(`DOCX 文本提取失败: ${error.message}`);
    }
  }
  
  /**
   * 从 DOC 文件提取文本
   * @param {string} filePath - DOC 文件路径
   * @returns {Promise<string>}
   */
  async extractFromDOC(filePath) {
    // DOC 格式较复杂，需要使用 textract 或其他工具
    // textract 需要系统依赖（如 antiword 或 catdoc）
    try {
      const textract = require('textract');
      return new Promise((resolve, reject) => {
        textract.fromFileWithPath(filePath, (error, text) => {
          if (error) {
            logger.warn('DOC 文本提取失败', { error: error.message });
            reject(new Error(`DOC 文本提取失败: ${error.message}。请确保已安装系统依赖（如 antiword 或 catdoc）`));
          } else {
            resolve(text || '');
          }
        });
      });
    } catch (error) {
      // 如果 textract 不可用，提供友好的错误信息
      logger.error('DOC 文本提取器不可用', { error: error.message });
      throw new Error(`DOC 文本提取失败: textract 库未正确安装或缺少系统依赖。请安装 textract 和系统工具（如 antiword 或 catdoc）`);
    }
  }
  
  /**
   * 从 XLSX 文件提取文本
   * @param {string} filePath - XLSX 文件路径
   * @returns {Promise<string>}
   */
  async extractFromXLSX(filePath) {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const textParts = [];
      
      // 遍历所有工作表
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        // 将每行数据转换为文本
        jsonData.forEach(row => {
          if (Array.isArray(row) && row.length > 0) {
            const rowText = row.filter(cell => cell !== null && cell !== undefined && cell !== '').join('\t');
            if (rowText.trim()) {
              textParts.push(rowText);
            }
          }
        });
      });
      
      return textParts.join('\n');
    } catch (error) {
      throw new Error(`XLSX 文本提取失败: ${error.message}`);
    }
  }
  
  /**
   * 从 XLS 文件提取文本
   * @param {string} filePath - XLS 文件路径
   * @returns {Promise<string>}
   */
  async extractFromXLS(filePath) {
    // XLS 和 XLSX 使用相同的库处理
    return await this.extractFromXLSX(filePath);
  }
  
  /**
   * 从 TXT 文件提取文本
   * @param {string} filePath - TXT 文件路径
   * @returns {Promise<string>}
   */
  async extractFromTXT(filePath) {
    try {
      // 尝试不同的编码
      const encodings = ['utf8', 'utf16le', 'gbk', 'gb2312'];
      
      for (const encoding of encodings) {
        try {
          const content = fs.readFileSync(filePath, encoding);
          return content;
        } catch (error) {
          // 尝试下一个编码
          continue;
        }
      }
      
      // 如果所有编码都失败，使用默认 UTF-8
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`TXT 文本提取失败: ${error.message}`);
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
        if (fs.existsSync(filePath) && filePath.includes(this.config.tempDir)) {
          fs.unlinkSync(filePath);
          logger.debug('已删除临时文件', { filePath });
        }
      } catch (error) {
        logger.warn('删除临时文件失败', { filePath, error: error.message });
      }
    }
  }
}

module.exports = TextExtractor;

