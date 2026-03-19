#!/usr/bin/env node

/**
 * OA Todo CLI 工具
 * 新国都OA系统待办管理命令行工具
 */

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

// 设置版本
const packageJson = require('../package.json');
program.version(packageJson.version);

// 配置
const config = {
  dbPath: process.env.OA_DB_PATH || '/tmp/oa_todos/oa_todos.db',
  todosDir: process.env.OA_TODOS_DIR || '/tmp/oa_todos',
  detailsDir: process.env.OA_DETAILS_DIR || '/tmp/oa_todos/details',
  stateFile: process.env.OA_STATE_FILE || '/tmp/oa_login_state.json',
  loginTimeout: parseInt(process.env.LOGIN_TIMEOUT_MINUTES || '10', 10)
};

// 确保目录存在
function ensureDirs() {
  [config.todosDir, config.detailsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// 主程序
program
  .name('oa-todo')
  .description('新国都OA系统待办管理工具')
  .hook('preAction', () => {
    ensureDirs();
  });

// sync 命令
program
  .command('sync')
  .description('同步OA系统待办列表')
  .option('--limit <n>', '限制同步数量', parseInt, 0)
  .option('--force <fdId>', '强制更新指定待办详情')
  .option('--with-detail', '同步时获取详情', false)
  .option('--skip-detail', '跳过详情获取', false)
  .option('--login', '强制重新登录', false)
  .action(async (options) => {
    const sync = require('../src/commands/sync');
    await sync({ ...options, config });
  });

// list 命令
program
  .command('list')
  .alias('ls')
  .description('列出待办事项')
  .option('--status <status>', '按状态筛选 (pending/approved/skip/...)')
  .option('--type <type>', '按类型筛选 (meeting/workflow/...)')
  .option('--limit <n>', '显示数量', parseInt, 20)
  .option('--all', '显示所有', false)
  .option('--json', 'JSON格式输出', false)
  .action(async (options) => {
    const list = require('../src/commands/list');
    await list({ ...options, config });
  });

// show 命令
program
  .command('show <fdId>')
  .description('查看待办详情')
  .option('--refresh', '强制刷新详情', false)
  .option('--open', '在浏览器中打开', false)
  .action(async (fdId, options) => {
    const show = require('../src/commands/show');
    await show(fdId, { ...options, config });
  });

// approve 命令
program
  .command('approve <fdId> <action>')
  .description('审批待办')
  .option('--comment <text>', '审批意见')
  .option('--force', '强制执行（不确认）', false)
  .action(async (fdId, action, options) => {
    const approve = require('../src/commands/approve');
    await approve(fdId, action, { ...options, config });
  });

// status 命令
program
  .command('status')
  .description('查看统计信息')
  .option('--by-type', '按类型统计', false)
  .option('--by-status', '按状态统计', false)
  .option('--by-date', '按日期统计', false)
  .action(async (options) => {
    const status = require('../src/commands/status');
    await status({ ...options, config });
  });

// clean 命令
program
  .command('clean')
  .description('清理数据')
  .option('--days <n>', '清理N天前的数据', parseInt, 30)
  .option('--status <status>', '清理指定状态的数据')
  .option('--all', '清理所有数据', false)
  .action(async (options) => {
    const clean = require('../src/commands/clean');
    await clean({ ...options, config });
  });

// 错误处理
program.exitOverride((err) => {
  if (err.code === 'commander.help' || err.code === 'commander.version') {
    process.exit(0);
  }
  console.error(chalk.red('错误:'), err.message);
  process.exit(1);
});

// 解析命令行参数
program.parse(process.argv);
