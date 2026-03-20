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

The CLI tool uses SQLite for data persistence and supports advanced features like status management, partial fdId matching, and file-based JSON extraction to avoid truncation issues.

## Environment Variables (Required)

Configure these in CoPaw Environments:

```bash
OA_USER_NAME=your_username
OA_USER_PASSWD=your_password
OA_STATE_FILE=/tmp/oa_login_state.json  # optional, default shown
LOGIN_TIMEOUT_MINUTES=25                 # optional, session timeout
```

**Security**: Never ask users for credentials directly. They must be configured in the environment.

## Dependencies

- **Node.js** >= 14.0.0
- **agent-browser** - Auto-installed via `npx agent-browser`

## Todo Types & Actions

| 类型 | detector名称 | 审批动作 | 按钮文本 |
|------|-------------|----------|----------|
| 会议邀请 | meeting | 参加、不参加 | 参加/不参加 |
| EHR假期 | ehr | 同意、不同意 | 同意/不同意 |
| 费用报销 | expense | 同意、驳回 | 同意/驳回 |
| 通用流程 | workflow | 通过、驳回、转办 | 通过/驳回 |

## Commands

### sync - Synchronize todos

```bash
oa-todo sync                    # Sync all todos (only if local is empty)
oa-todo sync --limit 10         # Sync first 10 todos
oa-todo sync --force <fdId>     # Force refresh specific todo detail
oa-todo sync --force-update     # Reset skip-status todos to pending
oa-todo sync --skip-detail      # Skip fetching details
oa-todo sync --login            # Force re-login
```

### list - List todos

```bash
oa-todo list                    # List pending todos
oa-todo list --status approved  # List by status
oa-todo list --type meeting     # List by type
oa-todo list --limit 50         # Limit results
oa-todo list --all              # Show all (including non-pending)
oa-todo list --json             # JSON output
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
oa-todo daemon                  # Show daemon status
oa-todo daemon start            # Start daemon
oa-todo daemon stop             # Stop daemon
oa-todo daemon restart          # Restart daemon
oa-todo daemon start --headed   # Start with visible browser
```

## State File Location

Default: `/tmp/oa_login_state.json`

Contains: Cookies, localStorage, sessionStorage, browser context

Valid for: ~25 minutes (configurable via `LOGIN_TIMEOUT_MINUTES`)

## Data Storage

- **Database**: SQLite at `/tmp/oa_todos/oa_todos.db`
- **Todo details**: `/tmp/oa_todos/details/<fdId>/`
  - `data.json` - Structured data
  - `detail.txt` - Plain text detail
  - `snapshot.txt` - Page snapshot
  - `screenshot.png` - Page screenshot

## Todo Type Detection

Detection is based on title patterns:
- **meeting**: Title starts with "邀请您参加会议"
- **ehr**: Title contains "休假" or "年假"
- **expense**: Title contains "付款报销"
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

Run with debug mode:
```bash
oa-todo --debug approve <fdId> <action>
```

Run with headed browser (via daemon):
```bash
oa-todo daemon start --headed
oa-todo approve <fdId> <action>
```

## Architecture

### Key Modules

- `src/lib/browser.js` - Browser automation wrapper around agent-browser
- `src/lib/database.js` - SQLite database operations
- `src/lib/detector.js` - Todo type detection from titles
- `src/lib/detail-handlers.js` - Type-specific detail page handlers
- `src/lib/web-extractor.js` - JavaScript injection for data extraction

### Commands

- `src/commands/sync.js` - Sync todos from OA system
- `src/commands/list.js` - List todos
- `src/commands/show.js` - Show todo details
- `src/commands/approve.js` - Approve todos
- `src/commands/status.js` - Show statistics
- `src/commands/daemon.js` - Manage browser daemon

## Common Development Tasks

When modifying the CLI:
1. Preserve the state load/save mechanism - it's core to performance
2. Use the handler pattern in `detail-handlers.js` for type-specific logic
3. Keep session names unique using timestamps
4. Ensure sessions are closed on exit (even on errors)
5. Use `evalWithFile()` for JavaScript execution to avoid JSON truncation
