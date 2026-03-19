# 更新 SKILL.md 以反映 oa-todo CLI 工具当前状态

## Context

SKILL.md 文档描述了 query-oa-approval 技能，包括新版 oa-todo CLI 工具。但文档与当前实现存在不一致：

1. **已删除的命令**: `update` 和 `clean` 命令在早期会话中被删除，但文档中仍有描述
2. **参数变更**: `--with-detail` 已改为 `--skip-detail`（默认获取详情）
3. **新增选项**: `--force-update`、`--skip-status-check`、`--delay` 等新选项未在文档中体现
4. **调试模式变更**: `--debug` 默认值从 true 改为 false

## 修改计划

### 1. 移除已删除命令的文档

**文件**: `SKILL.md`

删除以下内容：
- 第 22-25 行：新增状态管理命令描述
- 第 102-117 行：更新状态命令详解
- 第 148-156 行：清理数据命令详解

### 2. 更新 sync 命令参数

**变更前** (第 66-70 行):
```bash
# 同步并获取详情
oa-todo sync --with-detail
```

**变更后**:
```bash
# 同步时会自动获取详情（默认行为）
oa-todo sync

# 跳过详情获取
oa-todo sync --skip-detail
```

### 3. 更新命令详解部分

更新 CLI 命令详解章节（第 55-156 行），移除 update 和 clean 命令，更新现有命令参数：

#### sync 命令
```bash
# 同步所有待办（默认获取详情）
oa-todo sync

# 限制数量
oa-todo sync --limit 10

# 跳过详情获取
oa-todo sync --skip-detail

# 强制更新指定待办
oa-todo sync --force <fdId>

# 强制更新 skip 状态的待办
oa-todo sync --force-update

# 启用调试模式
oa-todo sync --debug

# 从指定页继续
oa-todo sync --resume-from 5
```

#### approve 命令
```bash
# 基本审批
oa-todo approve <fdId> <action>

# 带审批意见
oa-todo approve <fdId> 通过 --comment "同意"

# 强制执行（不确认）
oa-todo approve <fdId> 通过 --force

# 调试模式（显示浏览器并暂停）
oa-todo approve <fdId> 通过 --debug

# 跳过本地状态检查
oa-todo approve <fdId> 通过 --skip-status-check

# 成功后延迟关闭（默认3秒）
oa-todo approve <fdId> 通过 --delay 5
```

### 4. 更新环境变量说明

确认当前环境变量列表正确：
- `OA_USER_NAME`: OA系统用户名（必需）
- `OA_USER_PASSWD`: OA系统密码（必需）
- `OA_STATE_FILE`: 登录状态文件路径（可选，默认: /tmp/oa_login_state.json）
- `OA_DB_PATH`: 数据库路径（可选，默认: /tmp/oa_todos/oa_todos.db）
- `OA_TODOS_DIR`: 待办目录（可选，默认: /tmp/oa_todos）
- `OA_DETAILS_DIR`: 详情目录（可选，默认: /tmp/oa_todos/details）
- `LOGIN_TIMEOUT_MINUTES`: 登录超时时间（可选，默认: 10分钟）

### 5. 更新优势说明

移除"操作日志"相关描述（因为 update 命令已删除），确认当前优势：
- ✅ **SQLite数据库**：结构化存储，支持复杂查询
- ✅ **状态管理**：完整的状态流转（pending/approved/rejected/attended/skip）
- ✅ **类型识别**：自动从标题识别待办类型
- ✅ **智能同步**：默认获取详情，已存在则跳过
- ✅ **状态保护**：skip 状态在同步时自动保护，避免覆盖

## 关键文件

| 文件 | 修改内容 |
|------|----------|
| `SKILL.md` | 移除 update/clean 命令文档，更新参数描述 |

## 验证步骤

1. 运行 `oa-todo --help` 确认所有命令正确
2. 运行 `oa-todo sync --help` 确认参数正确
3. 运行 `oa-todo approve --help` 确认参数正确
4. 对比更新后的 SKILL.md 与实际实现是否一致
