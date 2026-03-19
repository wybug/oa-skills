/**
 * clean 命令 - 清理数据
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const Database = require('../lib/database');

async function clean(options) {
  try {
    // 初始化数据库
    const db = new Database(options.config.dbPath);
    await db.init();
    
    // 确认操作
    if (!options.force) {
      let message = '确认清理';
      
      if (options.all) {
        message = '确认清理【所有数据】？此操作不可恢复！';
      } else if (options.days) {
        message = `确认清理【${options.days}天前】的数据？`;
      } else if (options.status) {
        message = `确认清理状态为【${options.status}】的数据？`;
      }
      
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: message,
          default: false
        }
      ]);
      
      if (!answers.confirm) {
        console.log(chalk.yellow('已取消'));
        await db.close();
        process.exit(0);
      }
    }
    
    // 执行清理
    const changes = await db.clean(options);
    
    // 清理详情文件
    if (options.all) {
      const detailsDir = options.config.detailsDir;
      if (fs.existsSync(detailsDir)) {
        fs.rmSync(detailsDir, { recursive: true });
        fs.mkdirSync(detailsDir, { recursive: true });
      }
    }
    
    await db.close();
    
    console.log(chalk.green(`\n✅ 已清理 ${changes} 条数据`));
    
  } catch (error) {
    console.error(chalk.red('错误:'), error.message);
    process.exit(1);
  }
}

module.exports = clean;
