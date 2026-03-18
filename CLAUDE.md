# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an OA (Office Automation) approval system for 新国都集团 (XGD Group). It automates approval workflows for:
- **费控系统** (Expense Control System) - for expense reimbursements
- **OA系统** (General OA System) - for general todo items/approvals

The system uses Bash scripts with `agent-browser` (a browser automation tool built on Playwright) to interact with web forms.

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
- Scripts: `query_oa_todo.sh`, `approve_oa_todo.sh`, `approve_oa_todo_by_title.sh`, `sync_oa_todos.sh`
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
./scripts/approve_oa_todo_by_title.sh "<关键词>" <动作> [意见]  # Approve by searching title
./scripts/sync_oa_todos.sh [limit]            # Sync all todos to /tmp/oa_todos/
```

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
- **OA todo sync**: `/tmp/oa_todos/` directory with index.txt, summary.txt, and per-todo detail files

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

## Common Development Tasks

When modifying scripts:
1. Preserve the state load/save mechanism - it's core to performance
2. Maintain the `check_login_valid()` function pattern
3. Keep session names unique using timestamps
4. Ensure sessions are closed on exit (even on errors)
5. Use the same URL patterns for consistency
