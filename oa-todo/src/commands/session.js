/**
 * session 命令 - 统一管理浏览器会话
 * 管理 PauseManager 和 ExploreManager 的会话
 */

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function session(action, options) {
  const { config } = options;
  const pausesDir = path.join(config.todosDir, 'pauses');
  const exploreSessionsDir = path.join(config.todosDir, 'explore-sessions');

  switch (action) {
    case 'list':
    case 'ls':
      await listSessions(pausesDir, exploreSessionsDir);
      break;
    case 'close':
      if (!options.id) {
        console.error(chalk.red('错误: --id 参数是必需的'));
        console.log(chalk.gray('\n用法: oa-todo session close --id <sessionId>'));
        process.exit(1);
      }
      await closeSession(options.id, pausesDir, exploreSessionsDir);
      break;
    case 'clean':
      await cleanSessions(pausesDir, exploreSessionsDir, config);
      break;
    default:
      console.log(chalk.red(`未知操作: ${action}`));
      showHelp();
  }
}

async function listSessions(pausesDir, exploreSessionsDir) {
  console.log(chalk.bold('\n📋 活跃会话'));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  // 列出pause会话
  let pauseCount = 0;
  if (fs.existsSync(pausesDir)) {
    const files = fs.readdirSync(pausesDir).filter(f => f.endsWith('.json'));
    pauseCount = files.length;
    if (files.length > 0) {
      console.log(chalk.bold('\n📌 暂停会话 (Pause):'));
      files.forEach(file => {
        const data = JSON.parse(fs.readFileSync(path.join(pausesDir, file), 'utf8'));
        const remaining = Math.max(0, Math.floor((data.timeoutAt - Date.now()) / 60000));
        const fdId = file.replace('.json', '');
        console.log(`  ${chalk.yellow(fdId)} - ${data.title}`);
        console.log(`    Session: ${data.session}`);
        console.log(`    剩余: ${remaining}分钟\n`);
      });
    }
  }

  // 列出explore会话
  let exploreCount = 0;
  if (fs.existsSync(exploreSessionsDir)) {
    const dirs = fs.readdirSync(exploreSessionsDir);
    exploreCount = dirs.length;
    if (dirs.length > 0) {
      console.log(chalk.bold('\n🔍 探索会话 (Explore):'));
      dirs.forEach(sessionId => {
        const metaPath = path.join(exploreSessionsDir, sessionId, 'meta.json');
        if (fs.existsSync(metaPath)) {
          const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const remaining = Math.max(0, Math.floor((data.timeoutAt - Date.now()) / 60000));
          console.log(`  ${chalk.cyan(sessionId)} - ${data.purpose}`);
          console.log(`    URL: ${data.url || data.normalizedUrl}`);
          console.log(`    Session: ${data.session}`);
          console.log(`    剩余: ${remaining}分钟\n`);
        }
      });
    }
  }

  if (pauseCount === 0 && exploreCount === 0) {
    console.log(chalk.gray('\n  暂无活跃会话\n'));
  } else {
    console.log(chalk.gray(`总计: ${pauseCount + exploreCount} 个会话\n`));
  }
}

async function closeSession(sessionId, pausesDir, exploreSessionsDir) {
  const spinner = ora('关闭会话...').start();

  // 尝试在pause中查找
  const pausePath = path.join(pausesDir, `${sessionId}.json`);
  if (fs.existsSync(pausePath)) {
    const data = JSON.parse(fs.readFileSync(pausePath, 'utf8'));
    try {
      execSync(`npx agent-browser --session ${data.session} close`, { stdio: 'ignore' });
    } catch (e) {
      // 忽略关闭失败
    }
    fs.unlinkSync(pausePath);
    spinner.succeed(`已关闭pause会话: ${sessionId}`);
    return;
  }

  // 尝试在explore中查找
  const explorePath = path.join(exploreSessionsDir, sessionId);
  if (fs.existsSync(explorePath)) {
    const metaPath = path.join(explorePath, 'meta.json');
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      try {
        execSync(`npx agent-browser --session ${data.session} close`, { stdio: 'ignore' });
      } catch (e) {
        // 忽略关闭失败
      }
    }
    fs.rmSync(explorePath, { recursive: true, force: true });
    spinner.succeed(`已关闭explore会话: ${sessionId}`);
    return;
  }

  spinner.fail(`未找到会话: ${sessionId}`);
}

async function cleanSessions(pausesDir, exploreSessionsDir, config) {
  const spinner = ora('清理过期会话...').start();
  // 使用PauseManager和ExploreManager的cleanup方法
  const PauseManager = require('../lib/pause-manager');
  const ExploreManager = require('../lib/explore-manager');

  const pauseMgr = new PauseManager(config);
  const exploreMgr = new ExploreManager(config);

  await pauseMgr.cleanup();
  await exploreMgr.cleanup();

  spinner.succeed('已清理过期会话');
}

function showHelp() {
  console.log(chalk.bold('\n使用方法:'));
  console.log(chalk.gray('  oa-todo session list           列出所有活跃会话'));
  console.log(chalk.gray('  oa-todo session close --id <id> 关闭指定会话'));
  console.log(chalk.gray('  oa-todo session clean          清理过期会话\n'));
}

module.exports = session;
