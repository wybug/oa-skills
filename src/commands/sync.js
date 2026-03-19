/**
 * sync 命令 - 同步待办列表
 * 参考 scripts/sync_oa_todos.sh 实现
 */

const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const Database = require('../lib/database');
const Browser = require('../lib/browser');
const { detectTodoType, parseTitle } = require('../lib/detector');

// JavaScript 代码：获取待办列表
const getTodosScript = `
(() => {
  const todos = [];
  
  // 查找所有待办行
  const rows = Array.from(document.querySelectorAll('table tbody tr, table tr')).filter(row => {
    if (row.querySelector('th')) return false;
    const text = row.textContent.trim();
    if (row.querySelectorAll('input[type="checkbox"]').length > 0 && 
        row.querySelectorAll('.lui_paging_t_notpre, .lui_paging_t_hasnext, .lui_paging_t_refresh').length >= 2) {
      return false;
    }
    if (/^\\s*\\d+\\s*\\/\\s*\\d+\\s*$/.test(text)) return false;
    if (/批量打开/.test(text)) return false;
    const dataHrefLink = row.querySelector('a[data-href]');
    if (!dataHrefLink) return false;
    return text.length > 0;
  });
  
  rows.forEach((row, index) => {
    const allLinks = Array.from(row.querySelectorAll('a'));
    const titleLink = allLinks.find(link => {
      const dataHref = link.getAttribute('data-href');
      return dataHref && dataHref.startsWith('/sys/notify/');
    });
    
    if (titleLink) {
      const dataHref = titleLink.getAttribute('data-href') || titleLink.dataset.href;
      const fdIdMatch = dataHref.match(/fdId=([a-f0-9]+)/i);
      const fdId = fdIdMatch ? fdIdMatch[1] : null;
      
      todos.push({
        index: index + 1,
        title: titleLink.textContent.trim(),
        href: dataHref,
        fdId: fdId,
        cells: Array.from(row.querySelectorAll('td')).map(cell => cell.textContent.trim())
      });
    }
  });
  
  const hasNextButton = document.querySelector('.lui_paging_t_hasnext:not(.lui_paging_t_hasnext_n)');
  const hasNext = hasNextButton && hasNextButton.offsetParent !== null;
  
  return JSON.stringify({
    success: true,
    todos: todos,
    count: todos.length,
    hasNext: hasNext
  });
})()
`;

// JavaScript 代码：点击下一页
const clickNextScript = `
(() => {
  const nextBtn = document.querySelector('.lui_paging_t_hasnext:not(.lui_paging_t_hasnext_n)');
  if (nextBtn && nextBtn.offsetParent !== null) {
    nextBtn.click();
    return JSON.stringify({ success: true });
  }
  return JSON.stringify({ success: false });
})()
`;

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
    
    // 打开OA系统
    spinner.start('打开OA系统...');
    await browser.open('https://oa.xgd.com');
    spinner.succeed('已进入OA系统');
    
    // 打开待办页面
    spinner.start('打开待办页面...');
    const todoUrl = 'https://oa.xgd.com/xgd/reviewperson/person_todo/todo.jsp?fdModelName=&nodeType=node&&dataType=todo&s_path=%E6%90%9C%E7%B4%E2%E7%B1%BB%E3%80%80%3E%E3%80%80%E6%89%80%E5%BE%8C%E5%8A%E5%8A%9C%E7%A1%80%E6%90%9C%E7%B4%E3%80%80%3E%E3%80%80%E6%89%80%E5%BE%8C%E5%8A%E5%8A%9C%E7%A1&s_css=default';
    await browser.open(todoUrl);
    
    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.waitForLoad();
    await new Promise(resolve => setTimeout(resolve, 3000));
    spinner.succeed('已打开待办页面');
    
    // 翻页获取所有待办
    spinner.start('正在获取待办列表...');
    
    let totalCount = 0;
    let newCount = 0;
    let updateCount = 0;
    let pageNum = 1;
    let hasMore = true;
    
    while (hasMore) {
      if (options.limit > 0 && totalCount >= options.limit) {
        spinner.info(`已达到限制数量 (${options.limit})`);
        break;
      }
      
      spinner.text = `正在获取第 ${pageNum} 页... (已获取 ${totalCount} 条)`;
      
      // 获取待办列表（每页只获取标题和fdId）
      const pageResult = await browser.eval(getTodosScript);
      
      // 解析结果
      const result = JSON.parse(pageResult);
      
      if (!result.success) {
        spinner.fail('获取待办列表失败');
        break;
      }
      
      console.log(chalk.gray(`   本页待办数: ${result.count}`));
      
      if (result.count === 0) {
        spinner.info('没有更多待办');
        break;
      }
      
      // 保存待办（每页只保存标题和fdId）
      for (const todo of result.todos) {
        if (options.limit > 0 && totalCount >= options.limit) {
          break;
        }
        
        if (!todo.fdId) {
          console.log(chalk.yellow(`   ⚠️  无法提取fdId: ${todo.title.substring(0, 40)}...`));
          continue;
        }
        
        totalCount++;
        
        const parsed = parseTitle(todo.title);
        
        const todoData = {
          fd_id: todo.fdId,
          title: todo.title,
          href: todo.href,
          todo_type: parsed.type,
          source_dept: parsed.sourceDept,
          submitter: parsed.submitter,
          raw_data: todo
        };
        
        // 检查是否已存在
        const existing = await db.getTodo(todo.fdId);
        
        if (existing) {
          await db.upsertTodo(todoData);
          updateCount++;
          console.log(chalk.gray(`   [${totalCount}] 更新: ${todo.fdId} ${todo.title.substring(0, 50)}...`));
        } else {
          await db.upsertTodo(todoData);
          newCount++;
          console.log(chalk.green(`   [${totalCount}] 新增: ${todo.fdId} ${todo.title.substring(0, 50)}...`));
        }
        
        // 获取详情（如果需要）
        if (options.withDetail || options.force === todo.fdId) {
          const shouldFetchDetail = options.force === todo.fdId || !isDetailComplete(options.config, todo.fdId);
          
          if (shouldFetchDetail) {
            spinner.text = `正在获取详情: ${todo.title.substring(0, 30)}...`;
            await fetchTodoDetail(browser, db, options.config, todoData);
          }
        }
      }
      
      // 检查是否继续翻页
      if (result.hasNext) {
        if (options.limit === 0 || totalCount < options.limit) {
          console.log(chalk.gray('   翻到下一页...'));
          
          // 点击下一页按钮
          await browser.eval(clickNextScript);
          
          pageNum++;
          await new Promise(resolve => setTimeout(resolve, 3000));
          await browser.waitForLoad();
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          break;
        }
      } else {
        console.log(chalk.gray('   ✅ 已到最后一页'));
        break;
      }
      
      // 安全限制：最多20页
      if (pageNum > 20) {
        spinner.warn('已达到最大页数限制（20页）');
        break;
      }
    }
    
    await browser.close();
    await db.close();
    
    spinner.succeed('同步完成！');
    
    // 显示统计
    console.log(chalk.bold('\n📊 同步统计:'));
    console.log(`  总计: ${totalCount} 条`);
    console.log(`  新增: ${chalk.green(newCount)} 条`);
    console.log(`  更新: ${chalk.yellow(updateCount)} 条`);
    
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
  const url = todo.href.startsWith('http') ? todo.href : `https://oa.xgd.com${todo.href}`;
  await browser.open(url);
  
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
