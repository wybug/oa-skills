/**
 * Agent-Browser 封装模块
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class Browser {
  constructor(config) {
    this.config = config;
    this.agentBrowser = 'npx agent-browser';
    this.session = `oa-todo-${Date.now()}`;
  }

  async exec(args, options = {}) {
    const cmd = `${this.agentBrowser} ${args}`;
    try {
      return execSync(cmd, {
        encoding: 'utf-8',
        timeout: options.timeout || 60000,
        maxBuffer: options.maxBuffer || 20 * 1024 * 1024
      });
    } catch (error) {
      if (error.stdout) return error.stdout;
      throw error;
    }
  }

  async checkLoginValid() {
    if (!fs.existsSync(this.config.stateFile)) {
      return { valid: false, reason: '状态文件不存在' };
    }
    const stat = fs.statSync(this.config.stateFile);
    const ageMinutes = (Date.now() - stat.mtime) / 1000 / 60;
    const timeout = this.config.loginTimeout;
    if (ageMinutes > timeout) {
      return { valid: false, reason: '已过期', ageMinutes: Math.floor(ageMinutes) };
    }
    return { valid: true, remaining: Math.floor(timeout - ageMinutes) };
  }

  async loadState() {
    await this.exec(`--session ${this.session} close`, { timeout: 5000 });
    await this.exec(`--session ${this.session} open "about:blank"`);
    await this.exec(`--session ${this.session} state load ${this.config.stateFile}`);
  }

  async open(url) {
    await this.exec(`--session ${this.session} open "${url}"`);
    await this.waitForLoad();
  }

  async waitForLoad(timeout = 10000) {
    await this.exec(`--session ${this.session} wait --load networkidle`, { timeout });
  }

  async screenshot(outputPath) {
    await this.exec(`--session ${this.session} screenshot ${outputPath}`);
  }

  async snapshot() {
    return await this.exec(`--session ${this.session} snapshot`);
  }

  /**
   * 执行JavaScript并通过文件返回结果（避免JSON截断）
   * 方法：将结果存储在页面的隐藏元素中，通过snapshot读取
   */
  async evalWithFile(code, resultId = 'eval_result') {
    // 1. 修改代码，将结果写入页面元素
    const wrappedCode = `
(() => {
  try {
    const result = ${code};
    // 创建或更新结果元素
    let elem = document.getElementById('${resultId}');
    if (!elem) {
      elem = document.createElement('div');
      elem.id = '${resultId}';
      elem.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:white;padding:5px;border:1px solid black;font-family:monospace;font-size:12px;max-width:100%;word-wrap:break-word;';
      document.body.appendChild(elem);
    }
    // 使用特殊标记包裹JSON结果
    elem.textContent = '<<<START>>>' + JSON.stringify(result) + '<<<END>>>';
    return 'EVAL_SUCCESS';
  } catch (e) {
    let elem = document.getElementById('${resultId}');
    if (!elem) {
      elem = document.createElement('div');
      elem.id = '${resultId}';
      elem.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:white;padding:5px;border:1px solid red;';
      document.body.appendChild(elem);
    }
    elem.textContent = '<<<ERROR>>>' + e.message;
    return 'EVAL_ERROR';
  }
})()
`;

    // 2. 执行代码（结果会显示在页面上）
    const tempFile = `/tmp/browser_eval_${Date.now()}.js`;
    fs.writeFileSync(tempFile, wrappedCode, 'utf-8');
    
    try {
      await this.exec(`--session ${this.session} eval --stdin < "${tempFile}"`, { timeout: 10000 });
    } catch (e) {
      // 忽略执行错误，继续获取结果
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) {}
      }
    }

    // 3. 等待一下让结果渲染
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. 获取页面快照（这个不会截断）
    const snapshot = await this.snapshot();

    // 5. 从快照中提取结果
    const match = snapshot.match(/<<<START>>>(.+?)<<<END>>>/s);
    if (match) {
      return JSON.parse(match[1]);
    }

    const errorMatch = snapshot.match(/<<<ERROR>>>(.+)/);
    if (errorMatch) {
      throw new Error(errorMatch[1]);
    }

    throw new Error('无法从页面中提取执行结果');
  }

  async click(selector) {
    await this.exec(`--session ${this.session} click "${selector}"`);
  }

  async type(selector, text) {
    await this.exec(`--session ${this.session} type "${selector}" "${text}"`);
  }

  async close() {
    try {
      await this.exec(`--session ${this.session} close`, { timeout: 5000 });
    } catch (error) {}
  }

  async login() {
    const loginScript = require('path').join(__dirname, '../../scripts/login.sh');
    if (!fs.existsSync(loginScript)) {
      throw new Error('找不到登录脚本: ' + loginScript);
    }
    execSync(`bash "${loginScript}"`, { stdio: 'inherit', env: process.env });
    const status = await this.checkLoginValid();
    if (!status.valid) throw new Error('登录失败');
    return status;
  }

  async fetchTodoDetail(fdId, href) {
    const url = href.startsWith('http') ? href : `https://oa.xgd.com${href}`;
    await this.open(url);
    return this.snapshot();
  }

  async approveMeeting(action) {
    await this.click(`button:has-text("${action}")`);
    await this.waitForLoad();
    return this.snapshot();
  }

  async approveWorkflow(action, comment = '') {
    if (comment) {
      await this.type('textarea[id*="comment"], textarea[name*="comment"]', comment);
    }
    await this.click(`button:has-text("${action}"), input[value="${action}"]`);
    await this.waitForLoad();
    return this.snapshot();
  }
}

module.exports = Browser;
