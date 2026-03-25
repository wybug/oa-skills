#!/usr/bin/env node

/**
 * EHR 假期审批助手 V2
 *
 * 严格按照 rpa-generator-prompt.md 自动生成
 *
 * 探索发现:
 * - 有效查找策略: className-span (先找 span.base-btn-title, 再找父元素)
 * - 对话框位置: iframe 中
 * - 意见输入框: textarea (必填)
 * - 审批按钮: SPAN 元素 (class="base-bg-ripple base-btns-bgc-big")
 * - 对话框按钮: SPAN 元素 (确定: base-btns-bgc-big, 取消: base-btns-weaken)
 * - 完成判断: 页面上无"同意"/"不同意"按钮
 *
 * 按钮类型确认:
 * - 审批按钮发现 3 种: DIV、SPAN(base-btns-bgc-big)、SPAN(base-btn-title)
 * - 对话框按钮发现 1 种: SPAN (与审批按钮结构一致)
 * - 使用策略: className-span (优先找 span.base-btn-title，再找父元素)
 */

const { ApprovalHelper, CONFIG } = require('./approvalHelper');

class EHRApprovalHelperV2 extends ApprovalHelper {
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
        // 优先检查 span 类型的按钮（EHR 特有结构）
        const spans = Array.from(document.querySelectorAll('span.base-btn-title'));
        const spanButtons = spans.filter(s =>
          s.textContent.trim() === '同意' || s.textContent.trim() === '不同意'
        );

        // 检查标准按钮
        const standardButtons = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
          .filter(b => b.textContent.includes('同意') || b.textContent.includes('不同意'));

        const hasButtons = spanButtons.length > 0 || standardButtons.length > 0;

        return {
          success: true,
          isApprovable: hasButtons,
          hasButtons,
          status: hasButtons ? 'pending' : 'processed'
        };
      })()
    `;

    const result = this.eval(checkJs, { timeout: 10000 });

    if (this._checkSuccess(result)) {
      const statusMatch = result.match(/"status":\s*"([^"]+)"/);
      const isApprovableMatch = result.match(/"isApprovable":\s*(true|false)/);

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
        // 优先检查 span 类型的按钮
        const spans = Array.from(document.querySelectorAll('span.base-btn-title'));
        const spanButtons = spans.filter(s =>
          s.textContent.trim() === '同意' || s.textContent.trim() === '不同意'
        );

        // 检查标准按钮
        const standardButtons = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
          .filter(b => b.textContent.includes('同意') || b.textContent.includes('不同意'));

        const hasButtons = spanButtons.length > 0 || standardButtons.length > 0;

        return {
          success: true,
          hasButtons,
          buttonCount: spanButtons.length + standardButtons.length
        };
      })()
    `;

    const result = this.eval(statusJs, { timeout: 10000 });

    if (this._checkSuccess(result)) {
      const hasButtonsMatch = result.match(/"hasButtons":\s*(true|false)/);

      return {
        hasButtons: hasButtonsMatch?.[1] === 'true',
        status: hasButtonsMatch?.[1] === 'true' ? 'pending' : 'approved'
      };
    }

    return { hasButtons: false, status: 'unknown' };
  }

  /**
   * 执行审批操作
   * @param {string} action - 审批动作 ("同意" | "不同意")
   * @param {string} comment - 审批意见
   * @param {Object} options - 选项
   *   @param {boolean} options.submit - 是否真实提交（默认 true）
   *   @param {boolean} options.debug - 是否输出调试日志（默认 false）
   * @returns {Promise<{success: boolean, action: string, comment?: string}>}
   */
  async approve(action, comment, options = {}) {
    const { submit = true, debug = this.debug } = options;

    if (debug) console.log(`[EHRApprovalV2] 开始审批: ${action}`);

    // 步骤1: 点击审批按钮（使用探索发现的 className-span 策略）
    const clickActionJs = String.raw`
      (() => {
        const buttonText = "${action}";
        let targetBtn = null;
        let strategy = '';

        // 策略0: className 优先 - 针对非标准按钮（EHR 的 span 结构）
        const spans = Array.from(document.querySelectorAll('span.base-btn-title'));
        const targetSpan = spans.find(s => s.textContent.trim() === buttonText);
        if (targetSpan) {
          targetBtn = targetSpan.closest('.base-btns-bgc-big, div, button, a');
          strategy = targetBtn ? 'className-span' : '';
        }

        // 策略1: 按文本内容查找
        if (!targetBtn) {
          targetBtn = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
            .find(btn => btn.textContent.trim() === buttonText);
          strategy = targetBtn ? 'textContent' : '';
        }

        // 策略2: 按 CSS 类名查找
        if (!targetBtn) {
          const buttonsByClass = document.querySelectorAll('.base-btns-bgc-big, .lui-btn, [class*="btn"]');
          targetBtn = Array.from(buttonsByClass).find(btn => btn.textContent.includes(buttonText));
          strategy = targetBtn ? 'className' : '';
        }

        // 策略3: 按父元素查找
        if (!targetBtn) {
          const allSpans = Array.from(document.querySelectorAll('span'));
          const foundSpan = allSpans.find(s => s.textContent.trim() === buttonText);
          if (foundSpan) {
            targetBtn = foundSpan.closest('button, a, div[role="button"]');
            strategy = targetBtn ? 'parentElement' : '';
          }
        }

        if (targetBtn) {
          // 按钮调试信息（强制要求）
          const debugInfo = {
            tagName: targetBtn.tagName,
            className: targetBtn.className,
            id: targetBtn.id,
            textContent: targetBtn.textContent?.trim().substring(0, 50),
            innerHTML: targetBtn.innerHTML?.substring(0, 100),
            strategy: strategy
          };
          targetBtn.click();
          return { success: true, clicked: buttonText, strategy, debugInfo };
        }
        return { success: false, error: '未找到审批按钮' };
      })()
    `;

    const clickResult = this.eval(clickActionJs, { timeout: 30000 });

    if (!this._checkSuccess(clickResult)) {
      throw new Error(`未找到审批按钮: ${action}`);
    }

    // 提取策略信息和调试信息
    const strategyMatch = clickResult.match(/"strategy":\s*"([^"]+)"/);
    const strategyUsed = strategyMatch?.[1] || 'unknown';

    if (debug) {
      console.log(`  ✓ 已点击审批按钮: ${action} (策略: ${strategyUsed})`);

      // 输出按钮调试信息
      try {
        const tagNameMatch = clickResult.match(/"tagName":\s*"([^"]+)"/);
        const classNameMatch = clickResult.match(/"className":\s*"([^"]+)"/);
        const textMatch = clickResult.match(/"textContent":\s*"([^"]+)"/);

        if (tagNameMatch || classNameMatch || textMatch) {
          console.log(`    [按钮信息]`);
          if (tagNameMatch) console.log(`      tagName: ${tagNameMatch[1]}`);
          if (classNameMatch) console.log(`      className: ${classNameMatch[1]}`);
          if (textMatch) console.log(`      text: ${textMatch[1]}`);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    // *** 重要：等待对话框弹出 ***
    await this.sleep(CONFIG.delays.afterClick);

    // *** 验证对话框是否弹出（必须验证，否则后续操作会失败）***
    const checkDialogJs = String.raw`
      (() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            // 检查是否有对话框元素（输入框或按钮）
            const dialog = doc.querySelector('textarea, span[class*="btn"], button');
            if (dialog) return { success: true, hasDialog: true, inIframe: true };
          } catch (e) {}
        }
        // 降级到主文档查找
        const dialog = document.querySelector('textarea, span[class*="btn"], button');
        if (dialog) return { success: true, hasDialog: true, inIframe: false };
        return { success: false, hasDialog: false, error: '对话框未弹出' };
      })()
    `;

    const dialogResult = this.eval(checkDialogJs, { timeout: 5000 });
    if (!this._checkSuccess(dialogResult)) {
      throw new Error('点击审批按钮后对话框未弹出');
    }

    if (debug) console.log('  ✓ 对话框已弹出');

    // 步骤2: 填写审批意见（必填，根据用户确认）
    const commentToUse = comment || '同意';  // 默认意见
    const commentJs = String.raw`
      (() => {
        const comment = "${commentToUse}";
        const iframes = Array.from(document.querySelectorAll('iframe'));

        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;

            // 策略1: 通过 placeholder 查找
            let targetBox = Array.from(doc.querySelectorAll('textarea'))
              .find(box => box.placeholder?.includes('意见'));

            // 策略2: 通过特定类名查找
            if (!targetBox) {
              targetBox = doc.querySelector('textarea.b02116-textarea-show, textarea');
            }

            if (targetBox) {
              // 使用增强的输入方法确保值被正确绑定
              targetBox.value = comment;
              targetBox.selectionStart = 0;
              targetBox.selectionEnd = comment.length;

              // 触发完整的事件序列
              targetBox.dispatchEvent(new Event('focus', { bubbles: true }));
              targetBox.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
              targetBox.dispatchEvent(new Event('input', { bubbles: true }));
              targetBox.dispatchEvent(new Event('change', { bubbles: true }));
              targetBox.dispatchEvent(new Event('blur', { bubbles: true }));

              return { success: true, inIframe: true, value: targetBox.value };
            }
          } catch (e) {
            // 跨域跳过
          }
        }

        // 降级到主文档查找
        const targetBox = document.querySelector('textarea');
        if (targetBox) {
          targetBox.value = comment;
          targetBox.dispatchEvent(new Event('input', { bubbles: true }));
          targetBox.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, inIframe: false, value: targetBox.value };
        }

        return { success: false, error: '未找到意见输入框' };
      })()
    `;

    const commentResult = this.eval(commentJs, { timeout: 10000 });

    if (!this._checkSuccess(commentResult)) {
      // 根据用户确认，意见是必填的
      throw new Error('未找到意见输入框（意见为必填项）');
    }

    if (debug) console.log(`  ✓ 已填写审批意见: ${commentToUse}`);

    await this.sleep(CONFIG.delays.afterInput);

    // 步骤3: 点击提交/取消按钮（注意：对话框按钮也是 SPAN 元素）
    const buttonText = submit ? '确定' : '取消';

    const submitJs = String.raw`
      (() => {
        const buttonText = "${buttonText}";
        const iframes = Array.from(document.querySelectorAll('iframe'));

        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;

            // 策略0: span.className 优先 - 对话框按钮也是 span
            const spans = Array.from(doc.querySelectorAll('span.base-bg-ripple'));
            const targetSpan = spans.find(s => s.textContent.trim() === buttonText);
            let targetBtn = null;
            let strategy = '';

            if (targetSpan) {
              targetBtn = targetSpan.closest('.base-btns-bgc-big, div, button, a');
              strategy = 'span-first';
            }

            // 策略1: 按文本查找
            if (!targetBtn) {
              targetBtn = Array.from(doc.querySelectorAll('button, span, a'))
                .find(btn => btn.textContent.trim() === buttonText);
              strategy = targetBtn ? 'textContent' : '';
            }

            // 策略2: 按类名查找
            if (!targetBtn) {
              if (buttonText === '确定') {
                targetBtn = doc.querySelector('[class*="base-btns-bgc-big"]');
              } else if (buttonText === '取消') {
                targetBtn = doc.querySelector('[class*="base-btns-weaken"]');
              }
              strategy = targetBtn ? 'className' : '';
            }

            if (targetBtn) {
              // 按钮调试信息
              const debugInfo = {
                tagName: targetBtn.tagName,
                className: targetBtn.className,
                id: targetBtn.id,
                textContent: targetBtn.textContent?.trim(),
                location: 'iframe',
                buttonText: buttonText,
                strategy: strategy
              };
              targetBtn.click();
              return { success: true, clicked: buttonText, strategy: 'iframe', debugInfo };
            }
          } catch (e) {
            // 跨域跳过
          }
        }

        // 降级到主文档查找
        const targetBtn = Array.from(document.querySelectorAll('button, span, a'))
          .find(btn => btn.textContent.trim() === buttonText);

        if (targetBtn) {
          const debugInfo = {
            tagName: targetBtn.tagName,
            className: targetBtn.className,
            id: targetBtn.id,
            textContent: targetBtn.textContent?.trim(),
            location: 'main'
          };
          targetBtn.click();
          return { success: true, clicked: buttonText, strategy: 'main', debugInfo };
        }

        return { success: false, error: '未找到按钮' };
      })()
    `;

    const submitResult = this.eval(submitJs, { timeout: 30000 });

    if (!this._checkSuccess(submitResult)) {
      throw new Error('未找到按钮');
    }

    if (debug) {
      console.log(`  ✓ 已点击${buttonText}按钮`);

      // 输出按钮调试信息
      try {
        const tagNameMatch = submitResult.match(/"tagName":\s*"([^"]+)"/);
        const classNameMatch = submitResult.match(/"className":\s*"([^"]+)"/);
        const locationMatch = submitResult.match(/"location":\s*"([^"]+)"/);
        const strategyMatch = submitResult.match(/"strategy":\s*"([^"]+)"/);

        if (tagNameMatch || classNameMatch || locationMatch) {
          console.log(`    [按钮信息]`);
          if (tagNameMatch) console.log(`      tagName: ${tagNameMatch[1]}`);
          if (classNameMatch) console.log(`      className: ${classNameMatch[1]}`);
          if (locationMatch) console.log(`      location: ${locationMatch[1]}`);
          if (strategyMatch) console.log(`      strategy: ${strategyMatch[1]}`);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    await this.waitForLoad();

    return {
      success: true,
      action,
      comment: commentToUse
    };
  }
}

module.exports = { EHRApprovalHelperV2, CONFIG };
