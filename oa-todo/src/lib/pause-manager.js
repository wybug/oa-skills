/**
 * Pause Manager - 智能断点会话管理
 * 管理暂停的浏览器会话生命周期
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PATHS } = require('./paths');
const logger = require('./logger');
const log = logger.getLogger('pause');

class PauseManager {
  constructor(config) {
    this.pausesDir = PATHS.pausesDir;
    this.config = config;
    this.defaultTimeout = (config.pauseTimeout || 10) * 60 * 1000; // 转换为毫秒

    // 确保目录存在
    if (!fs.existsSync(this.pausesDir)) {
      fs.mkdirSync(this.pausesDir, { recursive: true });
    }
  }

  /**
   * 获取断点文件路径
   */
  _getPausePath(fdId) {
    return path.join(this.pausesDir, `${fdId}.json`);
  }

  /**
   * 清理过期断点
   */
  async cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    let files;
    try {
      files = fs.readdirSync(this.pausesDir);
    } catch (e) {
      log.debug('cleanup: pausesDir not accessible');
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.pausesDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // 检查是否超时
        if (now > data.timeoutAt) {
          log.info('cleanup: removing expired pause', { fdId: data.fdId, session: data.session });

          // 关闭浏览器会话
          try {
            execFileSync('agent-browser', ['--session', data.session, 'close'], {
              timeout: 5000,
              stdio: 'ignore'
            });
          } catch (e) {
            log.warn('cleanup: failed to close browser session', { fdId: data.fdId, session: data.session, error: e.message });
          }

          // 删除状态文件
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch (e) {
        // 文件损坏，删除
        log.warn('cleanup: removing corrupted pause file', { file, error: e.message });
        try {
          fs.unlinkSync(filePath);
          cleanedCount++;
        } catch (e2) {
          // 忽略
        }
      }
    }

    if (cleanedCount > 0) {
      log.info('cleanup: removed %d expired/corrupted pause(s)', cleanedCount);
    }
  }

  /**
   * 创建断点
   */
  async create(fdId, todo, session, timeoutMinutes = 10) {
    // 先清理过期断点
    await this.cleanup();

    const now = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    const pauseData = {
      fdId,
      session,
      url: todo.href || '',
      title: todo.title || '',
      type: todo.todo_type || 'unknown',
      status: todo.status || 'pending',
      submitter: todo.submitter || '',
      sourceDept: todo.source_dept || '',
      createdAt: now,
      timeoutAt: now + timeoutMs,
      lastActivity: now,
      timeoutMinutes
    };

    const pausePath = this._getPausePath(fdId);
    fs.writeFileSync(pausePath, JSON.stringify(pauseData, null, 2));

    log.info('create: pause created', { fdId, session, type: pauseData.type, timeoutMinutes, title: pauseData.title });

    return pauseData;
  }

  /**
   * 获取断点信息
   */
  async get(fdId) {
    const pausePath = this._getPausePath(fdId);

    if (!fs.existsSync(pausePath)) {
      log.debug('get: pause not found', { fdId });
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(pausePath, 'utf8'));

      // 检查是否过期
      if (Date.now() > data.timeoutAt) {
        // 过期，清理并返回null
        log.info('get: pause expired, closing', { fdId, session: data.session });
        await this.close(fdId);
        return null;
      }

      log.debug('get: pause retrieved', { fdId, session: data.session });
      return data;
    } catch (e) {
      // 文件损坏，删除并返回null
      log.warn('get: corrupted pause file, removing', { fdId, error: e.message });
      try {
        fs.unlinkSync(pausePath);
      } catch (e2) {
        // 忽略
      }
      return null;
    }
  }

  /**
   * 更新断点活动时间（续期）
   */
  async update(fdId) {
    const pausePath = this._getPausePath(fdId);

    if (!fs.existsSync(pausePath)) {
      log.debug('update: pause not found', { fdId });
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(pausePath, 'utf8'));
      const now = Date.now();

      // 更新活动时间和超时时间
      data.lastActivity = now;
      data.timeoutAt = now + (data.timeoutMinutes * 60 * 1000);

      fs.writeFileSync(pausePath, JSON.stringify(data, null, 2));

      log.info('update: pause renewed', { fdId, session: data.session, timeoutMinutes: data.timeoutMinutes });

      return data;
    } catch (e) {
      log.warn('update: failed to update pause', { fdId, error: e.message });
      return null;
    }
  }

  /**
   * 关闭断点并释放session
   */
  async close(fdId) {
    const pausePath = this._getPausePath(fdId);

    if (!fs.existsSync(pausePath)) {
      log.debug('close: pause not found', { fdId });
      return false;
    }

    try {
      const data = JSON.parse(fs.readFileSync(pausePath, 'utf8'));

      log.info('close: closing pause', { fdId, session: data.session });

      // 关闭浏览器会话
      try {
        execFileSync('agent-browser', ['--session', data.session, 'close'], {
          timeout: 5000,
          stdio: 'ignore'
        });
      } catch (e) {
        log.warn('close: failed to close browser session', { fdId, session: data.session, error: e.message });
      }

      // 删除状态文件
      fs.unlinkSync(pausePath);

      log.info('close: pause removed', { fdId, session: data.session });

      return true;
    } catch (e) {
      log.error('close: failed to close pause', { fdId, error: e.message });
      return false;
    }
  }

  /**
   * 列出所有活跃断点
   */
  async list() {
    await this.cleanup();

    const files = fs.readdirSync(this.pausesDir);
    const pauses = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.pausesDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        pauses.push(data);
      } catch (e) {
        // 跳过损坏的文件
      }
    }

    log.debug('list: found %d active pause(s)', pauses.length);

    return pauses;
  }
}

module.exports = PauseManager;
