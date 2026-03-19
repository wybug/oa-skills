/**
 * Agent-Browser 封装模块
 * 提供与 OA 系统交互的高级 API
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class Browser {
  constructor(config) {
    this.config = config;
    this.agentBrowser = 'npx agent-browser';
    this.session = `oa-todo-${Date.now()}`;
  }

  /**
   * 执行 agent-browser 命令
   */
  async exec(args, options = {}) {
    return new Promise((resolve, reject) => {
      const cmd = `${this.agentBrowser} ${args}`;
      
      try {
        const result = execSync(cmd, {
          encoding: 'utf-8',
          timeout: options.timeout || 60000,
          cwd: options.cwd || process.cwd(),
          env: { ...process.env, ...options.env }
        });
        resolve(result);
      } catch (error) {
        // 如果是超时或其他错误，尝试解析错误输出
        if (error.stdout) {
          resolve(error.stdout);
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * 检查登录状态是否有效
   */
  async checkLoginValid() {
    const stateFile = this.config.stateFile;
    
    if (!fs.existsSync(stateFile)) {
      return { valid: false, reason: '状态文件不存在' };
    }

    const stat = fs.statSync(stateFile);
    const ageMinutes = (Date.now() - stat.mtime) / 1000 / 60;
    const timeout = this.config.loginTimeout;

    if (ageMinutes > timeout) {
      return { 
        valid: false, 
        reason: `已过期（超过${timeout}分钟）`,
        ageMinutes: Math.floor(ageMinutes)
      };
    }

    return { 
      valid: true, 
      ageMinutes: Math.floor(ageMinutes),
      remaining: Math.floor(timeout - ageMinutes)
    };
  }

  /**
   * 加载登录状态
   */
  async loadState() {
    await this.exec(`--session ${this.session} close`, { timeout: 5000 });
    await this.exec(`--session ${this.session} open "about:blank"`);
    await this.exec(`--session ${this.session} state load ${this.config.stateFile}`);
  }

  /**
   * 打开页面
   */
  async open(url) {
    await this.exec(`--session ${this.session} open "${url}"`);
    await this.waitForLoad();
  }

  /**
   * 等待页面加载
   */
  async waitForLoad(timeout = 10000) {
    await this.exec(`--session ${this.session} wait --load networkidle`, { timeout });
  }

  /**
   * 截图
   */
  async screenshot(outputPath) {
    await this.exec(`--session ${this.session} screenshot ${outputPath}`);
  }

  /**
   * 获取页面快照
   */
  async snapshot() {
    const result = await this.exec(`--session ${this.session} snapshot`);
    return result;
  }

  /**
   * 执行 JavaScript
   */
  async eval(code) {
    const result = await this.exec(`--session ${this.session} eval --stdin`, {
      timeout: 10000
    });
    
    // 需要通过 stdin 传递代码
    // 这里简化处理，实际使用时需要更复杂的实现
    return result;
  }

  /**
   * 点击元素
   */
  async click(selector) {
    await this.exec(`--session ${this.session} click "${selector}"`);
  }

  /**
   * 输入文本
   */
  async type(selector, text) {
    await this.exec(`--session ${this.session} type "${selector}" "${text}"`);
  }

  /**
   * 关闭会话
   */
  async close() {
    try {
      await this.exec(`--session ${this.session} close`, { timeout: 5000 });
    } catch (error) {
      // 忽略关闭错误
    }
  }

  /**
   * 执行登录脚本
   */
  async login() {
    const loginScript = path.join(__dirname, '../../scripts/login.sh');
    
    if (!fs.existsSync(loginScript)) {
      throw new Error('找不到登录脚本: ' + loginScript);
    }

    // 调用 bash 登录脚本
    execSync(`bash "${loginScript}"`, {
      stdio: 'inherit',
      env: process.env
    });

    // 验证登录是否成功
    const status = await this.checkLoginValid();
    if (!status.valid) {
      throw new Error('登录失败');
    }

    return status;
  }

  /**
   * 获取待办列表页面
   */
  async fetchTodoList(page = 1) {
    const url = `https://oa.xgd.com/sys/notify/sys_notify_todo/sysNotifyTodo.do?method=pagingQuery&page=${page}`;
    await this.open(url);
    return this.snapshot();
  }

  /**
   * 获取待办详情页面
   */
  async fetchTodoDetail(fdId, href) {
    const url = href.startsWith('http') ? href : `https://oa.xgd.com${href}`;
    await this.open(url);
    return this.snapshot();
  }

  /**
   * 审批会议待办
   */
  async approveMeeting(action) {
    if (action === '参加') {
      await this.click('button:has-text("参加")');
    } else if (action === '不参加') {
      await this.click('button:has-text("不参加")');
    } else {
      throw new Error(`不支持的动作: ${action}`);
    }
    
    await this.waitForLoad();
    return this.snapshot();
  }

  /**
   * 审批流程待办
   */
  async approveWorkflow(action, comment = '') {
    if (action === '通过') {
      if (comment) {
        await this.type('textarea[id*="comment"], textarea[name*="comment"]', comment);
      }
      await this.click('button:has-text("通过"), input[value="通过"]');
    } else if (action === '驳回') {
      if (comment) {
        await this.type('textarea[id*="comment"], textarea[name*="comment"]', comment);
      }
      await this.click('button:has-text("驳回"), input[value="驳回"]');
    } else if (action === '转办') {
      // 转办逻辑更复杂，需要选择转办人
      await this.click('button:has-text("转办"), input[value="转办"]');
      // 这里需要进一步实现
      throw new Error('转办功能暂未实现');
    } else {
      throw new Error(`不支持的动作: ${action}`);
    }
    
    await this.waitForLoad();
    return this.snapshot();
  }
}

module.exports = Browser;
