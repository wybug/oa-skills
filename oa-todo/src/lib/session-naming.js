/**
 * 统一Session命名模块
 * 提供标准化的会话ID生成和解析功能
 */

const crypto = require('crypto');

const SessionType = {
  DEFAULT: 'default',
  PAUSE: 'pause',
  EXPLORE: 'explore',
  LOGIN: 'login',
  POOL: 'pool',
};

/**
 * 生成短随机ID（6位十六进制）
 */
function generateShortId() {
  return crypto.randomBytes(3).toString('hex');
}

/**
 * 生成会话ID
 * @param {string} type - 会话类型
 * @param {Object} options - 选项
 * @param {string} options.context - 上下文标识（如fdId、purpose等）
 * @param {string} options.suffix - 后缀
 * @param {boolean} options.includeTimestamp - 是否包含时间戳，默认true
 * @returns {string} 会话ID
 */
function generateSessionId(type, options = {}) {
  const { context, suffix, includeTimestamp = true } = options;
  const parts = ['oa-todo', type];

  if (context) parts.push(context);
  if (includeTimestamp) parts.push(Date.now().toString());
  if ([SessionType.EXPLORE, SessionType.POOL].includes(type)) {
    parts.push(generateShortId());
  }
  if (suffix) parts.push(suffix);

  return parts.join('-');
}

/**
 * 解析会话ID
 * @param {string} sessionId - 会话ID
 * @returns {Object} 解析结果 { valid, type, context, timestamp }
 */
function parseSessionId(sessionId) {
  const parts = sessionId.split('-');
  if (parts[0] !== 'oa-todo' || parts.length < 2) {
    return { valid: false };
  }

  const result = { valid: true, type: parts[1], context: null, timestamp: null };
  for (let i = 2; i < parts.length; i++) {
    const part = parts[i];
    if (/^\d{13}$/.test(part)) {
      result.timestamp = parseInt(part, 10);
    } else if (result.context === null) {
      result.context = part;
    }
  }
  return result;
}

module.exports = { SessionType, generateSessionId, parseSessionId };
