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
# 同步所有待办
oa-todo sync

# 限制数量（测试用）
oa-todo sync --limit 10

# 同步并获取详情
oa-todo sync --with-detail

# 强制更新指定待办
oa-todo sync --force abc123

# 强制重新登录
oa-todo sync --login
```

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
