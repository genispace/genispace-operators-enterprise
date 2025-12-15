/**
 * PDF 生成服务
 * 
 * 核心功能：
 * 1. Markdown 模板解析和 JSON 数据填充
 * 2. 高质量 PDF 生成
 * 3. 云存储上传（阿里云 OSS / 腾讯云 COS）
 * 4. 临时文件管理
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const puppeteer = require('puppeteer');
const marked = require('marked');
const Mustache = require('mustache');
const OSS = require('ali-oss');
const COS = require('cos-nodejs-sdk-v5');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../../src/utils/logger');
const config = require('../../../src/config/env');

class PDFGenerator {
  constructor(config = {}) {
    this.config = {
      tempDir: config.tempDir || path.join(os.tmpdir(), 'pdf-generator'),
      outputDir: config.outputDir || path.join(os.tmpdir(), 'pdf-generator', 'outputs'),
      
      // 阿里云 OSS 配置
      aliyun: {
        region: config.aliyun?.region || process.env.ALIYUN_OSS_REGION,
        accessKeyId: config.aliyun?.accessKeyId || process.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: config.aliyun?.accessKeySecret || process.env.ALIYUN_ACCESS_KEY_SECRET,
        bucket: config.aliyun?.bucket || process.env.ALIYUN_OSS_BUCKET,
        endpoint: config.aliyun?.endpoint || process.env.ALIYUN_OSS_ENDPOINT,
        customDomain: config.aliyun?.customDomain || process.env.ALIYUN_OSS_CUSTOM_DOMAIN,
        ...config.aliyun
      },
      
      // 腾讯云 COS 配置
      tencent: {
        SecretId: config.tencent?.SecretId || process.env.TENCENT_SECRET_ID,
        SecretKey: config.tencent?.SecretKey || process.env.TENCENT_SECRET_KEY,
        Bucket: config.tencent?.Bucket || process.env.TENCENT_COS_BUCKET,
        Region: config.tencent?.Region || process.env.TENCENT_COS_REGION,
        customDomain: config.tencent?.customDomain || process.env.TENCENT_COS_CUSTOM_DOMAIN,
        ...config.tencent
      },
      
      // PDF 默认选项
      defaultPdfOptions: {
        format: 'A4',
        margin: {
          top: '1cm',
          right: '1cm',
          bottom: '1cm',
          left: '1cm'
        },
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        ...config.defaultPdfOptions
      },
      
      // 默认 CSS 样式
      defaultCssStyles: `
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 100%;
          margin: 0;
          padding: 20px;
          font-size: 14px;
        }
        h1, h2, h3, h4, h5, h6 { 
          color: #2c3e50;
          margin-top: 2em;
          margin-bottom: 1em;
          font-weight: 600;
        }
        h1 { 
          font-size: 2.5em; 
          border-bottom: 3px solid #3498db; 
          padding-bottom: 0.5em; 
          page-break-before: auto;
        }
        h2 { 
          font-size: 2em; 
          border-bottom: 2px solid #bdc3c7; 
          padding-bottom: 0.3em; 
        }
        h3 { font-size: 1.5em; }
        h4 { font-size: 1.25em; }
        h5 { font-size: 1.1em; }
        h6 { font-size: 1em; }
        
        p { margin: 1em 0; }
        
        code { 
          background-color: #f8f9fa;
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: 'SFMono-Regular', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
          font-size: 0.9em;
        }
        
        pre { 
          background-color: #f8f9fa;
          padding: 1em;
          border-radius: 5px;
          overflow-x: auto;
          border-left: 4px solid #3498db;
          page-break-inside: avoid;
        }
        
        pre code {
          background: none;
          padding: 0;
        }
        
        table { 
          border-collapse: collapse;
          width: 100%;
          margin: 1.5em 0;
          page-break-inside: avoid;
        }
        
        th, td { 
          border: 1px solid #ddd;
          padding: 0.75em;
          text-align: left;
          font-size: 0.9em;
        }
        
        th { 
          background-color: #f8f9fa;
          font-weight: 600;
        }
        
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        
        blockquote {
          border-left: 4px solid #3498db;
          margin: 1.5em 0;
          padding-left: 1em;
          color: #666;
          font-style: italic;
          background-color: #f8f9fa;
          padding: 1em;
          border-radius: 0 5px 5px 0;
        }
        
        ul, ol {
          margin: 1em 0;
          padding-left: 2em;
        }
        
        li {
          margin: 0.5em 0;
        }
        
        img { 
          max-width: 100%;
          height: auto;
          display: block;
          margin: 1em auto;
          border-radius: 5px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        hr {
          border: none;
          border-top: 2px solid #eee;
          margin: 2em 0;
        }
        
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        
        .highlight {
          background-color: #fff3cd;
          padding: 0.5em;
          border-radius: 3px;
          border-left: 4px solid #ffc107;
        }
        
        @media print {
          body { 
            margin: 0; 
            font-size: 12pt;
          }
          
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
          }
          
          table, pre, blockquote {
            page-break-inside: avoid;
          }
          
          img {
            max-width: 100% !important;
          }
        }
      `,
      
      // Puppeteer 配置
      puppeteerOptions: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 
                       process.env.CHROME_BIN || 
                       "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ||
                       undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ],
        ...config.puppeteerOptions
      },
      
      ...config
    };
    
    // 确保目录存在
    this.ensureDirectories();
    
    // 初始化云存储客户端
    this.initCloudClients();
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
   * 初始化云存储客户端
   */
  initCloudClients() {
    // 初始化阿里云 OSS 客户端
    if (this.config.aliyun.accessKeyId && this.config.aliyun.accessKeySecret && this.config.aliyun.bucket) {
      try {
        this.ossClient = new OSS({
          region: this.config.aliyun.region,
          accessKeyId: this.config.aliyun.accessKeyId,
          accessKeySecret: this.config.aliyun.accessKeySecret,
          bucket: this.config.aliyun.bucket,
          endpoint: this.config.aliyun.endpoint
        });
        logger.info('阿里云 OSS 客户端初始化成功');
      } catch (error) {
        logger.warn('阿里云 OSS 客户端初始化失败', { error: error.message });
      }
    }
    
    // 初始化腾讯云 COS 客户端
    if (this.config.tencent.SecretId && this.config.tencent.SecretKey && this.config.tencent.Bucket) {
      try {
        this.cosClient = new COS({
          SecretId: this.config.tencent.SecretId,
          SecretKey: this.config.tencent.SecretKey
        });
        logger.info('腾讯云 COS 客户端初始化成功');
      } catch (error) {
        logger.warn('腾讯云 COS 客户端初始化失败', { error: error.message });
      }
    }
  }
  
  /**
   * 生成 PDF
   * @param {Object} options - 生成选项
   * @param {string} options.markdownTemplate - Markdown 模板内容或 URL
   * @param {Object} options.templateData - 填充模板的 JSON 数据
   * @param {string} options.fileName - 输出文件名（可选）
   * @param {Object} options.pdfOptions - PDF 生成选项（可选）
   * @param {string} options.cssStyles - 自定义 CSS 样式（可选）
   * @param {string} options.cloudProvider - 云存储提供商（可选）
   * @returns {Promise<Object>} - 生成结果
   */
  async generatePDF(options) {
    const {
      markdownTemplate,
      templateData,
      fileName,
      pdfOptions = {},
      cssStyles = '',
      cloudProvider
    } = options;
    
    logger.info('开始生成 PDF', {
      hasTemplate: !!markdownTemplate,
      dataKeys: templateData ? Object.keys(templateData) : [],
      fileName,
      cloudProvider
    });
    
    if (!markdownTemplate) {
      throw new Error('必须提供 Markdown 模板内容');
    }
    
    if (templateData === undefined || templateData === null || typeof templateData !== 'object' || Array.isArray(templateData)) {
      throw new Error('必须提供有效的 JSON 模板数据');
    }
    
    try {
      // 生成唯一文件名
      const uniqueId = uuidv4().substring(0, 8);
      const finalFileName = fileName ? 
        `${fileName}_${uniqueId}` : 
        `pdf_${Date.now()}_${uniqueId}`;
      
      // 获取模板内容
      const templateContent = await this.getTemplateContent(markdownTemplate);
      
      // 填充模板数据
      const filledMarkdown = Mustache.render(templateContent, templateData);
      
      // 转换为 HTML
      const htmlContent = this.convertMarkdownToHTML(filledMarkdown, cssStyles);
      
      // 生成 PDF
      const pdfPath = await this.generatePDFFromHTML(htmlContent, finalFileName, pdfOptions);
      
      // 获取 PDF 信息
      const fileStats = fs.statSync(pdfPath);
      const pageCount = await this.getPDFPageCount(pdfPath);
      
      // 上传到云存储
      const provider = this.getStorageProvider();
      const pdfURL = await this.uploadToCloud(pdfPath, finalFileName);
      
      // 清理临时文件
      this.cleanupFiles(pdfPath);
      
      const result = {
        success: true,
        pdfURL,
        pageCount,
        fileSize: fileStats.size,
        fileName: `${finalFileName}.pdf`,
        storageProvider: provider,
        generatedAt: new Date().toISOString()
      };
      
      logger.info('PDF 生成成功', result);
      return result;
      
    } catch (error) {
      logger.error('PDF 生成失败', { error: error.stack });
      throw new Error(`PDF 生成失败: ${error.message}`);
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
   * 转换 Markdown 为 HTML
   * @param {string} markdown - Markdown 内容
   * @param {string} customCSS - 自定义 CSS 样式
   * @returns {string} - HTML 内容
   */
  convertMarkdownToHTML(markdown, customCSS = '') {
    // 配置 marked（使用新的 API）
    marked.use({
      renderer: {
        code(code, language) {
          // 代码高亮处理
          const lang = language || 'text';
          return `<pre><code class="language-${lang}">${this.options.sanitize ? marked.utils.escape(code) : code}</code></pre>`;
        },
        table(header, body) {
          return `<div class="table-container"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
        }
      },
      breaks: true,
      gfm: true
    });
    
    const htmlBody = marked.parse(markdown);
    const cssStyles = this.config.defaultCssStyles + '\n' + (customCSS || '');
    
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generated PDF</title>
        <style>${cssStyles}</style>
      </head>
      <body>
        ${htmlBody}
      </body>
      </html>
    `;
  }
  
  /**
   * 从 HTML 模板生成 PDF
   * @param {string} htmlTemplate - HTML 模板内容
   * @param {Object} templateData - 模板数据 (可选)
   * @param {string} fileName - 文件名（不含扩展名）
   * @param {Object} options - PDF 选项
   * @returns {Promise<string>} - PDF 文件路径
   */
  async generatePDFFromHTML(htmlTemplate, templateData = {}, fileName, options = {}) {
    const outputPath = path.join(this.config.outputDir, `${fileName}.pdf`);
    
    let browser;
    try {
      // 如果提供了模板数据，则使用 Mustache 处理模板
      let htmlContent = htmlTemplate;
      if (templateData && Object.keys(templateData).length > 0) {
        htmlContent = Mustache.render(htmlTemplate, templateData);
      }
      
      // 动态检测 Chrome 路径
      const chromePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_BIN,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser"
      ];
      
      let executablePath;
      for (const path of chromePaths) {
        if (path && fs.existsSync(path)) {
          executablePath = path;
          break;
        }
      }
      
      const launchOptions = {
        ...this.config.puppeteerOptions,
        executablePath
      };
      
      logger.debug('Puppeteer 启动配置', { executablePath, headless: launchOptions.headless });
      
      // 启动 Puppeteer 浏览器
      browser = await puppeteer.launch(launchOptions);
      
      const page = await browser.newPage();
      
      // 设置页面内容
      await page.setContent(htmlContent, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      // 合并 PDF 选项
      const pdfOptions = {
        ...this.config.defaultPdfOptions,
        ...options,
        path: outputPath
      };
      
      // 生成 PDF
      await page.pdf(pdfOptions);
      
      logger.info('PDF 文件生成完成', { outputPath });
      return outputPath;
      
    } catch (error) {
      logger.error('PDF 生成失败', { error: error.stack });
      throw new Error(`PDF 生成失败: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
  
  /**
   * 获取 PDF 页面数量
   * @param {string} pdfPath - PDF 文件路径
   * @returns {Promise<number>} - 页面数量
   */
  async getPDFPageCount(pdfPath) {
    try {
      // 简单估算：每页约 50KB
      const fileSize = fs.statSync(pdfPath).size;
      return Math.max(1, Math.round(fileSize / (50 * 1024)));
    } catch (error) {
      logger.warn('无法获取 PDF 页面数量，使用默认值', { error: error.message });
      return 1;
    }
  }
  
  /**
   * 获取配置的存储提供商
   * @returns {string} - 存储提供商
   */
  getStorageProvider() {
    const provider = process.env.STORAGE_PROVIDER || 'LOCAL';
    
    switch (provider.toUpperCase()) {
      case 'ALIYUN_OSS':
        if (this.ossClient) {
          return 'aliyun';
        }
        logger.warn('ALIYUN_OSS 配置不完整，使用 LOCAL 存储', {
          hasOSSClient: !!this.ossClient
        });
        return 'local';
        
      case 'TENCENT_COS':
        if (this.cosClient) {
          return 'tencent';
        }
        logger.warn('TENCENT_COS 配置不完整，使用 LOCAL 存储', {
          hasCOSClient: !!this.cosClient
        });
        return 'local';
        
      case 'LOCAL':
        return 'local';
        
      default:
        logger.warn(`未知的存储提供商: ${provider}，使用 LOCAL`);
        return 'local';
    }
  }
  
  /**
   * 上传文件到配置的存储提供商
   * @param {string} filePath - 文件路径
   * @param {string} fileName - 文件名
   * @returns {Promise<string>} - 文件 URL
   */
  async uploadToCloud(filePath, fileName) {
    const provider = this.getStorageProvider();
    const fileKey = `pdf-documents/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${fileName}.pdf`;
    
    logger.info('上传文件到存储', {
      provider,
      fileName,
      fileKey,
      storageProvider: process.env.STORAGE_PROVIDER
    });
    
    switch (provider) {
      case 'aliyun':
        return await this.uploadToAliyunOSS(filePath, fileKey);
      case 'tencent':
        return await this.uploadToTencentCOS(filePath, fileKey);
      case 'local':
      default:
        return await this.saveToLocal(filePath, fileName);
    }
  }
  
  /**
   * 上传到阿里云 OSS
   * @param {string} filePath - 文件路径
   * @param {string} fileKey - 对象 key
   * @returns {Promise<string>} - 文件 URL
   */
  async uploadToAliyunOSS(filePath, fileKey) {
    if (!this.ossClient) {
      throw new Error('阿里云 OSS 客户端未初始化');
    }
    
    try {
      const result = await this.ossClient.put(fileKey, filePath);
      
      // 构建访问 URL
      let url;
      if (this.config.aliyun.customDomain) {
        url = `https://${this.config.aliyun.customDomain}/${fileKey}`;
      } else {
        url = result.url;
      }
      
      logger.info('文件上传到阿里云 OSS 成功', { url, fileKey });
      return url;
    } catch (error) {
      logger.error('阿里云 OSS 上传失败', { error: error.stack });
      throw new Error(`阿里云 OSS 上传失败: ${error.message}`);
    }
  }
  
  /**
   * 上传到腾讯云 COS
   * @param {string} filePath - 文件路径
   * @param {string} fileKey - 对象 key
   * @returns {Promise<string>} - 文件 URL
   */
  async uploadToTencentCOS(filePath, fileKey) {
    if (!this.cosClient) {
      throw new Error('腾讯云 COS 客户端未初始化');
    }
    
    try {
      const result = await new Promise((resolve, reject) => {
        this.cosClient.putObject({
          Bucket: this.config.tencent.Bucket,
          Region: this.config.tencent.Region,
          Key: fileKey,
          Body: fs.createReadStream(filePath)
        }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      
      // 构建访问 URL
      let url;
      if (this.config.tencent.customDomain) {
        url = `https://${this.config.tencent.customDomain}/${fileKey}`;
      } else {
        url = `https://${this.config.tencent.Bucket}.cos.${this.config.tencent.Region}.myqcloud.com/${fileKey}`;
      }
      
      logger.info('文件上传到腾讯云 COS 成功', { url, fileKey });
      return url;
    } catch (error) {
      logger.error('腾讯云 COS 上传失败', { error: error.stack });
      throw new Error(`腾讯云 COS 上传失败: ${error.message}`);
    }
  }
  
  /**
   * 保存到本地
   * @param {string} filePath - 原文件路径
   * @param {string} fileName - 文件名
   * @returns {Promise<string>} - 文件 URL
   */
  async saveToLocal(filePath, fileName) {
    try {
      // 使用项目outputs目录，支持多服务共享
      const projectRoot = path.resolve(__dirname, '../..');
      const outputDir = path.join(projectRoot, 'outputs');
      await fs.promises.mkdir(outputDir, { recursive: true });
      
      // 生成目标文件路径
      const targetPath = path.join(outputDir, `${fileName}.pdf`);
      
      // 如果源文件和目标文件不同，复制文件
      if (filePath !== targetPath) {
        await fs.promises.copyFile(filePath, targetPath);
        logger.info('文件复制到输出目录', { from: filePath, to: targetPath });
      }
      
      // 使用配置中的API基础URL，只拼接业务路径
      const apiBaseUrl = config.getApiBaseUrl();
      const baseUrl = `${apiBaseUrl}/document/pdf-generator/download`;
      const url = `${baseUrl}/${fileName}.pdf`;
      
      logger.info('文件保存到本地成功', { url, path: targetPath });
      return url;
    } catch (error) {
      logger.error('本地文件保存失败', { error: error.stack });
      throw new Error(`本地文件保存失败: ${error.message}`);
    }
  }
  
  /**
   * 清理临时文件
   * @param {...string} filePaths - 文件路径
   */
  cleanupFiles(...filePaths) {
    for (const filePath of filePaths) {
      try {
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

module.exports = PDFGenerator;
