---
name: query-oa-approval
description: 新国都集团OA待办管理CLI工具。使用oa-todo命令同步、查询、审批待办。**必须触发**：用户提到OA待办、查待办、我的待办、审批单据、同意/驳回审批、参加会议、不参加会议、会议邀请、批一下单子、处理OA待办、审批流程、待审批列表、同步待办等任何与OA系统待办或会议邀请相关的操作。**复杂审批触发**：用户需要深度审查的审批（包含附件、文档、技术资料）、需要智能体辅助分析资料、用户主动提出"复杂审批"、"深度审查"、"仔细审核"、"协助审阅"等。**页面探索触发**：用户提到"开发xxx功能"、"探索xxx页面"、"看看xxx功能怎么用"、"打开xxx页面"、"研究一下xxx"、"xxx页面怎么操作"、"会议室预约"、"请假申请"、"费用报销"等与OA系统通用页面操作相关的需求。
---

# OA待办管理CLI

新国都OA系统的待办同步、查询、审批工具。支持完整ID显示、SQLite本地存储、智能同步。

**详细文档索引**：
- [命令详解](references/commands.md) - sync, list, show, approve, status, daemon, explore
- [复杂审批流程](references/complex-approval.md) - 深度审查、断点管理、智能分析
- [使用场景](references/scenarios.md) - 常见操作示例和最佳实践
- [故障排除](references/troubleshooting.md) - FAQ和问题排查
- [高级用法](references/advanced.md) - 数据库结构与高级查询
- [最佳实践](references/best-practices.md) - 性能优化与安全建议
- [AI开发RPA脚本指南](oa-todo/docs/AI开发RPA脚本指南.md) - 使用 explore --pause 开发 RPA 脚本

---

## ⚠️ 重要说明

### 智能体使用规范

**获取待办列表行为**：
1. 用户要求查看待办时，直接调用：`oa-todo list` 和 `oa-todo status`
2. 智能体自行构建优化表格（使用Markdown格式）
3. 翻译类型和状态为中文自然语言
4. 显示下一步操作提示

**类型翻译对照**：
- `workflow` → 流程审批
- `meeting` → 会议邀请
- `ehr` → EHR假期
- `expense` → 费用报销
- `unknown` → 未知类型

**状态翻译对照**：
- `pending` → 待审核
- `approved` → 已同意
- `rejected` → 已驳回
- `attended` → 已参加
- `not_attended` → 不参加
- `skip` → 已跳过
- `transferred` → 已转办
- `other` → 其他

**智能体内部处理**：
- 保存ID与序号的对应关系
- 用户通过序号操作时，自动映射到完整ID
- 使用Markdown表格格式输出，合理设置列宽

### 同步操作超时限制与定时同步策略

- **同步待办列表很快**，通常不会超时
- **获取待办详情较慢**：200条约需3分钟，可能超时
- **建议**：使用 `-c 5` 并发数，或 `--limit 25` 限制数量
- **推荐定时同步策略**：
  - 🌙 凌晨全量同步：`oa-todo sync --fetch-detail -c 5`（凌晨2点）
  - ☀️ 工作时间增量：`oa-todo sync --fetch-detail -c 5 --limit 25`（每小时，8:00-19:00）
  - 📋 仅同步列表：`oa-todo sync`（速度快，随时可执行）

### 复杂审批模式智能提示

**检测逻辑**：智能体在展示待办列表后，自动分析待办标题和类型，检测可能需要深度审查的待办。

**复杂度判断标准**：
- 标题包含：附件、采购、合同、技术方案、评审、服务器、设备、付款、报销等关键词
- 类型为：`workflow`（流程审批）或 `expense`（费用报销）
- 标题包含金额信息（如：¥10,000+）

**提示格式**：
```
🔍 检测到以下待办可能需要深度审查：

• [序号] 待办标题

💡 建议使用"复杂审批模式"进行深度分析

使用方法：复杂审批第N个
```

### 交互式信息提取（暂停模式）

**触发场景**：用户请求查看更多信息时，使用暂停模式创建浏览器会话进行交互式提取。

**用户意图触发词**："查看详情"、"深入了解一下"、"看看议程"、"有什么附件"

**工作流程**：
1. 创建暂停点会话：`oa-todo approve <fdId> --pause`
2. 使用 agent-browser 审查资料（提取页面信息、查看附件）
3. 向用户展示提取的信息
4. 用户决策后执行审批：`oa-todo approve <fdId> <action> --force`

**信息提取能力**：
- 会议邀请：议程、参会人员、会议材料
- 流程审批：表单详情、审批历史、附件列表
- 费用报销：报销明细、票据信息

### 通用页面探索模式

**触发场景**：用户需要操作OA系统中的通用页面（非待办审批）。

**用户意图触发词**："探索xxx页面"、"会议室预约"、"请假申请"、"费用报销"

**工作流程**：
1. 创建探索会话：`oa-todo explore <url> --pause`
2. 智能体解析 agentUXContext
3. 选择操作方式：
   - **HTTP API**（推荐用于数据查询）
   - **浏览器操作**（用于页面交互）
4. 使用 agent-browser 探索页面
5. 多轮对话理解用户意图
6. 生成命令序列并确认执行

**支持的场景**：会议室查询/预约、请假申请、费用报销、通用表单

### 审批安全确认机制

**所有审批操作都需要用户确认**：

**单个审批 - 单个确认**：
1. 展示待办详细信息
2. 询问确认
3. 执行：`oa-todo approve <id> <action> --force`

**批量审批 - 一次确认**：
1. 展示所有待办的Markdown表格
2. 询问确认
3. 自动逐个执行

**批量审批支持自然语言**：
- 按序号：`"通过第1、3、5个"`
- 按范围：`"批量审批1-3号"`
- 按条件：`"通过所有张三提交的"`
- 按数量：`"批量审批前5个"`

### 会议邀请智能审批语义

**会议邀请的特殊审批映射**：
- "同意" → 执行 `参加`
- "不同意" → 执行 `不参加`
- "参加" → 执行 `参加`
- "不参加" → 执行 `不参加`

---

## 快速开始

### 本地源码编译安装（推荐）

```bash
cd oa-todo
npm install
npm run build
npm link

# 配置环境变量 (在 CoPaw Environments 中)
# OA_USER_NAME=your_username
# OA_USER_PASSWD=your_password

oa-todo sync
```

### 从内部 npm 安装（备用）

```bash
npm login --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/
npm install -g oa-todo --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/
oa-todo sync
```

---

## 🎯 最佳实践工作流程

### 标准审批流程（推荐）

```bash
# 步骤1: 列出待审核
oa-todo list --type workflow --status pending

# 步骤2: 查看详情
oa-todo show <完整fdId>

# 步骤3: 用户确认后执行
oa-todo approve <完整ID> 通过
```

### 批量审批流程

```bash
# 步骤1: 列出所有待审核
oa-todo list --status pending

# 步骤2: 通过Markdown表格展示并确认
# 智能体展示列表 → 用户确认 → 智能体逐个执行

# 步骤3: 用户确认后自动执行
# oa-todo approve <id1> 通过 --force
# oa-todo approve <id2> 通过 --force
```

---

## 核心优化

### ✅ 优先使用本地数据
- 默认行为：本地有数据时，`oa-todo sync` 不自动同步
- 强制同步：`oa-todo sync --force`

### ✅ 完整信息展示
- 完整ID：列表显示32位ID，方便复制
- 完整标题：自动换行，不截断
- 提交人信息：新增提交人/来源部门列

### ✅ 详细审批信息
- 审批时展示完整详情
- 包含提交人、来源部门、创建时间

---

## 命令参考

**详细说明请参考 [references/commands.md](references/commands.md)**

| 命令 | 说明 | 示例 |
|------|------|------|
| `sync` | 同步待办 | `oa-todo sync --fetch-detail -c 5` |
| `list` | 列出待办 | `oa-todo list --type workflow` |
| `show` | 查看详情 | `oa-todo show <fdId>` |
| `approve` | 审批操作 | `oa-todo approve <fdId> 通过` |
| `status` | 统计信息 | `oa-todo status --by-type` |
| `daemon` | 管理守护进程 | `oa-todo daemon start` |
| `explore` | 通用页面探索 | `oa-todo explore "/meeting/booking" --pause` |
| `session` | 会话管理 | `oa-todo session list` |
| `rooms` | 查询会议室 | `oa-todo rooms 2026-03-25` |

---

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `OA_USER_NAME` | ✅ | - | OA用户名 |
| `OA_USER_PASSWD` | ✅ | - | OA密码 |
| `OA_STATE_FILE` | ❌ | `~/.oa-todo/login_state.json` | 登录状态文件 |
| `OA_DB_PATH` | ❌ | `~/.oa-todo/oa_todos.db` | 数据库路径 |
| `OA_TODOS_DIR` | ❌ | `~/.oa-todo` | 待办目录 |
| `LOGIN_TIMEOUT_MINUTES` | ❌ | 25 | 登录状态超时（分钟） |
| `PAUSE_TIMEOUT_MINUTES` | ❌ | 10 | 断点超时时间（分钟） |

---

## 更多文档

- [命令详解](references/commands.md) - 完整命令说明与参数
- [复杂审批流程](references/complex-approval.md) - 深度审查、断点管理、智能分析
- [使用场景](references/scenarios.md) - 常见操作示例
- [故障排除](references/troubleshooting.md) - FAQ和问题排查
- [高级用法](references/advanced.md) - 数据库结构与高级查询
- [最佳实践](references/best-practices.md) - 性能优化与安全建议
