/**
 * 智能体二次匹配：解析 execute 响应并与算法侧结果合并（与 test/script/call-agent-reconcile-unmatched 一致的核心逻辑）
 */

function extractFirstJsonObject(text) {
  const t = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const candidate = fence ? fence[1].trim() : t;
  const start = candidate.indexOf('{');
  if (start < 0) throw new Error('响应文本中未找到 JSON 对象起始');
  let depth = 0;
  let end = -1;
  for (let i = start; i < candidate.length; i += 1) {
    const c = candidate[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('JSON 大括号不匹配');
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeRematchPayload(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('无效 JSON 对象');
  return {
    matches: Array.isArray(obj.matches) ? obj.matches : [],
    unmatchedBaselineAccount: Array.isArray(obj.unmatchedBaselineAccount)
      ? obj.unmatchedBaselineAccount
      : [],
    unmatchedTargetAccount: Array.isArray(obj.unmatchedTargetAccount)
      ? obj.unmatchedTargetAccount
      : [],
  };
}

/**
 * @param {unknown} raw - 智能体 HTTP 响应 body 或嵌套字段
 */
function parseRematchPayloadFromAgentResponse(raw) {
  if (raw == null) throw new Error('智能体响应为空');
  if (typeof raw === 'string') {
    return normalizeRematchPayload(extractFirstJsonObject(raw));
  }
  if (typeof raw === 'object' && Array.isArray(raw.matches)) {
    return normalizeRematchPayload(raw);
  }

  const tryNested = ['data', 'result', 'output', 'response', 'message', 'content'];
  for (const k of tryNested) {
    if (raw[k] != null) {
      try {
        return parseRematchPayloadFromAgentResponse(raw[k]);
      } catch (_) {
        /* continue */
      }
    }
  }

  if (Array.isArray(raw.choices) && raw.choices[0]?.message?.content != null) {
    return parseRematchPayloadFromAgentResponse(raw.choices[0].message.content);
  }

  throw new Error(
    '无法从智能体响应中解析 matches/unmatchedBaselineAccount/unmatchedTargetAccount'
  );
}

function recordIdStr(r) {
  if (!r || r.id == null) return null;
  return String(r.id);
}

function collectIdsFromMatch(m) {
  const bIds = [];
  const tIds = [];
  if (m.baselineRecord) {
    const id = recordIdStr(m.baselineRecord);
    if (id) bIds.push(id);
  }
  if (Array.isArray(m.baselineRecords)) {
    for (const r of m.baselineRecords) {
      const id = recordIdStr(r);
      if (id) bIds.push(id);
    }
  }
  if (m.targetRecord) {
    const id = recordIdStr(m.targetRecord);
    if (id) tIds.push(id);
  }
  if (Array.isArray(m.targetRecords)) {
    for (const r of m.targetRecords) {
      const id = recordIdStr(r);
      if (id) tIds.push(id);
    }
  }
  return { bIds, tIds };
}

/**
 * 将智能体返回的匹配并入状态；未匹配列表由原始未匹配池减去已被占用 id（不信任模型返回的 unmatched）。
 * @param {{ matches: object[], unmatchedBaselineAccount: object[], unmatchedTargetAccount: object[] }} state
 * @param {{ matches?: object[] }} agentPayload
 */
function mergeAgentMatchesIntoReconciliationState(state, agentPayload) {
  const {
    matches: existingMatches,
    unmatchedBaselineAccount: ub0,
    unmatchedTargetAccount: ut0,
  } = state;
  const usedB = new Set();
  const usedT = new Set();

  function consumeMatch(m) {
    const { bIds, tIds } = collectIdsFromMatch(m);
    bIds.forEach((id) => usedB.add(id));
    tIds.forEach((id) => usedT.add(id));
  }

  for (const m of existingMatches) consumeMatch(m);

  const appended = [];
  for (const m of agentPayload.matches || []) {
    const { bIds, tIds } = collectIdsFromMatch(m);
    if (bIds.length === 0 && tIds.length === 0) continue;
    const conflict =
      bIds.some((id) => usedB.has(id)) || tIds.some((id) => usedT.has(id));
    if (conflict) continue;
    bIds.forEach((id) => usedB.add(id));
    tIds.forEach((id) => usedT.add(id));
    appended.push(m);
  }

  const filterUnmatched = (rows, usedSet) =>
    (rows || []).filter((r) => {
      if (!r || r.id == null) return true;
      return !usedSet.has(String(r.id));
    });

  return {
    matches: [...existingMatches, ...appended],
    unmatchedBaselineAccount: filterUnmatched(ub0, usedB),
    unmatchedTargetAccount: filterUnmatched(ut0, usedT),
  };
}

module.exports = {
  parseRematchPayloadFromAgentResponse,
  mergeAgentMatchesIntoReconciliationState,
};
