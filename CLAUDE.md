# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an OA (Office Automation) approval system for 新国都集团 (XGD Group). It automates approval workflows for:
- **费控系统** (Expense Control System) - for expense reimbursements
- **OA系统** (General OA System) - for general todo items/approvals

The system uses Bash scripts with `agent-browser` (a browser automation tool built on Playwright) to interact with web forms.

## Node.js CLI Tool (oa-todo)

The project includes a modern Node.js CLI tool located in the `oa-todo/` subdirectory:
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
```

The CLI tool uses SQLite for data persistence and supports advanced features like status management, partial fdId matching, and file-based JSON extraction to avoid truncation issues.

## Environment Variables (Required)

Configure these in CoPaw Environments:

```bash
OA_USER_NAME=your_username
OA_USER_PASSWD=your_password
OA_STATE_FILE=/tmp/oa_login_state.json  # optional, default shown
LOGIN_TIMEOUT_MINUTES=10                # optional, session timeout
```

**Security**: Never ask users for credentials directly. They must be configured in the environment.

## Dependencies

- **Node.js** >= 14.0.0
- **agent-browser** - Auto-installed via `npx agent-browser`, or globally with `npm install -g agent-browser`
- **Python 3** - Used for JSON parsing in scripts

Check/install dependencies: `./scripts/check_dependencies.sh`

## Two-System Architecture

### 费控系统 (Expense Control)
- URL: `https://sso-oa.xgd.com/sso/login?service=https://ekuaibao.xgd.com:9080/ykb/single/sso`
- Scripts: `query_approval.sh`, `approve.sh`, `batch_approve.sh`
- Use case: Expense reimbursement approvals

### OA系统 (General OA)
- URL: `https://oa.xgd.com`
- Scripts: `query_oa_todo.sh`, `approve_oa_todo.sh`, `approve_oa_todo_by_title.sh`, `approve_oa_todo_by_fdId.sh`, `sync_oa_todos.sh`
- Use case: General workflow approvals, meeting notifications

**Important**: Do not mix scripts between systems. Each has its own entry point and workflow.

## Core Scripts

### Login & State Management

```bash
./scripts/login.sh              # Login and save session state to file
```

The login state is saved as a JSON file containing cookies and session data, allowing other scripts to skip the login process (~5-8 seconds saved per run).

### Expense Control (费控系统)

```bash
./scripts/query_approval.sh           # Query pending expense approvals
./scripts/approve.sh <单号> 同意|驳回 [意见]    # Approve/reject single expense
./scripts/batch_approve.sh <csv> [并发数]      # Batch approve expenses
```

### OA System (OA系统)

```bash
./scripts/query_oa_todo.sh                    # Query OA todo list
./scripts/approve_oa_todo.sh <序号|关键词> <动作> [意见]  # Approve OA todo by index/keyword
./scripts/approve_oa_todo_by_title.sh "<关键词>" <动作> [意见]  # Approve by searching title (fuzzy match)
./scripts/approve_oa_todo_by_fdId.sh <fdId> <动作> [意见]  # Approve by exact fdId (precise)
./scripts/sync_oa_todos.sh [limit]            # Sync all todos to /tmp/oa_todos/
```

**OA Todo Approval Methods:**
- **By index**: `approve_oa_todo.sh 5 通过` - Approve the 5th item from query output
- **By title keyword**: `approve_oa_todo_by_title.sh "QuickBi会议" 参加` - Fuzzy search by title
- **By fdId**: `approve_oa_todo_by_fdId.sh "19bba01cb5a30a6668fdc15413daa5da" 通过` - Exact match, fastest

### Approval Actions

- **会议安排**: 参加, 不参加
- **流程管理**: 通过, 驳回, 转办
- **费控系统**: 同意, 驳回

## Session & State Architecture

All scripts share a common pattern:

1. **Check login validity** - Compare state file age against `LOGIN_TIMEOUT_MINUTES`
2. **Auto-relogin if expired** - Calls `login.sh` automatically
3. **Load state** - `agent-browser state load $STATE_FILE`
4. **Create unique session** - `SESSION_NAME="oa-$(action)-$(date +%s%N)"`
5. **Execute action**
6. **Close session**

This allows concurrent execution (3-5 tasks recommended) without session conflicts.

## State File Location

Default: `/tmp/oa_login_state.json`

Contains: Cookies, localStorage, sessionStorage, browser context

Valid for: ~30 minutes (depends on OA system session timeout)

## Output Files

- **Expense approval logs**: `/tmp/oa_approve_<单号>.log`
- **Batch results**: `/tmp/oa_batch_results.csv`
- **OA todo sync**: `/tmp/oa_todos/` directory with:
  - `index.txt` - Index file: `fdId|title|href` (one per line)
  - `summary.txt` - Sync summary report
  - `[fdId]/detail.txt` - Per-todo detail (page content + snapshot)
  - `[fdId]/snapshot.txt` - Page snapshot
  - `[fdId]/screenshot.png` - Page screenshot

**Index file format:**
```
19bba01cb5a30a6668fdc15413daa5da|邀请您参加会议：QuickBi会议|/sys/notify/sys_notify_todo/sysNotifyTodo.do?method=view&fdId=19bba01cb5a30a6668fdc15413daa5da
1973435176269e7aec5a2fd4c13b002a|请审批[运维中心]张凯旋提交的流程：阿里云大数据架构探讨|/sys/notify/sys_notify_todo/sysNotifyTodo.do?method=view&fdId=1973435176269e7aec5a2fd4c13b002a
```

The `approve_oa_todo_by_fdId.sh` script uses exact fdId matching (`grep "^${FDID}|"`) for precise lookup, while `approve_oa_todo_by_title.sh` uses fuzzy grep matching on titles.

## Debugging

Run scripts with visible browser:
```bash
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK001 同意
```

## Timezone

All scripts set `TZ=Asia/Shanghai` for consistent Beijing/Shanghai time.

## Script Conventions

- All scripts start with `set -e` for error handling
- All scripts source `check_dependencies.sh` for dependency checking
- Session names use nanosecond timestamps for uniqueness: `$(date +%s%N)`
- All scripts close their session before exiting

## Todo Type Detection

OA system todos come in two types, requiring different approval workflows:

1. **会议安排** (Meeting) - Actions: 参加, 不参加
2. **流程管理** (Workflow) - Actions: 通过, 驳回, 转办

**Detection approach** (used in `approve_oa_todo_by_fdId.sh`):
1. First, check title prefix: "邀请您参加会议" → meeting, "请审批" → workflow
2. If title is inconclusive, analyze page content for keywords
3. This two-step approach reduces page load and parsing overhead

Direct URL opening (via href from index.txt) bypasses OA UI navigation, making `approve_oa_todo_by_fdId.sh` the fastest approval method when fdId is known.

## Common Development Tasks

When modifying scripts:
1. Preserve the state load/save mechanism - it's core to performance
2. Maintain the `check_login_valid()` function pattern
3. Keep session names unique using timestamps
4. Ensure sessions are closed on exit (even on errors)
5. Use the same URL patterns for consistency
