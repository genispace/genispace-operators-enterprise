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
  
  try {
    // 检查认证
    textExtractor.checkAuth(req);
    
    // 提取文本
    const text = await textExtractor.extractText(fileId, req);
    
    const processingTime = Date.now() - startTime;
    
    const responseData = {
      text,
      fileId,
      textLength: text.length,
      extractedAt: new Date().toISOString(),
      processingTimeMs: processingTime
    };
    
    sendSuccessResponse(res, responseData, '文本提取成功');
    
  } catch (error) {
    console.error('文本提取失败:', error);
    sendErrorResponse(res, `文本提取失败: ${error.message}`, 'TEXT_EXTRACTION_FAILED', { 
      originalError: error.message 
    }, 500);
  }
}));

module.exports = router;

