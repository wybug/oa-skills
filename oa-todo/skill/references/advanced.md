# OA待办管理 - 高级文档

## 数据库结构

待办数据存储在SQLite数据库中，支持复杂查询和状态管理。

**数据库位置**: `/tmp/oa_todos/oa_todos.db` (可通过 `OA_DB_PATH` 环境变量配置)

### todos 表

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

### logs 表

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

## 状态说明

| 状态 | 英文 | 说明 |
|------|------|------|
| 待审核 | pending | 默认状态，等待处理 |
| 已同意 | approved | 流程审批通过 |
| 已驳回 | rejected | 流程审批驳回 |
| 已参加 | attended | 会议已参加 |
| 不参加 | not_attended | 会议不参加 |
| 已转办 | transferred | 转交他人处理 |
| 已跳过 | skip | 暂不处理 |
| 其他 | other | 其他状态 |

## 待办类型

| 类型 | 英文 | 识别规则 |
|------|------|---------|
| 流程审批 | workflow | 标题包含"请审批" |
| 会议邀请 | meeting | 标题包含"邀请您参加会议" |
| 报销 | expense | 报销类流程 |
| EHR | ehr | 人事相关流程 |
| 未知 | unknown | 无法识别类型 |

## 直接查询数据库

```bash
# 查看所有待审核
sqlite3 /tmp/oa_todos/oa_todos.db "SELECT fd_id, title FROM todos WHERE status='pending' LIMIT 10"

# 查看操作日志
sqlite3 /tmp/oa_todos/oa_todos.db "SELECT * FROM logs ORDER BY created_at DESC LIMIT 10"

# 按部门统计
sqlite3 /tmp/oa_todos/oa_todos.db "SELECT source_dept, COUNT(*) FROM todos GROUP BY source_dept"
```

## 调试技巧

### 可视化模式

```bash
# 使用可视化浏览器（用于调试登录问题）
AGENT_BROWSER_HEADED=1 oa-todo sync

# 审批时显示浏览器窗口
oa-todo approve <fdId> 通过 --debug
```

### 查看详细日志

CLI会在 `/tmp/oa_todos/` 目录下保存：
- 登录状态文件
- 详情快照
- 截图文件

## 批量处理脚本

```bash
# 批量通过所有待审核的流程审批
oa-todo list --status pending --json | jq -r '.[] | select(.todo_type=="workflow") | .fd_id' | while read fdId; do
    oa-todo approve "$fdId" 通过 --force
done

# 批量参加所有会议
oa-todo list --status pending --json | jq -r '.[] | select(.todo_type=="meeting") | .fd_id' | while read fdId; do
    oa-todo approve "$fdId" 参加 --force
done
```

## 定时同步

配合cron实现定时同步：

```bash
# 每小时同步一次
0 * * * * /usr/local/bin/oa-todo sync --skip-detail
```
