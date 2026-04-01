/**
 * daemon 命令 - 管理浏览器守护进程和模式
 */

const chalk = require('chalk');
const ora = require('ora');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PATHS } = require('../lib/paths');
const Logger = require('../lib/logger');
const log = Logger.getLogger('daemon');

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

  const cdpUrl = process.env.OA_CDP_URL || options.config.cdpUrl;

  if (cdpUrl) {
    console.log(chalk.green('✅ CDP模式：使用外部Chrome'));
    console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold('当前配置:'));
    console.log(`  CDP URL: ${cdpUrl}`);
    console.log(`  状态文件: ${options.config.stateFile}`);
    console.log(`  数据库: ${options.config.dbPath}`);

    // 显示持久化配置
    if (fs.existsSync(DAEMON_CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(DAEMON_CONFIG_FILE, 'utf-8'));
      if (savedConfig.cdpUrl) {
        console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.bold('持久化配置:'));
        console.log(`  CDP模式: 已启用`);
        console.log(`  启动时间: ${savedConfig.startedAt || savedConfig.restartedAt || 'N/A'}`);
      }
    }
    console.log('');
    return;
  }

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
  const cdpUrl = process.env.OA_CDP_URL;
  log.info('Daemon starting', { headed: options.headed });

  if (cdpUrl) {
    log.info('CDP mode configured', { cdpUrl });
    // CDP模式：保存配置并返回
    const config = {
      cdpUrl,
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(DAEMON_CONFIG_FILE, JSON.stringify(config, null, 2));

    spinner.succeed('CDP模式：使用外部Chrome会话');
    console.log(chalk.gray(`\nCDP URL: ${cdpUrl}`));
    console.log(chalk.gray('提示: CDP模式下不启动本地daemon\n'));
    return;
  }

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
    const cmd = `agent-browser ${headedFlag}`;

    execSync(cmd, {
      stdio: 'inherit',
      timeout: 30000
    });

    spinner.succeed('Daemon 已启动');
    log.info('Daemon started', { headed: headedMode });
    console.log(chalk.gray(`\n模式: ${headedMode ? '可见窗口' : '无头模式'}`));
    console.log(chalk.gray('提示: daemon 将持续运行，使用 Ctrl+C 或 "oa-todo daemon stop" 停止\n'));
  } catch (error) {
    log.error('Daemon start failed', { error: error.message });
    spinner.fail('启动 daemon 失败');
    console.error(chalk.red('\n错误:'), error.message);
    process.exit(1);
  }
}

async function restartDaemon(options) {
  const spinner = ora('重启 daemon...').start();
  const cdpUrl = process.env.OA_CDP_URL;
  log.info('Daemon restarting');

  if (cdpUrl) {
    // CDP模式：保存配置
    const config = {
      cdpUrl,
      restartedAt: new Date().toISOString()
    };
    fs.writeFileSync(DAEMON_CONFIG_FILE, JSON.stringify(config, null, 2));

    spinner.succeed('CDP模式：使用外部Chrome会话');
    console.log(chalk.gray(`\nCDP URL: ${cdpUrl}`));
    console.log(chalk.gray('提示: CDP模式下不启动本地daemon\n'));
    return;
  }

  try {
    // 停止现有 daemon
    execSync('agent-browser close', {
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
    execSync(`agent-browser ${headedFlag}`, {
      stdio: 'inherit',
      timeout: 30000
    });

    spinner.succeed('Daemon 已重启');
    log.info('Daemon restarted', { headed: headedMode });
    console.log(chalk.gray(`\n模式: ${headedMode ? '可见窗口' : '无头模式'}`));
  } catch (error) {
    spinner.fail('重启 daemon 失败');
    console.error(chalk.red('\n错误:'), error.message);
    process.exit(1);
  }
}

async function stopDaemon() {
  const spinner = ora('停止 daemon...').start();
  log.info('Daemon stopping');

  try {
    execSync('agent-browser close', {
      stdio: 'ignore',
      timeout: 5000
    });

    // 清除环境变量和配置
    delete process.env.OA_BROWSER_HEADED;
    if (fs.existsSync(DAEMON_CONFIG_FILE)) {
      fs.unlinkSync(DAEMON_CONFIG_FILE);
    }

    spinner.succeed('Daemon 已停止');
    log.info('Daemon stopped');
  } catch (error) {
    spinner.warn('Daemon 可能已经停止');
  }
}

async function releaseDaemon() {
  const spinner = ora('释放 daemon...').start();
  const cdpUrl = process.env.OA_CDP_URL;
  log.info('Daemon releasing');

  // CDP模式下不需要关闭外部Chrome
  if (cdpUrl) {
    spinner.succeed('CDP模式：配置已保留');
    console.log(chalk.gray(`\n当前配置: CDP模式`));
    console.log(chalk.gray('提示: 下次启动将使用相同配置\n'));
    return;
  }

  try {
    execSync('agent-browser close', {
      stdio: 'ignore',
      timeout: 5000
    });

    // 保留环境变量和配置文件（不删除）
    spinner.succeed('Daemon 已释放（配置已保留）');
    log.info('Daemon released');

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
