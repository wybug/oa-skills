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
  
  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 获取待办信息
    const todo = await db.getTodo(fdId);
    
    if (!todo) {
      spinner.fail(`未找到待办: ${fdId}`);
      console.log(chalk.yellow('\n请先同步待办: oa-todo sync'));
      await db.close();
      process.exit(1);
    }
    
    spinner.succeed('找到待办');
    
    // 显示待办信息
    console.log(chalk.bold('\n📋 待办信息:'));
    console.log(`  ID: ${todo.fd_id}`);
    console.log(`  标题: ${todo.title}`);
    console.log(`  类型: ${TYPE_NAMES[todo.todo_type] || '未知'}`);
    console.log(`  当前状态: ${STATUS_NAMES[todo.status] || todo.status}`);
    
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
    
    // 检查登录
    const browser = new Browser(options.config);
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
    
    // 加载登录状态
    await browser.loadState();
    spinner.succeed('登录状态已加载');
    
    // 打开待办详情
    spinner.start('打开待办详情...');
    await browser.fetchTodoDetail(fdId, todo.href);
    spinner.succeed('已打开待办详情');
    
    // 执行审批
    spinner.start(`正在执行「${action}」操作...`);
    
    const newStatus = ACTION_TO_STATUS[action];
    
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
    
    // 更新数据库状态
    await db.updateStatus(fdId, newStatus, action, options.comment);
    
    // 保存截图作为凭证
    const screenshotDir = require('path').join(options.config.detailsDir, fdId);
    const screenshotPath = require('path').join(screenshotDir, `approve_${Date.now()}.png`);
    await browser.screenshot(screenshotPath);
    
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
    
    process.exit(1);
  }
}

module.exports = approve;
