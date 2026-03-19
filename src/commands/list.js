/**
 * list 命令 - 列出待办
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const Database = require('../lib/database');
const { STATUS_NAMES, TYPE_NAMES, STATUS_COLORS } = require('../config');

async function list(options) {
  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 构建查询条件
    const filters = {};
    
    if (options.status) {
      filters.status = options.status;
    }
    
    if (options.type) {
      filters.type = options.type;
    }
    
    if (!options.all) {
      filters.limit = options.limit || 20;
    }
    
    // 获取待办列表
    const todos = await db.getTodos(filters);
    
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
    
    // 表格输出
    const table = new Table({
      head: [
        chalk.cyan('#'),
        chalk.cyan('ID'),
        chalk.cyan('类型'),
        chalk.cyan('状态'),
        chalk.cyan('标题'),
        chalk.cyan('同步时间')
      ],
      colWidths: [4, 12, 10, 10, 50, 20],
      wordWrap: true
    });
    
    todos.forEach((todo, index) => {
      const statusColor = STATUS_COLORS[todo.status] || 'white';
      const typeName = TYPE_NAMES[todo.todo_type] || '未知';
      const statusName = STATUS_NAMES[todo.status] || todo.status;
      
      table.push([
        index + 1,
        todo.fd_id.substring(0, 8),
        typeName,
        chalk[statusColor](statusName),
        todo.title.substring(0, 60),
        todo.synced_at ? formatTime(todo.synced_at) : '-'
      ]);
    });
    
    console.log(table.toString());
    
    // 统计信息
    console.log(chalk.gray(`\n共 ${todos.length} 条待办`));
    
  } catch (error) {
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
