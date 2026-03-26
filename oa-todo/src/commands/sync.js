/**
 * sync 命令 - 同步待办列表
 */

const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const Database = require('../lib/database');
const Browser = require('../lib/browser');
const BrowserPool = require('../lib/browser-pool');
const { detectTodoType, parseTitle } = require('../lib/detector');
const { createDetailHandler } = require('../lib/detail-handlers');

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

    // 检查浏览器工具
    const browser = new Browser(options.config, { debugMode: options.debug });

    // 如果使用 --fetch-detail，跳过列表同步，直接获取详情
    if (options.fetchDetail) {
      // 先检查是否有需要获取详情的待办（避免不必要的登录检查）
      const todosNeedingDetails = await db.getTodosWithoutDetails(options.limit);

      if (todosNeedingDetails.length === 0) {
        spinner.succeed('所有待办详情已完整');
        await db.close();
        return;
      }

      spinner.text = '检查登录状态...';

      // 检查登录状态（不打开页面）
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

      // 直接获取详情，无需加载列表页面
      await fetchDetailsConcurrent(null, db, options.config, options);

      await db.close();
      return;
    }

    // 如果使用 --force <fdId>，直接更新单条详情
    if (options.force && typeof options.force === 'string') {
      spinner.text = `正在获取待办详情: ${options.force}...`;

      // 检查登录状态
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

      // 从数据库获取待办信息
      const todo = await db.getTodo(options.force);
      if (!todo) {
        spinner.fail(`待办不存在: ${options.force}`);
        console.log(chalk.gray('\n💡 提示: 使用 "oa-todo list" 查看本地待办'));
        await db.close();
        await browser.close();
        return;
      }

      // 加载登录状态并获取详情
      await browser.loadState();
      await fetchTodoDetail(browser, db, options.config, todo, { debug: options.debug });

      spinner.succeed('详情更新完成！');
      console.log(chalk.gray(`\n待办ID: ${todo.fd_id}`));
      console.log(chalk.gray(`标题: ${todo.title}`));
      console.log(chalk.gray(`\n详情路径: ${todo.detail_path}`));

      await browser.close();
      await db.close();
      return;
    }

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

    // 用于收集所有同步的 fdId（用于标记已处理的待办）
    const syncedFdIds = new Set();

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

        // 收集 fdId（用于标记已处理的待办）
        syncedFdIds.add(todo.fdId);

        totalCount++;

        // 从 cells 数组提取发起人和接收时间
        const submitterFromCells = todo.cells[6] || null;
        const receivedAt = todo.cells[7] || null;

        // 保留从标题解析的信息作为后备
        const parsed = parseTitle(todo.title);

        const todoData = {
          fd_id: todo.fdId,
          title: todo.title,
          href: todo.href,
          todo_type: parsed.type,
          source_dept: parsed.sourceDept,
          submitter: submitterFromCells || parsed.submitter,  // cells[6] 优先，标题解析作为后备
          received_at: receivedAt,  // 新增：接收时间
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

    // 同步完成后，标记已处理的待办（仅全量同步）
    const isFullSync = !options.limit && !options.fetchDetail && !options.force;
    let processResult = null;

    if (isFullSync && syncedFdIds.size > 0) {
      spinner.start('检查已处理的待办...');

      processResult = await db.markProcessed([...syncedFdIds]);

      if (processResult.marked > 0) {
        spinner.succeed(`已标记 ${processResult.marked} 条待办为"已处理"`);
      } else {
        spinner.stop();
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
    if (processResult && processResult.marked > 0) {
      console.log(`  已处理: ${chalk.gray(processResult.marked)} 条 (从OA移除)`);
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
 * 并发获取待办详情（使用 BrowserPool 优化）
 * @param {Browser} browser - 浏览器实例（用于配置，不直接使用）
 * @param {Database} db - 数据库实例
 * @param {Object} config - 配置对象
 * @param {Object} options - 命令选项
 */
async function fetchDetailsConcurrent(browser, db, config, options) {
  const spinner = ora('正在获取待办详情...').start();

  // 从数据库获取缺少详情的待办（--limit 限制总数）
  const todos = await db.getTodosWithoutDetails(options.limit);

  if (todos.length === 0) {
    spinner.info('所有待办详情已完整');
    return;
  }

  const total = todos.length;
  const requestedInstances = options.concurrency || 1;  // -c 参数指定实例数

  // 计算浏览器实例数和每实例tab数
  const tabsPerInstance = 5;  // 固定每实例5个tab
  // 动态计算：每5条待办使用1个实例，不超过用户指定的上限
  const optimalInstances = Math.ceil(total / tabsPerInstance);
  const instances = Math.min(requestedInstances, optimalInstances);

  const actualConcurrency = instances * tabsPerInstance;

  spinner.text = `需要获取详情: ${total} 条，并发数: ${actualConcurrency} (${instances}实例×${tabsPerInstance}tab)`;

  // 创建浏览器池
  const pool = new BrowserPool(config, {
    instances: instances,
    tabsPerInstance: tabsPerInstance,
    debug: options.debug
  });

  try {
    // 初始化浏览器实例
    spinner.text = `初始化 ${instances} 个浏览器实例...`;
    await pool.initialize();
    spinner.succeed(`浏览器池已就绪 (${instances} 个实例)`);

    // 处理待办
    spinner.start('正在获取待办详情...');
    let completed = 0;

    // 使用回调更新进度
    await pool.processTodos(todos, db);

    spinner.succeed(`详情获取完成！共 ${total} 条`);

  } finally {
    // 确保关闭所有浏览器实例
    await pool.closeAll();
  }
}

/**
 * 获取待办详情
 * @param {Browser} browser - 浏览器实例
 * @param {Database} db - 数据库实例
 * @param {Object} config - 配置对象
 * @param {Object} todo - 待办对象
 * @param {Object} detailOptions - 详情选项
 * @param {boolean} detailOptions.debug - 是否调试模式
 */
async function fetchTodoDetail(browser, db, config, todo, detailOptions = {}) {
  const detailDir = path.join(config.detailsDir, todo.fd_id);

  if (!fs.existsSync(detailDir)) {
    fs.mkdirSync(detailDir, { recursive: true });
  }

  // 打开详情页面
  const url = todo.href.startsWith('http') ? todo.href : `https://oa.xgd.com${todo.href}`;
  // 详情页面可能需要更长的加载时间，使用30秒超时
  await browser.open(url, 30000);

  // 额外等待确保页面完全加载
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 初始化工具库
  const initResult = await browser.initExtractor();
  if (!initResult.success) {
    console.error(`${chalk.red('[ERROR]')} 初始化 WebExtractor 失败: ${initResult.error || '未知错误'}`);
    console.error(`${chalk.gray('  详情:')} fdId=${todo.fd_id}, type=${todo.todo_type}, title=${todo.title.substring(0, 30)}...`);
    // 保存快照用于调试
    const snapshot = await browser.snapshot();
    const snapshotPath = path.join(detailDir, 'snapshot.txt');
    fs.writeFileSync(snapshotPath, snapshot, 'utf-8');
    return;
  }

  // 获取所有表格概览
  const allTables = await browser.getAllTables();

  // 检查返回的数据格式
  if (!Array.isArray(allTables)) {
    console.error(`${chalk.red('[ERROR]')} getAllTables 返回格式错误，期望数组，实际类型: ${typeof allTables}`);
    console.error(`${chalk.gray('  详情:')} fdId=${todo.fd_id}, type=${todo.todo_type}`);
    // 保存快照用于调试
    const snapshot = await browser.snapshot();
    const snapshotPath = path.join(detailDir, 'snapshot.txt');
    fs.writeFileSync(snapshotPath, snapshot, 'utf-8');
    return;
  }

  // 使用类型处理器处理详情
  const handler = createDetailHandler(browser, todo);
  const result = await handler.handle(allTables);

  // 提取流程跟踪和附件（通用）
  const workflowHistory = await extractWorkflowHistory(browser, allTables);
  const attachments = await extractAttachments(browser);

  // 组装结构化数据
  const structuredData = {
    fdId: todo.fd_id,
    title: todo.title,
    todoType: todo.todo_type,
    url: url,
    extractedAt: new Date().toISOString(),
    isApprovable: result.isApprovable,
    supportedActions: result.supportedActions,
    skipReason: result.reason,
    formInfo: result.formData.info,
    formMarkdown: result.formData.markdown,
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

  // 保存截图（仅在 debug 模式）
  let screenshotPath = null;
  if (detailOptions.debug) {
    screenshotPath = path.join(detailDir, 'screenshot.png');
    await browser.screenshot(screenshotPath);
  }

  // 保存详情文本（从快照提取）
  const detailPath = path.join(detailDir, 'detail.txt');
  const detailText = extractDetailText(snapshot, todo, structuredData);
  fs.writeFileSync(detailPath, detailText, 'utf-8');

  // 更新数据库
  await db.updateDetailPaths(todo.fd_id, detailPath, snapshotPath, screenshotPath);

  // 如果不可审批，设置状态为 skip
  if (!result.isApprovable) {
    await db.updateStatus(todo.fd_id, 'skip', 'sync', result.reason);
    console.log(chalk.yellow(`   ⚠️  ${todo.fd_id} 不可审批，状态设置为 skip`));
  }
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
    // 添加审批状态信息
    if (typeof structuredData.isApprovable !== 'undefined') {
      lines.push('=== 审批状态 ===');
      lines.push(`可审批: ${structuredData.isApprovable ? '是' : '否'}`);
      if (structuredData.supportedActions && structuredData.supportedActions.length > 0) {
        lines.push(`支持动作: ${structuredData.supportedActions.join(', ')}`);
      }
      if (structuredData.skipReason) {
        lines.push(`跳过原因: ${structuredData.skipReason}`);
      }
      lines.push('');
    }

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
