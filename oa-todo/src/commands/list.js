/**
 * list 命令 - 列出待办
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const Database = require('../lib/database');
const { STATUS_NAMES, TYPE_NAMES, STATUS_COLORS } = require('../config');
const Logger = require('../lib/logger');
const log = Logger.getLogger('list');

async function list(options) {
  log.info('List started', { status: options.status, type: options.type, all: options.all });

  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 构建查询条件
    const filters = {};

    // 默认只显示待审核状态（除非明确指定了其他状态或使用 --all）
    if (options.status) {
      filters.status = options.status;
    } else if (!options.all) {
      filters.status = 'pending';  // 默认只显示待审核
    }

    if (options.type) {
      filters.type = options.type;
    }

    // 支持按接收时间排序
    if (options.sortReceived) {
      filters.orderBy = 'received_at';
      filters.orderDir = options.sortReceived === 'asc' ? 'ASC' : 'DESC';
    }

    if (!options.all) {
      filters.limit = options.limit || 10;
    }
    
    // 获取待办列表
    const todos = await db.getTodos(filters);
    log.info('List completed', { count: todos.length });

    await db.close();
    
    if (todos.length === 0) {
      console.log(chalk.yellow('暂无待办'));
      return;
    }
    
    // 输出格式
    if (options.json) {
      console.log(JSON.stringify(todos, null, 2));
      return;
    }
    
    // 表格输出 - 优化显示关键信息：ID、标题、提交人、接收时间
    const table = new Table({
      head: [
        chalk.cyan('#'),
        chalk.cyan('ID (完整)'),
        chalk.cyan('标题'),
        chalk.cyan('提交人'),
        chalk.cyan('接收时间')
      ],
      colWidths: [4, 34, 60, 20, 20],
      wordWrap: true
    });

    todos.forEach((todo, index) => {
      const statusColor = STATUS_COLORS[todo.status] || 'white';

      // 提取提交人信息（从submitter字段）
      const submitter = todo.submitter || '-';

      // 使用接收时间（received_at），这是待办实际到达的时间
      const receivedTime = todo.received_at || todo.synced_at || '-';

      table.push([
        index + 1,
        todo.fd_id,  // 显示完整ID
        todo.title,  // 显示完整标题（自动换行）
        submitter,
        receivedTime ? formatTime(receivedTime) : '-'
      ]);
    });
    
    console.log(table.toString());
    
    // 统计信息
    const statusText = filters.status === 'pending' ? '待审核' : (filters.status || '所有');
    const typeText = filters.type ? ` [${TYPE_NAMES[filters.type] || filters.type}]` : '';
    console.log(chalk.gray(`\n共 ${todos.length} 条待办 (${statusText}${typeText})`));


  } catch (error) {
    log.error('List failed', { error: error.message });
    console.error(chalk.red('错误:'), error.message);
    process.exit(1);
  }
}

/**
 * 格式化时间
 */
function formatTime(timeStr) {
  const date = new Date(timeStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) {
    return '刚刚';
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}

module.exports = list;
