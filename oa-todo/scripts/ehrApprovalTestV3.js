#!/usr/bin/env node

/**
 * EHR 审批测试脚本 V3
 *
 * 基于 rpa-generator-prompt.md 自动生成
 *
 * 使用方法:
 *   node ehrApprovalTestV3.js <session-id> [loopCount] [options]
 *
 * 示例:
 *   node ehrApprovalTestV3.js oa-todo-pause-xxx 3 --testcase
 *   node ehrApprovalTestV3.js oa-todo-pause-xxx 1 --debug
 *
 * 选项:
 *   --testcase  输出结构化验证日志
 *   --debug     输出详细调试信息
 */

const { EHRApprovalHelperV2, CONFIG } = require('./ehrApprovalV2');

// 检测 --testcase 参数
const isTestcaseMode = process.argv.includes('--testcase');
const isDebugMode = process.argv.includes('--debug');

// 解析参数
const args = process.argv.slice(2);  // 跳过 'node' 和脚本名
const sessionId = args[0];
const loopCount = parseInt(args[1]) || 3;

if (!sessionId) {
  console.error('错误: 缺少 session-id');
  console.error('用法: node ehrApprovalTestV3.js <session-id> [loopCount] [--testcase] [--debug]');
  process.exit(1);
}

/**
 * 检查页面状态
 */
async function checkPageStatus(helper) {
  const checkJs = String.raw`
    (() => {
      // 优先检查 span 类型的按钮（EHR 特有结构）
      const spans = Array.from(document.querySelectorAll('span.base-btn-title'));
      const spanButtons = spans.filter(s =>
        s.textContent.trim() === '同意' || s.textContent.trim() === '不同意'
      );

      // 检查标准按钮
      const standardButtons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
      const standardApproveButtons = standardButtons.filter(b =>
        b.textContent.includes('同意') || b.textContent.includes('不同意')
      );

      return {
        success: true,
        hasButtons: spanButtons.length > 0 || standardApproveButtons.length > 0,
        count: spanButtons.length + standardApproveButtons.length
      };
    })()
  `;

  const result = helper.eval(checkJs);

  if (helper._checkSuccess(result)) {
    const hasButtonsMatch = result.match(/"hasButtons":\s*(true|false)/);
    return {
      hasButtons: hasButtonsMatch?.[1] === 'true'
    };
  }

  return { hasButtons: false };
}

/**
 * 输出 testcase 日志
 */
function logTestcase(step, status, message = '') {
  if (isTestcaseMode) {
    console.log(`[testcase] ${step}: ${status}${message ? ' - ' + message : ''}`);
  }
}

/**
 * 主测试流程
 */
async function runTest() {
  console.log('==========================================');
  console.log('       EHR 审批测试脚本 V3');
  console.log('==========================================');
  console.log(`Session: ${sessionId}`);
  console.log(`循环次数: ${loopCount}`);
  console.log(`测试模式: ${isTestcaseMode ? '结构化' : '常规'}`);
  console.log('==========================================\n');

  const helper = new EHRApprovalHelperV2(sessionId, { debug: isDebugMode });

  const summary = {
    total: loopCount,
    success: 0,
    failed: 0,
    results: []
  };

  const action = '同意';
  const comment = '测试审批意见';

  for (let i = 0; i < loopCount; i++) {
    console.log(`[循环 ${i + 1}/${loopCount}]`);

    try {
      // === 步骤1: 状态检查 ===
      const pageStatus = await checkPageStatus(helper);

      if (!pageStatus.hasButtons) {
        console.log('  ⚠️  页面无审批按钮，停止测试');
        logTestcase('步骤1_状态检查', 'FAIL', '无审批按钮');
        break;
      }

      console.log(`  ✓ 页面状态正常 (有 ${pageStatus.hasButtons ? '审批' : '无'}按钮)`);
      logTestcase('步骤1_状态检查', 'PASS');

      // === 步骤2: 点击审批按钮 ===
      const clickJs = String.raw`
        (() => {
          const buttonText = "${action}";
          let targetBtn = null;
          let strategy = '';

          // 策略0: className 优先 - 针对非标准按钮（EHR 的 span）
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
            targetBtn.click();
            return { success: true, clicked: buttonText, strategy };
          }
          return { success: false, error: '未找到按钮' };
        })()
      `;

      const clickResult = helper.eval(clickJs);

      if (!helper._checkSuccess(clickResult)) {
        console.log('  ✗ 点击审批按钮失败');
        logTestcase('步骤2_点击审批按钮', 'FAIL');
        summary.failed++;
        summary.results.push({ loop: i + 1, success: false, error: 'click_failed' });
        break;
      }

      const strategyMatch = clickResult.match(/"strategy":\s*"([^"]+)"/);
      const strategy = strategyMatch?.[1] || 'unknown';

      console.log(`  ✓ 点击审批按钮: ${action} (策略: ${strategy})`);
      logTestcase('步骤2_点击审批按钮', 'PASS', `策略=${strategy}`);

      // 等待对话框弹出
      await helper.sleep(CONFIG.delays.afterClick);

      // === 步骤3: 验证对话框弹出 ===
      const checkDialogJs = String.raw`
        (() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          for (const iframe of iframes) {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const dialog = doc.querySelector('textarea, button[class*="btn"], button');
              if (dialog) return { success: true, hasDialog: true, inIframe: true };
            } catch (e) {}
          }
          const dialog = document.querySelector('textarea, button[class*="btn"], button');
          if (dialog) return { success: true, hasDialog: true, inIframe: false };
          return { success: false, hasDialog: false, error: '对话框未弹出' };
        })()
      `;

      const dialogResult = helper.eval(checkDialogJs);

      if (!helper._checkSuccess(dialogResult)) {
        console.log('  ✗ 对话框未弹出');
        logTestcase('步骤3_对话框弹出', 'FAIL');
        summary.failed++;
        summary.results.push({ loop: i + 1, success: false, error: 'dialog_not_found' });
        break;
      }

      console.log('  ✓ 对话框已弹出');
      logTestcase('步骤3_对话框弹出', 'PASS');

      // === 步骤4: 输入意见 ===
      const inputJs = String.raw`
        (() => {
          const comment = "${comment}";
          const iframes = Array.from(document.querySelectorAll('iframe'));

          for (const iframe of iframes) {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow.document;

              let targetBox = Array.from(doc.querySelectorAll('textarea'))
                .find(box => box.placeholder?.includes('意见'));

              if (!targetBox) {
                targetBox = doc.querySelector('textarea.b02116-textarea-show, textarea');
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

                return { success: true, inIframe: true, value: targetBox.value };
              }
            } catch (e) {}
          }

          const targetBox = document.querySelector('textarea');
          if (targetBox) {
            targetBox.value = comment;
            targetBox.dispatchEvent(new Event('input', { bubbles: true }));
            targetBox.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, inIframe: false, value: targetBox.value };
          }

          return { success: false, error: '未找到输入框' };
        })()
      `;

      const inputResult = helper.eval(inputJs);

      if (!helper._checkSuccess(inputResult)) {
        console.log('  ⚠️  输入意见失败（继续执行）');
        logTestcase('步骤4_输入意见', 'WARN', '输入可能失败');
      } else {
        console.log(`  ✓ 输入意见: ${comment}`);
        logTestcase('步骤4_输入意见', 'PASS');
      }

      await helper.sleep(CONFIG.delays.afterInput);

      // === 步骤5: 点击取消（测试模式，不提交） ===
      const cancelJs = String.raw`
        (() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));

          for (const iframe of iframes) {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow.document;

              let cancelBtn = Array.from(doc.querySelectorAll('button'))
                .find(btn => btn.textContent.trim() === '取消');

              if (!cancelBtn) {
                cancelBtn = doc.querySelector('button[class*="btn_weaken"]');
              }

              if (cancelBtn) {
                cancelBtn.click();
                return { success: true, strategy: 'iframe' };
              }
            } catch (e) {}
          }

          const cancelBtn = Array.from(document.querySelectorAll('button'))
            .find(btn => btn.textContent.trim() === '取消');

          if (cancelBtn) {
            cancelBtn.click();
            return { success: true, strategy: 'main' };
          }

          return { success: false, error: '未找到取消按钮' };
        })()
      `;

      const cancelResult = helper.eval(cancelJs);

      if (!helper._checkSuccess(cancelResult)) {
        console.log('  ✗ 点击取消失败');
        logTestcase('步骤5_点击取消', 'FAIL');
        summary.failed++;
        summary.results.push({ loop: i + 1, success: false, error: 'cancel_failed' });
        break;
      }

      console.log('  ✓ 点击取消按钮');
      logTestcase('步骤5_点击取消', 'PASS');

      // 等待状态恢复
      await helper.sleep(CONFIG.delays.afterClick);

      // === 步骤6: 验证状态恢复 ===
      const finalStatus = await checkPageStatus(helper);

      if (finalStatus.hasButtons) {
        console.log('  ✓ 状态已恢复（有审批按钮）');
        logTestcase('步骤6_状态恢复', 'PASS');
      } else {
        console.log('  ⚠️  状态未恢复（无审批按钮）');
        logTestcase('步骤6_状态恢复', 'WARN', '可能已提交');
      }

      // 本轮成功
      summary.success++;
      summary.results.push({ loop: i + 1, success: true });

      console.log(''); // 空行分隔

    } catch (error) {
      console.log(`  ✗ 错误: ${error.message}`);
      logTestcase(`循环${i + 1}`, 'FAIL', error.message);
      summary.failed++;
      summary.results.push({ loop: i + 1, success: false, error: error.message });
      break;
    }
  }

  // 输出测试结果
  console.log('==========================================');
  console.log('           测试完成！');
  console.log('==========================================');
  console.log(`总测试数: ${summary.total}`);
  console.log(`成功: ${summary.success}`);
  console.log(`失败: ${summary.failed}`);
  console.log('==========================================');

  // testcase 模式下输出汇总
  if (isTestcaseMode) {
    const allPass = summary.failed === 0;
    console.log(`[testcase] 测试汇总: ${allPass ? 'PASS' : 'FAIL'}`);
    console.log(`[testcase] 成功率: ${Math.round(summary.success / summary.total * 100)}%`);
  }

  // 退出码
  process.exit(summary.failed > 0 ? 1 : 0);
}

runTest().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
