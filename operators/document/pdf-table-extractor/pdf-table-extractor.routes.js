/**
 * GeniSpace PDF Table Extractor Routes
 *
 * PDF 表格提取算子路由实现
 */

const express = require('express');
const PdfTableExtractor = require('./PdfTableExtractor');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');

const router = express.Router();

const pdfTableExtractor = new PdfTableExtractor();

/**
 * 验证提取表格请求参数
 */
function validateExtractTables(req, res, next) {
  const { fileId } = req.body;

  if (!fileId || typeof fileId !== 'string') {
    return sendErrorResponse(res, '缺少必需的 fileId 参数', 'MISSING_FILE_ID', null, 400);
  }

  if (fileId.length > 128) {
    return sendErrorResponse(res, 'fileId 长度超过限制（最大 128 字符）', 'FILE_ID_TOO_LONG', null, 400);
  }

  next();
}

/**
 * 提取 PDF 表格
 */
router.post('/extract', validateExtractTables, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { fileId, columnHeaders, outputColumns } = req.body;

  try {
    pdfTableExtractor.checkAuth(req);

    const records = await pdfTableExtractor.extractTables(fileId, req, { columnHeaders, outputColumns });

    const processingTime = Date.now() - startTime;

    const responseData = {
      records,
      fileId,
      recordCount: records.length,
      extractedAt: new Date().toISOString(),
      processingTimeMs: processingTime
    };

    sendSuccessResponse(res, responseData, '表格提取成功');
  } catch (error) {
    console.error('PDF 表格提取失败:', error);
    sendErrorResponse(res, `PDF 表格提取失败: ${error.message}`, 'PDF_TABLE_EXTRACTION_FAILED', {
      originalError: error.message
    }, 500);
  }
}));

module.exports = router;
