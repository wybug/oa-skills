/**
 * daemon 命令 - 管理浏览器守护进程和模式
 */

const chalk = require('chalk');
const ora = require('ora');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PATHS } = require('../lib/paths');

// 配置文件路径
const DAEMON_CONFIG_FILE = PATHS.daemonConfigFile;

async function daemon(action, options) {
  switch (action) {
    case 'status':
      await showStatus(options);
      break;
    case 'start':
      await startDaemon(options);
      break;
    case 'restart':
      await restartDaemon(options);
      break;
    case 'stop':
      await stopDaemon();
      break;
    case 'release':
      await releaseDaemon();
      break;
    default:
      console.log(chalk.red(`未知操作: ${action}`));
      console.log(chalk.gray('支持的操作: status, start, restart, stop, release'));
      showHelp();
  }
}

function showHelp() {
  console.log(chalk.bold('\n使用方法:'));
  console.log(chalk.gray('  oa-todo daemon status          查看当前状态'));
  console.log(chalk.gray('  oa-todo daemon start --headed  启动可见模式 daemon'));
  console.log(chalk.gray('  oa-todo daemon start           启动无头模式 daemon'));
  console.log(chalk.gray('  oa-todo daemon restart --headed 重启为可见模式'));
  console.log(chalk.gray('  oa-todo daemon stop            停止 daemon'));
  console.log(chalk.gray('  oa-todo daemon release         释放 daemon（关闭后保持配置）\n'));
}

async function showStatus(options) {
  console.log(chalk.bold('\n📊 Daemon 状态'));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  // 检查 daemon 是否运行
  try {
    const result = execSync('ps aux | grep "[a]gent-browser"', {
      encoding: 'utf-8'
    });
    console.log(chalk.green('✅ Daemon 运行中'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Daemon 未运行'));
  }

  // 显示当前配置
  const headedMode = process.env.OA_BROWSER_HEADED === '1';
  console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold('当前配置:'));
  console.log(`  浏览器模式: ${headedMode ? chalk.green('可见窗口') : chalk.gray('无头模式')}`);
  console.log(`  反检测参数: ${process.env.AGENT_BROWSER_ARGS || '--disable-blink-features=AutomationControlled'}`);
  console.log(`  状态文件: ${options.config.stateFile}`);
  console.log(`  数据库: ${options.config.dbPath}`);

  // 显示持久化配置
  if (fs.existsSync(DAEMON_CONFIG_FILE)) {
    const savedConfig = JSON.parse(fs.readFileSync(DAEMON_CONFIG_FILE, 'utf-8'));
    console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold('持久化配置:'));
    console.log(`  保存的模式: ${savedConfig.headed ? '可见窗口' : '无头模式'}`);
  }

  console.log('');
}

async function startDaemon(options) {
  const spinner = ora('启动 daemon...').start();
  const headedMode = options.headed !== undefined ? options.headed : false;

  try {
    // 保存配置
    const config = {
      headed: headedMode,
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(DAEMON_CONFIG_FILE, JSON.stringify(config, null, 2));

    // 设置环境变量
    process.env.OA_BROWSER_HEADED = headedMode ? '1' : '0';

    const headedFlag = headedMode ? '--headed' : '';
    const cmd = `npx agent-browser ${headedFlag}`;

    execSync(cmd, {
      stdio: 'inherit',
      timeout: 30000
    });

    spinner.succeed('Daemon 已启动');
    console.log(chalk.gray(`\n模式: ${headedMode ? '可见窗口' : '无头模式'}`));
    console.log(chalk.gray('提示: daemon 将持续运行，使用 Ctrl+C 或 "oa-todo daemon stop" 停止\n'));
  } catch (error) {
    spinner.fail('启动 daemon 失败');
    console.error(chalk.red('\n错误:'), error.message);
    process.exit(1);
  }
}

async function restartDaemon(options) {
  const spinner = ora('重启 daemon...').start();

  try {
    // 停止现有 daemon
    execSync('npx agent-browser close', {
      stdio: 'ignore',
      timeout: 5000
    });

    // 决定模式：选项 > 保存的配置 > 默认(false)
    let headedMode = false;
    if (options.headed !== undefined) {
      headedMode = options.headed;
    } else if (fs.existsSync(DAEMON_CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(DAEMON_CONFIG_FILE, 'utf-8'));
      headedMode = savedConfig.headed || false;
    }

    // 保存配置
    const config = {
      headed: headedMode,
      restartedAt: new Date().toISOString()
    };
    fs.writeFileSync(DAEMON_CONFIG_FILE, JSON.stringify(config, null, 2));

    // 设置环境变量
    process.env.OA_BROWSER_HEADED = headedMode ? '1' : '0';

    const headedFlag = headedMode ? '--headed' : '';
    execSync(`npx agent-browser ${headedFlag}`, {
      stdio: 'inherit',
      timeout: 30000
    });

    spinner.succeed('Daemon 已重启');
    console.log(chalk.gray(`\n模式: ${headedMode ? '可见窗口' : '无头模式'}`));
  } catch (error) {
    spinner.fail('重启 daemon 失败');
    console.error(chalk.red('\n错误:'), error.message);
    process.exit(1);
  }
}

async function stopDaemon() {
  const spinner = ora('停止 daemon...').start();

  try {
    execSync('npx agent-browser close', {
      stdio: 'ignore',
      timeout: 5000
    });

    // 清除环境变量和配置
    delete process.env.OA_BROWSER_HEADED;
    if (fs.existsSync(DAEMON_CONFIG_FILE)) {
      fs.unlinkSync(DAEMON_CONFIG_FILE);
    }

    spinner.succeed('Daemon 已停止');
  } catch (error) {
    spinner.warn('Daemon 可能已经停止');
  }
}

async function releaseDaemon() {
  const spinner = ora('释放 daemon...').start();

  try {
    execSync('npx agent-browser close', {
      stdio: 'ignore',
      timeout: 5000
    });

    // 保留环境变量和配置文件（不删除）
    spinner.succeed('Daemon 已释放（配置已保留）');

    // 显示当前配置
    if (fs.existsSync(DAEMON_CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(DAEMON_CONFIG_FILE, 'utf-8'));
      console.log(chalk.gray(`\n当前配置: ${savedConfig.headed ? '可见窗口' : '无头模式'}`));
    }
    console.log(chalk.gray('提示: 下次启动将使用相同配置\n'));
  } catch (error) {
    spinner.warn('Daemon 可能已经停止');
  }
}

module.exports = daemon;
