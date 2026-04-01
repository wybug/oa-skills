/**
 * exec-agent.js — 直接执行 agent-browser 的工具模块
 * 使用 execFileSync 替代 execSync，消除 sh 中间进程开销
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

const AGENT_BROWSER = 'agent-browser';

/**
 * 将命令字符串解析为参数数组
 * 处理单引号/双引号包裹的参数和 < file stdin 重定向
 *
 * @param {string} argsString - 命令参数字符串（不含 agent-browser 本身）
 * @returns {{ args: string[], stdinFile?: string }}
 */
function parseArgs(argsString) {
  const args = [];
  let stdinFile = undefined;
  const str = argsString.trim();
  let i = 0;

  while (i < str.length) {
    // 跳过空白
    if (str[i] === ' ' || str[i] === '\t') {
      i++;
      continue;
    }

    // 检测 < 重定向
    if (str[i] === '<') {
      i++;
      // 跳过空白
      while (i < str.length && (str[i] === ' ' || str[i] === '\t')) i++;
      // 读取文件路径（可能被引号包裹）
      let filePath = '';
      if (i < str.length && (str[i] === '"' || str[i] === "'")) {
        const quote = str[i];
        i++;
        while (i < str.length && str[i] !== quote) {
          filePath += str[i];
          i++;
        }
        if (i < str.length) i++; // 跳过结束引号
      } else {
        while (i < str.length && str[i] !== ' ' && str[i] !== '\t') {
          filePath += str[i];
          i++;
        }
      }
      stdinFile = filePath;
      continue;
    }

    // 单引号包裹的参数
    if (str[i] === "'") {
      i++;
      let arg = '';
      while (i < str.length && str[i] !== "'") {
        arg += str[i];
        i++;
      }
      if (i < str.length) i++; // 跳过结束引号
      args.push(arg);
      continue;
    }

    // 双引号包裹的参数
    if (str[i] === '"') {
      i++;
      let arg = '';
      while (i < str.length && str[i] !== '"') {
        // 在双引号内支持反斜杠转义
        if (str[i] === '\\' && i + 1 < str.length) {
          const next = str[i + 1];
          if (next === '"' || next === '\\' || next === '$' || next === '`') {
            arg += next;
            i += 2;
            continue;
          }
        }
        arg += str[i];
        i++;
      }
      if (i < str.length) i++; // 跳过结束引号
      args.push(arg);
      continue;
    }

    // 无引号的普通参数
    let arg = '';
    while (i < str.length && str[i] !== ' ' && str[i] !== '\t') {
      arg += str[i];
      i++;
    }
    args.push(arg);
  }

  return { args, stdinFile };
}

/**
 * 使用 execFileSync 执行 agent-browser 命令
 *
 * @param {string[]} args - 参数数组
 * @param {Object} [options] - execFileSync 选项
 * @param {string|Buffer} [options.input] - stdin 输入
 * @returns {string} 命令输出
 */
function execAgent(args, options = {}) {
  const { input, ...execOptions } = options;
  return execFileSync(AGENT_BROWSER, args, {
    encoding: 'utf-8',
    timeout: 60000,
    maxBuffer: 20 * 1024 * 1024,
    ...execOptions,
    ...(input !== undefined ? { input } : {})
  });
}

/**
 * 使用 execFileSync 执行 agent-browser 命令，文件内容作为 stdin
 *
 * @param {string[]} args - 参数数组
 * @param {string} inputFile - 输入文件路径
 * @param {Object} [options] - execFileSync 选项
 * @returns {string} 命令输出
 */
function execAgentStdin(args, inputFile, options = {}) {
  const input = fs.readFileSync(inputFile, 'utf-8');
  return execAgent(args, { ...options, input });
}

module.exports = { parseArgs, execAgent, execAgentStdin, AGENT_BROWSER };
