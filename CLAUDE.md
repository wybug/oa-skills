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
```

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
- `other` - Other

## Commands

### sync - Synchronize todos

```bash
oa-todo sync                        # Sync all todos (default: no detail fetch)
oa-todo sync --limit 10             # Sync first 10 todos
oa-todo sync --force <fdId>         # Force refresh specific todo detail
oa-todo sync --force-update         # Reset skip-status todos to pending
oa-todo sync --fetch-detail         # Fetch missing details (skips list sync, queries DB)
oa-todo sync -c 3 --fetch-detail    # Fetch details with 3 concurrent workers
oa-todo sync --login                # Force re-login
```

**Note**: The `--fetch-detail` option is a new workflow that:
1. Checks login status (without opening pages)
2. Queries database for todos missing details
3. Creates multiple browser instances for concurrent detail fetching
4. Default concurrency is 5, adjustable via `-c` option

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

## Architecture

### Key Modules

- `src/lib/browser.js` - Browser automation wrapper around agent-browser
- `src/lib/database.js` - SQLite database operations
- `src/lib/detector.js` - Todo type detection from titles
- `src/lib/detail-handlers.js` - Type-specific detail page handlers
- `src/lib/web-extractor.js` - JavaScript injection for data extraction
- `src/config.js` - Constants for status, types, actions, and their mappings

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
