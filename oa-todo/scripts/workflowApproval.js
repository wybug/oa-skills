#!/usr/bin/env node

/**
 * 通用流程审批 RPA 脚本
 * 导出 WorkflowApprovalHelper 类
 * 移植来源：lib/browser.js approveWorkflow()
 */

const { ApprovalHelper, CONFIG } = require('./approvalHelper');

/**
 * 通用流程审批助手
 * 继承基类，实现通用流程特定审批逻辑
 */
class WorkflowApprovalHelper extends ApprovalHelper {
  constructor(session, options = {}) {
    super(session, options);
  }

  /**
   * 解析 eval 返回的 base64 编码 JSON
   * @param {string} output - eval 返回的 base64 字符串
   * @returns {Object|null} 解析后的对象，失败返回 null
   */
  _parseBase64JSON(output) {
    if (!output) return null;
    const trimmed = output.trim();
    try {
      return JSON.parse(Buffer.from(trimmed, 'base64').toString());
    } catch (e) {
      // 降级：尝试直接解析（向后兼容旧代码）
      try {
        return JSON.parse(trimmed);
      } catch (e2) {
        console.error('JSON parse error:', e2.message);
        return null;
      }
    }
  }

  /**
   * 实现通用流程审批逻辑
   * 从 lib/browser.js 的 approveWorkflow() 移植而来
   * @param {string} action - 审批动作（通过/驳回/转办）
   * @param {string} comment - 审批意见
   * @param {Object} options - 选项 { submit, debug }
   */
  async approve(action, comment, options = {}) {
    const { submit = true, debug = this.debug } = options;

    if (debug) console.log(`[WorkflowApprovalHelper] 开始审批: ${action}`);

    // 等待页面完全渲染
    await this.sleep(3000);

    // 步骤1: 点击审批动作的单选按钮
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

    const radioResult = this.eval(clickRadioJs, { timeout: 30000 });

    // 检查结果
    if (!this._checkSuccess(radioResult)) {
      if (debug) console.error('页面返回:', radioResult);
      throw new Error(`未找到审批选项: ${action}`);
    }

    if (debug) console.log(`  ✓ 已选择审批选项: ${action}`);

    // 步骤2: 如果是驳回操作，需要选择驳回节点
    if (action === '驳回') {
      await this.sleep(500);

      const selectRejectNodeJs = `(() => {
        // 查找驳回节点下拉框
        const rejectSelect = document.querySelector('select[name="jumpToNodeIdSelectObj"]');
        if (rejectSelect && rejectSelect.offsetParent !== null) {
          // 默认选择第一个选项（通常是起草节点）
          if (rejectSelect.options.length > 0) {
            rejectSelect.selectedIndex = 0;
            rejectSelect.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, selectedNode: rejectSelect.value, nodeName: rejectSelect.options[0].text };
          } else {
            return { success: false, error: 'No options available' };
          }
        } else {
          return { success: false, error: 'Reject select not visible' };
        }
      })()`;

      const rejectResult = this.eval(selectRejectNodeJs, { timeout: 10000 });
      if (!this._checkSuccess(rejectResult)) {
        throw new Error('无法选择驳回节点');
      }

      if (debug) console.log(`  ✓ 已选择驳回节点`);
    }

    // 步骤3: 填写处理意见（如果有）
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

      const commentResult = this.eval(fillCommentJs, { timeout: 10000 });
      if (debug && this._checkSuccess(commentResult)) {
        console.log(`  ✓ 已填写审批意见`);
      }
    }

    // 步骤4: 点击提交按钮
    if (submit) {
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

      const submitResult = this.eval(submitJs, { timeout: 10000 });
      if (!this._checkSuccess(submitResult)) {
        throw new Error('未找到提交按钮');
      }

      if (debug) console.log(`  ✓ 已点击提交按钮`);
    }

    await this.waitForLoad();

    return { success: true, action, comment };
  }
}

module.exports = { WorkflowApprovalHelper, CONFIG };
