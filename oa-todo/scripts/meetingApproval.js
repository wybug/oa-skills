#!/usr/bin/env node

/**
 * 会议审批 RPA 脚本
 * 导出 MeetingApprovalHelper 类
 * 移植来源：lib/browser.js approveMeeting()
 */

const { ApprovalHelper, CONFIG } = require('./approvalHelper');

/**
 * 会议审批助手
 * 继承基类，实现会议特定审批逻辑
 */
class MeetingApprovalHelper extends ApprovalHelper {
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
   * 实现会议审批逻辑
   * 从 lib/browser.js 的 approveMeeting() 移植而来
   * @param {string} action - 审批动作（参加/不参加）
   * @param {string} comment - 审批意见（会议通常不需要）
   * @param {Object} options - 选项 { submit, debug }
   */
  async approve(action, comment, options = {}) {
    const { submit = true, debug = this.debug } = options;

    if (debug) console.log(`[MeetingApprovalHelper] 开始审批: ${action}`);

    // 等待页面完全渲染
    await this.sleep(CONFIG.delays.afterClick);

    // 步骤1: 选择会议选项（参加/不参加）
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

    const selectResult = this.eval(selectActionJs, { timeout: 30000 });
    if (!this._checkSuccess(selectResult)) {
      throw new Error(`未找到会议选项: ${action}`);
    }

    if (debug) console.log(`  ✓ 已选择: ${action}`);

    // 步骤2: 点击提交按钮
    if (submit) {
      await this.sleep(CONFIG.delays.afterClick);

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

      const submitResult = this.eval(submitJs, { timeout: 30000 });
      if (!this._checkSuccess(submitResult)) {
        throw new Error('未找到提交按钮');
      }

      if (debug) console.log(`  ✓ 已点击提交按钮`);
    }

    await this.waitForLoad();

    return { success: true, action, comment };
  }
}

module.exports = { MeetingApprovalHelper, CONFIG };
