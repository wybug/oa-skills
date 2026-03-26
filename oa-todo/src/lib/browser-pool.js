/**
 * BrowserPool - 管理多个浏览器实例，每个实例通过固定数量的tab处理待办
 *
 * 工作流程:
 * 1. 启动N个浏览器实例，每个加载一次登录状态
 * 2. 每个实例创建固定数量的空白tab（默认5个）
 * 3. 将待办列表按批次分配（每批tab数量个待办）
 * 4. 每批：顺序加载URL到tab1~tabN，然后串行处理提取信息
 * 5. 处理完一批后，复用相同tab处理下一批（不关闭tab）
 * 6. 所有实例处理完毕后关闭浏览器
 *
 * 关键优化:
 * - 保持tab打开，复用tab处理多批次任务
 * - 减少tab创建/销毁开销
 * - 网络加载并发（tab间），信息提取串行（避免竞态）
 * - initExtractor缓存：跳过重复初始化
 * - 异步文件保存：并行写入提升I/O性能
 * - 智能等待：动态检测页面就绪状态
 * - 批量数据库更新：减少数据库操作次数
 */

const { createDetailHandler } = require('./detail-handlers');
const Database = require('./database');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const { generateSessionId, SessionType } = require('./session-naming');

class BrowserPool {
  /**
   * @param {Object} config - 配置对象
   * @param {Object} options - 选项
   * @param {number} options.instances - 浏览器实例数量
   * @param {number} options.tabsPerInstance - 每个实例的tab数量
   * @param {boolean} options.debug - 是否启用调试模式
   */
  constructor(config, options = {}) {
    this.config = config;
    this.instances = [];
    this.instanceCount = options.instances || 1;
    this.tabsPerInstance = options.tabsPerInstance || 5;
    this.debug = options.debug || false;
  }

  /**
   * 初始化浏览器实例池（并发优化）
   * 多个浏览器实例同时初始化，提升启动速度
   */
  async initialize() {
    const Browser = require('./browser');

    // 并发初始化所有实例
    const initPromises = [];
    for (let i = 0; i < this.instanceCount; i++) {
      initPromises.push(this._initSingleInstance(i, Browser));
    }

    // 等待所有实例初始化完成
    const results = await Promise.all(initPromises);

    // 检查是否有失败的实例
    const failedInstances = results.filter(r => !r.success);
    if (failedInstances.length > 0) {
      throw new Error(`${failedInstances.length} 个实例初始化失败`);
    }
  }

  /**
   * 初始化单个浏览器实例
   * @param {number} index - 实例索引
   * @param {Object} BrowserClass - Browser 类
   * @returns {Object} 初始化结果
   */
  async _initSingleInstance(index, BrowserClass) {
    const browser = new BrowserClass(this.config, { debugMode: this.debug });
    // 使用统一的会话命名确保会话名唯一
    const sessionId = generateSessionId(SessionType.POOL, { context: String(index) });
    browser.session = sessionId;

    try {
      await browser.loadState();
      // 等待页面稳定
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 确保有一个可用的 tab
      const tabs = await browser.listTabs();
      if (this.debug) {
        console.log(chalk.gray(`[Pool] 实例 ${index} 初始化完成，会话: ${sessionId}, tabs: [${tabs.join(', ')}]`));
      }

      // 存储到实例数组
      this.instances[index] = {
        id: index,
        browser: browser,
        sessionId: sessionId,
        isBusy: false
      };

      return { success: true, index, sessionId };
    } catch (error) {
      console.error(chalk.red(`[Pool] 实例 ${index} 初始化失败: ${error.message}`));
      return { success: false, index, error: error.message };
    }
  }

  /**
   * 处理待办列表
   * @param {Array} todos - 待办对象数组
   * @param {Database} db - 数据库实例
   * @returns {Array} 处理结果
   */
  async processTodos(todos, db) {
    if (todos.length === 0) {
      return [];
    }

    // 将todos平均分配给各实例
    const chunks = this._chunkArray(todos, this.tabsPerInstance);
    const instanceChunks = this._distributeChunks(chunks);

    if (this.debug) {
      console.log(chalk.gray(`[Pool] 分配策略: ${this.instanceCount}个实例, ${chunks.length}个批次`));
      instanceChunks.forEach((chunkIndices, i) => {
        console.log(chalk.gray(`[Pool] 实例 ${i} 处理 ${chunkIndices.length} 个批次`));
      });
    }

    // 并发处理各实例的批次
    const results = await Promise.all(
      instanceChunks.map((chunkIndices, i) =>
        this._processInstance(this.instances[i], chunkIndices, chunks, db)
      )
    );

    return results.flat();
  }

  /**
   * 将todos按每实例的tab数分块
   * 每个批次最多 tabsPerInstance 个待办
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      const chunk = array.slice(i, i + size);
      chunks.push(chunk);
      if (this.debug) {
        console.log(chalk.gray(`[Pool] 分块 ${chunks.length}: ${chunk.length} 个待办`));
      }
    }
    return chunks;
  }

  /**
   * 将批次分配给各实例
   * 使用轮询分配确保负载均衡
   */
  _distributeChunks(chunks) {
    const instanceChunks = Array.from({ length: this.instanceCount }, () => []);
    chunks.forEach((chunk, i) => {
      const instanceIndex = i % this.instanceCount;
      instanceChunks[instanceIndex].push(i);
    });
    return instanceChunks;
  }

  /**
   * 处理单个实例的多个批次（复用tab）
   * 新逻辑：
   * 1. 第一批：创建tab，处理后保持打开
   * 2. 后续批次：复用已有tab，顺序加载URL
   * 3. 最后一批处理完：保持tab打开（由closeAll统一关闭）
   *
   * 优化：
   * - 批量数据库更新：收集后统一更新
   * - 异步文件保存：并行写入
   * - 智能等待：动态检测页面就绪
   */
  async _processInstance(instance, chunkIndices, allChunks, db) {
    const { browser, id } = instance;
    const results = [];
    let reusedTabs = null; // 存储复用的tab索引
    const batchDbUpdates = []; // 收集数据库更新

    if (this.debug) {
      console.log(chalk.gray(`[Pool-${id}] 开始处理 ${chunkIndices.length} 个批次`));
    }

    for (let i = 0; i < chunkIndices.length; i++) {
      const chunkIndex = chunkIndices[i];
      const chunk = allChunks[chunkIndex];

      if (this.debug) {
        console.log(chalk.gray(`[Pool-${id}] 处理批次 ${i + 1}/${chunkIndices.length} (${chunk.length}个待办)`));
      }

      // 处理批次，传入复用的tab
      const { results: chunkResults, tabIndices, dbUpdates } =
        await this._processChunk(browser, chunk, db, id, reusedTabs);

      results.push(...chunkResults);
      batchDbUpdates.push(...dbUpdates);

      // 第一批保存tab索引供后续批次复用
      if (reusedTabs === null) {
        reusedTabs = tabIndices;
        if (this.debug) {
          console.log(chalk.gray(`[Pool-${id}] 保存 tab 索引供复用: [${tabIndices.join(', ')}]`));
        }
      }
    }

    // 批量更新数据库
    if (batchDbUpdates.length > 0) {
      if (this.debug) {
        console.log(chalk.gray(`[Pool-${id}] 批量更新数据库: ${batchDbUpdates.length} 条`));
      }
      await this._batchUpdateDatabase(db, batchDbUpdates);
    }

    return results;
  }

  /**
   * 处理单个批次（使用固定tab，顺序加载URL，串行提取信息）
   *
   * 优化改进：
   * - 复用tab，不关闭
   * - 异步文件保存：并行写入
   * - 智能等待：动态检测页面就绪
   * - 收集数据库更新：延迟批量执行
   *
   * 注意：extractorReady 不能跨tab复用（每个tab有独立的页面上下文）
   */
  async _processChunk(browser, todos, db, instanceId, reusedTabs = null, extractorReady = false) {
    const results = [];
    const tabCount = this.tabsPerInstance; // 固定tab数量（默认5）
    const dbUpdates = []; // 收集数据库更新

    if (this.debug) {
      console.log(chalk.gray(`[Pool-${instanceId}] 处理批次: ${todos.length} 个待办${reusedTabs ? '(复用tab)' : '(新建tab)'}`));
    }

    // 阶段1：准备固定数量的tab（复用或新建）
    let tabIndices;
    if (reusedTabs) {
      // 复用已有tab
      tabIndices = reusedTabs;
    } else {
      // 新建固定数量的空白tab
      tabIndices = [];
      for (let i = 0; i < tabCount; i++) {
        try {
          const tabIndex = await browser.createNewTab();
          tabIndices.push(tabIndex);
          if (this.debug) {
            console.log(chalk.gray(`[Pool-${instanceId}] 创建 tab ${tabIndex} (${i + 1}/${tabCount})`));
          }
        } catch (error) {
          if (this.debug) {
            console.error(chalk.red(`[Pool-${instanceId}] 创建 tab 失败: ${error.message}`));
          }
          tabIndices.push(null);
        }
      }
    }

    // 阶段2：顺序加载 URL 到前 N 个 tab（N = 待办数量）
    // 网络加载并发：所有tab同时发起请求，利用并发优势
    for (let i = 0; i < todos.length; i++) {
      const tabIndex = tabIndices[i];
      if (tabIndex === null) continue;

      const todo = todos[i];
      const url = todo.href.startsWith('http') ? todo.href : `https://oa.xgd.com${todo.href}`;
      try {
        await browser.openUrlInTab(tabIndex, url);
        if (this.debug) {
          console.log(chalk.gray(`[Pool-${instanceId}] Tab ${tabIndex} 打开 URL: ${url.substring(0, 60)}...`));
        }
        // 极短等待，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        if (this.debug) {
          console.error(chalk.red(`[Pool-${instanceId}] Tab ${tabIndex} 打开 URL 失败: ${error.message}`));
        }
      }
    }

    // 只有当待办数少于tab数时，才处理空白tab
    if (todos.length < tabCount) {
      for (let i = todos.length; i < tabCount; i++) {
        const tabIndex = tabIndices[i];
        if (tabIndex === null) continue;
        try {
          await browser.openUrlInTab(tabIndex, 'about:blank');
        } catch (error) {
          // 忽略空白页错误
        }
      }
    }

    // 智能等待：检测页面基本就绪（而非固定等待）
    await this._smartWaitForPages(browser, tabIndices.slice(0, todos.length), this.debug);

    // 阶段3：从 tab1 开始串行处理每个有任务的 tab 提取信息（不关闭tab）
    // 每个tab需要独立初始化extractor（页面上下文独立）
    for (let i = 0; i < todos.length; i++) {
      const tabIndex = tabIndices[i];
      const todo = todos[i];

      console.log(chalk.gray(`[Pool-${instanceId}] [${i+1}/${todos.length}] 处理: ${todo.fd_id}`));

      if (tabIndex === null || tabIndex === undefined) {
        console.log(chalk.red(`[Pool-${instanceId}] ✗ ${todo.fd_id} tab无效`));
        results.push({ success: false, fdId: todo.fd_id, error: 'tab无效' });
        continue;
      }

      try {
        // 切换到对应 tab
        await browser.switchToTab(tabIndex);

        // 等待页面加载完成
        await browser.waitForLoad(30000);

        // 每个tab都需要初始化extractor（页面上下文独立）
        // 不使用extractorReady缓存，因为每个tab是独立页面
        const detailResult = await this._extractTodoDetail(browser, this.config, todo, false);

        // 准备详情目录
        const detailDir = path.join(this.config.detailsDir, todo.fd_id);
        if (!fs.existsSync(detailDir)) {
          fs.mkdirSync(detailDir, { recursive: true });
        }

        const dataPath = path.join(detailDir, 'data.json');
        const snapshotPath = path.join(detailDir, 'snapshot.txt');
        const detailPath = path.join(detailDir, 'detail.txt');

        // 异步并行保存文件（优化I/O性能）
        const fileWrites = [
          fsPromises.writeFile(dataPath, JSON.stringify(detailResult.data, null, 2), 'utf-8'),
          fsPromises.writeFile(snapshotPath, detailResult.snapshot, 'utf-8'),
        ];

        // 保存截图（仅在debug模式）
        let screenshotPath = null;
        if (this.debug) {
          screenshotPath = path.join(detailDir, 'screenshot.png');
          fileWrites.push(browser.screenshot(screenshotPath));
        }

        // 保存详情文本
        const detailText = this._extractDetailText(detailResult.snapshot, todo, detailResult.data);
        fileWrites.push(fsPromises.writeFile(detailPath, detailText, 'utf-8'));

        // 等待所有文件写入完成
        await Promise.all(fileWrites);

        // 收集数据库更新（延迟批量执行）
        dbUpdates.push({
          fdId: todo.fd_id,
          detailPath,
          snapshotPath,
          screenshotPath,
          isApprovable: detailResult.data.isApprovable,
          skipReason: detailResult.data.skipReason
        });

        results.push({
          success: true,
          fdId: todo.fd_id,
          data: detailResult.data
        });

        console.log(chalk.green(`[Pool-${instanceId}] ✓ ${todo.fd_id} 完成`));

        // 每处理5个tab（一轮）更新一次数据库
        if ((i + 1) % 5 === 0 || i === todos.length - 1) {
          if (dbUpdates.length > 0) {
            await this._batchUpdateDatabase(db, dbUpdates);
            console.log(chalk.gray(`[Pool-${instanceId}] 已更新 ${dbUpdates.length} 条到数据库`));
            dbUpdates.length = 0; // 清空已处理的更新
          }
        }

      } catch (error) {
        console.error(chalk.red(`[Pool-${instanceId}] ✗ ${todo.fd_id} 失败: ${error.message}`));
        results.push({
          success: false,
          fdId: todo.fd_id,
          error: error.message
        });
      }
    }

    return { results, tabIndices, dbUpdates, extractorReady: false };
  }

  /**
   * 提取待办详情（从sync.js迁移）
   * @param {boolean} extractorReady - extractor是否已初始化
   */
  async _extractTodoDetail(browser, config, todo, extractorReady = false) {
    const detailDir = path.join(config.detailsDir, todo.fd_id);

    // 初始化工具库（如果未就绪）
    if (!extractorReady) {
      const initResult = await browser.initExtractor();
      if (!initResult.success) {
        throw new Error(`初始化 WebExtractor 失败: ${initResult.error || '未知错误'}`);
      }
    }

    // 获取所有表格概览
    const allTables = await browser.getAllTables();

    if (!Array.isArray(allTables)) {
      throw new Error(`getAllTables 返回格式错误，期望数组，实际类型: ${typeof allTables}`);
    }

    // 使用类型处理器处理详情
    const handler = createDetailHandler(browser, todo);
    const result = await handler.handle(allTables);

    // 提取流程跟踪和附件（通用）
    const workflowHistory = await this._extractWorkflowHistory(browser, allTables);
    const attachments = await this._extractAttachments(browser);

    // 组装结构化数据
    const structuredData = {
      fdId: todo.fd_id,
      title: todo.title,
      todoType: todo.todo_type,
      url: todo.href.startsWith('http') ? todo.href : `https://oa.xgd.com${todo.href}`,
      extractedAt: new Date().toISOString(),
      isApprovable: result.isApprovable,
      supportedActions: result.supportedActions,
      skipReason: result.reason,
      formInfo: result.formData.info,
      formMarkdown: result.formData.markdown,
      workflowHistory: workflowHistory,
      attachments: attachments
    };

    // 获取快照
    const snapshot = await browser.snapshot();

    return { data: structuredData, snapshot };
  }

  /**
   * 提取流程跟踪记录
   */
  async _extractWorkflowHistory(browser, allTables) {
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

    return tableData.data.slice(1).filter(row => row.length > 0);
  }

  /**
   * 提取附件列表
   */
  async _extractAttachments(browser) {
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
  _extractDetailText(snapshot, todo, structuredData = null) {
    const lines = [
      `待办ID: ${todo.fd_id}`,
      `标题: ${todo.title}`,
      `类型: ${todo.todo_type}`,
      `链接: ${todo.href}`,
      ''
    ];

    if (structuredData) {
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

  /**
   * 智能等待：检测页面基本就绪状态
   * 优化：动态检测而非固定等待
   */
  async _smartWaitForPages(browser, tabIndices, debug = false) {
    const maxWait = 3000; // 最大等待3秒
    const checkInterval = 200; // 每200ms检查一次
    const start = Date.now();
    let readyCount = 0;
    const targetReady = Math.min(tabIndices.length, 2); // 至少2个tab就绪即可开始

    while (Date.now() - start < maxWait && readyCount < targetReady) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));

      // 抽样检查前几个tab的状态
      readyCount = 0;
      for (let i = 0; i < Math.min(tabIndices.length, 3); i++) {
        try {
          await browser.switchToTab(tabIndices[i]);
          // 快速检查页面是否有内容
          const ready = await this._checkPageReady(browser);
          if (ready) readyCount++;
        } catch (e) {
          // 忽略检查错误
        }
      }

      if (debug && readyCount > 0) {
        console.log(chalk.gray(`[Pool] 页面就绪检查: ${readyCount}/${targetReady}`));
      }
    }

    // 最短等待500ms，确保网络请求发起
    const elapsed = Date.now() - start;
    if (elapsed < 500) {
      await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
    }
  }

  /**
   * 检查页面是否基本就绪（快速检测）
   */
  async _checkPageReady(browser) {
    try {
      const code = `document.readyState === 'complete' || document.readyState === 'interactive'`;
      const result = await browser.exec(`--session ${browser.session} eval "${code}"`, { timeout: 1000 });
      return result.trim() === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * 批量更新数据库
   * 优化：收集后统一更新，减少数据库操作次数
   */
  async _batchUpdateDatabase(db, updates) {
    // 分组更新：先更新路径，再更新状态
    const pathUpdates = updates.filter(u => u.detailPath);
    const statusUpdates = updates.filter(u => !u.isApprovable);

    // 批量更新路径
    for (const update of pathUpdates) {
      if (this.debug) {
        console.log(chalk.gray(`[DEBUG] updateDetailPaths: fdId=${update.fdId}, detailPath=${update.detailPath}, snapshotPath=${update.snapshotPath}, screenshotPath=${update.screenshotPath}`));
      }
      await db.updateDetailPaths(
        update.fdId,
        update.detailPath,
        update.snapshotPath,
        update.screenshotPath
      );
    }

    // 批量更新状态
    for (const update of statusUpdates) {
      await db.updateStatus(update.fdId, 'skip', 'sync', update.skipReason);
    }
  }

  /**
   * 关闭所有浏览器实例
   */
  async closeAll() {
    const closePromises = this.instances.map(({ browser }) => browser.close());
    await Promise.all(closePromises);
    this.instances = [];
  }

  /**
   * 获取池状态
   */
  getStatus() {
    return {
      instanceCount: this.instances.length,
      tabsPerInstance: this.tabsPerInstance,
      instances: this.instances.map(({ id, sessionId, isBusy }) => ({
        id,
        sessionId,
        isBusy
      }))
    };
  }
}

module.exports = BrowserPool;
