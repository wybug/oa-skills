# AI开发RPA脚本指南

本指南面向 AI 辅助开发 OA 审批系统的 RPA 自动化脚本。

## 1. 项目概述

本项目是一个基于 Node.js 的 CLI 工具，用于自动化处理 OA 系统的待办审批流程。

**技术栈**:
- Node.js >= 16.0.0
- agent-browser (基于 Playwright 的浏览器自动化工具)
- SQLite (本地数据存储)

**系统架构**:
- `bin/oa-todo.js` - CLI 入口
- `src/lib/` - 核心库
  - `browser.js` - 浏览器封装类（包含纯 JS 登录实现）
  - `web-extractor.js` - 网页数据提取工具库（仅通用功能）
  - `database.js` - 数据库操作
  - `detector.js` - 待办类型检测
- `src/commands/` - 命令实现
- `src/config.js` - 配置管理

**重要**: 本项目所有功能均使用纯 JavaScript/Node.js 实现，不依赖任何 shell 脚本。

## 2. 工具库设计原则

**重要**: `web-extractor.js` 只提供通用提取功能，不包含任何业务逻辑。

### 2.1 工具库职责

提供通用的数据提取和转换能力：
- 表格提取
- 表格转 Markdown
- 元素查找
- 页面快照

### 2.2 业务逻辑职责

在具体命令中实现：
- 待办类型识别
- 针对不同类型的提取策略
- 数据格式化和保存

## 3. agent-browser 命令参考

```bash
# 打开页面
npx agent-browser --session <name> open <url>

# 获取快照
npx agent-browser --session <name> snapshot

# 执行 JavaScript
npx agent-browser --session <name> eval "<code>"

# 保存/加载状态
npx agent-browser --session <name> state save <file>
npx agent-browser --session <name> state load <file>

# 关闭会话
npx agent-browser --session <name> close
```

## 4. web-extractor.js API 参考

### 4.1 TableExtractor - 表格提取与转换

**浏览器端工具**：

```javascript
// 提取表格为对象
WebExtractor.TableExtractor.extractTable('table', {
  headerRow: 0,
  skipHeader: true
});
// 返回: { success: true, header: [...], data: [...], rowCount: 10 }

// 提取表格并转换为 Markdown
WebExtractor.TableExtractor.extractTable('table', {
  headerRow: 0,
  skipHeader: true,
  format: 'markdown'
});
// 返回: { success: true, header: [...], data: [...], rowCount: 10, markdown: '...' }

// 直接转换数据为 Markdown
WebExtractor.TableExtractor.toMarkdown(
  ['姓名', '部门'],
  [['张三', '技术部'], ['李四', '产品部']],
  { title: '人员信息' }
);
// 返回: "| 姓名 | 部门 |\n|---|---|\n| 张三 | 技术部 |\n| 李四 | 产品部 |"
```

**Node.js 端方法**：

```javascript
await browser.extractTable('table', { skipHeader: true });
await browser.extractTableAsMarkdown('table', { title: '会议信息' });
```

### 4.2 DebugHelper - 调试辅助工具

```javascript
// 获取所有表格概览
WebExtractor.DebugHelper.getAllTables();
// 返回: [{ index, rowCount, hasHeader, preview, selector }, ...]

// 获取页面概览
WebExtractor.DebugHelper.getPageOverview();
// 返回: { url, title, tables, buttons, inputs, links, forms }
```

## 5. 待办类型与处理策略

### 5.1 类型识别

在 `detector.js` 中根据标题识别类型：

```javascript
function detectTodoType(title) {
  if (title.includes('邀请您参加会议')) return 'meeting';
  if (title.includes('请假') || title.includes('休假')) return 'ehr';
  if (title.includes('请审批') || title.includes('提交的流程')) return 'workflow';
  return 'unknown';
}
```

### 5.2 提取策略

每种类型使用不同的表格查找策略：

**meeting（会议）**：
- 查找包含"会议名称"的表格
- 提取：会议名称、类型、时间、地点、参加人员等

**workflow（流程）**：
- 跳过包含"会议名称"和"流程跟踪"的表格
- 查找第一个包含表单数据的表格
- 提取：申请人、时间、事由、金额等

**ehr（休假）**：
- 跳过包含"会议名称"和"流程跟踪"的表格
- 查找包含"假别"、"开始时间"等字段的表格
- 提取：假别、时间、天数、代理人等

## 6. 开发流程

### 6.1 实现待办详情提取

在 `sync.js` 的 `fetchTodoDetail` 函数中实现业务逻辑：

```javascript
async function fetchTodoDetail(browser, db, config, todo) {
  await browser.open(url);
  await browser.initExtractor();

  let formInfo = {};
  let formMarkdown = '';

  // 根据类型使用不同的提取策略
  if (todo.todo_type === 'meeting') {
    const result = await extractMeetingTable(browser);
    formInfo = result.info;
    formMarkdown = result.markdown;
  } else if (todo.todo_type === 'ehr') {
    const result = await extractLeaveTable(browser);
    formInfo = result.info;
    formMarkdown = result.markdown;
  } else {
    const result = await extractWorkflowTable(browser);
    formInfo = result.info;
    formMarkdown = result.markdown;
  }

  // 通用部分：流程跟踪、附件
  const history = await extractWorkflowHistory(browser);
  const attachments = await extractAttachments(browser);

  // 保存数据
  const detailData = {
    fdId: todo.fd_id,
    todoType: todo.todo_type,
    formInfo: formInfo,
    formMarkdown: formMarkdown,
    workflowHistory: history,
    attachments: attachments
  };

  fs.writeFileSync(dataPath, JSON.stringify(detailData, null, 2));
}
```

### 6.2 表格提取模式

**模式1：根据关键字查找表格**

```javascript
async function extractMeetingTable(browser) {
  const tables = await browser.getAllTables();

  // 查找包含"会议名称"的表格
  const targetTable = tables.find(t => t.preview.includes('会议名称'));
  if (!targetTable) {
    return { success: false, info: {}, markdown: '' };
  }

  // 提取表格数据
  const tableData = await browser.extractTable(
    `table:nth-of-type(${targetTable.index + 1})`,
    { skipHeader: false }
  );

  // 转换为键值对和 Markdown
  const info = {};
  const markdown = ['## 会议信息', ''];

  tableData.data.forEach(row => {
    for (let i = 0; i < row.length; i += 2) {
      if (i + 1 < row.length && row[i]) {
        info[row[i]] = row[i + 1];
        markdown.push(`- **${row[i]}**: ${row[i + 1]}`);
      }
    }
  });

  return { success: true, info, markdown: markdown.join('\n') };
}
```

**模式2：查找第一个有效表格**

```javascript
async function extractWorkflowTable(browser) {
  const tables = await browser.getAllTables();

  // 跳过特定类型的表格
  const targetTable = tables.find(t =>
    !t.preview.includes('会议名称') &&
    !t.preview.includes('流程跟踪') &&
    !t.preview.includes('节点') &&
    t.rowCount > 1
  );

  if (!targetTable) {
    return { success: false, info: {}, markdown: '## 表单信息\n\n(未找到表单数据)' };
  }

  const tableData = await browser.extractTable(
    `table:nth-of-type(${targetTable.index + 1})`,
    { skipHeader: false }
  );

  // 转换数据...
  const { info, markdown } = convertTableToKeyValue(tableData);

  return { success: true, info, markdown };
}
```

### 6.3 通用提取函数

**提取流程跟踪记录**：

```javascript
async function extractWorkflowHistory(browser) {
  const tables = await browser.getAllTables();

  // 查找流程跟踪表格
  const historyTable = tables.find(t =>
    t.preview.includes('流程跟踪') ||
    (t.preview.includes('节点') && t.preview.includes('处理人'))
  );

  if (!historyTable) {
    return [];
  }

  const tableData = await browser.extractTable(
    `table:nth-of-type(${historyTable.index + 1})`,
    { skipHeader: false }
  );

  return tableData.data.filter(row => row.length > 0);
}
```

**提取附件列表**：

```javascript
async function extractAttachments(browser) {
  const code = `
    (function() {
      const attachments = [];
      document.querySelectorAll('a[href*="download"], a[href*="attachment"]').forEach((a, i) => {
        if (a.textContent.trim()) {
          attachments.push({
            name: a.textContent.trim(),
            url: a.getAttribute('href')
          });
        }
      });
      return attachments;
    })()
  `;
  return await browser.evalWithFile(code, `attachments_${Date.now()}`);
}
```

## 7. 错误处理

### 7.1 常见错误类型

| 错误类型 | 描述 | 处理方式 |
|---------|------|----------|
| INIT_ERROR | WebExtractor 初始化失败 | 保存快照，输出 [ERROR] 日志 |
| FORMAT_ERROR | getAllTables 返回格式错误 | 保存快照，输出 [ERROR] 日志 |
| LOGIN_EXPIRED | 登录状态过期 | 重新登录 |
| ACCESS_DENIED | 无权访问该待办 | 标记为 skip 状态 |

### 7.2 错误输出格式

当获取待办详情失败时，控制台输出格式：

```
[ERROR] 初始化 WebExtractor 失败: WebExtractor not available
  详情: fdId=abc123, type=meeting, title=邀请您参加会议...
```

### 7.3 特殊错误处理

#### 登录过期检测

```javascript
const snapshot = await browser.snapshot();
if (snapshot.includes('登录') && snapshot.includes('密码')) {
  console.error('[ERROR] 登录已过期，需要重新登录');
  throw new Error('LOGIN_EXPIRED');
}
```

#### 无权访问处理

```javascript
if (snapshot.includes('访问被拒绝') || snapshot.includes('无权访问')) {
  console.error('[ERROR] 无权访问该待办:', todo.title);
  await db.updateStatus(todo.fd_id, 'skip', 'sync', '无权访问');
  return;
}
```

## 8. 调试流程

### 8.1 使用断点分析页面

```javascript
// 在 fetchTodoDetail 中添加断点
await browser.initExtractor();

const tables = await browser.getAllTables();
const pageOverview = await browser.getPageOverview();

breakpoint(browser, `${todo.todo_type}类型分析`, {
  fdId: todo.fd_id,
  todoType: todo.todo_type,
  title: todo.title,
  tables: tables,
  pageOverview: pageOverview
});
```

### 8.2 手动调试命令

断点暂停后使用以下命令分析页面：

```bash
# 查看所有表格
npx agent-browser --session <session> eval 'WebExtractor.DebugHelper.getAllTables()'

# 查看页面概览
npx agent-browser --session <session> eval 'WebExtractor.DebugHelper.getPageOverview()'

# 测试表格提取
npx agent-browser --session <session> eval 'WebExtractor.TableExtractor.extractTable("table:nth-of-type(3)", {format:"markdown"})'
```

## 9. 测试验证

```bash
# 1. 重新登录
node bin/oa-todo.js sync --login

# 2. 测试不同类型
node bin/oa-todo.js sync --force <meeting_fdId>
node bin/oa-todo.js sync --force <workflow_fdId>
node bin/oa-todo.js sync --force <ehr_fdId>

# 3. 检查提取的数据
cat /tmp/oa_todos/details/<fdId>/data.json
```

## 10. 参考资料

- [agent-browser 文档](https://github.com/example/agent-browser)
- [Playwright 文档](https://playwright.dev/)
- [项目 CLAUDE.md](../../CLAUDE.md)
- [oa-todo README](../README.md)
