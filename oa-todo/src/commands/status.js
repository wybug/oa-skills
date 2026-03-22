/**
 * status 命令 - 查看统计信息
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const Database = require('../lib/database');
const { STATUS_NAMES, TYPE_NAMES } = require('../config');

async function status(options) {
  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 获取统计信息
    const stats = await db.getStats();
    
    await db.close();
    
    // 显示总体统计
    console.log(chalk.bold('\n📊 OA 待办统计'));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(chalk.bold(`\n总计: ${chalk.cyan(stats.total)} 条待办`));

    // 详情获取进度
    if (stats.byDetail && stats.byDetail.total > 0) {
      console.log(chalk.bold('\n详情获取进度:'));
      console.log(chalk.gray('─'.repeat(40)));

      const detailTable = new Table({
        head: [chalk.cyan('状态'), chalk.cyan('数量'), chalk.cyan('占比')],
        colWidths: [15, 10, 10]
      });

      const withDetail = stats.byDetail.withDetail || 0;
      const withoutDetail = stats.byDetail.withoutDetail || 0;
      const total = stats.byDetail.total;

      const withDetailPercent = ((withDetail / total) * 100).toFixed(1);
      const withoutDetailPercent = ((withoutDetail / total) * 100).toFixed(1);

      detailTable.push(['已获取详情', withDetail, `${withDetailPercent}%`]);
      detailTable.push(['待获取详情', withoutDetail, `${withoutDetailPercent}%`]);

      console.log(detailTable.toString());
    }

    // 按状态统计
    if (options.byStatus || !options.byType) {
      console.log(chalk.bold('\n按状态统计:'));
      console.log(chalk.gray('─'.repeat(40)));
      
      const statusTable = new Table({
        head: [chalk.cyan('状态'), chalk.cyan('数量'), chalk.cyan('占比')],
        colWidths: [15, 10, 10]
      });
      
      Object.entries(stats.byStatus).forEach(([status, count]) => {
        const statusName = STATUS_NAMES[status] || status;
        const percentage = ((count / stats.total) * 100).toFixed(1);
        statusTable.push([statusName, count, `${percentage}%`]);
      });
      
      console.log(statusTable.toString());
    }
    
    // 按类型统计
    if (options.byType || !options.byStatus) {
      console.log(chalk.bold('\n按类型统计:'));
      console.log(chalk.gray('─'.repeat(40)));
      
      const typeTable = new Table({
        head: [chalk.cyan('类型'), chalk.cyan('数量'), chalk.cyan('占比')],
        colWidths: [15, 10, 10]
      });
      
      Object.entries(stats.byType).forEach(([type, count]) => {
        const typeName = TYPE_NAMES[type] || type;
        const percentage = ((count / stats.total) * 100).toFixed(1);
        typeTable.push([typeName, count, `${percentage}%`]);
      });
      
      console.log(typeTable.toString());
    }
    
    // 按日期统计
    if (options.byDate) {
      console.log(chalk.bold('\n按日期统计（最近7天）:'));
      console.log(chalk.gray('─'.repeat(40)));
      
      const dateTable = new Table({
        head: [chalk.cyan('日期'), chalk.cyan('数量')],
        colWidths: [20, 10]
      });
      
      stats.byDate.forEach(item => {
        dateTable.push([item.date, item.count]);
      });
      
      console.log(dateTable.toString());
    }
    
    console.log('');
    
  } catch (error) {
    console.error(chalk.red('错误:'), error.message);
    process.exit(1);
  }
}

module.exports = status;
