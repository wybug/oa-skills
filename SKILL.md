---
name: query-oa-approval
description: 新国都集团OA待办管理CLI工具。使用oa-todo命令同步、查询、审批待办。**必须触发**：用户提到OA待办、查待办、我的待办、审批单据、同意/驳回审批、参加会议、不参加会议、会议邀请、批一下单子、处理OA待办、审批流程、待审批列表、同步待办等任何与OA系统待办或会议邀请相关的操作。
---

# OA待办管理CLI

新国都OA系统的待办同步、查询、审批工具。支持完整ID显示、SQLite本地存储、智能同步。

## 🎯 推荐工作流程

```bash
# 1. 查看本地待办（优先使用，不同步）
oa-todo list

# 2. 查看待审核的流程审批
oa-todo list --type workflow --status pending

# 3. 审批（使用完整ID）
oa-todo approve <完整ID> 通过

# 4. 如需强制同步（只在需要时使用）
oa-todo sync --force
```

---

## 核心优化

### ✅ 优先使用本地数据
- **默认行为**: 如果本地有待办数据，`oa-todo sync` 不会自动同步
- **查看待办**: 直接使用 `oa-todo list`，快速高效
- **强制同步**: 使用 `oa-todo sync --force` 强制从服务器同步

### ✅ 完整信息展示
- **完整ID**: 列表显示完整的32位ID，方便复制使用
- **完整标题**: 标题自动换行，不会截断
- **提交人信息**: 新增提交人/来源部门列

### ✅ 详细审批信息
- 审批时展示完整的待办详情
- 包含提交人、来源部门、创建时间等关键信息

---

## 命令详解

### sync - 同步待办

从OA系统同步待办到本地数据库。

```bash
oa-todo sync                      # 智能同步（本地有数据则不同步）
oa-todo sync --force              # 强制同步（忽略本地数据）
oa-todo sync --limit 10           # 限制数量（测试用）
oa-todo sync --skip-detail        # 跳过详情（更快）
oa-todo sync --login              # 强制重新登录
oa-todo sync --force <fdId>       # 强制更新指定待办
oa-todo sync --force-update       # 重置skip状态为pending
oa-todo sync --resume-from <n>    # 从指定页继续
```

**💡 智能同步说明**:
- 首次使用会自动同步
- 后续使用 `oa-todo list` 查看本地数据即可
- 只有明确要求或使用 `--force` 才会重新同步

### list/ls - 列出待办

查看本地待办列表，**默认只显示待审核（pending）状态**，**显示完整ID和标题**。

```bash
oa-todo list                      # 默认显示待审核的20条
oa-todo list --limit 10           # 显示待审核的10条
oa-todo list --all                # 显示所有状态
oa-todo list --status approved    # 查看已同意的
oa-todo list --status rejected    # 查看已驳回的
oa-todo list --type workflow      # 按类型筛选（默认仍是pending）
oa-todo list --type workflow --all # 查看所有状态的流程审批
oa-todo list --json               # JSON输出
```

**🎯 默认行为优化**:
- ✅ **默认只显示待审核（pending）状态** - 专注于需要处理的待办
- ✅ 完整的32位ID（方便复制）
- ✅ 完整标题（自动换行）
- ✅ 提交人/来源部门
- ✅ 同步时间

**查看其他状态**:
- 使用 `--all` 查看所有状态
- 使用 `--status <状态>` 查看指定状态

**状态**: `pending`(待审核) `approved`(已同意) `rejected`(已驳回) `attended`(已参加) `not_attended`(不参加) `skip`(已跳过)

**类型**: `workflow`(流程审批) `meeting`(会议邀请) `ehr` `expense` `unknown`

### show - 查看详情

```bash
oa-todo show <fdId>               # 查看详情
oa-todo show <fdId> --refresh     # 强制刷新
oa-todo show <fdId> --open        # 在浏览器中打开
oa-todo show 19bba                # 支持部分fdId匹配
```

### approve - 审批操作

**展示详细信息**后再审批。

```bash
# 流程审批
oa-todo approve <完整ID> 通过
oa-todo approve <完整ID> 驳回
oa-todo approve <完整ID> 转办

# 会议邀请
oa-todo approve <完整ID> 参加
oa-todo approve <完整ID> 不参加

# 带审批意见
oa-todo approve <完整ID> 通过 --comment "同意"

# 调试模式（显示浏览器）
oa-todo approve <完整ID> 通过 --debug

# 跳过确认
oa-todo approve <完整ID> 通过 --force
```

**审批信息展示**:
```
📋 待办详细信息:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ID:         18798bf8c8b26e8fbfb50d34f0888f8f
  标题:       请审批[基础架构部]吴庆提交的流程：评审小组
  类型:       流程审批
  当前状态:   待审核
  提交人:     吴庆
  来源部门:   基础架构部
  创建时间:   2025-01-15 10:30:00
  同步时间:   2025-01-15 14:20:15
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

| 参数 | 说明 |
|------|------|
| `--comment <text>` | 审批意见 |
| `--force` | 跳过确认直接执行 |
| `--debug` | 显示浏览器窗口，在审批页面暂停 |
| `--delay <秒>` | 成功后延迟关闭窗口 |
| `--skip-status-check` | 跳过本地状态检查 |

### status - 统计信息

```bash
oa-todo status              # 总体统计
oa-todo status --by-type    # 按类型统计
oa-todo status --by-status  # 按状态统计
oa-todo status --by-date    # 按日期统计
```

---

## 常用场景

### 🎯 推荐流程（优先使用）

```bash
# 1. 查看本地待办（快速）
oa-todo list

# 2. 查看待审核的流程审批
oa-todo list --type workflow --status pending

# 3. 复制完整ID，进行审批
oa-todo approve 18798bf8c8b26e8fbfb50d34f0888f8f 通过

# 4. 查看统计
oa-todo status
```

### 强制同步场景

```bash
# 明确要求同步时
oa-todo sync --force

# 或首次使用
oa-todo sync
```

### 批量审批

```bash
# 查看待审核列表
oa-todo list --status pending

# 批量审批（使用完整ID）
for id in 18798bf8c8b26e8fbfb50d34f0888f8f 1877517aca354d3b44b4ddb488fadd32; do
    oa-todo approve "$id" 通过 --force
done
```

### 处理会议邀请

```bash
# 查看会议
oa-todo list --type meeting

# 参加
oa-todo approve <完整ID> 参加
```

---

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `OA_USER_NAME` | ✅ | - | OA用户名 |
| `OA_USER_PASSWD` | ✅ | - | OA密码 |
| `OA_STATE_FILE` | ❌ | `/tmp/oa_login_state.json` | 登录状态文件 |
| `OA_DB_PATH` | ❌ | `/tmp/oa_todos/oa_todos.db` | 数据库路径 |

---

## 常见问题

### 登录状态过期？

重新同步会自动登录：
```bash
oa-todo sync
```

### fdId太长？

使用部分匹配：
```bash
# 完整: 19bba01cb5a30a6668fdc15413daa5da
oa-todo show 19bba  # 只需前几位
```

### 调试登录问题？

使用可视化模式：
```bash
AGENT_BROWSER_HEADED=1 oa-todo sync
```

---

## 依赖

- Node.js >= 14.0.0
- agent-browser（首次运行自动检查）

---

## 更多文档

- [高级用法与数据库结构](references/advanced.md)
- [旧版脚本迁移指南](references/legacy.md)
