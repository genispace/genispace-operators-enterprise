const express = require('express');
const FilesToImages = require('./FilesToImages');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');

const router = express.Router();
const converter = new FilesToImages();

router.post('/convert', asyncHandler(async (req, res) => {
  const { attachments, maxPagesPerFile, maxImages } = req.body || {};
  if (attachments != null && !Array.isArray(attachments)) {
    return sendErrorResponse(res, 'attachments 必须是数组', 'INVALID_ATTACHMENTS', null, 400);
  }

  try {
    const data = await converter.convert(attachments || [], req, {
      maxPagesPerFile,
      maxImages,
    });
    sendSuccessResponse(res, data, '附件已转为图片');
  } catch (error) {
    sendErrorResponse(res, `附件转图失败: ${error.message}`, 'FILES_TO_IMAGES_FAILED', {
      originalError: error.message,
    }, 500);
  }
}));

module.exports = router;
