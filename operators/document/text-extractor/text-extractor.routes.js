/**
 * GeniSpace Text Extractor Routes
 * 
 * 文本提取算子路由实现
 * 支持从平台存储提取各种格式文件的文本内容
 */

const express = require('express');
const TextExtractor = require('./TextExtractor');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');

const router = express.Router();

// 初始化文本提取器
const textExtractor = new TextExtractor();

/**
 * 验证提取文本请求参数
 */
function validateExtractText(req, res, next) {
  const { fileId } = req.body;
  
  if (!fileId || typeof fileId !== 'string') {
    return sendErrorResponse(res, '缺少必需的 fileId 参数', 'MISSING_FILE_ID', null, 400);
  }
  
  // 检查 fileId 长度
  if (fileId.length > 128) {
    return sendErrorResponse(res, 'fileId 长度超过限制（最大 128 字符）', 'FILE_ID_TOO_LONG', null, 400);
  }
  
  next();
}

/**
 * 提取文本内容
 */
router.post('/extract', validateExtractText, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { fileId } = req.body;
  
  // 响应大小限制：100KB
  const MAX_RESPONSE_TEXT_SIZE = 100 * 1024; // 100KB
  
  try {
    // 检查认证
    textExtractor.checkAuth(req);
    
    // 提取文本
    const fullText = await textExtractor.extractText(fileId, req);
    
    const processingTime = Date.now() - startTime;
    
    // 如果文本超过限制，只返回前100KB
    const isTruncated = fullText.length > MAX_RESPONSE_TEXT_SIZE;
    const text = isTruncated ? fullText.substring(0, MAX_RESPONSE_TEXT_SIZE) : fullText;
    
    const responseData = {
      text,
      fileId,
      textLength: fullText.length, // 原始文本长度
      returnedLength: text.length,   // 实际返回的文本长度
      isTruncated,                   // 是否被截断
      extractedAt: new Date().toISOString(),
      processingTimeMs: processingTime
    };
    
    // 如果被截断，添加提示信息
    if (isTruncated) {
      responseData.message = `文本内容过大（${(fullText.length / 1024).toFixed(2)}KB），已截断为前100KB。完整文本长度：${fullText.length} 字符`;
    }
    
    sendSuccessResponse(res, responseData, isTruncated ? '文本提取成功（内容已截断）' : '文本提取成功');
    
  } catch (error) {
    console.error('文本提取失败:', error);
    sendErrorResponse(res, `文本提取失败: ${error.message}`, 'TEXT_EXTRACTION_FAILED', { 
      originalError: error.message 
    }, 500);
  }
}));

module.exports = router;

