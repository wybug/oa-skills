#!/usr/bin/env node

/**
 * 通用流程审批 V2 - RPA 脚本
 *
 * 支持操作：
 *   通过：选择通过→填写处理意见→点击提交
 *   驳回：选择驳回→选择起草节点→必须填意见→点提交
 *   转办：选择转办→点击转办人员输入框→地址本弹窗搜索人员→选择人员(自动关闭)→填写意见→点提交
 *
 * 完成判断：界面上没有"提交"按钮
 *
 * 探索发现：
 *   - 操作选项：3个 radio button（LabelText 包裹），value 格式如 handler_superRefuse:驳回
 *   - 驳回节点：select name="jumpToNodeIdSelectObj"，选中驳回后出现
 *   - 转办人员：input#toOtherHandlerNames (readOnly)，点击触发地址本 iframe 弹窗
 *   - 地址本弹窗：iframe address_main.jsp，搜索框 placeholder="请输入关键字"，人员列表 LI 元素
 *   - 处理意见：textarea
 *   - 提交按钮：button "提交"
 */

const { ApprovalHelper, CONFIG } = require('./approvalHelper');

class WorkflowApprovalV2Helper extends ApprovalHelper {
  constructor(session, options = {}) {
    super(session, options);
  }

  /**
   * 检查页面是否可审批（是否有提交按钮和操作选项）
   */
  isApprovable() {
    const js = `
      (() => {
        // 查找提交按钮
        let submitBtn = Array.from(document.querySelectorAll('button'))
          .find(btn => btn.textContent.trim() === '提交' && btn.offsetParent !== null);
        if (!submitBtn) {
          submitBtn = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"]'))
            .find(btn => btn.value === '提交' && btn.offsetParent !== null);
        }

        // 查找操作单选按钮
        const radios = document.querySelectorAll('input[type="radio"]');
        const actions = [];
        radios.forEach(r => {
          const label = r.closest('label, .LabelText');
          const text = label ? label.textContent.trim() : '';
          if (['通过', '驳回', '转办'].includes(text)) {
            actions.push({ text, checked: r.checked });
          }
        });

        return {
          success: true,
          hasSubmitBtn: !!submitBtn,
          hasActionRadios: actions.length > 0,
          actions,
          approvable: !!submitBtn && actions.length > 0
        };
      })()
    `;
    const result = this.eval(js, { timeout: 10000 });
    if (!this._checkSuccess(result)) return false;
    const match = result.match(/"approvable"\s*:\s*(true|false)/);
    return match ? match[1] === 'true' : false;
  }

  /**
   * 选择操作类型（通过/驳回/转办）
   * 降级策略：label文本 → radio value → 包含匹配
   */
  selectAction(action) {
    const js = `
      (() => {
        const action = '${action}';
        const radios = document.querySelectorAll('input[type="radio"]');
        let target = null;
        let strategy = '';

        // 策略1: label 文本精确匹配
        target = Array.from(radios).find(r => {
          const label = r.closest('label, .LabelText');
          return label && label.textContent.trim() === action;
        });
        strategy = target ? 'labelText' : '';

        // 策略2: radio value 包含匹配（如 handler_superRefuse:驳回）
        if (!target) {
          target = Array.from(radios).find(r => (r.value || '').includes(action));
          strategy = target ? 'valueContains' : '';
        }

        // 策略3: label 文本包含匹配
        if (!target) {
          target = Array.from(radios).find(r => {
            const label = r.closest('label, .LabelText');
            return label && label.textContent.trim().includes(action);
          });
          strategy = target ? 'labelContains' : '';
        }

        if (target) {
          const debugInfo = { tagName: target.tagName, value: target.value };
          target.click();
          return { success: true, action, strategy, debugInfo };
        }

        return { success: false, error: '未找到操作单选按钮: ' + action };
      })()
    `;
    const result = this.eval(js, { timeout: 10000 });
    if (!this._checkSuccess(result)) {
      throw new Error(`未找到操作单选按钮: ${action}`);
    }
    return result;
  }

  /**
   * 选择驳回目标节点
   * select name="jumpToNodeIdSelectObj"，降级策略：起草节点→第一个选项
   */
  selectRejectNode(nodeName) {
    const js = `
      (() => {
        const nodeName = ${JSON.stringify(nodeName || '')};
        // 按name查找
        let sel = document.querySelector('select[name="jumpToNodeIdSelectObj"]');
        // 降级：查找含"节点"选项的select
        if (!sel || sel.offsetParent === null) {
          sel = null;
          for (const s of document.querySelectorAll('select')) {
            if (s.offsetParent === null) continue;
            if (Array.from(s.options).some(o => o.textContent.includes('节点'))) { sel = s; break; }
          }
        }

        if (!sel) return { success: false, error: '未找到驳回到下拉框' };

        const options = Array.from(sel.options);
        let opt = null;
        if (nodeName) opt = options.find(o => o.textContent.includes(nodeName));
        if (!opt) opt = options.find(o => o.textContent.includes('起草'));
        if (!opt && options.length > 0) opt = options[0];

        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, selectedNode: opt.textContent.trim(), strategy: 'select' };
        }
        return { success: false, error: '未找到可选节点' };
      })()
    `;
    return this.eval(js, { timeout: 10000 });
  }

  /**
   * 转办人员选择
   * 点击 toOtherHandlerNames 输入框触发地址本 iframe 弹窗，
   * 在 iframe 中搜索并选择人员
   */
  selectTransferPerson(personName) {
    // 步骤1: 点击转办人员输入框触发地址本弹窗
    const triggerJs = `
      (() => {
        const inp = document.querySelector('#toOtherHandlerNames');
        if (!inp) return { success: false, error: '未找到转办人员输入框' };
        inp.click();
        inp.focus();
        return { success: true, triggered: true };
      })()
    `;
    const triggerResult = this.eval(triggerJs, { timeout: 10000 });
    if (!this._checkSuccess(triggerResult)) {
      throw new Error('转办人员输入框点击失败');
    }

    // 等待地址本弹窗加载
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 注意：这里无法用 await，因为 selectTransferPerson 是同步调用的 eval
    // 改为在 approve() 中调用前后加 sleep

    // 步骤2: 在地址本 iframe 中搜索并选择人员
    const searchAndSelectJs = `
      (() => {
        const personName = ${JSON.stringify(personName)};
        // 查找地址本 iframe
        const iframes = Array.from(document.querySelectorAll('iframe'));
        let addrDoc = null;
        for (const iframe of iframes) {
          if (iframe.src && iframe.src.includes('address_main') && iframe.offsetParent !== null) {
            try {
              addrDoc = iframe.contentDocument || iframe.contentWindow.document;
              if (addrDoc) break;
            } catch(e) {}
          }
        }
        if (!addrDoc) return { success: false, error: '地址本弹窗未出现' };

        // 查找搜索输入框
        let searchInput = null;
        const inputs = addrDoc.querySelectorAll('input[type="text"], input:not([type])');
        for (const inp of inputs) {
          if (inp.offsetParent !== null && (inp.placeholder?.includes('关键字') || inp.className?.includes('form-control'))) {
            searchInput = inp;
            break;
          }
        }
        // 降级：第一个可见输入框
        if (!searchInput) {
          for (const inp of inputs) {
            if (inp.offsetParent !== null) { searchInput = inp; break; }
          }
        }

        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
          searchInput.value = personName;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));
          searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));
        }

        return { success: true, searched: true, hasSearchInput: !!searchInput };
      })()
    `;
    const searchResult = this.eval(searchAndSelectJs, { timeout: 15000 });
    if (!this._checkSuccess(searchResult)) {
      throw new Error('地址本搜索输入失败');
    }

    // 步骤3: 等待搜索结果，选择匹配人员
    const selectJs = `
      (() => {
        const personName = ${JSON.stringify(personName)};
        const iframes = Array.from(document.querySelectorAll('iframe'));
        let addrDoc = null;
        for (const iframe of iframes) {
          if (iframe.src && iframe.src.includes('address_main') && iframe.offsetParent !== null) {
            try {
              addrDoc = iframe.contentDocument || iframe.contentWindow.document;
              if (addrDoc) break;
            } catch(e) {}
          }
        }
        if (!addrDoc) return { success: false, error: '地址本弹窗已关闭' };

        // 查找人员列表项
        const items = addrDoc.querySelectorAll('li, [class*="item"]');
        let target = null;
        for (const item of items) {
          const text = item.textContent?.trim() || '';
          if (text.includes(personName)) {
            target = item;
            break;
          }
        }

        if (target) {
          const debugInfo = {
            tagName: target.tagName,
            textContent: target.textContent.trim().substring(0, 50)
          };
          target.click();
          return { success: true, selectedPerson: personName, strategy: 'liClick', debugInfo };
        }
        return { success: false, error: '未找到人员: ' + personName };
      })()
    `;
    const selectResult = this.eval(selectJs, { timeout: 15000 });
    if (!this._checkSuccess(selectResult)) {
      // 找不到转办人，先关闭地址本弹窗，再抛出错误终止审批
      this._closeAddressBook();
      throw new Error(`转办人员选择失败，未找到: ${personName}，审批已终止`);
    }

    // 步骤4: 关闭地址本弹窗（如果未自动关闭）
    const closeJs = `
      (() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          if (iframe.src && iframe.src.includes('address_main')) {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const closeBtn = Array.from(doc.querySelectorAll('button, a, span'))
                    .find(el => ['关闭', '取消', '×'].includes(el.textContent?.trim()));
              if (closeBtn && closeBtn.offsetParent !== null) {
                closeBtn.click();
                return { success: true, closed: true };
              }
            } catch(e) {}
          }
        }
        return { success: true, info: '弹窗可能已自动关闭' };
      })()
    `;
    this.eval(closeJs, { timeout: 5000 });

    return selectResult;
  }

  /**
   * 关闭地址本弹窗（内部方法）
   */
  _closeAddressBook() {
    const closeJs = `
      (() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          if (!iframe.src || !iframe.src.includes('address_main')) continue;
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const closeBtn = Array.from(doc.querySelectorAll('button, a, span, div'))
              .find(el => ['关闭', '取消', '×'].includes(el.textContent?.trim()) && el.offsetParent !== null);
            if (closeBtn) { closeBtn.click(); return { success: true, closed: true }; }
          } catch(e) {}
        }
        // 降级：点击页面上的关闭元素
        const closeEl = Array.from(document.querySelectorAll('div, span, a'))
          .find(el => ['关闭', '×'].includes(el.textContent?.trim()) && el.offsetParent !== null);
        if (closeEl) { closeEl.click(); return { success: true, closed: true }; }
        return { success: true, info: '无需关闭' };
      })()
    `;
    this.eval(closeJs, { timeout: 5000 });
  }

  /**
   * 填写处理意见
   */
  fillComment(comment) {
    const js = `
      (() => {
        const comment = ${JSON.stringify(comment || '')};
        let target = null;
        let strategy = '';

        // 策略1: 通过父元素文本查找（意见/处理意见/审批意见）
        const labels = Array.from(document.querySelectorAll('label, td, th, .LabelText'));
        for (const label of labels) {
          const t = label.textContent.trim();
          if (t.includes('意见') || t.includes('处理意见') || t.includes('审批意见')) {
            const parent = label.parentElement;
            if (parent) {
              const ta = parent.querySelector('textarea');
              const inp = parent.querySelector('input[type="text"]');
              const nextTa = parent.nextElementSibling?.querySelector('textarea');
              const nextInp = parent.nextElementSibling?.querySelector('input[type="text"]');
              target = ta || inp || nextTa || nextInp;
              if (target && target.offsetParent !== null) { strategy = 'parentLabel'; break; }
            }
          }
        }

        // 策略2: 查找第一个可见 textarea
        if (!target) {
          for (const ta of document.querySelectorAll('textarea')) {
            if (ta.offsetParent !== null && ta.offsetHeight > 0) { target = ta; strategy = 'visibleTextarea'; break; }
          }
        }

        // 策略3: contentEditable div
        if (!target) {
          for (const el of document.querySelectorAll('[contenteditable="true"]')) {
            if (el.offsetParent !== null) { target = el; strategy = 'contentEditable'; break; }
          }
        }

        if (target) {
          if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
            target.value = comment;
            target.dispatchEvent(new Event('focus', { bubbles: true }));
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            target.dispatchEvent(new Event('blur', { bubbles: true }));
          } else {
            target.textContent = comment;
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return { success: true, strategy, value: comment };
        }
        return { success: false, error: '未找到意见输入框' };
      })()
    `;
    return this.eval(js, { timeout: 10000 });
  }

  /**
   * 点击提交按钮
   */
  clickSubmit() {
    const js = `
      (() => {
        let btn = null;
        let strategy = '';

        // 策略1: button 文本
        btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim() === '提交' && b.offsetParent !== null);
        strategy = btn ? 'button-text' : '';

        // 策略2: input[type="button"] value
        if (!btn) {
          btn = Array.from(document.querySelectorAll('input[type="button"]'))
            .find(b => b.value === '提交' && b.offsetParent !== null);
          strategy = btn ? 'input-button' : '';
        }

        // 策略3: input[type="submit"] value
        if (!btn) {
          btn = Array.from(document.querySelectorAll('input[type="submit"]'))
            .find(b => b.value === '提交' && b.offsetParent !== null);
          strategy = btn ? 'input-submit' : '';
        }

        // 策略4: 降级查找
        if (!btn) {
          btn = Array.from(document.querySelectorAll('div, span, a'))
            .find(el => el.textContent.trim() === '提交' && el.offsetParent !== null);
          strategy = btn ? 'fallback' : '';
        }

        if (btn) {
          const debugInfo = {
            tagName: btn.tagName, className: btn.className, id: btn.id,
            textContent: btn.textContent?.trim().substring(0, 50)
          };
          btn.click();
          return { success: true, clicked: '提交', strategy, debugInfo };
        }
        return { success: false, error: '未找到提交按钮' };
      })()
    `;
    return this.eval(js, { timeout: 10000 });
  }

  /**
   * 恢复初始状态（测试模式用）
   */
  restoreState() {
    const js = `
      (() => {
        const radios = document.querySelectorAll('input[type="radio"]');
        const passRadio = Array.from(radios).find(r => {
          const label = r.closest('label, .LabelText');
          return label && label.textContent.trim() === '通过';
        });
        if (passRadio) passRadio.click();

        for (const ta of document.querySelectorAll('textarea')) {
          if (ta.offsetParent !== null && ta.offsetHeight > 0) {
            ta.value = '';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        return { success: true, restored: true };
      })()
    `;
    return this.eval(js, { timeout: 10000 });
  }

  /**
   * 执行审批操作
   * @param {string} action - 审批动作：通过/驳回/转办
   * @param {string} comment - 审批意见
   * @param {Object} options - 选项
   *   @param {boolean} options.submit - 是否真实提交（默认 true）
   *   @param {boolean} options.debug - 是否输出调试日志
   *   @param {string} options.rejectNode - 驳回目标节点名称
   *   @param {string} options.transferTo - 转办目标人员姓名
   */
  async approve(action, comment, options = {}) {
    const { submit = true, debug = this.debug } = options;

    if (debug) console.log(`[WorkflowV2] 开始审批: ${action}`);

    // 步骤1：检查页面状态
    if (!this.isApprovable()) {
      throw new Error('页面不可审批（未找到提交按钮或操作选项）');
    }
    if (debug) console.log('  ✓ 页面状态检查通过');

    // 步骤2：选择操作类型
    const selectResult = this.selectAction(action);
    if (!this._checkSuccess(selectResult)) {
      throw new Error(`选择操作失败: ${action}`);
    }
    if (debug) {
      const m = selectResult.match(/"strategy"\s*:\s*"([^"]+)"/);
      console.log(`  ✓ 已选择操作: ${action} (策略: ${m?.[1] || 'unknown'})`);
    }

    await this.sleep(CONFIG.delays.afterClick);

    // 步骤3：驳回时选择目标节点
    if (action === '驳回') {
      const rejectResult = this.selectRejectNode(options.rejectNode || '');
      if (this._checkSuccess(rejectResult)) {
        if (debug) {
          const nm = rejectResult.match(/"selectedNode"\s*:\s*"([^"]+)"/);
          console.log(`  ✓ 已选择驳回节点: ${nm?.[1] || 'default'}`);
        }
      } else if (debug) {
        console.log('  ⚠ 驳回节点选择可能失败');
      }
      await this.sleep(CONFIG.delays.afterClick);
    }

    // 步骤4：转办时选择转办人员
    if (action === '转办' && options.transferTo) {
      if (debug) console.log(`  → 搜索转办人员: ${options.transferTo}`);
      await this.sleep(CONFIG.delays.afterClick);
      this.selectTransferPerson(options.transferTo);
      await this.sleep(CONFIG.delays.afterClick);

      // 验证转办人员是否已填入
      const verifyJs = `
        (() => {
          const inp = document.querySelector('#toOtherHandlerNames');
          return { success: true, value: inp?.value || '' };
        })()
      `;
      const verifyResult = this.eval(verifyJs, { timeout: 5000 });
      const valueMatch = verifyResult?.match(/"value"\s*:\s*"([^"]+)"/);
      if (debug) {
        console.log(`  ✓ 转办人员已填入: ${valueMatch?.[1] || 'unknown'}`);
      }
    }

    // 步骤5：填写处理意见
    if (comment) {
      const commentResult = this.fillComment(comment);
      if (this._checkSuccess(commentResult)) {
        if (debug) {
          const m = commentResult.match(/"strategy"\s*:\s*"([^"]+)"/);
          console.log(`  ✓ 已填写审批意见 (策略: ${m?.[1] || 'unknown'})`);
        }
      } else if (action === '驳回') {
        throw new Error('驳回操作必须填写意见，但填写意见失败');
      } else if (debug) {
        console.log('  ⚠ 填写意见可能失败');
      }
      await this.sleep(CONFIG.delays.afterInput);
    } else if (action === '驳回') {
      throw new Error('驳回操作必须填写意见');
    }

    // 步骤6：提交或恢复状态
    if (submit) {
      if (debug) console.log('  → 点击提交按钮...');
      const submitResult = this.clickSubmit();
      if (!this._checkSuccess(submitResult)) {
        throw new Error('未找到提交按钮');
      }
      if (debug) {
        const m = submitResult.match(/"strategy"\s*:\s*"([^"]+)"/);
        console.log(`  ✓ 已点击提交按钮 (策略: ${m?.[1] || 'unknown'})`);
      }
    } else {
      if (debug) console.log('  → 测试模式：恢复状态...');
      this.restoreState();
      if (debug) console.log('  ✓ 已恢复初始状态');
    }

    await this.waitForLoad();
    return { success: true, action, comment };
  }
}

module.exports = { WorkflowApprovalV2Helper, CONFIG };
