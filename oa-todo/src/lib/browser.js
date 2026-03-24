/**
 * Agent-Browser 封装模块
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateClientCode, breakpoint } = require('./web-extractor');

class Browser {
  constructor(config, options = {}) {
    this.config = config;
    this.debugMode = options.debugMode || false;
    // headedMode 由环境变量控制（由 daemon 命令设置）
    this.headedMode = this._getDefaultHeadedMode();
    this.session = options.session || `oa-todo-${Date.now()}`;
    this.reuseMode = options.reuse || false;  // 复用模式标志
    this.debugInfo = {
      commands: [],
      errors: [],
      snapshots: []
    };

    // 反检测参数始终启用
    process.env.AGENT_BROWSER_ARGS = '--disable-blink-features=AutomationControlled';

    // 复用模式下不关闭现有 daemon
    if (!this.reuseMode) {
      try {
        execSync('npx agent-browser close', { timeout: 5000, stdio: 'ignore' });
      } catch (e) {
        // 忽略
      }
    }

    // 根据 headedMode 构建命令（与 debugMode 解耦）
    const headedFlag = this.headedMode ? '--headed' : '';
    this.agentBrowser = `npx agent-browser ${headedFlag}`.trim();
  }

  // 从环境变量获取浏览器模式（由 daemon 命令设置）
  _getDefaultHeadedMode() {
    const envValue = process.env.OA_BROWSER_HEADED;
    if (envValue !== undefined) {
      return envValue === '1' || envValue === 'true' || envValue === 'yes';
    }
    return false; // 默认：无头模式
  }

  async exec(args, options = {}) {
    const cmd = `${this.agentBrowser} ${args}`;
    const startTime = Date.now();

    // 记录调试信息
    if (this.debugMode) {
      this.debugInfo.commands.push({
        command: cmd,
        args: args,
        timestamp: new Date().toISOString()
      });
    }

    try {
      const result = execSync(cmd, {
        encoding: 'utf-8',
        timeout: options.timeout || 60000,
        maxBuffer: options.maxBuffer || 20 * 1024 * 1024
      });

      if (this.debugMode) {
        this.debugInfo.commands[this.debugInfo.commands.length - 1].result = {
          success: true,
          duration: Date.now() - startTime,
          outputLength: result ? result.length : 0
        };
      }

      return result;
    } catch (error) {
      // 记录错误信息
      const errorInfo = {
        command: cmd,
        args: args,
        error: error.message,
        stderr: error.stderr?.toString() || '',
        stdout: error.stdout?.toString() || '',
        code: error.status,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };

      if (this.debugMode) {
        this.debugInfo.errors.push(errorInfo);
        this.debugInfo.commands[this.debugInfo.commands.length - 1].result = {
          success: false,
          error: errorInfo
        };
      }

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
    // 添加一个快照操作来稳定页面状态（确保 CDP 会话完全建立）
    await this.snapshot();
  }

  async open(url, waitTimeout) {
    await this.exec(`--session ${this.session} open "${url}"`);
    // 移动网络可能需要更长的加载时间，默认30秒
    await this.waitForLoad(waitTimeout || 30000);
  }

  async waitForLoad(timeout = 30000) {
    await this.exec(`--session ${this.session} wait --load networkidle`, { timeout });
  }

  async snapshot() {
    return await this.exec(`--session ${this.session} snapshot`);
  }

  /**
   * 获取当前页面 URL
   */
  async getCurrentUrl() {
    try {
      const result = await this.exec(`--session ${this.session} eval 'window.location.href'`);
      // 解析输出，移除可能的引号和换行
      return result.trim().replace(/^['"]|['"]$/g, '');
    } catch (e) {
      if (this.debugMode) {
        console.error(`[getCurrentUrl] 错误: ${e.message}`);
      }
      throw new Error('无法获取当前URL');
    }
  }

  /**
   * 获取当前所有 tabs
   * @returns {Promise<Array<number>>} Tab 索引数组，如 [0, 1, 2]
   */
  async listTabs() {
    try {
      const output = await this.exec(`--session ${this.session} tab`);
      if (this.debugMode) {
        console.log(`[listTabs] 输出: ${output}`);
      }
      // 解析输出，提取 tab 索引
      // agent-browser 输出格式: "→ [0]  - about:blank"
      const lines = output.trim().split('\n');
      const tabs = [];
      for (const line of lines) {
        // 匹配格式: [0] 或 [1] 等
        const match = line.match(/\[(\d+)\]/);
        if (match) {
          tabs.push(parseInt(match[1]));
        }
      }
      if (this.debugMode) {
        console.log(`[listTabs] 解析结果: ${tabs.join(', ')}`);
      }
      return tabs;
    } catch (e) {
      if (this.debugMode) {
        console.error(`[listTabs] 错误: ${e.message}`);
      }
      return [];
    }
  }

  /**
   * 在新 tab 中打开 URL
   * @param {string} url - 要打开的 URL
   * @returns {Promise<number>} 新 tab 的索引
   */
  async openInNewTab(url) {
    try {
      if (this.debugMode) {
        console.log(`[openInNewTab] 准备打开 URL: ${url}`);
      }

      // 先获取当前 tab 列表
      const beforeTabs = await this.listTabs();

      // 打开新 tab
      const cmd = `--session ${this.session} tab new ${url}`;
      if (this.debugMode) {
        console.log(`[openInNewTab] 执行命令: ${cmd}`);
      }
      await this.exec(cmd);

      // 等待新 tab 创建和加载（增加等待时间以支持慢速网络）
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取新 tab 列表
      const afterTabs = await this.listTabs();

      if (this.debugMode) {
        console.log(`[openInNewTab] beforeTabs: [${beforeTabs.join(', ')}], afterTabs: [${afterTabs.join(', ')}]`);
      }

      // 找出新增加的 tab 索引
      for (const tabIndex of afterTabs) {
        if (!beforeTabs.includes(tabIndex)) {
          if (this.debugMode) {
            console.log(`[openInNewTab] 新 tab 索引: ${tabIndex}`);
          }
          return tabIndex; // 返回新 tab 的索引
        }
      }

      // 如果没找到新 tab（可能 afterTabs 和 beforeTabs 相同），使用第一个 tab
      if (afterTabs.length > 0) {
        if (this.debugMode) {
          console.log(`[openInNewTab] 使用第一个 tab: ${afterTabs[0]}`);
        }
        return afterTabs[0];
      }

      throw new Error('无法确定新 tab 的索引');
    } catch (e) {
      if (this.debugMode) {
        console.error(`[openInNewTab] 错误: ${e.message}`);
      }
      throw e;
    }
  }

  /**
   * 切换到指定 tab
   * @param {number} index - Tab 索引（从0开始）
   */
  async switchToTab(index) {
    try {
      if (index === null || index === undefined) {
        throw new Error('Tab 索引不能为空');
      }
      if (this.debugMode) {
        console.log(`[switchToTab] 切换到 tab ${index}`);
      }
      await this.exec(`--session ${this.session} tab ${index}`);
    } catch (e) {
      if (this.debugMode) {
        console.error(`[switchToTab] 错误: ${e.message}`);
      }
      throw e;
    }
  }

  /**
   * 关闭指定 tab
   * @param {number} index - Tab 索引，如果不指定则关闭当前 tab
   */
  async closeTab(index = null) {
    try {
      if (index !== null && index !== undefined) {
        await this.exec(`--session ${this.session} tab close ${index}`);
      } else {
        await this.exec(`--session ${this.session} tab close`);
      }
      // 等待 tab 关闭完成
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      // "Cannot close the last tab" 错误是预期的，不是真正的错误
      if (!e.message.includes('Cannot close the last tab') && this.debugMode) {
        console.error(`[closeTab] 错误: ${e.message}`);
      }
      // 关闭tab失败通常不是致命错误，继续执行
    }
  }

  /**
   * 创建一个新的空白 tab
   * @returns {Promise<number>} 新 tab 的索引
   */
  async createNewTab() {
    try {
      // 先获取当前 tab 列表
      const beforeTabs = await this.listTabs();

      // 创建空白 tab（不指定 URL）
      const cmd = `--session ${this.session} tab new`;
      await this.exec(cmd);

      // 等待新 tab 创建
      await new Promise(resolve => setTimeout(resolve, 500));

      // 获取新 tab 列表
      const afterTabs = await this.listTabs();

      if (this.debugMode) {
        console.log(`[createNewTab] beforeTabs: [${beforeTabs.join(', ')}], afterTabs: [${afterTabs.join(', ')}]`);
      }

      // 找出新增加的 tab 索引
      for (const tabIndex of afterTabs) {
        if (!beforeTabs.includes(tabIndex)) {
          if (this.debugMode) {
            console.log(`[createNewTab] 新 tab 索引: ${tabIndex}`);
          }
          return tabIndex;
        }
      }

      // 如果没找到新 tab，返回最大索引 + 1
      const maxIndex = afterTabs.length > 0 ? Math.max(...afterTabs) : -1;
      const newIndex = maxIndex + 1;
      if (this.debugMode) {
        console.log(`[createNewTab] 未找到新 tab，返回: ${newIndex}`);
      }
      return newIndex;
    } catch (e) {
      if (this.debugMode) {
        console.error(`[createNewTab] 错误: ${e.message}`);
      }
      throw e;
    }
  }

  /**
   * 在指定 tab 中打开 URL（使用 JavaScript 导航，不创建新 tab）
   * @param {number} tabIndex - Tab 索引
   * @param {string} url - 要打开的 URL
   */
  async openUrlInTab(tabIndex, url) {
    try {
      // 先切换到目标 tab
      await this.switchToTab(tabIndex);

      // 使用 JavaScript 在当前 tab 中导航（避免创建新 tab）
      // 转义单引号
      const escapedUrl = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const code = `window.location.href = '${escapedUrl}';`;
      await this.exec(`--session ${this.session} eval "${code}"`);

      if (this.debugMode) {
        console.log(`[openUrlInTab] Tab ${tabIndex}: ${url.substring(0, 60)}...`);
      }
    } catch (e) {
      if (this.debugMode) {
        console.error(`[openUrlInTab] Tab ${tabIndex} 错误: ${e.message}`);
      }
      throw e;
    }
  }

  /**
   * 截图（仅在 debug 模式下执行）
   * @param {string} outputPath - 输出路径
   */
  async screenshot(outputPath) {
    // 仅在 debug 模式下执行截图
    if (!this.debugMode) {
      return;
    }
    await this.exec(`--session ${this.session} screenshot ${outputPath}`);
  }

  /**
   * 执行JavaScript并通过文件返回结果（避免JSON截断）
   * 方法：将结果存储在页面的隐藏元素中，通过snapshot读取
   * @param {string} code - 要执行的JavaScript代码
   * @param {string} resultId - 结果元素ID
   * @param {Object} options - 选项
   * @param {number} options.maxRetries - 最大重试次数，默认3
   * @param {number} options.timeout - 执行超时时间（毫秒），默认10000
   * @param {boolean} options.debug - 是否输出调试信息
   */
  async evalWithFile(code, resultId = 'eval_result', options = {}) {
    const { maxRetries = 3, timeout = 10000, debug = false } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this._evalWithFileOnce(code, resultId, timeout, debug);
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const errorType = this._classifyError(error);

        if (debug || isLastAttempt) {
          console.error(`[evalWithFile] 尝试 ${attempt}/${maxRetries} 失败: ${errorType} - ${error.message}`);
        }

        // 如果是可重试的错误且不是最后一次尝试，继续重试
        if (this._isRetryableError(errorType) && !isLastAttempt) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 指数退避
          continue;
        }

        // 不可重试的错误或最后一次尝试失败
        throw new Error(`evalWithFile失败 (${errorType}): ${error.message}`);
      }
    }
  }

  /**
   * 执行JavaScript并通过文件返回结果（单次执行）
   * @private
   */
  async _evalWithFileOnce(code, resultId, timeout, debug) {
    // 1. 修改代码，将结果写入页面元素
    // 使用函数包装代码，避免模板字符串问题
    const getWrappedCode = (jsCode, id) => {
      return "(() => {try {const result = " + jsCode + ";" +
        "let elem = document.getElementById('" + id + "');" +
        "if (!elem) {elem = document.createElement('div');" +
        "elem.id = '" + id + "';" +
        "elem.style.cssText = 'position:fixed;top:0;left:0;z-index:-9999;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden;';" +
        "document.body.appendChild(elem);}" +
        "const jsonStr = JSON.stringify(result);" +
        "elem.textContent = '<<<START>>>' + jsonStr + '<<<END>>>';" +
        "elem.setAttribute('data-size', jsonStr.length);" +
        "return 'EVAL_SUCCESS';" +
        "} catch (e) {" +
        "let elem = document.getElementById('" + id + "');" +
        "if (!elem) {elem = document.createElement('div');" +
        "elem.id = '" + id + "';" +
        "elem.style.cssText = 'position:fixed;top:0;left:0;z-index:-9999;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden;';" +
        "document.body.appendChild(elem);}" +
        "elem.textContent = '<<<ERROR>>>' + e.message + '\\n' + e.stack;" +
        "return 'EVAL_ERROR';" +
        "}})()";
    };

    const wrappedCode = getWrappedCode(code, resultId);

    if (debug) {
      console.log(`[_evalWithFileOnce] resultId: ${resultId}`);
      console.log(`[_evalWithFileOnce] code length: ${code.length}`);
      console.log(`[_evalWithFileOnce] wrappedCode length: ${wrappedCode.length}`);
    }

    // 2. 执行代码（结果会显示在页面上）
    const tempFile = `/tmp/browser_eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.js`;
    fs.writeFileSync(tempFile, wrappedCode, 'utf-8');

    let execResult;
    try {
      execResult = await this.exec(`--session ${this.session} eval --stdin < "${tempFile}"`, { timeout });
    } catch (e) {
      // 忽略执行错误，继续获取结果（因为结果已经写入页面）
      if (debug) {
        console.log(`[evalWithFile] 执行命令出错: ${e.message}`);
      }
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) {}
      }
    }

    // 3. 等待一下让结果渲染
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. 获取页面快照（这个不会截断）
    const snapshot = await this.snapshot();

    if (debug) {
      console.log(`[evalWithFile] Snapshot长度: ${snapshot.length}`);
    }

    // 5. 从快照中提取结果
    const match = snapshot.match(/<<<START>>>(.+?)<<<END>>>/s);
    if (match) {
      let jsonStr = match[1];
      // 验证结果大小
      if (jsonStr.length > 10 * 1024 * 1024) { // 10MB
        throw new Error(`结果过大: ${jsonStr.length} 字节`);
      }

      // 修复Linux系统上的转义问题（{\"success\":true} 而不是 {"success":true}）
      if (jsonStr.includes('\\"')) {
        if (debug) {
          console.log(`[evalWithFile] 检测到Linux转义问题，进行修复...`);
        }
        jsonStr = jsonStr.replace(/\\"/g, '"');
      }

      try {
        const result = JSON.parse(jsonStr);
        if (debug) {
          console.log(`[evalWithFile] 成功解析JSON，大小: ${jsonStr.length} 字节`);
        }
        // 清理：移除结果元素
        this.exec(`--session ${this.session} eval "document.getElementById('${resultId}')?.remove()"`, { timeout: 5000 }).catch(() => {});
        return result;
      } catch (parseError) {
        // 尝试修复常见的JSON问题
        const fixedJson = this._tryFixJson(jsonStr);
        if (fixedJson) {
          const result = JSON.parse(fixedJson);
          // 清理：移除结果元素
          this.exec(`--session ${this.session} eval "document.getElementById('${resultId}')?.remove()"`, { timeout: 5000 }).catch(() => {});
          return result;
        }
        throw new Error(`JSON解析失败: ${parseError.message}`);
      }
    }

    const errorMatch = snapshot.match(/<<<ERROR>>>([\s\S]+)/);
    if (errorMatch) {
      const errorMsg = errorMatch[1].split('\n')[0]; // 只取第一行
      // 清理：移除结果元素
      this.exec(`--session ${this.session} eval "document.getElementById('${resultId}')?.remove()"`, { timeout: 5000 }).catch(() => {});
      throw new Error(`JavaScript执行错误: ${errorMsg}`);
    }

    // 检查是否有结果元素存在但没有内容
    if (snapshot.includes(resultId) && !snapshot.includes('<<<START>>>') && !snapshot.includes('<<<ERROR>>>')) {
      // 清理：移除结果元素
      this.exec(`--session ${this.session} eval "document.getElementById('${resultId}')?.remove()"`, { timeout: 5000 }).catch(() => {});
      throw new Error('结果元素存在但内容为空或未正确设置');
    }

    // 清理：移除结果元素（如果存在）
    this.exec(`--session ${this.session} eval "document.getElementById('${resultId}')?.remove()"`, { timeout: 5000 }).catch(() => {});

    throw new Error('无法从页面中提取执行结果');
  }

  /**
   * 尝试修复常见的JSON问题
   * @private
   */
  _tryFixJson(jsonStr) {
    // 移除可能的控制字符
    let fixed = jsonStr.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    // 尝试修复截断的JSON（如果末尾不完整）
    try {
      JSON.parse(fixed);
      return fixed;
    } catch (e) {
      return null;
    }
  }

  /**
   * 分类错误类型
   * @private
   */
  _classifyError(error) {
    if (error.message.includes('JavaScript执行错误')) {
      return 'EXEC_ERROR';
    }
    if (error.message.includes('JSON解析失败')) {
      return 'PARSE_ERROR';
    }
    if (error.message.includes('结果过大')) {
      return 'SIZE_ERROR';
    }
    if (error.message.includes('超时')) {
      return 'TIMEOUT_ERROR';
    }
    if (error.message.includes('结果元素存在但内容为空')) {
      return 'EMPTY_RESULT';
    }
    return 'EXTRACT_ERROR';
  }

  /**
   * 判断错误是否可重试
   * @private
   */
  _isRetryableError(errorType) {
    const retryableErrors = ['EXTRACT_ERROR', 'EMPTY_RESULT', 'TIMEOUT_ERROR'];
    return retryableErrors.includes(errorType);
  }

  async click(selector) {
    await this.exec(`--session ${this.session} click "${selector}"`);
  }

  async type(selector, text) {
    await this.exec(`--session ${this.session} type "${selector}" "${text}"`);
  }

  /**
   * 检查元素是否存在且可见
   * 使用 agent-browser 的原生命令
   */
  async exists(selector) {
    try {
      // 使用简单的 JavaScript 检查
      const code = "document.querySelector('" + selector + "')" +
                  "&&document.querySelector('" + selector + "').offsetParent!==null";
      const result = await this.exec(`--session ${this.session} eval "${code}"`, { timeout: 5000 });
      const output = result.trim();
      return output === 'true' || output === 'True';
    } catch (e) {
      return false;
    }
  }

  /**
   * 检查是否有下一页（简单方法）
   */
  async hasNextPage() {
    const result = {
      has_next: false,
      methods: [],
      debug: {}
    };

    // 方法1: 检查下一页按钮是否存在且可见
    try {
      const hasNextBtn = await this.exists('.lui_paging_t_hasnext:not(.lui_paging_t_hasnext_n)');
      result.methods.push({ name: 'button_check', result: hasNextBtn });
      result.debug.button_visible = hasNextBtn;
      if (hasNextBtn) {
        result.has_next = true;
      }
    } catch (e) {
      result.methods.push({ name: 'button_check', error: e.message });
    }

    // 方法2: 直接通过快照检查页码信息
    try {
      const snapshot = await this.snapshot();
      if (this.debugMode) {
        result.debug.snapshot_length = snapshot.length;
      }
      // 查找页码模式，如 "1/18" 或 "1 / 18"
      const pageMatch = snapshot.match(/\d+\s*[/／]\s*\d+/);
      if (pageMatch) {
        const parts = pageMatch[0].split(/[/／]/);
        const current = parseInt(parts[0].trim());
        const total = parseInt(parts[1].trim());
        result.methods.push({ name: 'page_indicator', current, total });
        result.debug.page_indicator = { current, total };
        if (!isNaN(current) && !isNaN(total) && current < total) {
          result.has_next = true;
        }
      }
    } catch (e) {
      result.methods.push({ name: 'page_indicator', error: e.message });
    }

    return result;
  }

  /**
   * 点击下一页按钮
   */
  async clickNextPage() {
    const result = {
      clicked: false,
      debug: {}
    };

    try {
      const selector = '.lui_paging_t_hasnext:not(.lui_paging_t_hasnext_n)';
      result.debug.selector = selector;

      // 先检查元素是否存在
      const exists = await this.exists(selector);
      result.debug.element_exists = exists;

      if (!exists) {
        result.debug.reason = 'Element not found or not visible';
        if (this.debugMode) {
          // 获取快照用于调试
          result.debug.snapshot = await this.snapshot();
        }
        return result;
      }

      // 执行点击
      await this.click(selector);
      result.clicked = true;

      if (this.debugMode) {
        // 保存点击后的快照
        result.debug.post_click_snapshot = await this.snapshot();
      }

    } catch (e) {
      result.debug.error = e.message;
      result.debug.error_stack = e.stack;
      if (this.debugMode) {
        result.debug.snapshot = await this.snapshot();
      }
    }

    return result;
  }

  /**
   * 获取调试信息
   */
  getDebugInfo() {
    return {
      session: this.session,
      debugMode: this.debugMode,
      agentBrowser: this.agentBrowser,
      commands: this.debugInfo.commands,
      errors: this.debugInfo.errors,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 保存调试信息到文件
   */
  async saveDebugInfo(outputPath) {
    const debugInfo = this.getDebugInfo();
    fs.writeFileSync(outputPath, JSON.stringify(debugInfo, null, 2));
    return outputPath;
  }

  async close() {
    try {
      await this.exec(`--session ${this.session} close`, { timeout: 5000 });
    } catch (error) {}
  }

  /**
   * 初始化 WebExtractor 工具库（在浏览器页面中注入工具代码）
   * @returns {Object} 初始化结果
   */
  async initExtractor() {
    const code = generateClientCode();
    const tempFile = `/tmp/web_extractor_${Date.now()}.js`;
    fs.writeFileSync(tempFile, code, 'utf-8');

    try {
      await this.exec(`--session ${this.session} eval --stdin < "${tempFile}"`, { timeout: 15000 });
      // 等待代码注入生效
      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证注入是否成功
      const verifyResult = await this.evalWithFile(`typeof window.WebExtractor !== 'undefined' ? 'OK' : 'FAIL'`, `verify_${Date.now()}`);

      if (verifyResult === 'OK') {
        return { success: true };
      }

      return { success: false, error: 'WebExtractor not available', verifyResult };
    } catch (error) {
      // 尝试验证是否已经存在
      try {
        const verifyResult = await this.evalWithFile(`typeof window.WebExtractor !== 'undefined' ? 'OK' : 'FAIL'`, `verify_${Date.now()}`);
        if (verifyResult === 'OK') {
          return { success: true, alreadyInitialized: true };
        }
      } catch (e) {
        // 忽略验证错误
      }
      return { success: false, error: error.message };
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  /**
   * 便捷方法：提取表格数据
   * @param {string} selector - 表格选择器
   * @param {Object} options - 选项
   * @returns {Object} 表格数据
   */
  async extractTable(selector, options = {}) {
    const code = `WebExtractor.TableExtractor.extractTable('${selector}', ${JSON.stringify(options)})`;
    return await this.evalWithFile(code, `table_${Date.now()}`);
  }

  /**
   * 便捷方法：根据表头查找表格
   * @param {string} headerText - 表头文本
   * @returns {Object|null} 表格HTML或null
   */
  async findTableByHeader(headerText) {
    const code = `WebExtractor.TableExtractor.findTableByHeader('${headerText}')`;
    return await this.evalWithFile(code, `find_table_${Date.now()}`);
  }

  /**
   * 便捷方法：提取表格并转换为 Markdown 格式
   * @param {string} selector - 表格选择器
   * @param {Object} options - 选项（包含 title 等）
   * @returns {Object} 包含 markdown 字段的结果
   */
  async extractTableAsMarkdown(selector, options = {}) {
    const opts = { ...options, format: 'markdown' };
    return await this.extractTable(selector, opts);
  }

  /**
   * 便捷方法：获取所有表格概览
   * @returns {Array} 表格列表
   */
  async getAllTables() {
    const code = `WebExtractor.DebugHelper.getAllTables()`;
    const result = await this.evalWithFile(code, `all_tables_${Date.now()}`);

    // 确保返回的是数组
    if (!Array.isArray(result)) {
      console.error(`getAllTables 返回非数组类型: ${typeof result}`, result);
      return [];
    }

    return result;
  }

  /**
   * 便捷方法：获取元素信息
   * @param {string} selector - CSS选择器
   * @returns {Object} 元素信息
   */
  async getElementInfo(selector) {
    const code = `WebExtractor.DebugHelper.getElementInfo('${selector}')`;
    return await this.evalWithFile(code, `element_${Date.now()}`);
  }

  /**
   * 便捷方法：获取页面概览
   * @returns {Object} 页面信息
   */
  async getPageOverview() {
    const code = `WebExtractor.DebugHelper.getPageOverview()`;
    return await this.evalWithFile(code, `page_overview_${Date.now()}`);
  }

  /**
   * 便捷方法：查找按钮
   * @param {string} text - 按钮文本
   * @param {Object} options - 选项
   * @returns {Object|null} 按钮信息
   */
  async findButton(text, options = {}) {
    const code = `WebExtractor.ElementFinder.findButton('${text}', ${JSON.stringify(options)})`;
    return await this.evalWithFile(code, `button_${Date.now()}`);
  }

  /**
   * 便捷方法：点击按钮
   * @param {string} text - 按钮文本
   * @returns {Object} 结果
   */
  async clickButtonByText(text) {
    const code = `WebExtractor.ElementInteractor.clickButton('${text}')`;
    return await this.evalWithFile(code, `click_${Date.now()}`);
  }

  /**
   * 便捷方法：填充输入框
   * @param {string} labelText - 标签文本
   * @param {string} value - 值
   * @returns {Object} 结果
   */
  async fillInputByLabel(labelText, value) {
    const code = `WebExtractor.ElementInteractor.fillInput('${labelText}', '${value}')`;
    return await this.evalWithFile(code, `fill_${Date.now()}`);
  }

  /**
   * 设置断点 - 暂停并保持浏览器打开
   * @param {string} label - 断点标签
   * @param {Object} info - 附加信息
   */
  setBreakpoint(label, info = {}) {
    breakpoint(this, label, info);
  }

  /**
   * 登录 OA 系统 - 纯 JavaScript 实现
   * @returns {Object} 登录状态 { valid, remaining }
   */
  async login() {
    const console = require('console');
    const userName = process.env.OA_USER_NAME;
    const userPasswd = process.env.OA_USER_PASSWD;

    // 检查环境变量
    if (!userName || !userPasswd) {
      console.error('\n❌ 错误: 环境变量未配置');
      console.error('\n请在 CoPaw 的 Environments 中配置以下环境变量:');
      console.error('  OA_USER_NAME=你的用户名');
      console.error('  OA_USER_PASSWD=你的密码\n');
      throw new Error('缺少环境变量 OA_USER_NAME 或 OA_USER_PASSWD');
    }

    // 验证环境变量格式
    if (userName.length < 2 || userPasswd.length < 4) {
      console.error('\n❌ 错误: 用户名或密码格式不正确');
      console.error('  - 用户名长度应不少于2个字符');
      console.error('  - 密码长度应不少于4个字符\n');
      throw new Error('用户名或密码格式不正确');
    }

    console.log('\n========================================');
    console.log('  OA系统登录 - 保存登录状态');
    console.log('========================================\n');

    // 创建临时登录会话
    const loginSession = 'oa-login-' + Date.now();

    // 步骤1: 打开OA登录页面
    console.log('🔐 步骤1: 打开OA登录页面...');
    await this.exec(`--session ${loginSession} open "https://oa.xgd.com"`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.exec(`--session ${loginSession} wait --load networkidle`);

    // 步骤2: 填写登录表单
    console.log('📝 步骤2: 填写登录表单...');

    // 获取快照以找到表单元素
    const snapshot = await this.exec(`--session ${loginSession} snapshot`, { timeout: 10000 });

    // 使用 JavaScript 填写表单
    const fillFormScript = `
      (function() {
        // 查找用户名输入框（可能是 name="username" 或类似）
        const usernameInputs = document.querySelectorAll('input[type="text"], input[name*="user"], input[name*="name"], input[id*="user"]');
        const passwordInputs = document.querySelectorAll('input[type="password"]');

        let usernameField = null;
        let passwordField = null;

        // 查找用户名输入框
        for (const input of usernameInputs) {
          if (input.type === 'text' && !input.value) {
            usernameField = input;
            break;
          }
        }

        // 查找密码输入框
        for (const input of passwordInputs) {
          if (input.type === 'password' && !input.value) {
            passwordField = input;
            break;
          }
        }

        if (!usernameField || !passwordField) {
          return { success: false, error: '未找到用户名或密码输入框', usernameFound: !!usernameField, passwordFound: !!passwordField };
        }

        // 填写表单
        usernameField.value = '${userName}';
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));

        passwordField.value = '${userPasswd}';
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true, usernameField: usernameField.name || usernameField.id, passwordField: passwordField.name || passwordField.id };
      })()
    `;

    const fillTempFile = `/tmp/login_fill_${Date.now()}.js`;
    fs.writeFileSync(fillTempFile, fillFormScript, 'utf-8');

    try {
      const fillResult = await this.exec(`--session ${loginSession} eval --stdin < "${fillTempFile}"`, { timeout: 10000 });
      fs.unlinkSync(fillTempFile);
    } catch (e) {
      if (fs.existsSync(fillTempFile)) fs.unlinkSync(fillTempFile);
      // 继续尝试，可能只是警告
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // 步骤3: 提交登录
    console.log('🚀 步骤3: 提交登录...');

    const submitScript = `
      (function() {
        // 查找登录按钮
        const submitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"], button');
        let submitBtn = null;

        for (const btn of submitButtons) {
          const text = btn.textContent || btn.value || '';
          if ((btn.tagName === 'BUTTON' || btn.tagName === 'INPUT') &&
              (btn.type === 'submit' || text.includes('登录') || text.includes('登陆'))) {
            submitBtn = btn;
            break;
          }
        }

        // 如果找不到按钮，尝试提交表单
        if (!submitBtn) {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return { success: true, method: 'form_submit' };
          }
          return { success: false, error: '未找到登录按钮或表单' };
        }

        submitBtn.click();
        return { success: true, method: 'button_click' };
      })()
    `;

    const submitTempFile = `/tmp/login_submit_${Date.now()}.js`;
    fs.writeFileSync(submitTempFile, submitScript, 'utf-8');

    try {
      await this.exec(`--session ${loginSession} eval --stdin < "${submitTempFile}"`, { timeout: 10000 });
    } catch (e) {
      // 继续执行
    } finally {
      if (fs.existsSync(submitTempFile)) fs.unlinkSync(submitTempFile);
    }

    // 等待页面跳转
    await new Promise(resolve => setTimeout(resolve, 5000));
    await this.exec(`--session ${loginSession} wait --load networkidle`, { timeout: 15000 });

    // 步骤4: 验证登录成功
    try {
      const currentUrl = await this.exec(`--session ${loginSession} get url`, { timeout: 5000 });

      if (currentUrl.includes('login') || currentUrl.includes('sso')) {
        console.error('❌ 登录失败，仍在登录页面');
        await this.exec(`--session ${loginSession} close`, { timeout: 5000 });
        throw new Error('登录失败，仍在登录页面');
      }
    } catch (e) {
      // URL 检查失败，尝试通过快照验证
      const checkSnapshot = await this.exec(`--session ${loginSession} snapshot`, { timeout: 10000 });
      if (checkSnapshot.includes('登录') || checkSnapshot.includes('密码')) {
        console.error('❌ 登录失败，仍在登录页面');
        await this.exec(`--session ${loginSession} close`, { timeout: 5000 });
        throw new Error('登录失败，仍在登录页面');
      }
    }

    console.log('✅ 登录成功！');

    // 步骤5: 保存登录状态
    console.log('💾 步骤4: 保存登录状态...');

    const stateFile = this.config.stateFile;
    await this.exec(`--session ${loginSession} state save "${stateFile}"`, { timeout: 10000 });

    if (fs.existsSync(stateFile)) {
      const stats = fs.statSync(stateFile);
      console.log(`✅ 登录状态已保存到: ${stateFile}`);
      console.log(`   文件大小: ${(stats.size / 1024).toFixed(1)} KB`);
    } else {
      console.error('❌ 保存登录状态失败');
      await this.exec(`--session ${loginSession} close`, { timeout: 5000 });
      throw new Error('保存登录状态失败');
    }

    // 关闭登录会话
    await this.exec(`--session ${loginSession} close`, { timeout: 5000 });

    console.log('\n========================================');
    console.log('  ✅ 登录状态保存完成');
    console.log('========================================');
    console.log(`状态文件: ${stateFile}`);
    console.log('有效期: 约30分钟（取决于OA系统session配置）\n');

    // 验证并返回登录状态
    const status = await this.checkLoginValid();
    if (!status.valid) {
      throw new Error('登录状态验证失败');
    }

    return status;
  }

  async fetchTodoDetail(fdId, href) {
    const url = href.startsWith('http') ? href : `https://oa.xgd.com${href}`;
    await this.open(url);
    // 额外等待确保页面完全加载（处理重定向）
    await new Promise(resolve => setTimeout(resolve, 2000));
    return this.snapshot();
  }

  // Helper function to check if eval result contains success
  _checkSuccess(result) {
    return result.includes('"success": true') ||
           result.includes('"success":true') ||
           result.includes('success: true');
  }

  async approveMeeting(action) {
    // 等待页面完全渲染（移动网络可能需要更长时间）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 参考 approve_oa_todo_by_fdId.sh 的会议审批实现
    const selectActionJs = `(() => {
      const action = "${action}";
      const allInputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      const targetInput = Array.from(allInputs).find(input => {
        const label = input.closest('label') || document.querySelector('label[for="' + input.id + '"]');
        const labelText = label ? label.textContent.trim() : '';
        const value = input.value || '';
        return (action === '参加' && (labelText.includes('参加') || value.includes('参加'))) ||
               (action === '不参加' && (labelText.includes('不参加') || value.includes('不参加')));
      });
      if (targetInput) {
        targetInput.click();
        return { success: true, action: action };
      }
      return { success: false };
    })()`;

    const selectFile = `/tmp/approve_meeting_select_${Date.now()}.js`;
    fs.writeFileSync(selectFile, selectActionJs, 'utf-8');
    const selectResult = await this.exec(`--session ${this.session} eval --stdin < "${selectFile}"`, { timeout: 30000 });
    fs.unlinkSync(selectFile);

    const successMarker = JSON.stringify({ success: true });
    if (!this._checkSuccess(selectResult)) {
      throw new Error(`未找到会议选项: ${action}`);
    }

    // 点击提交按钮
    const submitJs = `(() => {
      let submitBtn = document.querySelector('.lui_toolbar_btn_l');
      if (!submitBtn) {
        const allElements = document.querySelectorAll('div, button, input[type="submit"], input[type="button"], a');
        submitBtn = Array.from(allElements).find(el => {
          const text = el.textContent.trim();
          const value = el.value || '';
          return (text === '提交' || text === '确定' || text === '保存' ||
                  value === '提交' || value === '确定' || value === '保存') &&
                 el.offsetParent !== null;
        });
      }
      if (submitBtn) {
        submitBtn.click();
        return { success: true };
      }
      return { success: false };
    })()`;

    const submitFile = `/tmp/approve_meeting_submit_${Date.now()}.js`;
    fs.writeFileSync(submitFile, submitJs, 'utf-8');
    const submitResult = await this.exec(`--session ${this.session} eval --stdin < "${submitFile}"`, { timeout: 30000 });
    fs.unlinkSync(submitFile);

    if (!this._checkSuccess(submitResult)) {
      throw new Error('未找到提交按钮');
    }

    await this.waitForLoad();
    return this.snapshot();
  }

  async approveEhr(action, comment = '') {
    // 等待页面完全渲染（移动网络可能需要更长时间）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // EHR 使用"同意"/"不同意"按钮
    const selectActionJs = `
      (() => {
        const action = "${action}";
        const allButtons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const targetBtn = allButtons.find(btn => btn.textContent.trim() === action);

        if (targetBtn) {
          if (targetBtn.disabled || targetBtn.classList.contains('disabled')) {
            return { success: false, error: '按钮已禁用' };
          }
          targetBtn.click();
          return { success: true, action: action };
        }

        return { success: false, availableButtons: allButtons.map(b => b.textContent.trim()) };
      })()
    `;

    const selectFile = `/tmp/approve_ehr_select_${Date.now()}.js`;
    fs.writeFileSync(selectFile, selectActionJs, 'utf-8');
    const selectResult = await this.exec(`--session ${this.session} eval --stdin < "${selectFile}"`, { timeout: 30000 });
    fs.unlinkSync(selectFile);

    if (!this._checkSuccess(selectResult)) {
      throw new Error(`未找到审批选项: ${action}`);
    }

    // 点击提交按钮
    const submitJs = `
      (() => {
        let submitBtn = document.querySelector('.lui_toolbar_btn_l');
        if (!submitBtn) {
          const allElements = document.querySelectorAll('div, button, input[type="submit"], input[type="button"], a');
          submitBtn = Array.from(allElements).find(el => {
            const text = el.textContent.trim();
            const value = el.value || '';
            return (text === '提交' || text === '确定' || text === '保存' ||
                    value === '提交' || value === '确定' || value === '保存') &&
                   el.offsetParent !== null;
          });
        }
        if (submitBtn) {
          submitBtn.click();
          return { success: true };
        }
        return { success: false };
      })()
    `;

    const submitFile = `/tmp/approve_ehr_submit_${Date.now()}.js`;
    fs.writeFileSync(submitFile, submitJs, 'utf-8');
    const submitResult = await this.exec(`--session ${this.session} eval --stdin < "${submitFile}"`, { timeout: 30000 });
    fs.unlinkSync(submitFile);

    if (!this._checkSuccess(submitResult)) {
      throw new Error('未找到提交按钮');
    }

    await this.waitForLoad();
    return this.snapshot();
  }

  async approveExpense(action, comment = '') {
    // 等待页面完全渲染（移动网络可能需要更长时间）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 步骤1: 点击审批按钮
    const clickScript = `
      (() => {
        const action = "${action}";
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const targetBtn = buttons.find(btn => btn.textContent.trim() === action);

        if (targetBtn) {
          if (targetBtn.disabled || targetBtn.classList.contains('disabled')) {
            return { success: false, error: '按钮已禁用，可能已处理' };
          }
          targetBtn.click();
          return { success: true, action: action };
        }

        return { success: false, error: '未找到' + action + '按钮' };
      })()
    `;

    const clickFile = `/tmp/approve_expense_click_${Date.now()}.js`;
    fs.writeFileSync(clickFile, clickScript, 'utf-8');
    const clickResult = await this.exec(`--session ${this.session} eval --stdin < "${clickFile}"`, { timeout: 30000 });
    fs.unlinkSync(clickFile);

    const successMarker = JSON.stringify({ success: true });
    if (!this._checkSuccess(clickResult)) {
      throw new Error(`未找到审批按钮: ${action}`);
    }

    // 步骤2: 如果是驳回，填写意见
    if (action === '驳回' && comment) {
      const commentScript = `
        (() => {
          const commentBox = document.querySelector('textarea[placeholder*="意见"], input[placeholder*="意见"]');
          if (commentBox) {
            commentBox.value = '${comment}';
            commentBox.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true };
          }
          return { success: false };
        })()
      `;
      const commentFile = `/tmp/approve_expense_comment_${Date.now()}.js`;
      fs.writeFileSync(commentFile, commentScript, 'utf-8');
      await this.exec(`--session ${this.session} eval --stdin < "${commentFile}"`, { timeout: 30000 });
      fs.unlinkSync(commentFile);
    }

    // 步骤3: 处理确认弹窗
    const confirmScript = `
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(btn =>
          btn.textContent.includes('确定') || btn.textContent.includes('确认')
        );
        if (confirmBtn) {
          confirmBtn.click();
          return { success: true };
        }
        return { success: false };
      })()
    `;

    const confirmFile = `/tmp/approve_expense_confirm_${Date.now()}.js`;
    fs.writeFileSync(confirmFile, confirmScript, 'utf-8');
    await this.exec(`--session ${this.session} eval --stdin < "${confirmFile}"`, { timeout: 30000 });
    fs.unlinkSync(confirmFile);

    await this.waitForLoad();
    return this.snapshot();
  }

  async approveWorkflow(action, comment = '') {
    // 参考 approve_oa_todo_by_fdId.sh 的实现
    // 使用文件方式传递 JavaScript（避免中文字符问题）
    const successMarker = JSON.stringify({ success: true });

    // 等待页面完全渲染（移动网络可能需要更长时间）
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 1. 点击审批动作的单选按钮
    // 注意：OA系统使用 value="handler_pass:通过", "handler_superRefuse:驳回" 等格式
    // 增加重试机制以适应网络延迟
    const clickRadioJs = `(() => {
      const action = "${action}";

      // 重试函数：等待元素出现并执行操作
      const tryClickRadio = (retries) => {
        const radioButtons = document.querySelectorAll('input[type="radio"]');
        const targetRadio = Array.from(radioButtons).find(radio => {
          const label = radio.closest('label') || document.querySelector('label[for="' + radio.id + '"]');
          const labelText = label ? label.textContent.trim() : '';
          const value = radio.value || '';
          // 匹配多种格式: "通过", "handler_pass:通过", "驳回", "handler_superRefuse:驳回"
          return labelText === action || value === action ||
                 labelText.includes(action) || value.includes(action) ||
                 value.includes('handler_' + action.toLowerCase()) ||
                 value.includes(action);
        });

        if (targetRadio) {
          targetRadio.click();
          return { success: true, action: action, value: targetRadio.value };
        }

        // 如果没找到且还有重试次数，继续重试
        if (retries > 0) {
          return { success: false, retry: true, remaining: retries };
        }

        return { success: false, availableRadios: radioButtons.length };
      };

      // 首次尝试
      let result = tryClickRadio(0);

      // 如果失败且允许重试，使用Promise重试
      if (!result.success && result.retry) {
        return new Promise(resolve => {
          let retries = 5; // 最多重试5次
          const interval = setInterval(() => {
            result = tryClickRadio(retries - 1);
            if (result.success || !result.retry || retries <= 0) {
              clearInterval(interval);
              resolve(result);
            }
            retries--;
          }, 500); // 每500ms重试一次
        });
      }

      return result;
    })()`;

    const radioFile = `/tmp/approve_radio_${Date.now()}.js`;
    fs.writeFileSync(radioFile, clickRadioJs, 'utf-8');
    // 增加超时时间以适应移动网络延迟
    const clickResult = await this.exec(`--session ${this.session} eval --stdin < "${radioFile}"`, { timeout: 30000 });
    fs.unlinkSync(radioFile);

    // 检查结果
    if (!this._checkSuccess(clickResult)) {
      console.error('页面返回:', clickResult);
      throw new Error(`未找到审批选项: ${action}`);
    }

    // 2. 如果是驳回操作，需要选择驳回节点
    if (action === '驳回') {
      const selectRejectNodeJs = `(() => {
        // 等待UI更新
        return new Promise(resolve => {
          setTimeout(() => {
            // 查找驳回节点下拉框
            const rejectSelect = document.querySelector('select[name="jumpToNodeIdSelectObj"]');
            if (rejectSelect && rejectSelect.offsetParent !== null) {
              // 默认选择第一个选项（通常是起草节点）
              if (rejectSelect.options.length > 0) {
                rejectSelect.selectedIndex = 0;
                rejectSelect.dispatchEvent(new Event('change', { bubbles: true }));
                resolve({ success: true, selectedNode: rejectSelect.value, nodeName: rejectSelect.options[0].text });
              } else {
                resolve({ success: false, error: 'No options available' });
              }
            } else {
              resolve({ success: false, error: 'Reject select not visible' });
            }
          }, 500);
        });
      })()`;

      const rejectFile = `/tmp/approve_reject_${Date.now()}.js`;
      fs.writeFileSync(rejectFile, selectRejectNodeJs, 'utf-8');
      const rejectResult = await this.exec(`--session ${this.session} eval --stdin < "${rejectFile}"`, { timeout: 10000 });
      fs.unlinkSync(rejectFile);

      if (!this._checkSuccess(rejectResult)) {
        throw new Error('无法选择驳回节点');
      }
    }

    // 3. 填写处理意见（如果有）
    if (comment) {
      const fillCommentJs = `(() => {
        const comment = "${comment}";
        const textareas = Array.from(document.querySelectorAll('textarea'));
        const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
        let commentField = null;
        const allLabels = Array.from(document.querySelectorAll('label, td'));
        for (let label of allLabels) {
          const labelText = label.textContent.trim();
          if (labelText.includes('意见') || labelText.includes('处理意见') || labelText.includes('审批意见')) {
            const parent = label.parentElement;
            if (parent) {
              const textarea = parent.querySelector('textarea');
              const input = parent.querySelector('input[type="text"]');
              const nextSibling = parent.nextElementSibling?.querySelector('textarea') ||
                                parent.nextElementSibling?.querySelector('input[type="text"]');
              commentField = textarea || input || nextSibling;
              if (commentField) break;
            }
          }
        }
        if (!commentField) {
          commentField = textareas[0] || textInputs[0];
        }
        if (commentField) {
          commentField.value = comment;
          commentField.dispatchEvent(new Event('input', { bubbles: true }));
          commentField.dispatchEvent(new Event('change', { bubbles: true }));
          commentField.blur();
          return { success: true };
        }
        return { success: false };
      })()`;

      const commentFile = `/tmp/approve_comment_${Date.now()}.js`;
      fs.writeFileSync(commentFile, fillCommentJs, 'utf-8');
      await this.exec(`--session ${this.session} eval --stdin < "${commentFile}"`, { timeout: 10000 });
      fs.unlinkSync(commentFile);
    }

    // 3. 点击提交按钮
    const submitJs = `(() => {
      let submitBtn = null;
      const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a');
      submitBtn = Array.from(allButtons).find(btn => {
        const text = btn.textContent.trim();
        const value = btn.value || '';
        return text === '提交' || value === '提交' ||
               text === '确定' || value === '确定';
      });
      if (submitBtn) {
        submitBtn.click();
        return { success: true };
      }
      return { success: false };
    })()`;

    const submitFile = `/tmp/approve_submit_${Date.now()}.js`;
    fs.writeFileSync(submitFile, submitJs, 'utf-8');
    const submitResult = await this.exec(`--session ${this.session} eval --stdin < "${submitFile}"`, { timeout: 10000 });
    fs.unlinkSync(submitFile);

    if (!this._checkSuccess(submitResult)) {
      throw new Error('未找到提交按钮');
    }

    await this.waitForLoad();
    return this.snapshot();
  }
}

module.exports = Browser;
