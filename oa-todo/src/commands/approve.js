/**
 * approve 命令 - 审批待办
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const Database = require('../lib/database');
const Browser = require('../lib/browser');
const { validateAction, getValidActions } = require('../lib/detector');
const { ACTION_TO_STATUS, STATUS_NAMES, TYPE_NAMES } = require('../config');

async function approve(fdId, action, options) {
  const spinner = ora('正在处理审批...').start();

  // 声明在外部以便catch块访问
  let db = null;
  let browser = null;
  let todo = null;
  const isDebugMode = options.debug || false;

  try {
    // 初始化数据库
    db = new Database(options.config.dbPath);
    await db.init();

    // 获取待办信息
    todo = await db.getTodo(fdId);
    
    if (!todo) {
      spinner.fail(`未找到待办: ${fdId}`);
      console.log(chalk.yellow('\n请先同步待办: oa-todo sync'));
      await db.close();
      process.exit(1);
    }
    
    spinner.succeed('找到待办');
    
    // 显示待办详细信息
    console.log(chalk.bold('\n📋 待办详细信息:'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(`  ${chalk.bold('ID:')}         ${todo.fd_id}`);
    console.log(`  ${chalk.bold('标题:')}       ${todo.title}`);
    console.log(`  ${chalk.bold('类型:')}       ${TYPE_NAMES[todo.todo_type] || '未知'}`);
    console.log(`  ${chalk.bold('当前状态:')}   ${STATUS_NAMES[todo.status] || todo.status}`);
    if (todo.submitter) {
      console.log(`  ${chalk.bold('提交人:')}     ${todo.submitter}`);
    }
    if (todo.source_dept) {
      console.log(`  ${chalk.bold('来源部门:')}   ${todo.source_dept}`);
    }
    if (todo.created_at) {
      console.log(`  ${chalk.bold('创建时间:')}   ${todo.created_at}`);
    }
    if (todo.synced_at) {
      console.log(`  ${chalk.bold('同步时间:')}   ${todo.synced_at}`);
    }
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    // 检查本地状态
    if (!options.skipStatusCheck && todo.status !== 'pending') {
      spinner.fail(`该待办当前状态为「${STATUS_NAMES[todo.status] || todo.status}」，无法审批`);
      console.log(chalk.gray('\n提示: 使用 --skip-status-check 可跳过此检查'));
      console.log(chalk.gray(`       当前状态: ${todo.status}`));
      await db.close();
      process.exit(1);
    }

    // 验证动作
    if (!validateAction(todo.todo_type, action)) {
      const validActions = getValidActions(todo.todo_type);
      
      console.log(chalk.red(`\n❌ 不支持的动作: ${action}`));
      console.log(chalk.yellow('\n支持的动作:'));
      validActions.forEach(a => {
        console.log(`  - ${a}`);
      });
      
      await db.close();
      process.exit(1);
    }
    
    // 确认操作
    if (!options.force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `确认执行「${action}」操作？`,
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('已取消'));
        await db.close();
        process.exit(0);
      }
    }
    
    spinner.start('检查登录状态...');

    // 检查登录（根据debug模式设置）
    browser = new Browser(options.config, { debugMode: options.debug });
    let loginStatus = await browser.checkLoginValid();
    
    if (options.login || !loginStatus.valid) {
      spinner.text = '需要重新登录...';
      
      if (!process.env.OA_USER_NAME || !process.env.OA_USER_PASSWD) {
        spinner.fail('缺少环境变量 OA_USER_NAME 或 OA_USER_PASSWD');
        console.log(chalk.yellow('\n请在 CoPaw 的 Environments 中配置:'));
        console.log('  OA_USER_NAME=你的用户名');
        console.log('  OA_USER_PASSWD=你的密码');
        await db.close();
        process.exit(1);
      }
      
      await browser.login();
      loginStatus = await browser.checkLoginValid();
    }
    
    spinner.succeed(`登录状态有效（剩余约 ${loginStatus.remaining} 分钟）`);
    spinner.start('加载登录状态...');

    if (isDebugMode) {
      console.log(chalk.cyan('\n🐛 调试模式已启用，浏览器窗口将可见'));
    }
    
    // 加载登录状态
    await browser.loadState();
    spinner.succeed('登录状态已加载');
    
    // 打开待办详情
    spinner.start('打开待办详情...');
    await browser.fetchTodoDetail(fdId, todo.href);
    spinner.succeed('已打开待办详情');

    // 调试模式：暂停并等待用户确认
    if (isDebugMode) {
      spinner.stop();

      console.log(chalk.bold.cyan('\n🐛 调试模式已启动'));
      console.log(chalk.gray('────────────────────────────────────────────────────────────'));
      console.log(chalk.yellow('浏览器窗口已打开，请手动检查页面状态'));
      console.log(chalk.gray('\n页面信息:'));
      console.log(`  FD ID: ${todo.fd_id}`);
      console.log(`  标题: ${todo.title.substring(0, 50)}...`);
      console.log(`  类型: ${TYPE_NAMES[todo.todo_type] || '未知'}`);
      console.log(`  待执行操作: ${chalk.green(action)}`);
      console.log(chalk.gray('\n操作选项:'));
      console.log(`  1. 在浏览器中手动完成审批操作`);
      console.log(`  2. 检查页面元素是否正确`);
      console.log(`  3. 按 ${chalk.cyan('Enter')} 键继续（将关闭浏览器）`);
      console.log(chalk.gray('────────────────────────────────────────────────────────────'));

      // 等待用户按回车继续
      await new Promise(resolve => {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('', () => {
          rl.close();
          resolve();
        });
      });

      await browser.close();
      await db.close();

      console.log(chalk.green('\n✅ 已关闭浏览器'));
      console.log(chalk.gray('提示: 如需更新数据库状态，请使用: oa-todo update ' + fdId + ' approved'));
      process.exit(0);
    }

    // 执行审批
    spinner.start(`正在执行「${action}」操作...`);

    const newStatus = ACTION_TO_STATUS[action];

    try {
      if (todo.todo_type === 'meeting') {
        await browser.approveMeeting(action);
      } else if (todo.todo_type === 'workflow') {
        await browser.approveWorkflow(action, options.comment);
      } else {
        spinner.fail(`不支持的待办类型: ${todo.todo_type}`);
        await browser.close();
        await db.close();
        process.exit(1);
      }
    } catch (error) {
      // 检查是否是已处理的错误
      const errorMsg = error.message;
      if (errorMsg.includes('未找到审批选项') || errorMsg.includes('未找到提交按钮')) {
        // 可能页面已处理，尝试检查状态
        spinner.info('检查页面状态...');
        const snapshot = await browser.snapshot();
        if (snapshot.includes('已召开') || snapshot.includes('已处理') ||
            snapshot.includes('已完成') || snapshot.includes('您的操作已成功')) {
          spinner.warn('该待办已在OA系统中处理完成');
          // 更新数据库状态为 skip
          await db.updateStatus(fdId, 'skip', action, '后台已处理，无法再次审批');
          await browser.close();
          await db.close();
          console.log(chalk.yellow('\nℹ️  该待办在OA系统中已处理完成'));
          console.log(chalk.gray('   本地状态已更新为: skip'));
          process.exit(0);
        }
      }
      // 其他错误继续抛出
      throw error;
    }
    
    // 更新数据库状态
    await db.updateStatus(fdId, newStatus, action, options.comment);
    
    // 保存截图作为凭证
    const screenshotDir = require('path').join(options.config.detailsDir, fdId);
    const screenshotPath = require('path').join(screenshotDir, `approve_${Date.now()}.png`);
    await browser.screenshot(screenshotPath);

    // 调试模式：延迟关闭浏览器
    const delaySeconds = options.delay || 3;
    if (isDebugMode && delaySeconds > 0) {
      spinner.info(`调试模式：${delaySeconds} 秒后关闭浏览器...`);
      console.log(chalk.yellow(`\n💡 提示: 使用 Ctrl+C 可立即退出并保持浏览器打开`));
      console.log(chalk.gray(`   Session: ${browser.session}`));
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    }

    await browser.close();
    await db.close();
    
    spinner.succeed('审批完成！');
    
    console.log(chalk.bold.green('\n✅ 审批成功'));
    console.log(`  操作: ${action}`);
    console.log(`  新状态: ${STATUS_NAMES[newStatus]}`);
    console.log(`  截图: ${screenshotPath}`);
    
    if (options.comment) {
      console.log(`  意见: ${options.comment}`);
    }
    
  } catch (error) {
    spinner.fail('审批失败');
    console.error(chalk.red('\n错误:'), error.message);

    if (error.stack) {
      console.error(chalk.gray('\n堆栈:'), error.stack);
    }

    // 调试模式：不关闭浏览器，输出session信息供调试
    if (isDebugMode) {
      const Browser = require('../lib/browser');
      // 如果browser对象已创建，输出session信息
      try {
        console.error(chalk.cyan('\n🐛 调试模式：浏览器窗口保持打开'));
        console.error(chalk.gray('────────────────────────────────────────────────────────────'));
        console.error(chalk.yellow('Session: ') + browser.session);
        console.error(chalk.gray('\n使用以下命令调试:'));
        console.error(chalk.cyan(`  npx agent-browser --session ${browser.session} snapshot`));
        console.error(chalk.cyan(`  npx agent-browser --session ${browser.session} eval "document.body.innerHTML"`));
        console.error(chalk.gray('\n手动关闭浏览器:'));
        console.error(chalk.cyan(`  npx agent-browser --session ${browser.session} close`));
        console.error(chalk.gray('────────────────────────────────────────────────────────────'));
      } catch (e) {
        // browser可能未初始化，忽略错误
      }
    } else {
      // 非调试模式，关闭数据库
      try {
        await db.close();
      } catch (e) {
        // ignore
      }
    }

    process.exit(1);
  }
}

module.exports = approve;
