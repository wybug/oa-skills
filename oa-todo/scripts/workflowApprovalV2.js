#!/usr/bin/env node

/**
 * 通用流程审批助手 V2
 *
 * 严格按照 rpa-generator-prompt.md 生成
 *
 * 用户确认的操作步骤:
 * - 通过: 选择通过 → 填写处理意见 → 点击提交
 * - 驳回: 选择驳回 → 等待界面选择起草节点 → 必须填意见 → 点提交
 * - 转办: 选转办 → 在弹出界面中输入转办人，选择对应人员（自动关闭）→ 填写处理意见 → 点击提交
 *
 * 完成判断: 界面上没有"提交"按钮
 *
 * 探索发现:
 * - Radio 按钮: input[type="radio"][name="oprGroup"]，通过 label 文本匹配
 * - 起草节点: select[name="jumpToNodeIdSelectObj"]（驳回时出现）
 * - 意见输入框: textarea（多种策略降级查找）
 * - 提交按钮: button 文本匹配"提交"
 * - 转办人员输入框: input#toOtherHandlerNames 或 input.inputSgl
 * - 地址本弹窗: iframe[src*="address"]，内含搜索输入框和 LI 列表项
 */

const { ApprovalHelper, CONFIG } = require('./approvalHelper');

class WorkflowApprovalV2Helper extends ApprovalHelper {
  constructor(session, options = {}) {
    super(session, options);
  }

  /**
   * 检查待办是否可以审批
   * @returns {Promise<{isApprovable: boolean, status: string}>}
   */
  async isApprovable() {
    const checkJs = String.raw`
      (() => {
        const submitBtn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
          .find(btn => {
            const text = btn.textContent?.trim() || btn.value;
            return text === '提交' && btn.offsetParent !== null;
          });

        const radios = document.querySelectorAll('input[type="radio"][name="oprGroup"]');
        const hasRadios = radios.length > 0;
        const hasSubmit = !!submitBtn;

        return {
          success: true,
          isApprovable: hasSubmit && hasRadios,
          hasSubmitBtn: hasSubmit,
          hasRadios: hasRadios,
          status: hasSubmit ? 'pending' : 'processed'
        };
      })()
    `;

    const result = this.eval(checkJs, { timeout: 10000 });

    if (this._checkSuccess(result)) {
      const isApprovableMatch = result.match(/"isApprovable":\s*(true|false)/);
      const statusMatch = result.match(/"status":\s*"([^"]+)"/);

      return {
        isApprovable: isApprovableMatch?.[1] === 'true',
        status: statusMatch?.[1] || 'unknown'
      };
    }

    return { isApprovable: false, status: 'unknown' };
  }

  /**
   * 获取页面状态
   * @returns {Promise<{hasButtons: boolean, status: string}>}
   */
  async getPageStatus() {
    const statusJs = String.raw`
      (() => {
        const submitBtn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
          .find(btn => {
            const text = btn.textContent?.trim() || btn.value;
            return text === '提交' && btn.offsetParent !== null;
          });

        const radios = document.querySelectorAll('input[type="radio"][name="oprGroup"]');
        const actions = [];
        radios.forEach(r => {
          const label = r.closest('label, .LabelText, span, div');
          const text = label ? label.textContent.trim() : '';
          if (['通过', '驳回', '转办'].includes(text)) {
            actions.push({ text, checked: r.checked });
          }
        });

        const hasButtons = !!submitBtn && actions.length > 0;

        return {
          success: true,
          hasButtons,
          hasSubmitBtn: !!submitBtn,
          actions
        };
      })()
    `;

    const result = this.eval(statusJs, { timeout: 10000 });

    if (this._checkSuccess(result)) {
      const hasButtonsMatch = result.match(/"hasButtons":\s*(true|false)/);

      return {
        hasButtons: hasButtonsMatch?.[1] === 'true',
        status: hasButtonsMatch?.[1] === 'true' ? 'pending' : 'processed'
      };
    }

    return { hasButtons: false, status: 'unknown' };
  }

  /**
   * 选择审批动作单选按钮（通过/驳回/转办）
   * @param {string} action - "通过" | "驳回" | "转办"
   * @returns {string} eval 结果字符串
   */
  _clickActionRadio(action) {
    const clickRadioJs = String.raw`
      (() => {
        const actionText = "${action}";
        let targetRadio = null;
        let strategy = '';

        // 策略0: 通过 label 文本查找 radio
        const radios = document.querySelectorAll('input[type="radio"][name="oprGroup"]');
        for (const radio of radios) {
          const label = radio.closest('label, .LabelText, span, div');
          if (label && label.textContent.trim().includes(actionText)) {
            targetRadio = radio;
            strategy = 'radio-label';
            break;
          }
        }

        // 策略1: 通过 radio 的 value 属性查找
        if (!targetRadio) {
          const valueMap = { '通过': 'pass', '驳回': 'reject', '转办': 'transfer' };
          const keyword = valueMap[actionText] || actionText;
          for (const radio of radios) {
            if (radio.value && radio.value.includes(keyword)) {
              targetRadio = radio;
              strategy = 'radio-value';
              break;
            }
          }
        }

        // 策略2: 在所有 radio 中通过父元素文本查找
        if (!targetRadio) {
          const allRadios = document.querySelectorAll('input[type="radio"]');
          for (const radio of allRadios) {
            const parent = radio.parentElement;
            if (parent && parent.textContent.trim().includes(actionText)) {
              targetRadio = radio;
              strategy = 'radio-parent';
              break;
            }
          }
        }

        if (targetRadio) {
          targetRadio.click();
          // 触发 change 事件
          targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, selected: actionText, strategy };
        }

        return { success: false, error: '未找到审批动作选项: ' + actionText };
      })()
    `;

    const result = this.eval(clickRadioJs, { timeout: 10000 });

    if (!this._checkSuccess(result)) {
      throw new Error(`未找到审批动作选项: ${action}`);
    }

    return result;
  }

  /**
   * 选择起草节点（驳回时需要）
   * @returns {string} eval 结果字符串
   */
  _selectDraftNode() {
    const selectNodeJs = String.raw`
      (() => {
        // 策略0: 通过 name 属性查找
        let select = document.querySelector('select[name="jumpToNodeIdSelectObj"]');

        // 策略1: 查找可见的 select 元素
        if (!select) {
          const selects = document.querySelectorAll('select');
          for (const sel of selects) {
            if (sel.offsetParent !== null && sel.options.length > 1) {
              select = sel;
              break;
            }
          }
        }

        if (!select || select.offsetParent === null) {
          return { success: false, error: '驳回节点下拉框未出现' };
        }

        const options = Array.from(select.options);
        // 优先选择包含"起草"的选项
        let targetOption = options.find(o => o.textContent.includes('起草'));
        if (!targetOption && options.length > 0) {
          // 降级：选择第一个非空选项
          targetOption = options.find(o => o.value && o.value.trim() !== '') || options[0];
        }

        if (targetOption) {
          select.value = targetOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return {
            success: true,
            selectedNode: targetOption.textContent.trim(),
            strategy: 'select-option'
          };
        }

        return { success: false, error: '无可选节点' };
      })()
    `;

    const result = this.eval(selectNodeJs, { timeout: 10000 });

    if (!this._checkSuccess(result)) {
      throw new Error('驳回节点下拉框未出现或无法选择');
    }

    return result;
  }

  /**
   * 点击转办人员输入框，触发地址本弹窗
   * @returns {string} eval 结果字符串
   */
  _clickTransferInput() {
    const clickInputJs = String.raw`
      (() => {
        // 策略0: 通过 id 查找
        let input = document.querySelector('#toOtherHandlerNames');

        // 策略1: 通过 class 查找
        if (!input) {
          input = document.querySelector('input.inputSgl');
        }

        // 策略2: 查找可见的 readonly input（转办人员输入框通常是 readonly）
        if (!input) {
          const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
          for (const inp of inputs) {
            if (inp.offsetParent !== null && (inp.readOnly || inp.placeholder?.includes('人员') || inp.placeholder?.includes('选择'))) {
              input = inp;
              break;
            }
          }
        }

        if (input) {
          input.click();
          input.focus();
          const debugInfo = {
            tagName: input.tagName,
            id: input.id,
            className: input.className,
            value: input.value,
            readOnly: input.readOnly
          };
          return { success: true, clicked: true, debugInfo };
        }

        return { success: false, error: '未找到转办人员输入框' };
      })()
    `;

    const result = this.eval(clickInputJs, { timeout: 10000 });

    if (!this._checkSuccess(result)) {
      throw new Error('未找到转办人员输入框');
    }

    return result;
  }

  /**
   * 在地址本弹窗中搜索并选择转办人员
   * @param {string} personName - 人员姓名
   * @returns {string} eval 结果字符串
   * @throws 人员未找到时关闭弹窗并抛出错误
   */
  _selectTransferPerson(personName) {
    if (!personName) {
      throw new Error('转办操作必须指定转办人员');
    }

    const searchAndSelectJs = String.raw`
      (() => {
        const personName = ${JSON.stringify(personName)};
        const iframes = Array.from(document.querySelectorAll('iframe'));

        for (const iframe of iframes) {
          // 只检查地址本 iframe
          if (!iframe.src || !iframe.src.includes('address')) continue;

          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;

            // 查找搜索输入框
            let searchInput = null;
            const inputs = doc.querySelectorAll('input[type="text"], input:not([type])');
            for (const inp of inputs) {
              if (inp.offsetParent !== null) {
                searchInput = inp;
                break;
              }
            }
            if (!searchInput && inputs.length > 0) {
              searchInput = inputs[0];
            }

            if (searchInput) {
              searchInput.value = '';
              searchInput.focus();
              searchInput.value = personName;
              searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              searchInput.dispatchEvent(new Event('change', { bubbles: true }));
              searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));
            }

            // 查找并点击匹配人员
            const items = doc.querySelectorAll('LI, li, [class*="person"], [class*="item"]');
            for (const item of items) {
              if (item.offsetParent !== null && item.textContent.includes(personName)) {
                item.click();
                return { success: true, selectedPerson: personName, strategy: 'liClick' };
              }
            }

            // 搜索已输入但未找到匹配人员
            return {
              success: false,
              error: '搜索结果中未找到人员: ' + personName,
              searched: !!searchInput
            };
          } catch (e) {
            return { success: false, error: '跨域限制: ' + e.message };
          }
        }

        return { success: false, error: '未找到地址本弹窗iframe' };
      })()
    `;

    const result = this.eval(searchAndSelectJs, { timeout: 15000 });

    if (!this._checkSuccess(result)) {
      // 关闭可能残留的弹窗
      this._closeAddressBook();
      throw new Error(`转办人员选择失败，未找到: ${personName}，审批已终止`);
    }

    return result;
  }

  /**
   * 关闭地址本弹窗
   */
  _closeAddressBook() {
    const closeJs = String.raw`
      (() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          if (!iframe.src || !iframe.src.includes('address')) continue;
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const closeBtn = Array.from(doc.querySelectorAll('button, a, span, div'))
              .find(el => {
                const t = el.textContent?.trim();
                return (t === '关闭' || t === '取消' || t === '×') && el.offsetParent !== null;
              });
            if (closeBtn) {
              closeBtn.click();
              return { success: true, closedFrom: 'iframe' };
            }
          } catch (e) {}
        }

        // 降级到主文档查找关闭按钮
        const mainCloseBtn = Array.from(document.querySelectorAll('button, a, span, div'))
          .find(el => {
            const t = el.textContent?.trim();
            return (t === '关闭' || t === '取消') && el.offsetParent !== null;
          });
        if (mainCloseBtn) {
          mainCloseBtn.click();
          return { success: true, closedFrom: 'main' };
        }

        return { success: true, info: '无需关闭' };
      })()
    `;

    this.eval(closeJs, { timeout: 5000 });
  }

  /**
   * 填写处理意见
   * @param {string} comment - 处理意见
   * @returns {string} eval 结果字符串
   */
  _fillComment(comment) {
    const commentToUse = comment || '同意';

    const commentJs = String.raw`
      (() => {
        const comment = "${commentToUse}";
        let targetBox = null;
        let strategy = '';

        // 策略0: 通过 placeholder 查找
        const allTextareas = Array.from(document.querySelectorAll('textarea'));
        targetBox = allTextareas.find(box => box.placeholder?.includes('意见'));
        if (targetBox) strategy = 'placeholder';

        // 策略1: 通过父元素/兄弟元素文本查找
        if (!targetBox) {
          const allLabels = Array.from(document.querySelectorAll('label, td, .LabelText, th'));
          for (const label of allLabels) {
            const t = label.textContent.trim();
            if (t.includes('意见') || t.includes('处理意见')) {
              const parent = label.parentElement;
              if (parent) {
                targetBox = parent.querySelector('textarea') || parent.querySelector('input[type="text"]');
                if (!targetBox) {
                  targetBox = parent.nextElementSibling?.querySelector('textarea') ||
                              parent.nextElementSibling?.querySelector('input[type="text"]');
                }
              }
              if (targetBox && targetBox.offsetParent !== null) {
                strategy = 'labelText';
                break;
              }
              targetBox = null;
            }
          }
        }

        // 策略2: 查找第一个可见 textarea（降级）
        if (!targetBox) {
          for (const ta of allTextareas) {
            if (ta.offsetParent !== null && ta.offsetHeight > 0) {
              targetBox = ta;
              strategy = 'visibleTextarea';
              break;
            }
          }
        }

        // 策略3: 查找 class 包含 review/content 的 textarea
        if (!targetBox) {
          targetBox = document.querySelector('textarea.process_review_content, textarea[class*="review"], textarea[class*="comment"]');
          if (targetBox) strategy = 'className';
        }

        if (targetBox) {
          targetBox.value = comment;
          targetBox.selectionStart = 0;
          targetBox.selectionEnd = comment.length;
          targetBox.dispatchEvent(new Event('focus', { bubbles: true }));
          targetBox.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
          targetBox.dispatchEvent(new Event('input', { bubbles: true }));
          targetBox.dispatchEvent(new Event('change', { bubbles: true }));
          targetBox.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, strategy, value: comment };
        }

        return { success: false, error: '未找到意见输入框' };
      })()
    `;

    const result = this.eval(commentJs, { timeout: 10000 });

    if (!this._checkSuccess(result)) {
      throw new Error('未找到意见输入框（意见为必填项）');
    }

    return result;
  }

  /**
   * 点击提交按钮
   * @returns {string} eval 结果字符串
   */
  _clickSubmit() {
    const submitJs = String.raw`
      (() => {
        let targetBtn = null;
        let strategy = '';

        // 策略0: 通过 className 查找
        targetBtn = document.querySelector('button.process_review_button, span.process_review_button');
        if (targetBtn && targetBtn.offsetParent !== null) {
          strategy = 'className';
        } else {
          targetBtn = null;
        }

        // 策略1: 按文本内容查找 button
        if (!targetBtn) {
          const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
          for (const btn of buttons) {
            const text = btn.textContent?.trim() || btn.value;
            if (text === '提交' && btn.offsetParent !== null) {
              targetBtn = btn;
              strategy = 'textContent';
              break;
            }
          }
        }

        // 策略2: 按类名模糊匹配
        if (!targetBtn) {
          const classElements = document.querySelectorAll('[class*="submit"], [class*="btn"]');
          for (const el of classElements) {
            if (el.textContent?.trim() === '提交' && el.offsetParent !== null) {
              targetBtn = el;
              strategy = 'classNameFuzzy';
              break;
            }
          }
        }

        // 策略3: 降级查找任何包含"提交"文本的可点击元素
        if (!targetBtn) {
          const allElements = document.querySelectorAll('div, button, a, span, input');
          for (const el of allElements) {
            if (el.offsetParent === null) continue;
            const text = el.textContent?.trim() || el.value;
            if (text === '提交') {
              targetBtn = el;
              strategy = 'fallback';
              break;
            }
          }
        }

        if (targetBtn) {
          const debugInfo = {
            tagName: targetBtn.tagName,
            className: targetBtn.className,
            id: targetBtn.id,
            textContent: targetBtn.textContent?.trim().substring(0, 50)
          };
          targetBtn.click();
          return { success: true, clicked: '提交', strategy, debugInfo };
        }

        return { success: false, error: '未找到提交按钮' };
      })()
    `;

    const result = this.eval(submitJs, { timeout: 30000 });

    if (!this._checkSuccess(result)) {
      throw new Error('未找到提交按钮');
    }

    return result;
  }

  /**
   * 点击取消按钮（测试模式用）
   * @returns {string} eval 结果字符串
   */
  _clickCancel() {
    const cancelJs = String.raw`
      (() => {
        // 策略0: 在主文档中查找取消按钮
        const mainButtons = document.querySelectorAll('button, input[type="button"]');
        for (const btn of mainButtons) {
          const text = btn.textContent?.trim() || btn.value;
          if ((text === '取消' || text === '关闭') && btn.offsetParent !== null) {
            btn.click();
            return { success: true, strategy: 'main' };
          }
        }

        // 策略1: 在 iframe 中查找取消按钮
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const cancelBtn = Array.from(doc.querySelectorAll('button, a, span, div'))
              .find(el => {
                const t = el.textContent?.trim();
                return (t === '取消' || t === '关闭') && el.offsetParent !== null;
              });
            if (cancelBtn) {
              cancelBtn.click();
              return { success: true, strategy: 'iframe' };
            }
          } catch (e) {}
        }

        // 策略2: 降级查找任何可点击元素
        const allElements = document.querySelectorAll('div, button, a, span');
        for (const el of allElements) {
          const t = el.textContent?.trim();
          if ((t === '取消' || t === '关闭') && el.offsetParent !== null) {
            el.click();
            return { success: true, strategy: 'fallback' };
          }
        }

        return { success: true, strategy: 'none', info: '无取消按钮可点击' };
      })()
    `;

    const result = this.eval(cancelJs, { timeout: 15000 });
    return result;
  }

  /**
   * 执行审批操作
   * @param {string} action - 审批动作 ("通过" | "驳回" | "转办")
   * @param {string} comment - 审批意见
   * @param {Object} options - 选项
   *   @param {boolean} options.submit - 是否真实提交（默认 true）
   *   @param {boolean} options.debug - 是否输出调试日志（默认 false）
   *   @param {string} options.transferTo - 转办人员姓名（转办时必填）
   * @returns {Promise<{success: boolean, action: string, comment?: string}>}
   */
  async approve(action, comment, options = {}) {
    const { submit = true, debug = this.debug, transferTo } = options;

    if (debug) console.log(`[WorkflowApprovalV2] 开始审批: ${action}`);

    // 步骤1: 选择审批动作（通过/驳回/转办）
    if (debug) console.log(`  → 选择审批动作: ${action}`);

    const actionResult = this._clickActionRadio(action);
    const actionStrategyMatch = actionResult?.match?.(/"strategy":\s*"([^"]+)"/);
    const actionStrategy = actionStrategyMatch?.[1] || 'unknown';

    if (debug) {
      console.log(`  ✓ 已选择审批动作: ${action} (策略: ${actionStrategy})`);
    }

    await this.sleep(CONFIG.delays.afterClick);

    // 步骤2: 根据动作类型执行特定操作
    if (action === '驳回') {
      // 驳回: 等待界面选择起草节点
      if (debug) console.log('  → 等待起草节点选择...');

      const nodeResult = this._selectDraftNode();
      const nodeStrategyMatch = nodeResult?.match?.(/"strategy":\s*"([^"]+)"/);
      const nodeStrategy = nodeStrategyMatch?.[1] || 'unknown';
      const selectedNodeMatch = nodeResult?.match?.(/"selectedNode":\s*"([^"]+)"/);

      if (debug) {
        console.log(`  ✓ 已选择起草节点: ${selectedNodeMatch?.[1] || 'default'} (策略: ${nodeStrategy})`);
      }

      await this.sleep(CONFIG.delays.afterClick);
    }

    if (action === '转办') {
      // 转办: 选择转办人员
      if (!transferTo) {
        throw new Error('转办操作必须指定转办人员 (options.transferTo)');
      }

      if (debug) console.log(`  → 选择转办人员: ${transferTo}`);

      // 点击转办人员输入框触发地址本弹窗
      this._clickTransferInput();
      if (debug) console.log('  ✓ 已点击转办人员输入框');

      await this.sleep(CONFIG.delays.afterClick);

      // 在弹窗中搜索并选择人员
      const personResult = this._selectTransferPerson(transferTo);
      const personStrategyMatch = personResult?.match?.(/"strategy":\s*"([^"]+)"/);

      if (debug) {
        console.log(`  ✓ 已选择转办人员: ${transferTo} (策略: ${personStrategyMatch?.[1] || 'unknown'})`);
      }

      // 弹窗自动关闭
      await this.sleep(CONFIG.delays.afterClick);
    }

    // 步骤3: 填写处理意见
    const defaultComment = action === '通过' ? '同意' : action === '驳回' ? '不同意' : '转办处理';
    const commentToUse = comment || defaultComment;

    if (debug) console.log(`  → 填写处理意见: ${commentToUse}`);

    const fillResult = this._fillComment(commentToUse);
    const fillStrategyMatch = fillResult?.match?.(/"strategy":\s*"([^"]+)"/);

    if (debug) {
      console.log(`  ✓ 已填写处理意见: ${commentToUse} (策略: ${fillStrategyMatch?.[1] || 'unknown'})`);
    }

    await this.sleep(CONFIG.delays.afterInput);

    // 步骤4: 点击提交或取消
    if (submit) {
      if (debug) console.log('  → 点击提交按钮...');

      const submitResult = this._clickSubmit();
      const submitStrategyMatch = submitResult?.match?.(/"strategy":\s*"([^"]+)"/);

      if (debug) {
        console.log(`  ✓ 已点击提交按钮 (策略: ${submitStrategyMatch?.[1] || 'unknown'})`);

        // 输出按钮调试信息
        try {
          const tagNameMatch = submitResult.match(/"tagName":\s*"([^"]+)"/);
          const classNameMatch = submitResult.match(/"className":\s*"([^"]+)"/);
          if (tagNameMatch || classNameMatch) {
            console.log(`    [按钮信息]`);
            if (tagNameMatch) console.log(`      tagName: ${tagNameMatch[1]}`);
            if (classNameMatch) console.log(`      className: ${classNameMatch[1]}`);
          }
        } catch (e) {}
      }
    } else {
      if (debug) console.log('  → 点击取消按钮（测试模式）...');

      const cancelResult = this._clickCancel();
      const cancelStrategyMatch = cancelResult?.match?.(/"strategy":\s*"([^"]+)"/);

      if (debug) {
        console.log(`  ✓ 已点击取消按钮 (策略: ${cancelStrategyMatch?.[1] || 'none'})`);
      }
    }

    await this.waitForLoad();

    return {
      success: true,
      action,
      comment: commentToUse,
      transferTo: action === '转办' ? transferTo : undefined
    };
  }
}

module.exports = { WorkflowApprovalV2Helper, CONFIG };
