/**
 * Logger - 文件日志模块
 * 单例模式，全局初始化一次，各模块通过 getLogger('name') 获取子 logger
 */

const fs = require('fs');
const path = require('path');

// 日志级别
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * 生成北京时间戳字符串
 * 格式: YYYY-MM-DD HH:mm:ss.SSS
 */
function getTimestamp() {
  const now = new Date();
  // 使用 toLocaleString 获取北京时间各部分
  const parts = {};
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  formatter.formatToParts(now).forEach(p => {
    parts[p.type] = p.value;
  });
  // 毫秒需要手动获取
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${ms}`;
}

/**
 * ChildLogger - 绑定模块名的子 logger
 */
class ChildLogger {
  constructor(moduleName, logger) {
    this.moduleName = moduleName;
    this.logger = logger;
  }

  error(message, data) { this.logger._write('error', this.moduleName, message, data); }
  warn(message, data) { this.logger._write('warn', this.moduleName, message, data); }
  info(message, data) { this.logger._write('info', this.moduleName, message, data); }
  debug(message, data) { this.logger._write('debug', this.moduleName, message, data); }
}

/**
 * Logger - 单例日志管理器
 */
class Logger {
  constructor() {
    this._initialized = false;
    this._logDir = null;
    this._level = LEVELS.info; // 默认 info 级别
    this._maxFileSize = 10 * 1024 * 1024; // 10MB
    this._maxLineSize = 2 * 1024; // 2KB 单条截断
    this._retentionDays = 7;
    this._children = new Map();
  }

  /**
   * 初始化 Logger
   * @param {Object} options
   * @param {boolean} options.debug - 是否启用 debug 级别
   * @param {string} options.logDir - 日志目录
   */
  init(options = {}) {
    if (this._initialized) return;

    if (options.debug) {
      this._level = LEVELS.debug;
    }
    this._logDir = options.logDir;

    if (this._logDir) {
      try {
        if (!fs.existsSync(this._logDir)) {
          fs.mkdirSync(this._logDir, { recursive: true });
        }
        this._initialized = true;
        this._cleanOldLogs();
      } catch (e) {
        // 日志初始化失败不应阻塞主流程
        this._initialized = false;
      }
    }
  }

  /**
   * 获取子 logger
   * @param {string} moduleName - 模块名
   * @returns {ChildLogger}
   */
  getLogger(moduleName) {
    if (!this._children.has(moduleName)) {
      this._children.set(moduleName, new ChildLogger(moduleName, this));
    }
    return this._children.get(moduleName);
  }

  /**
   * 快捷静态方法（使用默认模块名 'app'）
   */
  error(message, data) { this._write('error', 'app', message, data); }
  warn(message, data) { this._write('warn', 'app', message, data); }
  info(message, data) { this._write('info', 'app', message, data); }
  debug(message, data) { this._write('debug', 'app', message, data); }

  /**
   * 写入日志
   */
  _write(level, moduleName, message, data) {
    if (!this._initialized) return;

    const levelValue = LEVELS[level];
    if (levelValue === undefined) return;
    if (levelValue > this._level) return;

    const timestamp = getTimestamp();
    let line = `${timestamp} [${level.toUpperCase()}] [${moduleName}] ${message}`;

    if (data !== undefined) {
      let dataStr;
      try {
        dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      } catch (e) {
        dataStr = String(data);
      }
      // 单条日志截断
      if (dataStr.length > this._maxLineSize) {
        dataStr = dataStr.substring(0, this._maxLineSize) + '...[truncated]';
      }
      line += ` ${dataStr}`;
    }

    // 整行截断
    if (line.length > this._maxLineSize) {
      line = line.substring(0, this._maxLineSize) + '...[truncated]';
    }

    line += '\n';

    try {
      const logFile = this._getLogFilePath();
      if (logFile) {
        fs.appendFileSync(logFile, line, 'utf-8');
      }
    } catch (e) {
      // 写入失败不应阻塞主流程
    }
  }

  /**
   * 获取当前日志文件路径（带文件大小检查）
   */
  _getLogFilePath() {
    if (!this._logDir) return null;

    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);

    const baseName = `oa-todo-${dateStr}`;
    const logPath = path.join(this._logDir, `${baseName}.log`);

    try {
      if (fs.existsSync(logPath)) {
        const stat = fs.statSync(logPath);
        if (stat.size >= this._maxFileSize) {
          // 文件超 10MB，追加序号
          let seq = 1;
          while (fs.existsSync(path.join(this._logDir, `${baseName}.${seq}.log`))) {
            seq++;
          }
          return path.join(this._logDir, `${baseName}.${seq}.log`);
        }
      }
    } catch (e) {
      // 忽略
    }

    return logPath;
  }

  /**
   * 清理超过 7 天的旧日志
   */
  _cleanOldLogs() {
    if (!this._logDir || !fs.existsSync(this._logDir)) return;

    const now = Date.now();
    const maxAge = this._retentionDays * 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(this._logDir);
      for (const file of files) {
        if (!file.startsWith('oa-todo-') || !file.endsWith('.log')) continue;
        const filePath = path.join(this._logDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > maxAge) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          // 忽略
        }
      }
    } catch (e) {
      // 忽略
    }
  }
}

// 导出单例
const logger = new Logger();

module.exports = logger;
