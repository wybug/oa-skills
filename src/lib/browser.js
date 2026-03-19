/**
 * Agent-Browser 封装模块
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class Browser {
  constructor(config, options = {}) {
    this.config = config;
    this.agentBrowser = options.debugMode ? 'npx agent-browser --headed' : 'npx agent-browser';
    this.session = `oa-todo-${Date.now()}`;
    this.debugMode = options.debugMode || false;
    this.debugInfo = {
      commands: [],
      errors: [],
      snapshots: []
    };
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
      const jsonStr = match[1];
      // 验证结果大小
      if (jsonStr.length > 10 * 1024 * 1024) { // 10MB
        throw new Error(`结果过大: ${jsonStr.length} 字节`);
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
    const selectResult = await this.exec(`--session ${this.session} eval --stdin < "${selectFile}"`, { timeout: 10000 });
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
    const submitResult = await this.exec(`--session ${this.session} eval --stdin < "${submitFile}"`, { timeout: 10000 });
    fs.unlinkSync(submitFile);

    if (!this._checkSuccess(submitResult)) {
      throw new Error('未找到提交按钮');
    }

    await this.waitForLoad();
    return this.snapshot();
  }

  async approveWorkflow(action, comment = '') {
    // 参考 approve_oa_todo_by_fdId.sh 的实现
    // 使用文件方式传递 JavaScript（避免中文字符问题）
    const successMarker = JSON.stringify({ success: true });

    // 等待页面完全渲染
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 1. 点击审批动作的单选按钮
    // 注意：OA系统使用 value="handler_pass:通过", "handler_superRefuse:驳回" 等格式
    const clickRadioJs = `(() => {
      const action = "${action}";
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
      return { success: false, availableRadios: radioButtons.length };
    })()`;

    const radioFile = `/tmp/approve_radio_${Date.now()}.js`;
    fs.writeFileSync(radioFile, clickRadioJs, 'utf-8');
    const clickResult = await this.exec(`--session ${this.session} eval --stdin < "${radioFile}"`, { timeout: 10000 });
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
