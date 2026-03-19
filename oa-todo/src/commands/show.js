/**
 * show 命令 - 查看待办详情
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const Database = require('../lib/database');
const Browser = require('../lib/browser');
const { STATUS_NAMES, TYPE_NAMES } = require('../config');

async function show(fdId, options) {
  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 获取待办信息（支持部分ID查询）
    const todo = await db.getTodoByPrefix(fdId);
    
    if (!todo) {
      console.log(chalk.red(`未找到待办: ${fdId}`));
      console.log(chalk.yellow('\n请先同步待办: oa-todo sync'));
      await db.close();
      process.exit(1);
    }
    
    // 在浏览器中打开
    if (options.open) {
      const browser = new Browser(options.config);
      
      // 检查登录
      const loginStatus = await browser.checkLoginValid();
      if (!loginStatus.valid) {
        console.log(chalk.yellow('需要重新登录'));
        await browser.login();
      }
      
      await browser.loadState();
      await browser.fetchTodoDetail(fdId, todo.href);
      
      console.log(chalk.green('已在浏览器中打开'));
      console.log(chalk.gray(`链接: ${todo.href}`));
      
      await db.close();
      return;
    }
    
    // 显示基本信息
    console.log(chalk.bold('\n📋 待办信息'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`${chalk.cyan('ID:')} ${todo.fd_id}`);
    console.log(`${chalk.cyan('标题:')} ${todo.title}`);
    console.log(`${chalk.cyan('类型:')} ${TYPE_NAMES[todo.todo_type] || '未知'}`);
    console.log(`${chalk.cyan('状态:')} ${STATUS_NAMES[todo.status] || todo.status}`);
    
    if (todo.source_dept) {
      console.log(`${chalk.cyan('部门:')} ${todo.source_dept}`);
    }
    
    if (todo.submitter) {
      console.log(`${chalk.cyan('提交人:')} ${todo.submitter}`);
    }
    
    console.log(`${chalk.cyan('链接:')} ${todo.href}`);
    console.log(`${chalk.cyan('创建时间:')} ${todo.created_at}`);
    console.log(`${chalk.cyan('同步时间:')} ${todo.synced_at || '-'}`);
    
    if (todo.processed_at) {
      console.log(`${chalk.cyan('处理时间:')} ${todo.processed_at}`);
    }
    
    if (todo.action) {
      console.log(`${chalk.cyan('执行动作:')} ${todo.action}`);
    }
    
    if (todo.comment) {
      console.log(`${chalk.cyan('审批意见:')} ${todo.comment}`);
    }
    
    // 显示详情文件路径
    if (todo.detail_path) {
      console.log(`${chalk.cyan('详情文件:')} ${todo.detail_path}`);
    }
    
    if (todo.screenshot_path) {
      console.log(`${chalk.cyan('截图文件:')} ${todo.screenshot_path}`);
    }
    
    // 强制刷新详情
    if (options.refresh) {
      console.log(chalk.yellow('\n正在刷新详情...'));
      
      const browser = new Browser(options.config);
      const loginStatus = await browser.checkLoginValid();
      
      if (!loginStatus.valid) {
        console.log(chalk.yellow('需要重新登录'));
        await browser.login();
      }
      
      await browser.loadState();
      await browser.fetchTodoDetail(fdId, todo.href);
      
      const detailDir = path.join(options.config.detailsDir, fdId);
      if (!fs.existsSync(detailDir)) {
        fs.mkdirSync(detailDir, { recursive: true });
      }
      
      const snapshot = await browser.snapshot();
      const snapshotPath = path.join(detailDir, 'snapshot.txt');
      fs.writeFileSync(snapshotPath, snapshot, 'utf-8');
      
      const screenshotPath = path.join(detailDir, 'screenshot.png');
      await browser.screenshot(screenshotPath);
      
      const detailPath = path.join(detailDir, 'detail.txt');
      const detailText = `待办ID: ${todo.fd_id}\n标题: ${todo.title}\n\n=== 页面内容 ===\n\n${snapshot}`;
      fs.writeFileSync(detailPath, detailText, 'utf-8');
      
      await db.updateDetailPaths(fdId, detailPath, snapshotPath, screenshotPath);
      
      console.log(chalk.green('✅ 详情已刷新'));
    }
    
    // 显示详情内容
    if (todo.detail_path && fs.existsSync(todo.detail_path)) {
      console.log(chalk.bold('\n📄 详情内容'));
      console.log(chalk.gray('─'.repeat(60)));
      
      const detailContent = fs.readFileSync(todo.detail_path, 'utf-8');
      const lines = detailContent.split('\n').slice(0, 50); // 只显示前50行
      
      lines.forEach(line => {
        console.log(line);
      });
      
      if (detailContent.split('\n').length > 50) {
        console.log(chalk.gray('\n... (更多内容请查看文件)'));
      }
    } else {
      console.log(chalk.yellow('\n💡 暂无详情文件'));
      console.log('使用以下命令获取详情:');
      console.log(chalk.cyan(`  oa-todo show ${fdId} --refresh`));
    }
    
    await db.close();
    
  } catch (error) {
    console.error(chalk.red('错误:'), error.message);
    process.exit(1);
  }
}

module.exports = show;
