#!/usr/bin/env node

/**
 * OA Todo CLI 工具
 * 新国都OA系统待办管理命令行工具
 */

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 设置版本
const packageJson = require('../package.json');
program.version(packageJson.version);

// 配置
const homedir = os.homedir();

const config = {
  dbPath: process.env.OA_DB_PATH || path.join(homedir, '.oa-todo', 'oa_todos.db'),
  todosDir: process.env.OA_TODOS_DIR || path.join(homedir, '.oa-todo'),
  detailsDir: process.env.OA_DETAILS_DIR || path.join(homedir, '.oa-todo', 'details'),
  stateFile: process.env.OA_STATE_FILE || path.join(homedir, '.oa-todo', 'login_state.json'),
  loginTimeout: parseInt(process.env.LOGIN_TIMEOUT_MINUTES || '25', 10)
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

// 全局 debug 选项（所有命令通用）
program.option('--debug', '开启调试模式（详细日志输出）', false);

// sync 命令
program
  .command('sync')
  .description('同步OA系统待办列表')
  .option('--limit <n>', '限制同步数量（默认0不限制）', parseInt, 0)
  .option('--force <fdId>', '强制更新指定待办详情')
  .option('--force-update', '强制更新 skip 状态的待办（重置为 pending）', false)
  .option('--fetch-detail', '获取待办详情（默认不同步详情）', false)
  .option('-c, --concurrency <n>', '详情获取并发数（默认5）', (v) => parseInt(v, 10), 5)
  .option('--login', '强制重新登录', false)
  .addHelpText('after', `

常用示例:
  oa-todo sync                      同步待办列表（默认不获取详情）
  oa-todo sync --fetch-detail       获取缺失详情（跳过列表同步，从数据库查询）
  oa-todo sync -c 3 --fetch-detail  使用3个并发获取详情
  oa-todo sync --fetch-detail --limit 10  获取前10条缺失详情
  oa-todo sync --force abc123       强制刷新指定待办的详情
  oa-todo sync --login              强制重新登录后同步
  oa-todo sync --force-update       将 skip 状态的待办重置为 pending

选项说明:
  --limit <n>       限制获取的待办数量，0 表示不限制
  --force <fdId>    仅更新指定 fdId 的待办详情，不执行列表同步
  --force-update    强制本地与远程同步，将 "skip" 状态重置为 "pending"
  --fetch-detail    获取待办详情（跳过列表同步，从数据库查询缺失详情）
  -c, --concurrency <n>  详情获取并发数（默认5）
  --login           忽略缓存的登录状态，强制重新登录

工作原理:
  默认模式 (sync):
    1. 检查登录状态，过期则自动重新登录
    2. 翻页获取所有待办列表（最多50页）
    3. 保存到本地数据库 (~/.oa-todo/oa_todos.db)
    4. 不同步详情（使用 --fetch-detail 单独获取）

  详情获取模式 (--fetch-detail):
    1. 检查登录状态（不打开页面）
    2. 从数据库查询缺少详情的待办
    3. 并发获取详情

并发获取说明:
  创建多个浏览器实例并发获取详情
  默认5个并发，可通过 -c 参数调整
  实际并发数不会超过待办数量（如2条待办仅启动2个实例）

skip 状态机制:
  - 获取审批明细时，如果页面无对应审批按钮（不同待办类型按钮不同），
    自动将该记录状态更新为 "skip"
  - skip 状态的待办在后续同步中会被自动跳过
  - 使用 --force-update 可强制将 skip 状态重置为 pending 并重新同步

待办类型与审批按钮:
  - 会议邀请 (meeting):   参加、不参加
  - EHR假期 (ehr):        同意、不同意
  - 费用报销 (expense):   同意、驳回
  - 通用流程 (workflow):  通过、驳回、转办

输出统计:
  同步完成后显示: 总计、新增、更新、跳过、重置 数量
  `)
  .action(async (options) => {
    const sync = require('../src/commands/sync');
    // 合并全局 debug 选项
    const mergedOptions = {
      ...options,
      debug: program.opts().debug
    };
    await sync({ ...mergedOptions, config });
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
  .option('--sort-received <dir>', '按接收时间排序 (desc/asc)', 'desc')
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
    const mergedOptions = {
      ...options,
      debug: program.opts().debug
    };
    await show(fdId, { ...mergedOptions, config });
  });

// approve 命令
program
  .command('approve <fdId> <action>')
  .description('审批待办')
  .addHelpText('after', `

审批动作说明:
  会议邀请 (meeting):   参加、不参加
  EHR假期 (ehr):        同意、不同意
  费用报销 (expense):   同意、驳回
  通用流程 (workflow):  通过、驳回、转办

示例:
  oa-todo approve <fdId> 参加
  oa-todo approve <fdId> 同意
  oa-todo approve <fdId> 驳回 --comment "理由"
  `)
  .option('--comment <text>', '审批意见')
  .option('--force', '强制执行（不确认）', false)
  .option('--delay <seconds>', '成功后延迟关闭窗口时间（秒）', parseInt, 3)
  .option('--skip-status-check', '跳过本地状态检查', false)
  .action(async (fdId, action, options) => {
    const approve = require('../src/commands/approve');
    const mergedOptions = {
      ...options,
      debug: program.opts().debug
    };
    await approve(fdId, action, { ...mergedOptions, config });
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

// daemon 命令
program
  .command('daemon')
  .description('管理浏览器守护进程和模式')
  .argument('[action]', '操作: status|start|restart|stop|release', 'status')
  .option('--headed', '启动/重启时使用可见窗口模式')
  .action(async (action, options) => {
    const daemon = require('../src/commands/daemon');
    await daemon(action, { ...options, config });
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
