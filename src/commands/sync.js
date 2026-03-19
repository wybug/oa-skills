/**
 * sync 命令 - 同步待办列表
 */

const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const Database = require('../lib/database');
const Browser = require('../lib/browser');
const { detectTodoType, parseTitle } = require('../lib/detector');

async function sync(options) {
  const spinner = ora('正在同步待办...').start();
  
  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 检查浏览器工具
    const browser = new Browser(options.config);
    
    // 检查登录状态
    spinner.text = '检查登录状态...';
    let loginStatus = await browser.checkLoginValid();
    
    if (options.login || !loginStatus.valid) {
      spinner.text = '需要重新登录...';
      if (!process.env.OA_USER_NAME || !process.env.OA_USER_PASSWD) {
        spinner.fail('缺少环境变量 OA_USER_NAME 或 OA_USER_PASSWD');
        console.log(chalk.yellow('\n请在 CoPaw 的 Environments 中配置:'));
        console.log('  OA_USER_NAME=你的用户名');
        console.log('  OA_USER_PASSWD=你的密码');
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
    
    // 获取待办列表
    spinner.start('正在获取待办列表...');
    
    let syncedCount = 0;
    let newCount = 0;
    let updateCount = 0;
    let detailCount = 0;
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      if (options.limit > 0 && syncedCount >= options.limit) {
        break;
      }
      
      spinner.text = `正在获取第 ${page} 页待办... (已同步 ${syncedCount} 条)`;
      
      // 打开待办列表页面
      const listUrl = `https://oa.xgd.com/sys/notify/sys_notify_todo/sysNotifyTodo.do?method=pagingQuery&page=${page}`;
      await browser.open(listUrl);
      
      // 获取页面快照
      const snapshot = await browser.snapshot();
      
      // 解析待办列表
      const todos = parseTodoList(snapshot);
      
      if (todos.length === 0) {
        hasMore = false;
        break;
      }
      
      // 保存待办
      for (const todo of todos) {
        if (options.limit > 0 && syncedCount >= options.limit) {
          break;
        }
        
        const parsed = parseTitle(todo.title);
        todo.todo_type = parsed.type;
        todo.source_dept = parsed.sourceDept;
        todo.submitter = parsed.submitter;
        
        // 检查是否已存在
        const existing = await db.getTodo(todo.fd_id);
        
        if (existing) {
          await db.upsertTodo(todo);
          updateCount++;
        } else {
          await db.upsertTodo(todo);
          newCount++;
        }
        
        // 获取详情（如果需要）
        if (options.withDetail || options.force === todo.fd_id) {
          const shouldFetchDetail = options.force === todo.fd_id || !isDetailComplete(options.config, todo.fd_id);
          
          if (shouldFetchDetail) {
            spinner.text = `正在获取详情: ${todo.title.substring(0, 30)}...`;
            await fetchTodoDetail(browser, db, options.config, todo);
            detailCount++;
          }
        }
        
        syncedCount++;
      }
      
      page++;
      
      // 安全限制：最多10页
      if (page > 10) {
        spinner.warn('已达到最大页数限制（10页）');
        break;
      }
    }
    
    await browser.close();
    await db.close();
    
    spinner.succeed('同步完成！');
    
    // 显示统计
    console.log(chalk.bold('\n📊 同步统计:'));
    console.log(`  总计: ${syncedCount} 条`);
    console.log(`  新增: ${chalk.green(newCount)} 条`);
    console.log(`  更新: ${chalk.yellow(updateCount)} 条`);
    if (detailCount > 0) {
      console.log(`  详情: ${chalk.cyan(detailCount)} 条`);
    }
    
    console.log(chalk.gray(`\n数据库: ${options.config.dbPath}`));
    
  } catch (error) {
    spinner.fail('同步失败');
    console.error(chalk.red('\n错误:'), error.message);
    
    if (error.stack) {
      console.error(chalk.gray('\n堆栈:'), error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * 从页面快照解析待办列表
 */
function parseTodoList(snapshot) {
  const todos = [];
  
  // 简单的文本解析（实际需要根据页面结构调整）
  // 这里假设快照中包含 fdId、标题和链接
  const lines = snapshot.split('\n');
  const fdIdRegex = /fdId=([a-f0-9]+)/gi;
  const hrefRegex = /href="([^"]*fdId=[a-f0-9]+[^"]*)"/gi;
  
  let currentFdId = null;
  let currentTitle = null;
  let currentHref = null;
  
  for (const line of lines) {
    // 提取 fdId
    const fdIdMatch = fdIdRegex.exec(line);
    if (fdIdMatch) {
      currentFdId = fdIdMatch[1];
    }
    
    // 提取 href
    const hrefMatch = hrefRegex.exec(line);
    if (hrefMatch) {
      currentHref = hrefMatch[1].replace(/&amp;/g, '&');
    }
    
    // 提取标题（假设标题在特定标签后）
    if (currentFdId && !currentTitle && line.trim() && !line.includes('fdId')) {
      currentTitle = line.trim();
      
      // 如果标题看起来合理，保存待办
      if (currentTitle && (currentTitle.includes('邀请') || currentTitle.includes('请审批'))) {
        todos.push({
          fd_id: currentFdId,
          title: currentTitle,
          href: currentHref || `/sys/notify/sys_notify_todo/sysNotifyTodo.do?method=view&fdId=${currentFdId}`,
          raw_data: { title: currentTitle, fdId: currentFdId, href: currentHref }
        });
      }
      
      currentFdId = null;
      currentTitle = null;
      currentHref = null;
    }
  }
  
  // 去重
  const uniqueTodos = [];
  const seen = new Set();
  
  for (const todo of todos) {
    if (!seen.has(todo.fd_id)) {
      seen.add(todo.fd_id);
      uniqueTodos.push(todo);
    }
  }
  
  return uniqueTodos;
}

/**
 * 判断详情是否完整
 */
function isDetailComplete(config, fdId) {
  const detailPath = path.join(config.detailsDir, fdId, 'detail.txt');
  const screenshotPath = path.join(config.detailsDir, fdId, 'screenshot.png');
  
  return fs.existsSync(detailPath) && fs.existsSync(screenshotPath);
}

/**
 * 获取待办详情
 */
async function fetchTodoDetail(browser, db, config, todo) {
  const detailDir = path.join(config.detailsDir, todo.fd_id);
  
  if (!fs.existsSync(detailDir)) {
    fs.mkdirSync(detailDir, { recursive: true });
  }
  
  // 打开详情页面
  await browser.fetchTodoDetail(todo.fd_id, todo.href);
  
  // 保存快照
  const snapshot = await browser.snapshot();
  const snapshotPath = path.join(detailDir, 'snapshot.txt');
  fs.writeFileSync(snapshotPath, snapshot, 'utf-8');
  
  // 保存截图
  const screenshotPath = path.join(detailDir, 'screenshot.png');
  await browser.screenshot(screenshotPath);
  
  // 保存详情文本（从快照提取）
  const detailPath = path.join(detailDir, 'detail.txt');
  const detailText = extractDetailText(snapshot, todo);
  fs.writeFileSync(detailPath, detailText, 'utf-8');
  
  // 更新数据库
  await db.updateDetailPaths(todo.fd_id, detailPath, snapshotPath, screenshotPath);
}

/**
 * 从快照提取详情文本
 */
function extractDetailText(snapshot, todo) {
  const lines = [
    `待办ID: ${todo.fd_id}`,
    `标题: ${todo.title}`,
    `类型: ${todo.todo_type}`,
    `链接: ${todo.href}`,
    '',
    '=== 页面内容 ===',
    '',
    snapshot
  ];
  
  return lines.join('\n');
}

module.exports = sync;
