/**
 * Explore Manager - 探索会话管理
 * 管理通用页面探索的浏览器会话生命周期
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PATHS } = require('./paths');
const logger = require('./logger');
const log = logger.getLogger('explore-mgr');

class ExploreManager {
  constructor(config) {
    this.exploreSessionsDir = PATHS.exploreSessionsDir;
    this.config = config;
    this.defaultTimeout = (config.pauseTimeout || 10) * 60 * 1000; // 转换为毫秒

    // 确保目录存在
    if (!fs.existsSync(this.exploreSessionsDir)) {
      fs.mkdirSync(this.exploreSessionsDir, { recursive: true });
    }
  }

  /**
   * 获取会话目录路径
   */
  _getSessionPath(sessionId) {
    return path.join(this.exploreSessionsDir, sessionId);
  }

  /**
   * 获取会话元数据文件路径
   */
  _getMetaPath(sessionId) {
    return path.join(this._getSessionPath(sessionId), 'meta.json');
  }

  /**
   * 规范化 URL（支持相对路径）
   */
  normalizeUrl(url) {
    if (!url) return '';

    // 如果是完整 URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // 处理相对路径
    // 从环境变量或配置获取 OA 基础 URL
    const baseUrl = process.env.OA_BASE_URL || 'https://oa.xgd.com';

    // 移除开头的斜杠（如果有）
    const cleanPath = url.startsWith('/') ? url.slice(1) : url;

    return `${baseUrl}/${cleanPath}`;
  }

  /**
   * 验证 URL 域名（支持 *.xgd.com）
   */
  validateUrl(url) {
    if (!url) {
      return { valid: false, error: 'URL 不能为空' };
    }

    const normalizedUrl = this.normalizeUrl(url);

    try {
      const urlObj = new URL(normalizedUrl);

      // 检查域名是否为 *.xgd.com 或 oa.xgd.com
      const hostname = urlObj.hostname;
      const isValidDomain = hostname === 'oa.xgd.com' ||
                           hostname === 'xgd.com' ||
                           hostname.endsWith('.xgd.com');

      if (!isValidDomain) {
        return {
          valid: false,
          error: `不支持的域名: ${hostname}（仅支持 *.xgd.com 域名）`
        };
      }

      return { valid: true, url: normalizedUrl };

    } catch (e) {
      return { valid: false, error: `无效的 URL: ${e.message}` };
    }
  }

  /**
   * 生成会话 ID
   */
  generateSessionId(purpose = 'explore') {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `oa-todo-explore-${purpose}-${timestamp}-${randomSuffix}`;
  }

  /**
   * 清理过期会话
   */
  async cleanup() {
    const now = Date.now();

    if (!fs.existsSync(this.exploreSessionsDir)) {
      return;
    }

    const sessionDirs = fs.readdirSync(this.exploreSessionsDir);

    for (const sessionId of sessionDirs) {
      const metaPath = this._getMetaPath(sessionId);

      try {
        if (!fs.existsSync(metaPath)) {
          // 无效的会话目录，删除
          fs.rmSync(this._getSessionPath(sessionId), { recursive: true, force: true });
          continue;
        }

        const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

        // 检查是否超时
        if (now > data.timeoutAt) {
          // 关闭浏览器会话
          try {
            execSync(`agent-browser --session ${data.session} close`, {
              timeout: 5000,
              stdio: 'ignore'
            });
          } catch (e) {
            // 忽略关闭失败
          }

          // 删除会话目录
          fs.rmSync(this._getSessionPath(sessionId), { recursive: true, force: true });
        }
      } catch (e) {
        // 文件损坏，删除目录
        try {
          fs.rmSync(this._getSessionPath(sessionId), { recursive: true, force: true });
        } catch (e2) {
          // 忽略
        }
      }
    }
  }

  /**
   * 保存会话信息
   */
  async saveSession(sessionId, metadata) {
    // 先清理过期会话
    await this.cleanup();

    const now = Date.now();
    const timeoutMs = metadata.timeoutMinutes * 60 * 1000;

    const sessionData = {
      sessionId,
      session: metadata.session,
      url: metadata.url || '',
      normalizedUrl: metadata.normalizedUrl || '',
      purpose: metadata.purpose || 'explore',
      createdAt: now,
      timeoutAt: now + timeoutMs,
      lastActivity: now,
      timeoutMinutes: metadata.timeoutMinutes || 10
    };

    // 创建会话目录
    const sessionDir = this._getSessionPath(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // 保存元数据
    const metaPath = this._getMetaPath(sessionId);
    fs.writeFileSync(metaPath, JSON.stringify(sessionData, null, 2));

    // 保存状态文件引用（指向登录状态）
    const statePath = path.join(sessionDir, 'state.json');
    const stateRef = {
      stateFile: this.config.stateFile,
      createdAt: now
    };
    fs.writeFileSync(statePath, JSON.stringify(stateRef, null, 2));

    log.info('saveSession: session saved', {
      sessionId,
      session: metadata.session,
      purpose: sessionData.purpose,
      timeoutMinutes: sessionData.timeoutMinutes,
      url: sessionData.normalizedUrl
    });

    return sessionData;
  }

  /**
   * 获取会话信息
   */
  async getSession(sessionId) {
    const metaPath = this._getMetaPath(sessionId);

    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      // 检查是否过期
      if (Date.now() > data.timeoutAt) {
        // 过期，清理并返回null
        await this.closeSession(sessionId);
        return null;
      }

      return data;
    } catch (e) {
      // 文件损坏，删除并返回null
      try {
        fs.rmSync(this._getSessionPath(sessionId), { recursive: true, force: true });
      } catch (e2) {
        // 忽略
      }
      return null;
    }
  }

  /**
   * 更新会话活动时间（续期）
   */
  async updateSession(sessionId) {
    const metaPath = this._getMetaPath(sessionId);

    if (!fs.existsSync(metaPath)) {
      log.debug('updateSession: session not found', { sessionId });
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const now = Date.now();

      // 更新活动时间和超时时间
      data.lastActivity = now;
      data.timeoutAt = now + (data.timeoutMinutes * 60 * 1000);

      fs.writeFileSync(metaPath, JSON.stringify(data, null, 2));

      log.info('updateSession: session renewed', {
        sessionId,
        session: data.session,
        timeoutMinutes: data.timeoutMinutes
      });

      return data;
    } catch (e) {
      log.warn('updateSession: failed to update session', { sessionId, error: e.message });
      return null;
    }
  }

  /**
   * 关闭会话并释放资源
   */
  async closeSession(sessionId) {
    const metaPath = this._getMetaPath(sessionId);

    if (!fs.existsSync(metaPath)) {
      log.debug('closeSession: session not found', { sessionId });
      return false;
    }

    try {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      log.info('closeSession: closing session', { sessionId, session: data.session });

      // 关闭浏览器会话
      try {
        execSync(`agent-browser --session ${data.session} close`, {
          timeout: 5000,
          stdio: 'ignore'
        });
      } catch (e) {
        log.warn('closeSession: failed to close browser session', { sessionId, session: data.session, error: e.message });
      }

      // 删除会话目录
      fs.rmSync(this._getSessionPath(sessionId), { recursive: true, force: true });

      log.info('closeSession: session removed', { sessionId, session: data.session });

      return true;
    } catch (e) {
      log.error('closeSession: failed to close session', { sessionId, error: e.message });
      return false;
    }
  }

  /**
   * 根据 URL 查找现有会话
   */
  async findByUrl(url) {
    const normalizedUrl = this.normalizeUrl(url);

    if (!fs.existsSync(this.exploreSessionsDir)) {
      return null;
    }

    const sessionDirs = fs.readdirSync(this.exploreSessionsDir);

    for (const sessionId of sessionDirs) {
      const sessionData = await this.getSession(sessionId);
      if (sessionData && sessionData.normalizedUrl === normalizedUrl) {
        return sessionData;
      }
    }

    return null;
  }

  /**
   * 列出所有活跃会话
   */
  async list() {
    await this.cleanup();

    const sessionDirs = fs.readdirSync(this.exploreSessionsDir);
    const sessions = [];

    for (const sessionId of sessionDirs) {
      const sessionData = await this.getSession(sessionId);
      if (sessionData) {
        sessions.push(sessionData);
      }
    }

    return sessions;
  }
}

module.exports = ExploreManager;
