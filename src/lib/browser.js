/**
 * Agent-Browser 封装模块
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');

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
        maxBuffer: options.maxBuffer || 20 * 1024 * 1024  // 20MB buffer
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

  async eval(code) {
    const tempFile = `/tmp/browser_eval_${Date.now()}.js`;
    fs.writeFileSync(tempFile, code, 'utf-8');
    
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', `cat "${tempFile}" | ${this.agentBrowser} --session ${this.session} eval --stdin`], {
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        // 清理临时文件
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile, () => {});
        }
        
        if (code !== 0 && !stdout) {
          reject(new Error(`eval failed with code ${code}: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });
      
      child.on('error', (error) => {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile, () => {});
        }
        reject(error);
      });
    });
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
