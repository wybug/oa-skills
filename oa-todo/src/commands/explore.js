/**
 * explore 命令 - 通用页面探索
 * 支持暂停模式供智能体多轮交互
 */

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const Browser = require('../lib/browser');
const ExploreManager = require('../lib/explore-manager');
const { createOATools } = require('../lib/web-extractor');
const { generateSessionId, SessionType } = require('../lib/session-naming');
const Logger = require('../lib/logger');
const log = Logger.getLogger('explore');

async function explore(url, options) {
  const spinner = ora('正在处理探索请求...').start();

  // 声明在外部以便catch块访问
  let browser = null;
  let exploreManager = null;
  const isDebugMode = options.debug || false;

  try {
    // 初始化探索管理器
    exploreManager = new ExploreManager(options.config);

    // ========== 处理 --close 选项 ==========
    if (options.close) {
      const sessionId = options.close;
      log.info('Explore close requested', { sessionId });

      spinner.start(`正在关闭会话: ${sessionId}...`);

      const closed = await exploreManager.closeSession(sessionId);
      log.info('Explore session closed', { sessionId });

      if (closed) {
        spinner.succeed('会话已关闭');

        // 输出简洁的状态（JSON 格式）
        console.log(JSON.stringify({
          status: 'checkpoint_closed',
          session: sessionId
        }, null, 2));

        process.exit(0);
      } else {
        spinner.fail('会话关闭失败或不存在');
        process.exit(1);
      }
    }

    // ========== 验证 URL ==========
    if (!url) {
      spinner.fail('缺少 URL 参数');
      console.log(chalk.yellow('\n用法: oa-todo explore <url> [options]'));
      console.log(chalk.gray('示例: oa-todo explore "/meeting/booking" --pause'));
      process.exit(1);
    }

    const validation = exploreManager.validateUrl(url);
    if (!validation.valid) {
      spinner.fail(`URL 验证失败: ${validation.error}`);
      process.exit(1);
    }

    const normalizedUrl = validation.url;

    // ========== 检查是否已存在会话（续期） ==========
    const existingSession = await exploreManager.findByUrl(url);
    if (existingSession) {
      await exploreManager.updateSession(existingSession.sessionId);

      // 如果是 --pause 模式，生成统一的 agentUX 上下文
      let agentUXContext = null;
      if (options.pause) {
        const oaTools = createOATools(options.config);
        const scriptTemplate = oaTools.generateScriptTemplate(existingSession.session, normalizedUrl);
        const agentFilePath = path.join(__dirname, '../agents/explore-agent.md');
        const agentGuide = fs.existsSync(agentFilePath) ? fs.readFileSync(agentFilePath, 'utf8') : '';
        agentUXContext = scriptTemplate + '\n\n' + agentGuide;
      }

      spinner.succeed('会话已续期');

      // 输出简洁的状态（JSON 格式）
      const output = {
        status: 'checkpoint_renewed',
        session: existingSession.session,
        url: normalizedUrl,
        timeout: existingSession.timeoutMinutes * 60
      };

      if (agentUXContext) {
        output.agentUXContext = agentUXContext;
      }

      console.log(JSON.stringify(output, null, 2));
      process.exit(0);
    }

    // ========== 创建新的浏览器会话 ==========
    spinner.start('创建浏览器会话...');

    // 生成会话 ID
    const purpose = options.name || 'custom';
    const sessionId = generateSessionId(SessionType.EXPLORE, { context: purpose });

    browser = new Browser(options.config, {
      debugMode: options.debug,
      session: sessionId,
      reuse: true  // 不关闭现有 daemon
    });

    // ========== 检查登录状态 ==========
    let loginStatus = await browser.checkLoginValid();
    if (!loginStatus.valid) {
      spinner.start('需要登录...');

      if (!process.env.OA_USER_NAME || !process.env.OA_USER_PASSWD) {
        spinner.fail('缺少环境变量 OA_USER_NAME 或 OA_USER_PASSWD');
        console.log(chalk.yellow('\n请在 CoPaw 的 Environments 中配置:'));
        console.log('  OA_USER_NAME=你的用户名');
        console.log('  OA_USER_PASSWD=你的密码');
        await browser.close();
        process.exit(1);
      }

      await browser.login();
    }

    // ========== 加载登录状态 ==========
    spinner.start('加载登录状态...');
    await browser.loadState();
    spinner.succeed('登录状态已加载');

    // ========== 导航到目标页面 ==========
    spinner.start(`正在打开页面: ${normalizedUrl}...`);

    try {
      // 使用 open 方法导航到目标页面
      await browser.open(normalizedUrl);
      spinner.succeed('页面已打开');
    } catch (error) {
      spinner.fail(`打开页面失败: ${error.message}`);
      await browser.close();
      process.exit(1);
    }

    // ========== 获取会话超时时间 ==========
    const timeout = options.timeout || 10;

    // ========== 保存会话信息 ==========
    await exploreManager.saveSession(sessionId, {
      session: browser.session,
      url: url,
      normalizedUrl: normalizedUrl,
      purpose: purpose,
      timeoutMinutes: timeout
    });

    // ========== 输出结果 ==========
    spinner.succeed('探索会话已创建');

    // 如果是 --pause 模式，生成统一的 agentUX 上下文
    let agentUXContext = null;
    if (options.pause) {
      const oaTools = createOATools(options.config);
      const scriptTemplate = oaTools.generateScriptTemplate(browser.session, normalizedUrl);
      const agentFilePath = path.join(__dirname, '../agents/explore-agent.md');
      const agentGuide = fs.existsSync(agentFilePath) ? fs.readFileSync(agentFilePath, 'utf8') : '';
      agentUXContext = scriptTemplate + '\n\n' + agentGuide;
    }

    // 输出简洁的状态（JSON 格式）
    const output = {
      status: 'checkpoint_created',
      session: browser.session,
      url: normalizedUrl,
      timeout: timeout * 60
    };

    // --pause 模式自动包含 agentUXContext
    if (agentUXContext) {
      output.agentUXContext = agentUXContext;
    }

    console.log(JSON.stringify(output, null, 2));

  } catch (error) {
    spinner.fail('探索会话创建失败');
    console.error(chalk.red('\n错误:'), error.message);

    if (error.stack && isDebugMode) {
      console.error(chalk.gray('\n堆栈:'), error.stack);
    }

    // 调试模式：不关闭浏览器，输出session信息供调试
    if (isDebugMode && browser) {
      console.error(chalk.cyan('\n🐛 调试模式：浏览器窗口保持打开'));
      console.error(chalk.gray('────────────────────────────────────────────────────────────'));
      console.error(chalk.yellow('Session: ') + browser.session);
      console.error(chalk.gray('\n使用以下命令调试:'));
      console.error(chalk.cyan(`  agent-browser --session ${browser.session} snapshot`));
      console.error(chalk.cyan(`  agent-browser --session ${browser.session} eval "document.body.innerHTML"`));
      console.error(chalk.gray('\n手动关闭浏览器:'));
      console.error(chalk.cyan(`  agent-browser --session ${browser.session} close`));
      console.error(chalk.gray('────────────────────────────────────────────────────────────'));
    }

    process.exit(1);
  }
}

module.exports = explore;
