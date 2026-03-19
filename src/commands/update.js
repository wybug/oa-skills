/**
 * update 命令 - 更新待办状态
 */

const chalk = require('chalk');
const Database = require('../lib/database');
const { STATUS_NAMES } = require('../config');

async function update(fdId, status, options) {
  try {
    // 验证状态
    const validStatuses = ['skip', 'pending', 'approved', 'rejected', 'transferred', 'attended', 'not_attended', 'other'];
    
    if (!validStatuses.includes(status)) {
      console.log(chalk.red(`无效的状态: ${status}`));
      console.log(chalk.yellow(`\n有效状态:`));
      validStatuses.forEach(s => {
        console.log(`  ${s} - ${STATUS_NAMES[s]}`);
      });
      process.exit(1);
    }
    
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 获取待办信息（支持部分ID查询）
    const todo = await db.getTodoByPrefix(fdId);
    
    if (!todo) {
      console.log(chalk.red(`未找到待办: ${fdId}`));
      await db.close();
      process.exit(1);
    }
    
    const oldStatus = todo.status;
    
    // 更新状态（updateStatus 已经包含日志记录）
    await db.updateStatus(todo.fd_id, status, 'status_change', options.comment || '');
    
    console.log(chalk.green('✅ 状态已更新'));
    console.log(chalk.gray(`ID: ${todo.fd_id}`));
    console.log(chalk.gray(`标题: ${todo.title}`));
    console.log(chalk.gray(`状态: ${STATUS_NAMES[oldStatus]} → ${STATUS_NAMES[status]}`));
    
    if (options.comment) {
      console.log(chalk.gray(`备注: ${options.comment}`));
    }
    
    await db.close();
    
  } catch (error) {
    console.error(chalk.red('\n错误:'), error.message);
    process.exit(1);
  }
}

module.exports = update;
