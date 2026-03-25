#!/usr/bin/env node

/**
 * 审批助手基类
 * 提供标准 approve() 方法定义和通用工具方法
 * 注意：此文件提供接口定义，具体实现在子类中
 */

const { execSync } = require('child_process');

/**
 * 通用配置
 */
const CONFIG = {
  delays: {
    afterClick: 2000,      // 点击后等待毫秒数
    afterInput: 1000,      // 输入后等待毫秒数
    afterSubmit: 2000      // 提交后等待毫秒数
  }
};

/**
 * 审批助手基类
 * 定义标准接口，子类实现具体逻辑
 */
class ApprovalHelper {
  constructor(session, options = {}) {
    this.session = session;
    this.debug = options.debug || false;
  }

  /**
   * 执行 agent-browser 命令（通用工具方法）
   */
  exec(command, options = {}) {
    const cmd = `npx agent-browser --session ${this.session} ${command}`;
    try {
      const output = execSync(cmd, {
        encoding: 'utf8',
        timeout: options.timeout || 30000,
        stdio: options.silent ? 'pipe' : 'inherit'
      });
      return output;
    } catch (e) {
      if (options.ignoreError) {
        return null;
      }
      throw e;
    }
  }

  /**
   * 执行 JavaScript 代码（通过临时文件避免字符转义问题）
   */
  eval(jsCode, options = {}) {
    const fs = require('fs');
    const tmpFile = `/tmp/oa_eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.js`;
    fs.writeFileSync(tmpFile, jsCode, 'utf-8');
    try {
      const result = this.exec(`eval --stdin < "${tmpFile}"`, {
        timeout: options.timeout || 30000,
        silent: true
      });
      return result;
    } finally {
      fs.unlinkSync(tmpFile);
    }
  }

  /**
   * 检查执行结果是否成功
   */
  _checkSuccess(output) {
    if (!output) return false;
    // 检查是否包含 success: true（考虑不同 JSON 格式）
    return output.includes('"success"') && output.includes('true');
  }

  /**
   * 获取页面快照（通用工具方法）
   */
  snapshot() {
    return this.exec('snapshot', { silent: true, timeout: 10000 });
  }

  /**
   * 等待页面加载完成
   */
  async waitForLoad() {
    await this.sleep(1000);
  }

  /**
   * 等待指定时间（通用工具方法）
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 标准 RPA 审批入口（接口定义，子类必须实现）
   * @param {string} action - 审批动作
   * @param {string} comment - 审批意见
   * @param {Object} options - 选项 { submit, debug }
   * @abstract
   */
  async approve(action, comment, options = {}) {
    throw new Error('approve() 方法必须由子类实现');
  }
}

module.exports = { ApprovalHelper, CONFIG };
