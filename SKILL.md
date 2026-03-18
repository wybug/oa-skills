---
name: query-oa-approval
description: 新国都集团OA费控系统审批自动化工具。**必须使用此技能当用户提到**：OA审批、费控审批、待办查询、OA待办、审批单据、同意单据、驳回单据、批量审批、费控系统、OA系统审批、查一下待办、批一下单子、处理OA待办、费控流程、审批流程、待审批列表等任何与OA审批相关的操作。支持：查询待审批工单（query_approval.sh）、执行审批操作（approve.sh）、批量并发审批（batch_approve.sh）。使用state save/load实现登录复用，性能提升50%以上。
---

# OA费控系统审批自动化

## 🎯 快速选择脚本

| 我要做什么 | 使用哪个脚本 | 示例 |
|-----------|------------|------|
| **查看待审批单据** | `query_approval.sh` | `./scripts/query_approval.sh` |
| **审批一个单据** | `approve.sh` | `./scripts/approve.sh FK001 同意` |
| **批量审批多个单据** | `batch_approve.sh` | `./scripts/batch_approve.sh list.csv` |
| **保存登录状态** | `login.sh` | `./scripts/login.sh` |

**⚠️ 重要**：查询用 `query_approval.sh`，审批用 `approve.sh`，不要混用！

---

## 功能概述

此技能提供新国都集团OA系统费控系统的完整审批自动化功能：

- ✅ **登录管理**: 独立登录脚本，保存登录状态供复用
- 🔍 **查询待办**: 查询费控系统待审批流程
- ⚡ **单据审批**: 根据单号执行同意或驳回操作
- 🚀 **批量审批**: 并发处理多个审批任务
- 🔐 **并发支持**: 使用独立session，支持多脚本同时执行

---

## 环境变量

以下环境变量需在CoPaw Environments中配置：

- `OA_USER_NAME`: OA系统用户名（必需）
- `OA_USER_PASSWD`: OA系统密码（必需）
- `OA_STATE_FILE`: 登录状态文件路径（可选，默认: /tmp/oa_login_state.json）

## 依赖要求

- **Node.js** >= 14.0.0
- **npm** >= 6.0.0
- **agent-browser**（自动检查，如未安装会提示）

**自动安装**：首次运行脚本时，会自动检查 agent-browser，如未安装会提供详细的安装指引。

**手动安装**：
```bash
# 全局安装（推荐）
npm install -g agent-browser

# 使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install -g agent-browser
```

---

## 快速开始

### 场景 1：查询待审批（仅查看）

```bash
# 一条命令完成查询（自动登录）
./scripts/query_approval.sh
```

### 场景 2：审批单个单据

```bash
# 步骤 1：登录保存状态（首次使用）
./scripts/login.sh

# 步骤 2：执行审批
./scripts/approve.sh FK20250101001 同意

# 步骤 3：继续审批（复用登录状态）
./scripts/approve.sh FK20250101002 驳回 费用超标
```

**approve.sh 参数**：
- `<单号>`: 费控系统中的单据编号
- `<同意|驳回>`: 审批动作（必须二选一）
- `[审批意见]`: 可选，驳回时建议填写原因

**智能查询**：
- 自动在审批记录中查询单据状态
- 快速区分"已审批"和"不存在"
- 避免重复审批

### 场景 3：批量审批

```bash
# 步骤 1：登录保存状态
./scripts/login.sh

# 步骤 2：创建审批清单
cat > approval_list.csv <<EOF
单号,动作,审批意见
FK20250101001,同意,
FK20250101002,驳回,费用超标
FK20250101003,同意,已核实
EOF

# 步骤 3：执行批量审批（并发数3）
./scripts/batch_approve.sh approval_list.csv 3

# 步骤 4：查看结果
cat /tmp/oa_batch_results.csv
```

---

## 脚本说明

### login.sh - 登录并保存状态

**用途**：独立登录脚本，保存cookies和session到文件

**使用**：
```bash
# 标准登录
./scripts/login.sh

# 可视化调试
AGENT_BROWSER_HEADED=1 ./scripts/login.sh
```

**输出**：
- 登录状态文件: `/tmp/oa_login_state.json`
- 有效期: 约30分钟

### query_approval.sh - 查询待审批

**用途**：查询费控系统待审批流程（**仅查询，不审批**）

**使用**：
```bash
# 标准查询（包含自动登录）
./scripts/query_approval.sh

# 可视化调试
AGENT_BROWSER_HEADED=1 ./scripts/query_approval.sh
```

**输出**：
- 控制台输出待审批列表
- 日志文件: `/tmp/oa_approve_*.log`（批量审批）

### approve.sh - 执行单据审批

**用途**：执行单据审批操作（**仅审批，不查询列表**）

**使用**：
```bash
# 同意
./scripts/approve.sh FK20250101001 同意

# 驳回（建议填写原因）
./scripts/approve.sh FK20250101002 驳回 费用超标

# 可视化调试
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK20250101001 同意
```

**智能功能**：
- 自动在待审批和审批记录中查询单据
- 显示单据审批状态
- 提供清晰的错误提示

### batch_approve.sh - 批量并发审批

**用途**：批量处理多个审批任务

**使用**：
```bash
# 默认并发数3
./scripts/batch_approve.sh approval_list.csv

# 指定并发数5
./scripts/batch_approve.sh approval_list.csv 5
```

**输出**：
- 结果文件: `/tmp/oa_batch_results.csv`
- 单据日志: `/tmp/oa_approve_<单号>.log`

---

## 常见问题

### Q: 登录状态过期怎么办？

```bash
# 重新登录保存状态
./scripts/login.sh

# 然后再执行审批
./scripts/approve.sh FK20250101001 同意
```

### Q: 单据未找到？

脚本会自动在审批记录中查询，可能的输出：

**情况1：单据已被审批**
```
⚠️  单据已被处理
单号: FK20250101001
状态: 在审批记录中找到
审批结果: 已同意
```

**情况2：单据不存在**
```
❌ 单据不存在
单号: FK20250101001
说明: 在待审批和审批记录中均未找到
可能原因:
  1. 单号输入错误
  2. 单据不存在
  3. 没有审批权限
```

### Q: 如何调试？

```bash
# 使用可视化模式
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK20250101001 同意

# 查看日志
cat /tmp/oa_approve_FK20250101001.log
```

---

## 详细文档

需要更详细的信息，请查阅：

- **架构设计**: [references/architecture.md](references/architecture.md)
  - 登录状态复用机制
  - 并发架构
  - 性能数据

- **故障排查**: [references/troubleshooting.md](references/troubleshooting.md)
  - 常见问题及解决方案
  - 调试方法
  - 日志文件说明

- **技术细节**: [references/technical-details.md](references/technical-details.md)
  - JavaScript 交互示例
  - agent-browser 命令参考
  - 错误处理

- **最佳实践**: [references/best-practices.md](references/best-practices.md)
  - 推荐工作流
  - 性能优化
  - 安全建议
  - 定时任务

---

## 使用限制

1. **登录方式**: 当前仅支持用户名密码登录
2. **验证码**: 不支持验证码验证
3. **审批类型**: 仅支持费控系统审批
4. **并发限制**: 建议不超过5个并发任务

---

## 更新日志

### v2.1.0 - 2025-03-18

**智能查询功能**:
- ✨ 自动在审批记录中查询单据状态
- 🔍 快速区分"已审批"和"不存在"
- 💡 提供清晰的错误提示

**文档优化**:
- 📚 重构文档结构，遵循 Progressive Disclosure 原则
- 🎯 增加快速决策表
- 🚀 强化 description，提升触发准确性

### v2.0.0 - 2025-03-18

**新增功能**:
- ✨ 登录状态保存/加载机制
- ✨ 独立审批脚本
- ✨ 批量并发审批
- ✨ Session隔离

**性能提升**:
- 单个审批任务从 ~15秒 降至 ~7秒
- 支持3-5个任务并发执行

---

**技术支持**: 如遇问题，请查看 [故障排查指南](references/troubleshooting.md) 或使用可视化模式调试。
