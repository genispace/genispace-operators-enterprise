/**
 * 数据源拉取 + 对账匹配 路由
 */

const express = require('express');
const DatasourceReconciliation = require('./DatasourceReconciliation');
const { sendSuccessResponse, sendErrorResponse, asyncHandler } = require('../../../src/utils/response');

const router = express.Router();
const service = new DatasourceReconciliation();

function validateReconcileBody(req, res, next) {
  const { datasourceId, baselineName, targetName, schema, taskName } = req.body || {};
  if (!datasourceId || typeof datasourceId !== 'string') {
    return sendErrorResponse(
      res,
      '缺少必需的 datasourceId（数据源 UUID）',
      'MISSING_DATASOURCE_ID',
      null,
      400
    );
  }
  if (
    baselineName == null ||
    typeof baselineName !== 'string' ||
    baselineName.trim() === ''
  ) {
    return sendErrorResponse(
      res,
      '缺少必需的 baselineName（非空字符串，对应数据源 POST 的 name，isBaseline 固定为 1）',
      'MISSING_BASELINE_NAME',
      null,
      400
    );
  }
  if (
    targetName == null ||
    typeof targetName !== 'string' ||
    targetName.trim() === ''
  ) {
    return sendErrorResponse(
      res,
      '缺少必需的 targetName（非空字符串，对应数据源 POST 的 name，isBaseline 固定为 0）',
      'MISSING_TARGET_NAME',
      null,
      400
    );
  }
  if (schema == null || typeof schema !== 'string' || schema.trim() === '') {
    return sendErrorResponse(res, '缺少必需的 schema（非空字符串）', 'MISSING_SCHEMA', null, 400);
  }
  if (taskName == null || typeof taskName !== 'string' || taskName.trim() === '') {
    return sendErrorResponse(res, '缺少必需的 taskName（非空字符串）', 'MISSING_TASK_NAME', null, 400);
  }
  next();
}

router.post(
  '/reconcile',
  validateReconcileBody,
  asyncHandler(async (req, res) => {
    const start = Date.now();
    try {
      const data = await service.reconcile(req, req.body || {});
      sendSuccessResponse(
        res,
        {
          ...data,
          processingTimeMs: Date.now() - start,
        },
        '数据源对账完成'
      );
    } catch (error) {
      const msg = error.message || String(error);
      let code = 'DATASOURCE_RECONCILE_FAILED';
      let status = 500;
      if (
        msg.includes('缺少') ||
        msg.includes('必填') ||
        msg.includes('须为') ||
        msg.includes('UUID')
      ) {
        code = 'INVALID_REQUEST';
        status = 400;
      } else if (msg.includes('无法取得用于数据源 API')) {
        code = 'MISSING_DATASOURCE_API_KEY_FOR_DATASOURCE';
        status = 401;
      } else if (msg.includes('Bearer') || msg.includes('Token') || msg.includes('401')) {
        code = 'DATASOURCE_AUTH_ERROR';
        status = 401;
      }
      sendErrorResponse(res, msg, code, { originalError: msg }, status);
    }
  })
);

module.exports = router;
