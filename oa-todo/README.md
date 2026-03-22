# OA Todo CLI 工具

新国都OA系统待办管理命令行工具

## 安装

```bash
cd /Users/wangyun/.copaw/active_skills/query-oa-approval
npm install
npm link  # 全局安装（可选）
```

## 用法

### 同步待办

```bash
# 同步所有待办列表（不获取详情）
oa-todo sync

# 限制同步数量（测试用）
oa-todo sync --limit 10

# 获取待办详情（推荐工作流）
oa-todo sync --fetch-detail          # 获取所有缺失详情
oa-todo sync --fetch-detail --limit 50  # 分批获取（推荐）
oa-todo sync -c 3 --fetch-detail     # 使用3个并发实例获取详情

# 强制更新指定待办的详情
oa-todo sync --force abc123

# 重置已跳过的待办状态
oa-todo sync --force-update

# 强制重新登录
oa-todo sync --login

# 调试模式（浏览器可见）
oa-todo sync --debug
```

**说明**：
- `--fetch-detail`: 跳过列表同步，仅获取缺失详情的待办信息
- `-c, --concurrency`: 详情获取并发数（默认5），建议使用3-5避免触发防火墙
- 使用 `--limit` 分批获取可提高稳定性

### 列出待办

```bash
# 列出待审核的待办（默认20条）
oa-todo list

# 显示所有
oa-todo list --all

# 按状态筛选
oa-todo list --status pending

# 按类型筛选
oa-todo list --type meeting

# JSON格式输出
oa-todo list --json
```

### 查看详情

```bash
# 查看详情
oa-todo show <fdId>

# 强制刷新详情
oa-todo show <fdId> --refresh

# 在浏览器中打开
oa-todo show <fdId> --open
```

### 审批待办

```bash
# 会议类
oa-todo approve <fdId> 参加
oa-todo approve <fdId> 不参加

# 流程类
oa-todo approve <fdId> 通过
oa-todo approve <fdId> 驳回
oa-todo approve <fdId> 转办

# 带审批意见
oa-todo approve <fdId> 通过 --comment "同意"

# 强制执行（不确认）
oa-todo approve <fdId> 通过 --force
```

### 查看统计

```bash
# 总体统计
oa-todo status

# 按状态统计
oa-todo status --by-status

# 按类型统计
oa-todo status --by-type

# 按日期统计
oa-todo status --by-date
```

### 清理数据

```bash
# 清理7天前的数据
oa-todo clean --days 7

# 清理指定状态的数据
oa-todo clean --status approved

# 清理所有数据
oa-todo clean --all
```

## 配置

环境变量：

- `OA_USER_NAME`: OA系统用户名
- `OA_USER_PASSWD`: OA系统密码
- `OA_DB_PATH`: 数据库路径（默认：/tmp/oa_todos/oa_todos.db）
- `OA_TODOS_DIR`: 待办目录（默认：/tmp/oa_todos）
- `OA_STATE_FILE`: 登录状态文件（默认：/tmp/oa_login_state.json）
- `LOGIN_TIMEOUT_MINUTES`: 登录超时时间（默认：10分钟）

## 数据结构

### 数据库表

#### todos 表

```sql
CREATE TABLE todos (
    fd_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    href TEXT NOT NULL,
    todo_type TEXT DEFAULT 'unknown',
    status TEXT DEFAULT 'pending',
    action TEXT,
    created_at TEXT,
    updated_at TEXT,
    synced_at TEXT,
    processed_at TEXT,
    detail_path TEXT,
    snapshot_path TEXT,
    screenshot_path TEXT,
    source_dept TEXT,
    submitter TEXT,
    comment TEXT,
    raw_data TEXT
);
```

#### logs 表

```sql
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fd_id TEXT,
    action TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    comment TEXT,
    created_at TEXT
);
```

### 待办类型

- `meeting`: 会议邀请
- `workflow`: 流程审批
- `expense`: 报销
- `ehr`: EHR
- `unknown`: 未知

### 待办状态

- `skip`: 已跳过
- `pending`: 待审核
- `approved`: 已同意
- `rejected`: 已驳回
- `transferred`: 已转办
- `attended`: 已参加
- `not_attended`: 不参加
- `other`: 其他

## 开发

```bash
# 安装依赖
npm install

# 测试运行
node bin/oa-todo.js sync --limit 1

# 调试模式
DEBUG=* node bin/oa-todo.js sync
```

## Web Extractor 工具库

项目包含一个内部工具库 `web-extractor.js`，用于网页数据提取和交互。

**注意**: 此工具库仅提供通用的表格提取和元素操作功能，不包含任何业务逻辑。业务逻辑（如会议信息提取、流程记录提取等）在具体命令中实现（参见 `src/commands/sync.js`）。

### 通用工具 API

```javascript
const Browser = require('./lib/browser');
const { breakpoint } = require('./lib/web-extractor');

const browser = new Browser(config, { debugMode: true });
await browser.loadState();
await browser.open('https://oa.xgd.com/...');

// 初始化工具库
await browser.initExtractor();

// 获取所有表格概览
const allTables = await browser.getAllTables();
console.log('表格数量:', allTables.length);

// 提取指定表格
const table = await browser.extractTable('table:nth-of-type(1)', { skipHeader: true });
console.log('表头:', table.header);
console.log('数据行数:', table.rowCount);

// 提取表格并转换为 Markdown
const tableMd = await browser.extractTableAsMarkdown('table', { title: '表格标题' });
console.log('Markdown:', tableMd.markdown);

// 获取页面概览
const pageOverview = await browser.getPageOverview();
console.log('页面信息:', pageOverview);

// 设置断点（浏览器保持打开，可手动调试）
breakpoint(browser, '分析点标签', { key: 'value' });
```

### 调试模式使用

当启用 `--debug` 模式时，浏览器窗口可见。可以：

1. 查看页面加载过程
2. 手动验证元素选择器
3. 使用断点暂停并保持浏览器打开

### 断点调试

断点功能允许在代码中设置暂停点，浏览器保持打开以便手动调试：

```javascript
const { breakpoint } = require('./lib/web-extractor');

// 在需要暂停的位置
breakpoint(browser, '待办详情页面分析', {
  fdId: todo.fd_id,
  title: todo.title
});
```

断点暂停后可以使用以下命令手动调试：

```bash
# 获取所有表格
npx agent-browser --session <输出的session> eval 'WebExtractor.DebugHelper.getAllTables()'

# 提取表格数据
npx agent-browser --session <输出的session> eval 'WebExtractor.TableExtractor.extractTable("table:nth-of-type(2)", {format:"markdown"})'

# 获取页面概览
npx agent-browser --session <输出的session> eval 'WebExtractor.DebugHelper.getPageOverview()'

# 截图查看
npx agent-browser --session <输出的session> screenshot /tmp/debug.png

# 关闭浏览器
npx agent-browser --session <输出的session> close
```

### 业务逻辑实现

不同待办类型的提取逻辑在 `src/commands/sync.js` 中实现：

- **会议类型** (`extractMeetingTable`): 查找包含"会议名称"的表格
- **流程类型** (`extractWorkflowTable`): 跳过会议和流程跟踪表格，提取第一个有效表格
- **EHR类型** (`extractLeaveTable`): 查找包含"假别"、"开始时间"等字段的表格

详细文档请参考：[docs/AI开发RPA脚本指南.md](docs/AI开发RPA脚本指南.md)

## 最佳实践

### 定时同步待办

建议使用 cron 或类似工具定时执行同步任务：

```bash
# crontab 示例：每10分钟同步一次待办列表
*/10 * * * * cd /path/to/oa-todo && node bin/oa-todo.js sync

# 每小时获取详情（分批处理）
0 * * * * cd /path/to/oa-todo && node bin/oa-todo.js sync --fetch-detail --limit 50
```

### 分批获取详情

当有大量待办需要获取详情时，建议分批处理：

```bash
# 1. 先同步待办列表
oa-todo sync

# 2. 检查待办数量
oa-todo status

# 3. 分批获取详情（每批50条，重复执行直到完成）
oa-todo sync --fetch-detail --limit 50
oa-todo status  # 检查剩余未获取详情的待办数量
# 重复执行直到所有详情获取完毕
```

### 推荐工作流

```bash
# 步骤1: 同步待办列表
oa-todo sync

# 步骤2: 查看统计
oa-todo status

# 步骤3: 分批获取详情（循环执行直到完成）
while true; do
  oa-todo sync --fetch-detail --limit 50
  sleep 5
done

# 或手动执行多次，直到 status 显示无需获取详情
```

### 并发控制

```bash
# 使用3个并发实例（更稳定，推荐）
oa-todo sync -c 3 --fetch-detail --limit 50

# 使用5个并发实例（默认值）
oa-todo sync --fetch-detail --limit 50

# 避免使用过高并发（可能触发防火墙）
# 不推荐: oa-todo sync -c 10 --fetch-detail
```

**注意**: 使用高并发（如 `-c 10`）可能触发 SafeLine WAF 防火墙，导致所有请求被阻断。

### 数据存储位置

默认数据存储在 `~/.oa-todo/` 目录：

```bash
~/.oa-todo/
├── oa_todos.db          # SQLite 数据库
├── login_state.json     # 登录状态文件
└── details/             # 待办详情目录
    └── <fdId>/          # 每个待办的详情
        ├── data.json    # 结构化数据
        ├── detail.txt   # 详情文本
        ├── snapshot.txt # 页面快照
        └── screenshot.png # 截图（debug模式）
```

可通过环境变量自定义：

```bash
export OA_DB_PATH=/custom/path/oa_todos.db
export OA_TODOS_DIR=/custom/path/
export OA_DETAILS_DIR=/custom/path/details/
```
