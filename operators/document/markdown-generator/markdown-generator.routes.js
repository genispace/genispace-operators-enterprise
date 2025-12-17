/**
 * GeniSpace Markdown Generator Routes
 * 
 * Markdown文件生成算子路由实现
 * 支持Markdown文本生成.md文档
 */

const express = require('express');
const path = require('path');
const os = require('os');
const MarkdownGenerator = require('./MarkdownGenerator');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');

const router = express.Router();

// 初始化 Markdown 生成器（使用默认临时目录，无需配置）
const markdownGenerator = new MarkdownGenerator();

/**
 * 验证请求参数
 */
function validateGenerateMarkdown(req, res, next) {
  const { markdownContent, templateData, lineEnding } = req.body;
  
  if (!markdownContent || typeof markdownContent !== 'string') {
    return sendErrorResponse(res, '缺少必需的markdownContent参数', 'MISSING_MARKDOWN_CONTENT', null, 400);
  }
  
  if (markdownContent.length > 10 * 1024 * 1024) { // 10MB限制
    return sendErrorResponse(res, 'Markdown内容过大，最大支持10MB', 'MARKDOWN_TOO_LARGE', null, 400);
  }
  
  // templateData是可选的，但如果提供了必须是对象
  if (templateData !== undefined && templateData !== null && 
      (typeof templateData !== 'object' || Array.isArray(templateData))) {
    return sendErrorResponse(res, 'templateData必须是对象格式', 'INVALID_TEMPLATE_DATA', null, 400);
  }
  
  // 验证换行符类型
  if (lineEnding !== undefined && lineEnding !== null) {
    const validLineEndings = ['\n', '\r\n', '\r'];
    if (!validLineEndings.includes(lineEnding)) {
      return sendErrorResponse(res, 'lineEnding必须是 \\n、\\r\\n 或 \\r 中的一个', 'INVALID_LINE_ENDING', null, 400);
    }
  }
  
  next();
}

/**
 * 生成Markdown文件
 */
router.post('/generate', validateGenerateMarkdown, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { 
    markdownContent, 
    templateData = {}, 
    fileName, 
    lineEnding = '\n' 
  } = req.body;
  
  try {
    // 检查认证
    markdownGenerator.checkAuth(req);
    
    // 如果提供了templateData，使用Mustache进行模板替换
    let processedContent = markdownContent;
    if (templateData && Object.keys(templateData).length > 0) {
      const Mustache = require('mustache');
      processedContent = Mustache.render(markdownContent, templateData);
    }
    
    // 生成Markdown文件
    const result = await markdownGenerator.generateMarkdown({
      markdownContent: processedContent,
      templateData: null, // 已经在上面处理过了
      fileName: fileName || `markdown_${Date.now()}`,
      lineEnding,
      req // 传递请求对象用于认证和SDK上传
    });
    
    const processingTime = Date.now() - startTime;
    
    // 添加处理时间到响应数据
    result.processingTimeMs = processingTime;
    
    sendSuccessResponse(res, result, 'Markdown文件生成成功');
    
  } catch (error) {
    console.error('Markdown生成失败:', error);
    sendErrorResponse(res, `Markdown生成失败: ${error.message}`, 'MARKDOWN_GENERATION_FAILED', { 
      originalError: error.message 
    }, 500);
  }
}));

/**
 * Markdown文件下载路由
 * 注意：这个路由不在算子OpenAPI定义中，但属于Markdown生成器的配套功能
 */
router.get('/download/:fileName', (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    // 验证文件名格式（安全检查）
    if (!/^[a-zA-Z0-9_-]+\.md$/.test(fileName)) {
      return sendErrorResponse(res, '无效的文件名格式', 'INVALID_FILENAME', null, 400);
    }
    
    // 构建文件路径 - 使用项目outputs目录
    const projectRoot = path.resolve(__dirname, '../../..');
    const outputDir = path.join(projectRoot, 'outputs');
    const filePath = path.join(outputDir, fileName);
    
    // 检查文件是否存在
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return sendErrorResponse(res, '文件不存在', 'FILE_NOT_FOUND', null, 404);
    }
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // 创建文件流并发送
    const fileStream = require('fs').createReadStream(filePath);
    
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

/**
 * 验证Markdown语法路由（可选功能）
 */
router.post('/validate', asyncHandler(async (req, res) => {
  const { markdownContent } = req.body;
  
  if (!markdownContent || typeof markdownContent !== 'string') {
    return sendErrorResponse(res, '缺少必需的markdownContent参数', 'MISSING_MARKDOWN_CONTENT', null, 400);
  }
  
  try {
    // 简单的Markdown语法验证
    const validationResult = validateMarkdownSyntax(markdownContent);
    
    sendSuccessResponse(res, validationResult, 'Markdown语法验证完成');
  } catch (error) {
    sendErrorResponse(res, `Markdown语法验证失败: ${error.message}`, 'VALIDATION_FAILED', null, 500);
  }
}));

/**
 * 简单的Markdown语法验证
 * @param {string} content - Markdown内容
 * @returns {Object} - 验证结果
 */
function validateMarkdownSyntax(content) {
  const lines = content.split('\n');
  const issues = [];
  let lineCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    lineCount++;
    const line = lines[i];
    
    // 检查标题语法
    if (line.match(/^#{1,6}\s/)) {
      // 有效的标题
    } else if (line.match(/^#+/)) {
      issues.push({
        line: lineCount,
        type: 'warning',
        message: '标题后应添加空格',
        code: 'HEADING_SPACE'
      });
    }
    
    // 检查列表语法
    if (line.match(/^\s*[-*+]\s/)) {
      // 有效的无序列表
    } else if (line.match(/^\s*[-*+]/)) {
      issues.push({
        line: lineCount,
        type: 'warning',
        message: '列表项后应添加空格',
        code: 'LIST_SPACE'
      });
    }
    
    // 检查链接语法
    const links = line.match(/\[([^\]]*)\]\(([^)]*)\)/g);
    if (links) {
      for (const link of links) {
        const match = link.match(/\[([^\]]*)\]\(([^)]*)\)/);
        if (match && !match[2].trim()) {
          issues.push({
            line: lineCount,
            type: 'warning',
            message: '链接地址不应为空',
            code: 'EMPTY_LINK'
          });
        }
      }
    }
  }
  
  return {
    isValid: issues.filter(issue => issue.type === 'error').length === 0,
    lineCount,
    issueCount: issues.length,
    issues,
    summary: {
      errors: issues.filter(issue => issue.type === 'error').length,
      warnings: issues.filter(issue => issue.type === 'warning').length
    }
  };
}

module.exports = router;
