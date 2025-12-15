/**
 * GeniSpace Word Generator Routes
 * 
 * Word生成算子路由实现
 * 支持HTML、Markdown模板生成Word文档
 */

const express = require('express');
const path = require('path');
const os = require('os');
const WordGenerator = require('./WordGenerator');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');

const router = express.Router();

// 初始化 Word 生成器（使用默认临时目录，无需配置）
const wordGenerator = new WordGenerator();

/**
 * 构建完整的 HTML 文档
 */
function buildFullHTMLDocument(htmlContent, cssStyles = '') {
  // 检查是否已经是完整的 HTML 文档
  const isCompleteDoc = htmlContent.toLowerCase().includes('<!doctype') || 
                       htmlContent.toLowerCase().includes('<html');
  
  if (isCompleteDoc) {
    // 如果有额外的 CSS，尝试注入到 head 中
    if (cssStyles) {
      const styleTag = `<style>${cssStyles}</style>`;
      if (htmlContent.includes('</head>')) {
        return htmlContent.replace('</head>', `${styleTag}</head>`);
      } else if (htmlContent.includes('<head>')) {
        return htmlContent.replace('<head>', `<head>${styleTag}`);
      }
    }
    return htmlContent;
  }
  
  // 构建完整的 HTML 文档
  const defaultStyles = `
    body { 
      font-family: 'Microsoft YaHei', 'SimSun', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      font-size: 12pt;
    }
    h1, h2, h3, h4, h5, h6 { 
      color: #2c3e50;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    h1 { font-size: 24pt; border-bottom: 2px solid #3498db; padding-bottom: 0.3em; }
    h2 { font-size: 18pt; border-bottom: 1px solid #bdc3c7; padding-bottom: 0.2em; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
    pre { background-color: #f4f4f4; padding: 1em; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #3498db; margin: 1em 0; padding-left: 1em; color: #666; }
    img { max-width: 100%; height: auto; }
  `;
  
  const combinedStyles = cssStyles ? `${defaultStyles}\n${cssStyles}` : defaultStyles;
  
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Generated Word</title>
      <style>${combinedStyles}</style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;
}

/**
 * 验证请求参数
 */
function validateGenerateFromHTML(req, res, next) {
  const { htmlContent, templateData } = req.body;
  
  if (!htmlContent || typeof htmlContent !== 'string') {
    return sendErrorResponse(res, '缺少必需的htmlContent参数', 'MISSING_HTML_CONTENT', null, 400);
  }
  
  if (htmlContent.length > 10 * 1024 * 1024) { // 10MB限制
    return sendErrorResponse(res, 'HTML内容过大，最大支持10MB', 'HTML_TOO_LARGE', null, 400);
  }
  
  // templateData是可选的，但如果提供了必须是对象
  if (templateData !== undefined && (typeof templateData !== 'object' || Array.isArray(templateData) || templateData === null)) {
    return sendErrorResponse(res, 'templateData必须是对象格式', 'INVALID_TEMPLATE_DATA', null, 400);
  }
  
  next();
}

function validateGenerateFromMarkdown(req, res, next) {
  const { markdownTemplate, templateData } = req.body;
  
  if (!markdownTemplate || typeof markdownTemplate !== 'string') {
    return sendErrorResponse(res, '缺少必需的markdownTemplate参数', 'MISSING_MARKDOWN_TEMPLATE', null, 400);
  }
  
  // templateData是可选的，但如果提供了必须是对象
  if (templateData !== undefined && (typeof templateData !== 'object' || Array.isArray(templateData) || templateData === null)) {
    return sendErrorResponse(res, 'templateData必须是对象格式', 'INVALID_TEMPLATE_DATA', null, 400);
  }
  
  if (markdownTemplate.length > 5 * 1024 * 1024) { // 5MB限制
    return sendErrorResponse(res, 'Markdown模板过大，最大支持5MB', 'MARKDOWN_TOO_LARGE', null, 400);
  }
  
  next();
}

/**
 * 从HTML生成Word
 */
router.post('/generate-from-html', validateGenerateFromHTML, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { htmlContent, templateData = {}, cssStyles = '', fileName, wordOptions = {} } = req.body;
  
  try {
    // 检查认证
    wordGenerator.checkAuth(req);
    
    // 如果提供了templateData，使用Mustache进行模板替换
    let processedHtmlContent = htmlContent;
    if (templateData && Object.keys(templateData).length > 0) {
      const Mustache = require('mustache');
      processedHtmlContent = Mustache.render(htmlContent, templateData);
    }
    
    // 构建完整的HTML文档
    const fullHtmlContent = buildFullHTMLDocument(processedHtmlContent, cssStyles);
    
    // 合并Word选项，确保有默认值
    const finalWordOptions = {
      orientation: 'portrait',
      margins: {
        top: 1440,
        right: 1440,
        bottom: 1440,
        left: 1440
      },
      ...wordOptions
    };
    
    // 生成Word
    const wordPath = await wordGenerator.generateWordFromHTML(
      fullHtmlContent,
      fileName || `word_${Date.now()}`,
      finalWordOptions
    );
    
    const processingTime = Date.now() - startTime;
    
    // 获取文件信息
    const fs = require('fs');
    const fileStats = fs.statSync(wordPath);
    
    // 上传到平台存储
    const wordURL = await wordGenerator.uploadToPlatformStorage(
      wordPath, 
      fileName || `word_${Date.now()}`, 
      req
    );
    
    // 清理临时文件
    wordGenerator.cleanupFiles(wordPath);
    
    const responseData = {
      wordURL,
      fileName: `${fileName || `word_${Date.now()}`}.docx`,
      fileSize: fileStats.size,
      storageProvider: 'platform',
      generatedAt: new Date().toISOString(),
      processingTimeMs: processingTime
    };
    
    sendSuccessResponse(res, responseData, 'Word生成成功');
    
  } catch (error) {
    console.error('HTML转Word失败:', error);
    sendErrorResponse(res, `Word生成失败: ${error.message}`, 'WORD_GENERATION_FAILED', { 
      originalError: error.message 
    }, 500);
  }
}));

/**
 * 从Markdown模板生成Word
 */
router.post('/generate-from-markdown', validateGenerateFromMarkdown, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { markdownTemplate, templateData = {}, fileName, cssStyles = '', wordOptions = {} } = req.body;
  
  try {
    // 使用WordGenerator的generateWord方法
    const result = await wordGenerator.generateWord({
      markdownTemplate,
      templateData,
      fileName: fileName || `markdown_word_${Date.now()}`,
      wordOptions: {
        orientation: 'portrait',
        margins: {
          top: 1440,
          right: 1440,
          bottom: 1440,
          left: 1440
        },
        ...wordOptions
      },
      cssStyles,
      req // 传递请求对象用于认证和SDK上传
    });
    
    const processingTime = Date.now() - startTime;
    
    // 添加处理时间到响应数据
    result.processingTimeMs = processingTime;
    
    sendSuccessResponse(res, result, 'Word生成成功');
    
  } catch (error) {
    console.error('Markdown转Word失败:', error);
    sendErrorResponse(res, `Word生成失败: ${error.message}`, 'WORD_GENERATION_FAILED', { 
      originalError: error.message 
    }, 500);
  }
}));

/**
 * Word文件下载路由
 * 注意：这个路由不在算子OpenAPI定义中，但属于Word生成器的配套功能
 */
router.get('/download/:fileName', (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    // 验证文件名格式（安全检查）
    if (!/^[a-zA-Z0-9_-]+\.docx$/.test(fileName)) {
      return sendErrorResponse(res, '无效的文件名格式', 'INVALID_FILENAME', null, 400);
    }
    
    // 构建文件路径 - 使用项目outputs/word-generator目录
    const projectRoot = path.resolve(__dirname, '../../..');
    const outputDir = path.join(projectRoot, 'outputs', 'word-generator');
    const filePath = path.join(outputDir, fileName);
    
    // 检查文件是否存在
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return sendErrorResponse(res, '文件不存在', 'FILE_NOT_FOUND', null, 404);
    }
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // 创建文件流并发送
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error('文件读取错误:', error);
      if (!res.headersSent) {
        sendErrorResponse(res, '文件读取失败', 'FILE_READ_ERROR', null, 500);
      }
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('下载处理错误:', error);
    sendErrorResponse(res, '服务器内部错误', 'INTERNAL_ERROR', null, 500);
  }
});

module.exports = router;

