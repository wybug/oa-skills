# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an OA (Office Automation) approval system for 新国都集团 (XGD Group). It automates approval workflows through a Node.js CLI tool that handles:
- **会议邀请** (Meeting invitations) - Actions: 参加, 不参加
- **EHR假期** (EHR leave requests) - Actions: 同意, 不同意
- **费用报销** (Expense reimbursements) - Actions: 同意, 驳回
- **通用流程** (General workflows) - Actions: 通过, 驳回, 转办

## Node.js CLI Tool (oa-todo)

The project uses a modern Node.js CLI tool located in the `oa-todo/` subdirectory:
- **Entry point**: `oa-todo/bin/oa-todo.js`
- **Source code**: `oa-todo/src/`
- **Package config**: `oa-todo/package.json`

**Installation**:
```bash
cd oa-todo
npm install
npm link  # Optional: install globally
```

**Usage**:
```bash
oa-todo sync      # Sync todos from OA system
oa-todo list      # List todos
oa-todo show <fdId>  # Show todo details
oa-todo approve <fdId> <action>  # Approve todo
oa-todo status    # Show statistics
```

The CLI tool uses SQLite for data persistence and supports advanced features like status management and file-based JSON extraction to avoid truncation issues.

**Publishing** (internal registry):
```bash
cd oa-todo
npm run publish:internal
```

## Environment Variables (Required)

Configure these in CoPaw Environments:

```bash
OA_USER_NAME=your_username
OA_USER_PASSWD=your_password
```

**Optional Environment Variables**:
```bash
OA_STATE_FILE=~/.oa-todo/login_state.json  # Login state file location
LOGIN_TIMEOUT_MINUTES=25                   # Session timeout in minutes
OA_DB_PATH=~/.oa-todo/oa_todos.db          # Database file location
OA_TODOS_DIR=~/.oa-todo                    # Todos directory
OA_DETAILS_DIR=~/.oa-todo/details          # Details directory
OA_CDP_URL=ws://localhost:9222            # Chrome DevTools Protocol URL (CDP mode)
OA_LOGS_DIR=~/.oa-todo/logs              # Log files directory
```

**CDP Mode**: Setting `OA_CDP_URL` enables CDP mode, connecting to an external Chrome instance instead of launching a new browser. Useful for debugging or reusing existing browser sessions. Note: CDP mode only supports single-instance concurrency (external Chrome limitation).

**Security**: Never ask users for credentials directly. They must be configured in the environment.

## Dependencies

- **Node.js** >= 16.0.0 (specified in package.json engines field)
- **agent-browser** - Auto-installed via `npx agent-browser`

## Todo Types & Actions

| 类型 | detector名称 | 审批动作 | 按钮文本 |
|------|-------------|----------|----------|
| 会议邀请 | meeting | 参加、不参加 | 参加/不参加 |
| EHR假期 | ehr | 同意、不同意 | 同意/不同意 |
| 费用报销 | expense | 同意、驳回 | 同意/驳回 |
| 通用流程 | workflow | 通过、驳回、转办 | 通过/驳回 |

**Status Values** (from `src/config.js`):
- `skip` - Skipped (cannot be processed)
- `pending` - Pending approval
- `approved` - Approved/Agreed
- `rejected` - Rejected
- `transferred` - Transferred
- `attended` - Attended (meeting)
- `not_attended` - Not attended (meeting)
- `processed` - Processed (removed from OA todo list)
- `other` - Other

## Commands

### sync - Synchronize todos

```bash
oa-todo sync                        # Sync all todos (default: no detail fetch)
oa-todo sync --limit 10             # Sync first 10 todos
oa-todo sync --force <fdId>         # Force refresh specific todo detail
oa-todo sync --force-update         # Reset skip-status todos to pending
oa-todo sync --fetch-detail         # Fetch missing details (skips list sync, queries DB)
oa-todo sync -c 3 --fetch-detail    # Fetch details with up to 3 concurrent workers
oa-todo sync --login                # Force re-login
```

**Note**: The `--fetch-detail` option is a workflow that:
1. Checks login status (without opening pages)
2. Queries database for todos missing details
3. Creates multiple browser instances for concurrent detail fetching
4. Instance count = min(`-c` limit, ceil(todos/5)), default `-c` is 1
5. For 200 todos with `-c 5`: creates 5 workers, ~40 todos each

### list - List todos

```bash
oa-todo list                          # List pending todos
oa-todo list --status approved        # List by status
oa-todo list --type meeting           # List by type
oa-todo list --limit 50               # Limit results
oa-todo list --all                    # Show all (including non-pending)
oa-todo list --json                   # JSON output
oa-todo list --sort-received desc     # Sort by received time (desc/asc)
```

### show - Show todo details

```bash
oa-todo show <fdId>             # Show todo details
oa-todo show <fdId> --refresh   # Force refresh details
oa-todo show <fdId> --open      # Open in browser
```

### approve - Approve todos

```bash
oa-todo approve <fdId> 参加
oa-todo approve <fdId> 同意
oa-todo approve <fdId> 驳回 --comment "需要修改"
oa-todo approve <fdId> 通过 --force --skip-status-check
oa-todo approve <fdId> --pause                    # Create pause checkpoint for AI review
oa-todo approve <fdId> --pause --timeout 15       # Custom timeout (15 minutes)
```

### status - Show statistics

```bash
oa-todo status                  # Overall statistics
oa-todo status --by-type        # Group by type
oa-todo status --by-status      # Group by status
oa-todo status --by-date        # Group by date
```

### daemon - Manage browser daemon

```bash
oa-todo daemon                    # Show daemon status (default action)
oa-todo daemon status             # Show daemon status
oa-todo daemon start              # Start daemon
oa-todo daemon stop               # Stop daemon
oa-todo daemon restart            # Restart daemon
oa-todo daemon release            # Release daemon resources
oa-todo daemon start --headed     # Start with visible browser
```

### session - Manage browser sessions

```bash
oa-todo session list              # List all active sessions (default)
oa-todo session ls                # Same as list
oa-todo session close --id <id>   # Close specific session
oa-todo session clean             # Clean expired sessions
```

**Session types** (from `src/lib/session-naming.js`):
- `default` - Standard browser session
- `pause` - Pause/checkpoint session for todo review
- `explore` - Exploration session for OA pages
- `login` - Login session
- `pool` - Browser pool worker session

### explore - Explore OA pages

```bash
oa-todo explore "/meeting/booking" --pause              # Create pause session with agentUX context
oa-todo explore "/leave/apply" --pause --timeout 20     # Custom timeout (minutes)
oa-todo explore "/expense/form" --pause --headed        # Show browser window
oa-todo explore --close <sessionId>                     # Close specific session
```

**Use cases**:
- Meeting room booking
- Leave application
- Expense reimbursement forms
- General OA form interactions

**Agent workflow**:
1. CLI creates pause session and returns JSON with `agentUXContext`
2. Agent uses `agent-browser --session <id>` to explore
3. Agent guides user through multi-turn dialogue
4. Agent generates command sequence for user confirmation
5. Execution and summary

### rooms - Query meeting room availability

```bash
oa-todo rooms                    # Query today's meeting rooms
oa-todo rooms 2026-03-25         # Query specific date
oa-todo rooms 20260325           # Short date format
```

**Output**:
- Meeting room list (grouped by floor)
- Occupancy statistics
- Available rooms list
- Available time slots per room
- JSON data export to `/tmp/meeting_rooms_YYYYMMDD.json`

## State File Location

Default: `~/.oa-todo/login_state.json` (overridable via `OA_STATE_FILE`)

Contains: Cookies, localStorage, sessionStorage, browser context

Valid for: ~25 minutes (configurable via `LOGIN_TIMEOUT_MINUTES`)

## Data Storage

Default location: `~/.oa-todo/` (overridable via `OA_TODOS_DIR`)

- **Database**: SQLite at `~/.oa-todo/oa_todos.db` (or `OA_DB_PATH`)
- **Todo details**: `~/.oa-todo/details/<fdId>/`
  - `data.json` - Structured data
  - `detail.txt` - Plain text detail
  - `snapshot.txt` - Page snapshot
  - `screenshot.png` - Page screenshot
- **Pause sessions**: `~/.oa-todo/pauses/<fdId>.json` - Checkpoint session data
- **Explore sessions**: `~/.oa-todo/explore-sessions/<sessionId>/` - Exploration session data
- **Temporary files**: `~/.oa-todo/temp/` - Temporary JS files for eval execution (auto-cleaned)
- **Logs**: `~/.oa-todo/logs/` - Log files (overridable via `OA_LOGS_DIR`)
  - Daily rotation: `oa-todo-YYYY-MM-DD.log` (Beijing timezone)
  - Retention: 7 days,

## Session Naming Convention

Session IDs follow the pattern: `oa-todo-<type>-<context>-<timestamp>-<suffix>`

- **Type**: `default`, `pause`, `explore`, `login`, `pool`
- **Context**: fdId, purpose, or other identifier
- **Timestamp**: Unix timestamp (13 digits)
- **Suffix**: Short random ID for explore/pool types

Examples:
- `oa-todo-pause-abc123-1711234567890` - Pause session for todo abc123
- `oa-todo-explore-meeting-1711234567890-a1b2c3` - Explore session for meeting

## Pause/Checkpoint System

The pause system allows AI agents to interactively review todos before approval:

**Workflow**:
1. Create pause: `oa-todo approve <fdId> --pause [--timeout <minutes>]`
2. CLI returns JSON with session ID and agentUXContext
3. Agent uses `agent-browser --session <id>` to explore page
4. Agent reviews content, extracts information, presents to user
5. User confirms action
6. Agent executes: `oa-todo approve <fdId> <action> --force`

**Lifecycle**:
- Default timeout: 10 minutes (configurable)
- Auto-renews on activity
- Auto-cleanup after timeout
- Manual close via `oa-todo session close --id <fdId>`

## Todo Type Detection

Detection is based on title patterns:
- **meeting**: Title starts with "邀请您参加会议"
- **ehr**: Title contains "休假" or "年假"
- **expense**: Title contains "付款报销" or "费用报销"
- **workflow**: Title starts with "请审批"
- **unknown**: Default fallback

## Approval Workflow

1. Check login validity, auto-relogin if expired
2. Load browser state from file
3. Open todo detail page directly via URL
4. Click appropriate action button(s)
5. Submit approval
6. Update local database status

## Debugging

Run with global debug mode (verbose logging):
```bash
oa-todo --debug sync
oa-todo --debug approve <fdId> <action>
```

Run with headed browser (via daemon):
```bash
oa-todo daemon start --headed
oa-todo approve <fdId> <action>
```

**CDP Mode** (connect to external Chrome):
```bash
# Start Chrome with remote debugging
chrome --remote-debugging-port=9222

# Set environment variable
export OA_CDP_URL=ws://localhost:9222

# Run commands (will use external Chrome)
oa-todo sync
oa-todo approve <fdId> <action>
```

## Architecture

### Key Modules

- `src/lib/browser.js` - Browser automation wrapper around agent-browser with CDP mode support
- `src/lib/database.js` - SQLite database operations
- `src/lib/detector.js` - Todo type detection from titles
- `src/lib/detail-handlers.js` - Type-specific detail page handlers
- `src/lib/web-extractor.js` - JavaScript injection for data extraction (WebExtractor toolkit)
- `src/lib/paths.js` - Centralized path configuration and directory management
- `src/lib/logger.js` - File-based logging (日志轮转、按天分割、7天保留)
- `src/lib/session-naming.js` - Unified session ID generation and parsing
- `src/lib/pause-manager.js` - Checkpoint session lifecycle management
- `src/lib/explore-manager.js` - Explore session lifecycle management
- `src/lib/browser-pool.js` - Concurrent browser instances for detail fetching
- `src/config.js` - Constants for status, types, actions, and their mappings

### Browser Capabilities

The Browser class provides advanced automation features:

**Tab Management**:
- `openInNewTab(url)` - Open URL in a new tab
- `switchToTab(index)` - Switch to specific tab
- `closeTab(index)` - Close specified tab
- `listTabs()` - Get all open tabs

**Data Extraction** (via WebExtractor):
- `extractTable(selector)` - Extract table data
- `extractTableAsMarkdown(selector)` - Extract table as Markdown
- `getAllTables()` - Get overview of all tables on page
- `getPageOverview()` - Get page structure overview
- `getElementInfo(selector)` - Get detailed element information

**Advanced Execution**:
- `evalWithFile(code, resultId)` - Execute JS without JSON truncation (uses file-based result transfer)
- `initExtractor()` - Initialize WebExtractor toolkit in page

**CDP Mode**:
When `OA_CDP_URL` is set, browser connects to external Chrome instance via Chrome DevTools Protocol.
Limitations: Single-instance concurrency only (external Chrome limitation).

### Commands

- `src/commands/sync.js` - Sync todos from OA system
- `src/commands/list.js` - List todos
- `src/commands/show.js` - Show todo details
- `src/commands/approve.js` - Approve todos (with pause mode support)
- `src/commands/status.js` - Show statistics
- `src/commands/daemon.js` - Manage browser daemon
- `src/commands/session.js` - Unified session management
- `src/commands/explore.js` - Explore OA pages with pause mode
- `src/commands/rooms.js` - Query meeting room availability

## RPA Script Development

### Using Pause Mode for RPA Development

The `--pause` option enables interactive RPA script development:

**For todo approval scripts:**
```bash
oa-todo approve <fdId> --pause
```

**For OA page exploration:**
```bash
oa-todo explore "/some/page" --pause
```

**Development workflow:**
1. CLI creates pause session and returns JSON with `agentUXContext`
2. Use `agent-browser --session <id>` to explore and interact
3. Analyze page structure and element selectors
4. Develop RPA script iteratively
5. Test with `scripts/<type>ApprovalTest.js`
6. Close session when done

**Key files:**
- `oa-todo/scripts/approvalHelper.js` - Base class for approval scripts
- `oa-todo/scripts/ehrApproval.js` - EHR leave approval example
- `oa-todo/scripts/ehrApprovalTest.js` - EHR test script
- `oa-todo/scripts/rpa-generator-prompt.md` - AI prompt template for RPA generation

### 全自动流程

AI 可以全自动生成 RPA 审批脚本，用户只需在开始时通过自然语言确认关键信息。

#### 阶段一：自然语言确认

AI 会向你确认以下信息：
1. **审批类型** - EHR 假期审批、会议邀请、费用报销等
2. **如何判断流程已审核完毕** - 例如：页面上没有"同意"/"不同意"按钮
3. **审批"同意"的操作步骤** - 详细描述每个操作步骤
4. **审批"不同意"的操作步骤** - 详细描述每个操作步骤

#### 阶段二：自动执行

确认信息后，AI 自动执行：
1. 查找测试数据：`oa-todo list --type <类型>`
2. 创建暂停会话：`oa-todo approve <fdId> <action> --pause`
3. 自动探索页面：使用 `agent-browser` 分析页面结构
4. 生成脚本：`<类型>Approval.js` 和 `<类型>ApprovalTest.js`
5. 执行测试：运行测试脚本验证功能
6. 检查完成标准：验证代码结构和功能完整性

#### 阶段三：完成提示

AI 会报告：
- 生成的文件列表
- 测试结果统计
- 下一步建议

### 提示词位置

`oa-todo/scripts/rpa-generator-prompt.md`

### 示例对话

```
用户：帮我生成 EHR 假期审批的脚本

AI：好的，让我确认几个关键信息：

1. 如何判断流程已审核完毕？
   - 例如：页面上没有"同意"/"不同意"按钮
   - 或：显示"已审批"状态
   - 或：审批按钮被禁用

2. 审批"同意"的操作步骤是什么？
   - 例如：
     1. 点击"同意"按钮
     2. 弹出对话框
     3. 填写意见（可选）
     4. 点击"确定"

3. 审批"不同意"的操作步骤是什么？
   - 例如：
     1. 点击"不同意"按钮
     2. 必须填写意见
     3. 点击"确定"

用户：（提供描述）

AI：（自动执行并报告结果）
```

### 现有审批脚本

| 脚本 | 类型 | 说明 |
|------|------|------|
| `scripts/approvalHelper.js` | 基类 | 审批助手基类 |
| `scripts/ehrApprovalV2.js` | EHR | EHR 假期审批 v2 |
| `scripts/ehrApprovalTestV3.js` | EHR | EHR 测试脚本 v3 |
| `scripts/expenseApproval.js` | 费用报销 | 费用报销审批 |
| `scripts/meetingApproval.js` | 会议邀请 | 会议邀请审批 |
| `scripts/workflowApproval.js` | 通用流程 | 通用流程审批 |
| `scripts/getMeetingRooms.js` | 工具 | 会议室查询工具 |
| `scripts/rpa-generator-prompt.md` | 模板 | AI 提示词模板 |

## Common Development Tasks

When modifying the CLI:
1. Preserve the state load/save mechanism - it's core to performance
2. Use the handler pattern in `detail-handlers.js` for type-specific logic
3. Use `src/lib/session-naming.js` for all session ID generation (don't roll your own)
4. Ensure sessions are closed on exit (even on errors)
5. Use `evalWithFile()` for JavaScript execution to avoid JSON truncation (writes result to page element, reads via snapshot)
6. Use `src/lib/paths.js` for all path configuration - never hardcode paths
7. When adding pause/explore features, use PauseManager/ExploreManager classes
8. For CDP mode, respect the single-instance limitation when implementing concurrent operations

Session naming:
- Always use `generateSessionId(type, options)` from `session-naming.js`
- For pause sessions: include fdId as context
- For explore sessions: include purpose as context
- Parse existing IDs with `parseSessionId(sessionId)` to extract metadata

Path configuration:
- Import `PATHS` from `src/lib/paths.js` for all file paths
- Call `ensureDirectories()` to create necessary directories on startup
- Use `getLegacyConfig()` for backward-compatible config object
