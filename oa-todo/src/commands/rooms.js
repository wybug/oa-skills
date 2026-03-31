/**
 * rooms 命令 - 查询会议室信息
 */

const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Browser = require('../lib/browser');
const Logger = require('../lib/logger');
const log = Logger.getLogger('rooms');

// 获取今天的日期（YYYY-MM-DD格式）
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 解析日期参数（支持 YYYY-MM-DD 和 YYYYMMDD 格式）
function parseDate(dateStr) {
  if (!dateStr) return getTodayDate();

  // 如果是 YYYYMMDD 格式 (8位数字)
  if (/^\d{8}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  // 如果是 YYYY-MM-DD 格式
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  throw new Error(`日期格式不正确: ${dateStr}，请使用 YYYY-MM-DD 或 YYYYMMDD 格式`);
}

async function rooms(options) {
  const spinner = require('ora')('正在初始化...').start();

  try {
    log.info('Rooms started', { date: options.date });
    const { config } = options;

    // 解析日期参数
    const queryDate = parseDate(options.date);

    console.log(chalk.bold('\n🏢 会议室查询'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(`查询日期: ${chalk.cyan(queryDate)}`);

    // 初始化浏览器（独立于sync命令）
    const browser = new Browser(config, { debugMode: options.debug });

    // 检查登录状态
    spinner.text = '检查登录状态...';
    let loginStatus = await browser.checkLoginValid();

    if (!loginStatus.valid) {
      spinner.text = '需要登录...';
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
    log.info('Login valid', { remaining: loginStatus.remaining });

    // 调用会议室查询脚本
    const scriptPath = path.join(__dirname, '../../scripts/getMeetingRooms.js');

    if (!fs.existsSync(scriptPath)) {
      console.error(chalk.red('错误:'), '会议室查询脚本不存在:', scriptPath);
      await browser.close();
      process.exit(1);
    }

    console.log(chalk.gray('\n正在查询会议室数据...\n'));

    // 使用 spawn 运行脚本
    const nodeArgs = [scriptPath, queryDate, queryDate];
    const proc = spawn('node', nodeArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        OA_STATE_FILE: config.stateFile,
        OA_DEBUG: options.debug ? 'true' : 'false'  // 传递 debug 选项
      }
    });

    // 等待脚本完成
    await new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`脚本退出，代码: ${code}`));
        }
      });
      proc.on('error', (err) => {
        reject(err);
      });
    });

    await browser.close();

  } catch (error) {
    log.error('Rooms failed', { error: error.message });
    console.error(chalk.red('错误:'), error.message);
    process.exit(1);
  }
}

module.exports = rooms;
