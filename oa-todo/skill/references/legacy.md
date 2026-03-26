# 旧版脚本（已废弃）

> ⚠️ 以下bash脚本已废弃，推荐使用 `oa-todo` CLI工具。

## OA系统脚本

| 脚本 | 功能 | 替代命令 |
|------|------|---------|
| `./scripts/login.sh` | 登录并保存状态 | `oa-todo sync --login` |
| `./scripts/query_oa_todo.sh` | 查询OA待办列表 | `oa-todo list` |
| `./scripts/approve_oa_todo.sh` | 审批OA待办（序号/关键词） | `oa-todo approve` |
| `./scripts/approve_oa_todo_by_fdId.sh` | 审批OA待办（fdId） | `oa-todo approve` |
| `./scripts/sync_oa_todos.sh` | 同步所有待办详情 | `oa-todo sync --with-detail` |

## 费控系统脚本

> ⚠️ 费控系统功能已移除

| 脚本 | 功能 | 状态 |
|------|------|------|
| `./scripts/query_approval.sh` | 查询费控待审批 | 已废弃 |
| `./scripts/approve.sh` | 审批费控单据 | 已废弃 |
| `./scripts/batch_approve.sh` | 批量审批费控单据 | 已废弃 |

## 迁移指南

### 从旧脚本迁移到CLI

```bash
# 旧方式
./scripts/login.sh
./scripts/query_oa_todo.sh
./scripts/approve_oa_todo.sh 1 通过

# 新方式
oa-todo sync
oa-todo list
oa-todo approve <fdId> 通过
```
