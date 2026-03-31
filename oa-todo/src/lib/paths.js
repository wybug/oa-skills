/**
 * 统一路径配置模块
 * 提供项目中所有路径和超时配置的集中管理
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const homedir = os.homedir();
const baseDir = process.env.OA_TODOS_DIR || path.join(homedir, '.oa-todo');

const PATHS = {
  baseDir,
  dbPath: process.env.OA_DB_PATH || path.join(baseDir, 'oa_todos.db'),
  stateFile: process.env.OA_STATE_FILE || path.join(baseDir, 'login_state.json'),
  detailsDir: process.env.OA_DETAILS_DIR || path.join(baseDir, 'details'),
  pausesDir: path.join(baseDir, 'pauses'),
  exploreSessionsDir: path.join(baseDir, 'explore-sessions'),
  daemonConfigFile: path.join(baseDir, 'daemon.json'),
  tempDir: path.join(baseDir, 'temp'),  // 替代 /tmp
  logsDir: process.env.OA_LOGS_DIR || path.join(baseDir, 'logs'),
  loginTimeout: parseInt(process.env.LOGIN_TIMEOUT_MINUTES || '25', 10),
  pauseTimeout: parseInt(process.env.PAUSE_TIMEOUT_MINUTES || '10', 10),
};

/**
 * 确保所有必需的目录存在
 */
function ensureDirectories() {
  [PATHS.baseDir, PATHS.detailsDir, PATHS.pausesDir,
   PATHS.exploreSessionsDir, PATHS.tempDir, PATHS.logsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

/**
 * 获取遗留配置（向后兼容）
 */
function getLegacyConfig() {
  return {
    dbPath: PATHS.dbPath,
    todosDir: PATHS.baseDir,
    detailsDir: PATHS.detailsDir,
    stateFile: PATHS.stateFile,
    loginTimeout: PATHS.loginTimeout,
    pauseTimeout: PATHS.pauseTimeout,
    cdpUrl: process.env.OA_CDP_URL || null,
  };
}

module.exports = { PATHS, ensureDirectories, getLegacyConfig };
