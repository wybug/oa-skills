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
const { breakpoint } = require('../lib/web-extractor');

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
  
  return {
    success: true,
    todos: todos,
    count: todos.length,
    hasNext: hasNext
  };
})()
`;

async function sync(options) {
  const spinner = ora('正在同步待办...').start();

  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 检查本地是否有待办数据
    if (!options.force) {
      const existingTodos = await db.getTodos({ limit: 1 });
      if (existingTodos.length > 0) {
        const total = await db.getTodoCount();
        spinner.info(`本地已有 ${total} 条待办数据`);
        console.log(chalk.gray('\n💡 提示: 使用 "oa-todo list" 查看本地待办'));
        console.log(chalk.gray('   如需强制同步，请使用: oa-todo sync --force\n'));
        await db.close();
        return;
      }
    }

    // 检查浏览器工具
    const browser = new Browser(options.config, { debugMode: options.debug });

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
    const todoUrl = 'https://oa.xgd.com/xgd/reviewperson/person_todo/todo.jsp?fdModelName=&nodeType=node&&dataType=todo&s_path=%E6%90%9C%E7%B4%A2%E7%B1%BB%E3%80%80%3E%E3%80%80%E6%89%80%E6%9C%89%E5%8A%9E%E5%85%AC%E5%8F%B0%E6%90%9C%E7%B4%A2%E3%80%80%3E%E3%80%80%E6%89%80%E6%9C%89%E5%8A%9E%E5%85%AC%E5%8F%B0&s_css=default';
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
    let skipCount = 0;
    let resetCount = 0;
    let pageNum = 1;
    let hasMore = true;
    let lastPageFdid = null; // 用于检测页面是否变化
    let emptyPageCount = 0;  // 连续空页面计数
    const maxEmptyPages = 2; // 最大连续空页面数
    let samePageRetryCount = 0; // 页面内容未变化重试计数
    const maxSamePageRetries = 3; // 最大重试次数

    while (hasMore) {
      if (options.limit > 0 && totalCount >= options.limit) {
        spinner.info(`已达到限制数量 (${options.limit})`);
        break;
      }

      spinner.text = `正在获取第 ${pageNum} 页... (已获取 ${totalCount} 条)`;

      // 使用增强的 evalWithFile 获取待办列表
      const result = await browser.evalWithFile(getTodosScript, `todos_page_${pageNum}`, {
        maxRetries: 3,
        debug: options.debug
      });

      if (!result.success) {
        spinner.fail('获取待办列表失败');
        break;
      }

      console.log(chalk.gray(`   本页待办数: ${result.count}`));

      if (result.count === 0) {
        emptyPageCount++;
        if (emptyPageCount >= maxEmptyPages) {
          spinner.warn(`连续 ${maxEmptyPages} 页为空，停止翻页`);
          break;
        }
      } else {
        emptyPageCount = 0;
      }

      // 检查页面是否真的变化了（通过比较第一个fdId）
      const currentFirstFdid = result.todos.length > 0 ? result.todos[0].fdId : null;
      if (pageNum > 1 && currentFirstFdid === lastPageFdid) {
        samePageRetryCount++;
        if (samePageRetryCount >= maxSamePageRetries) {
          console.log(chalk.yellow(`   ⚠️  连续 ${maxSamePageRetries} 次页面内容未变化，可能已到最后一页`));
          console.log(chalk.gray('   ✅ 停止翻页'));
          break;
        }
        console.log(chalk.yellow(`   ⚠️  页面内容未变化 (${samePageRetryCount}/${maxSamePageRetries})，重试翻页...`));
        // 重试翻页
        const clickResult = await browser.clickNextPage();
        if (clickResult.clicked) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          await browser.waitForLoad();
          continue;
        } else {
          console.log(chalk.gray('   ✅ 已到最后一页'));
          break;
        }
      }
      samePageRetryCount = 0; // 重置计数器
      lastPageFdid = currentFirstFdid;

      // 保存待办
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

        // 如果已存在且状态为 skip，且没有 --force-update，则跳过
        if (existing && existing.status === 'skip' && !options.forceUpdate) {
          skipCount++;
          console.log(chalk.gray(`   [${totalCount}] 跳过: ${todo.fdId} ${todo.title.substring(0, 50)}... (状态: skip)`));
          totalCount++;
          continue;
        }

        // 如果使用 --force-update 且状态为 skip，重置为 pending
        if (existing && existing.status === 'skip' && options.forceUpdate) {
          await db.upsertTodo(todoData);
          await db.updateStatus(todo.fdId, 'pending', 'sync', '强制更新重置');
          resetCount++;
          console.log(chalk.yellow(`   [${totalCount}] 重置: ${todo.fdId} ${todo.title.substring(0, 50)}... (skip → pending)`));
          totalCount++;
          // 获取详情（如果需要）
          if (!options.skipDetail || options.force === todo.fdId) {
            const shouldFetchDetail = options.force === todo.fdId || !isDetailComplete(options.config, todo.fdId);
            if (shouldFetchDetail) {
              spinner.text = `正在获取详情: ${todo.title.substring(0, 30)}...`;
              await fetchTodoDetail(browser, db, options.config, todoData);
            }
          }
          continue;
        }

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
        if (!options.skipDetail || options.force === todo.fdId) {
          const shouldFetchDetail = options.force === todo.fdId || !isDetailComplete(options.config, todo.fdId);

          if (shouldFetchDetail) {
            spinner.text = `正在获取详情: ${todo.title.substring(0, 30)}...`;
            await fetchTodoDetail(browser, db, options.config, todoData);
          }
        }
      }

      // 检查是否继续翻页 - 使用增强的 Browser 方法
      if (options.limit === 0 || totalCount < options.limit) {
        // 使用 hasNextPage 方法检查（返回详细对象）
        const hasNextResult = await browser.hasNextPage();

        if (hasNextResult.has_next) {
          console.log(chalk.gray('   翻到下一页...'));

          // 使用 clickNextPage 方法点击下一页（返回详细对象）
          const clickResult = await browser.clickNextPage();

          if (!clickResult.clicked) {
            console.log(chalk.gray('   ✅ 无法点击下一页'));
            break;
          }

          pageNum++;

          // 等待页面加载完成
          await new Promise(resolve => setTimeout(resolve, 4000));
          await browser.waitForLoad();
          await new Promise(resolve => setTimeout(resolve, 2500));
        } else {
          console.log(chalk.gray('   ✅ 已到最后一页'));
          break;
        }
      } else {
        break;
      }

      // 安全限制：最多50页
      if (pageNum > 50) {
        spinner.warn('已达到最大页数限制（50页）');
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
    if (skipCount > 0) {
      console.log(`  跳过: ${chalk.gray(skipCount)} 条 (状态: skip)`);
    }
    if (resetCount > 0) {
      console.log(`  重置: ${chalk.yellow(resetCount)} 条 (skip → pending)`);
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
 * 判断详情是否完整
 */
function isDetailComplete(config, fdId) {
  const detailPath = path.join(config.detailsDir, fdId, 'detail.txt');
  const screenshotPath = path.join(config.detailsDir, fdId, 'screenshot.png');
  
  return fs.existsSync(detailPath) && fs.existsSync(screenshotPath);
}

/**
 * 获取待办详情
 * @param {Browser} browser - 浏览器实例
 * @param {Database} db - 数据库实例
 * @param {Object} config - 配置对象
 * @param {Object} todo - 待办对象
 */
async function fetchTodoDetail(browser, db, config, todo) {
  const detailDir = path.join(config.detailsDir, todo.fd_id);

  if (!fs.existsSync(detailDir)) {
    fs.mkdirSync(detailDir, { recursive: true });
  }

  // 打开详情页面
  const url = todo.href.startsWith('http') ? todo.href : `https://oa.xgd.com${todo.href}`;
  await browser.open(url);

  // 额外等待确保页面完全加载
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 初始化工具库
  await browser.initExtractor();

  // 获取所有表格概览
  const allTables = await browser.getAllTables();

  // 根据待办类型使用不同的提取策略
  let formInfo = {};
  let formMarkdown = '';
  let workflowHistory = [];
  let attachments = [];

  if (todo.todo_type === 'meeting') {
    // 会议类型：查找包含"会议名称"的表格
    const result = await extractMeetingTable(browser, allTables);
    formInfo = result.info;
    formMarkdown = result.markdown;
  } else if (todo.todo_type === 'ehr') {
    // EHR类型：查找包含"假别"、"开始时间"等字段的表格
    const result = await extractLeaveTable(browser, allTables);
    formInfo = result.info;
    formMarkdown = result.markdown;
  } else {
    // 流程类型：跳过会议和流程跟踪表格，查找第一个有效表格
    const result = await extractWorkflowTable(browser, allTables);
    formInfo = result.info;
    formMarkdown = result.markdown;
  }

  // 提取流程跟踪记录（通用）
  workflowHistory = await extractWorkflowHistory(browser, allTables);

  // 提取附件列表（通用）
  attachments = await extractAttachments(browser);

  // 组装结构化数据
  const structuredData = {
    fdId: todo.fd_id,
    title: todo.title,
    todoType: todo.todo_type,
    url: url,
    extractedAt: new Date().toISOString(),
    formInfo: formInfo,
    formMarkdown: formMarkdown,
    workflowHistory: workflowHistory,
    attachments: attachments
  };

  // 保存结构化数据
  const dataPath = path.join(detailDir, 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(structuredData, null, 2), 'utf-8');

  // 保存快照
  const snapshot = await browser.snapshot();
  const snapshotPath = path.join(detailDir, 'snapshot.txt');
  fs.writeFileSync(snapshotPath, snapshot, 'utf-8');

  // 保存截图
  const screenshotPath = path.join(detailDir, 'screenshot.png');
  await browser.screenshot(screenshotPath);

  // 保存详情文本（从快照提取）
  const detailPath = path.join(detailDir, 'detail.txt');
  const detailText = extractDetailText(snapshot, todo, structuredData);
  fs.writeFileSync(detailPath, detailText, 'utf-8');

  // 更新数据库
  await db.updateDetailPaths(todo.fd_id, detailPath, snapshotPath, screenshotPath);
}

/**
 * 提取会议信息表格
 * @param {Browser} browser - 浏览器实例
 * @param {Array} allTables - 所有表格概览
 * @returns {Object} { info, markdown }
 */
async function extractMeetingTable(browser, allTables) {
  // 查找包含"会议名称"的表格
  const targetTable = allTables.find(t => t.preview.includes('会议名称'));

  if (!targetTable) {
    return { info: {}, markdown: '## 会议信息\n\n(未找到会议信息表格)' };
  }

  const tableData = await browser.extractTable(
    `table:nth-of-type(${targetTable.index + 1})`,
    { skipHeader: false }
  );

  if (!tableData.success) {
    return { info: {}, markdown: '## 会议信息\n\n(提取失败)' };
  }

  // 转换为键值对和Markdown
  const info = {};
  const markdownLines = ['## 会议信息', ''];

  tableData.data.forEach(row => {
    for (let i = 0; i < row.length; i += 2) {
      if (i + 1 < row.length && row[i]) {
        const key = row[i].trim();
        const value = row[i + 1] ? row[i + 1].trim() : '';
        info[key] = value;
        markdownLines.push(`- **${key}**: ${value}`);
      }
    }
  });

  return { info, markdown: markdownLines.join('\n') };
}

/**
 * 提取请假信息表格
 * @param {Browser} browser - 浏览器实例
 * @param {Array} allTables - 所有表格概览
 * @returns {Object} { info, markdown }
 */
async function extractLeaveTable(browser, allTables) {
  // 跳过包含"会议名称"和"流程跟踪"的表格
  // 查找包含"假别"、"开始时间"等字段的表格
  const targetTable = allTables.find(t =>
    !t.preview.includes('会议名称') &&
    !t.preview.includes('流程跟踪') &&
    !t.preview.includes('节点') &&
    (t.preview.includes('假别') || t.preview.includes('开始时间') || t.preview.includes('假期类型')) &&
    t.rowCount > 1
  );

  if (!targetTable) {
    return { info: {}, markdown: '## 请假信息\n\n(未找到请假信息表格)' };
  }

  const tableData = await browser.extractTable(
    `table:nth-of-type(${targetTable.index + 1})`,
    { skipHeader: false }
  );

  if (!tableData.success) {
    return { info: {}, markdown: '## 请假信息\n\n(提取失败)' };
  }

  // 转换为键值对和Markdown
  const info = {};
  const markdownLines = ['## 请假信息', ''];

  tableData.data.forEach(row => {
    for (let i = 0; i < row.length; i += 2) {
      if (i + 1 < row.length && row[i]) {
        const key = row[i].trim();
        const value = row[i + 1] ? row[i + 1].trim() : '';
        info[key] = value;
        markdownLines.push(`- **${key}**: ${value}`);
      }
    }
  });

  return { info, markdown: markdownLines.join('\n') };
}

/**
 * 提取流程表单表格
 * @param {Browser} browser - 浏览器实例
 * @param {Array} allTables - 所有表格概览
 * @returns {Object} { info, markdown }
 */
async function extractWorkflowTable(browser, allTables) {
  // 跳过包含"会议名称"和"流程跟踪"的表格
  // 查找第一个包含有效数据的表格
  const targetTable = allTables.find(t =>
    !t.preview.includes('会议名称') &&
    !t.preview.includes('流程跟踪') &&
    !t.preview.includes('节点') &&
    !t.preview.includes('处理人') &&
    t.rowCount > 1
  );

  if (!targetTable) {
    return { info: {}, markdown: '## 表单信息\n\n(未找到表单数据)' };
  }

  const tableData = await browser.extractTable(
    `table:nth-of-type(${targetTable.index + 1})`,
    { skipHeader: false }
  );

  if (!tableData.success) {
    return { info: {}, markdown: '## 表单信息\n\n(提取失败)' };
  }

  // 转换为键值对和Markdown
  const info = {};
  const markdownLines = ['## 表单信息', ''];

  tableData.data.forEach(row => {
    for (let i = 0; i < row.length; i += 2) {
      if (i + 1 < row.length && row[i]) {
        const key = row[i].trim();
        const value = row[i + 1] ? row[i + 1].trim() : '';
        info[key] = value;
        markdownLines.push(`- **${key}**: ${value}`);
      }
    }
  });

  return { info, markdown: markdownLines.join('\n') };
}

/**
 * 提取流程跟踪记录
 * @param {Browser} browser - 浏览器实例
 * @param {Array} allTables - 所有表格概览
 * @returns {Array} 流程记录数组
 */
async function extractWorkflowHistory(browser, allTables) {
  // 查找流程跟踪表格
  const historyTable = allTables.find(t =>
    t.preview.includes('流程跟踪') ||
    (t.preview.includes('节点') && t.preview.includes('处理人'))
  );

  if (!historyTable) {
    return [];
  }

  const tableData = await browser.extractTable(
    `table:nth-of-type(${historyTable.index + 1})`,
    { skipHeader: false }
  );

  if (!tableData.success) {
    return [];
  }

  // 返回过滤后的数据行（跳过表头）
  return tableData.data.slice(1).filter(row => row.length > 0);
}

/**
 * 提取附件列表
 * @param {Browser} browser - 浏览器实例
 * @returns {Array} 附件数组
 */
async function extractAttachments(browser) {
  const code = `
    (function() {
      const attachments = [];
      document.querySelectorAll('a[href*="download"], a[href*="attachment"]').forEach((a, i) => {
        if (a.textContent.trim()) {
          attachments.push({
            name: a.textContent.trim(),
            url: a.getAttribute('href')
          });
        }
      });
      return attachments;
    })()
  `;
  try {
    return await browser.evalWithFile(code, `attachments_${Date.now()}`);
  } catch (e) {
    return [];
  }
}

/**
 * 从快照提取详情文本
 */
function extractDetailText(snapshot, todo, structuredData = null) {
  const lines = [
    `待办ID: ${todo.fd_id}`,
    `标题: ${todo.title}`,
    `类型: ${todo.todo_type}`,
    `链接: ${todo.href}`,
    ''
  ];

  // 添加结构化数据
  if (structuredData) {
    if (structuredData.formMarkdown) {
      lines.push('=== 表单信息 ===');
      lines.push('');
      lines.push(structuredData.formMarkdown);
      lines.push('');
    }

    if (structuredData.attachments && structuredData.attachments.length > 0) {
      lines.push('=== 附件列表 ===');
      lines.push('');
      structuredData.attachments.forEach(att => {
        lines.push(`- ${att.name}`);
      });
      lines.push('');
    }

    if (structuredData.workflowHistory && structuredData.workflowHistory.length > 0) {
      lines.push(`=== 流程记录 (${structuredData.workflowHistory.length}条) ===`);
      lines.push('');
    }
  }

  lines.push('=== 页面快照 ===');
  lines.push('');
  lines.push(snapshot);

  return lines.join('\n');
}

module.exports = sync;
