#!/usr/bin/env node

/**
 * 费用报销审批 RPA 脚本
 * 导出 ExpenseApprovalHelper 类
 * 移植来源：lib/browser.js approveExpense()
 */

const { ApprovalHelper, CONFIG } = require('./approvalHelper');

/**
 * 费用报销审批助手
 * 继承基类，实现费用报销特定审批逻辑
 */
class ExpenseApprovalHelper extends ApprovalHelper {
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
   * 实现费用报销审批逻辑
   * 从 lib/browser.js 的 approveExpense() 移植而来
   * @param {string} action - 审批动作（同意/驳回）
   * @param {string} comment - 审批意见
   * @param {Object} options - 选项 { submit, debug }
   */
  async approve(action, comment, options = {}) {
    const { submit = true, debug = this.debug } = options;

    if (debug) console.log(`[ExpenseApprovalHelper] 开始审批: ${action}`);

    // 等待页面完全渲染
    await this.sleep(CONFIG.delays.afterClick);

    // 步骤1: 点击审批按钮
    const clickScript = `(() => {
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
    })()`;

    const clickResult = this.eval(clickScript, { timeout: 30000 });
    if (!this._checkSuccess(clickResult)) {
      throw new Error(`未找到审批按钮: ${action}`);
    }

    if (debug) console.log(`  ✓ 已点击审批按钮: ${action}`);

    // 等待弹出对话框
    await this.sleep(CONFIG.delays.afterClick);

    // 步骤2: 如果是驳回，填写意见
    if (action === '驳回' && comment) {
      const commentScript = `(() => {
        const commentBox = document.querySelector('textarea[placeholder*="意见"], input[placeholder*="意见"]');
        if (commentBox) {
          commentBox.value = '${comment}';
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
          return { success: true };
        }
        return { success: false };
      })()`;

      const commentResult = this.eval(commentScript, { timeout: 10000 });
      if (debug && this._checkSuccess(commentResult)) {
        console.log(`  ✓ 已填写审批意见`);
      }
    }

    // 步骤3: 处理确认弹窗
    if (submit) {
      const confirmScript = `(() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(btn =>
          btn.textContent.includes('确定') || btn.textContent.includes('确认')
        );
        if (confirmBtn) {
          confirmBtn.click();
          return { success: true };
        }
        return { success: false };
      })()`;

      const confirmResult = this.eval(confirmScript, { timeout: 10000 });
      if (debug) {
        console.log(this._checkSuccess(confirmResult) ? `  ✓ 已点击确认` : `  ⚠ 未找到确认按钮`);
      }
    }

    await this.waitForLoad();

    return { success: true, action, comment };
  }
}

module.exports = { ExpenseApprovalHelper, CONFIG };
