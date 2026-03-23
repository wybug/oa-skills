---
name: query-oa-approval
description: 新国都集团OA待办管理CLI工具。使用oa-todo命令同步、查询、审批待办。**必须触发**：用户提到OA待办、查待办、我的待办、审批单据、同意/驳回审批、参加会议、不参加会议、会议邀请、批一下单子、处理OA待办、审批流程、待审批列表、同步待办等任何与OA系统待办或会议邀请相关的操作。**复杂审批触发**：用户需要深度审查的审批（包含附件、文档、技术资料）、需要智能体辅助分析资料、用户主动提出"复杂审批"、"深度审查"、"仔细审核"、"协助审阅"等。
---

# OA待办管理CLI

新国都OA系统的待办同步、查询、审批工具。支持完整ID显示、SQLite本地存储、智能同步。

**详细文档索引**：
- [命令详解](references/commands.md) - sync, list, show, approve, status, daemon
- [复杂审批流程](references/complex-approval.md) - 深度审查、断点管理、智能分析
- [使用场景](references/scenarios.md) - 常见操作示例和最佳实践
- [故障排除](references/troubleshooting.md) - FAQ和问题排查

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
当检测到复杂待办时，在表格下方显示：

```
🔍 检测到以下待办可能需要深度审查：

• [序号] 待办标题

💡 建议使用"复杂审批模式"进行深度分析（包含附件解析、关键信息提取、智能建议）

使用方法：
- 对单个待办：复杂审批第N个
- 详细说明：references/complex-approval.md
```

**不显示提示的情况**：
- 未检测到复杂待办
- 待办类型为 `meeting`（会议邀请）
- 用户明确表示快速审批

### 交互式信息提取（暂停模式）

**触发场景**：当用户请求查看更多信息时，使用暂停模式创建浏览器会话进行交互式提取。

**用户意图触发词**：
- "查看更多信息"、"查看详情"、"详细看看"
- "看看议程"、"参会人员"、"审批历史"
- "有什么附件"、"上会材料"
- "深入了解一下"

**工作流程**：

1. **创建暂停点会话**（内部执行：`oa-todo approve <fdId> --pause --timeout 15`）
   输出包含 session ID、fdId、title、type、timeout

2. **使用 agent-browser --session <session_id> 进行资料审查（交互式提取信息）**
   获取页面快照、提取页面元素、查看附件列表

3. **向用户展示提取的信息**

4. **用户决策后执行审批（内部使用CLI命令）**（内部执行：`oa-todo approve <fdId> <action> --force`）
   用户看到：自然语言描述的执行动作

**操作方式区分（智能体内部实现细节）**：
| 操作类型 | 使用工具 | 说明 |
|---------|---------|------|
| 资料审查 | agent-browser | 提取页面信息、查看附件、分析内容 |
| 审批动作 | CLI 命令 | 内部调用，不展示给用户 |

**信息提取能力**：
- 会议邀请：议程、参会人员、会议材料、时间地点
- 流程审批：表单详情、审批历史、附件列表、意见说明
- 费用报销：报销明细、票据信息、审批流程
- EHR假期：请假事由、假期类型、时间范围

**示例对话（注意：CLI 不展示给用户）**：

```
用户: 查看第1个待办的详细信息

智能体: 好的，让我为您创建交互式会话来获取详细信息。

✅ 已创建会话: oa-todo-pause-xxx-1234567890
📋 待办: 校招面试会议审批
👤 提交人: 舒清舟（风控研发部）

正在提取会议议程和参会人员...

📅 会议议程:
1. 面试流程介绍 (10分钟)
2. 候选人自我介绍 (20分钟)
...

👥 参会人员:
- 主持人: 舒清舟
- 面试官: 张三、李四
...

您是否需要了解更多信息，或准备进行审批？

用户: 同意参加

智能体: 好的，我将为您执行审批操作。

✅ 审批已完成
```

**Session管理注意事项**：
- 默认超时15分钟（可通过 --timeout 调整）
- 同一 fdId 重复调用会自动续期
- 审批完成后自动关闭会话
- 使用 `oa-todo daemon release` 可手动释放资源

### 审批安全确认机制

**所有审批操作都需要用户确认**：

**单个审批 - 单个确认**：
1. 智能体展示该待办的详细信息
2. 询问："确认要通过/驳回这个审批吗？"
3. 用户确认后，智能体执行：`oa-todo approve <id> 通过 --force`

**批量审批 - 一次确认，智能体自动批量执行**：
1. 智能体通过Markdown表格展示所有待办的摘要列表
2. 询问："确认批量通过这N个待办吗？"
3. 用户确认一次后，智能体自动逐个执行

**批量审批支持自然语言**：
- 按序号：`"通过第1、3、5个"` → 智能体提取ID并逐个执行
- 按范围：`"批量审批1-3号"` → 智能体提取第1-3个ID并逐个执行
- 按条件：`"通过所有张三提交的"` → 智能体筛选并逐个执行
- 按数量：`"批量审批前5个"` → 智能体提取前5个ID并逐个执行

**批量确认展示格式**：
批量审批时，智能体必须使用Markdown表格展示待办列表：

| 序号 | 标题 | 提交人 | 类型 | 状态 |
|------|------|--------|------|------|
| 1 | 请审批[基础架构部]吴庆... | 吴庆 | 流程审批 | 待审核 |
| 2 | 请审批[产品部]张三... | 张三 | 流程审批 | 待审核 |

确认批量通过这2个待办吗？(y/n)

**重要说明**：
- 批量审批时，用户只需确认一次，智能体会自动逐个执行所有审批操作
- **审批时使用 `--force` 参数**，因为已经在智能体层面进行了用户确认

### 会议邀请智能审批语义

**会议邀请的特殊审批映射**：
- 用户说 "同意" → 智能体执行 `参加`
- 用户说 "不同意" → 智能体执行 `不参加`
- 用户说 "参加" → 智能体执行 `参加`
- 用户说 "不参加" → 智能体执行 `不参加`

---

## 快速开始

### 本地源码编译安装（推荐）

```bash
# 1. 进入项目目录
cd /path/to/query-oa-approval/oa-todo

# 2. 安装依赖
npm install

# 3. 编译 TypeScript
npm run build

# 4. 全局链接
npm link

# 5. 配置环境变量 (在 CoPaw Environments 中)
# OA_USER_NAME=your_username
# OA_USER_PASSWD=your_password

# 6. 同步待办
oa-todo sync
```

### 从内部 npm 安装（备用）

```bash
# 1. 配置 npm registry
npm login --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/

# 2. 安装
npm install -g oa-todo --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/

# 3. 配置环境变量 (在 CoPaw Environments 中)
# OA_USER_NAME=your_username
# OA_USER_PASSWD=your_password

# 4. 同步待办
oa-todo sync
```

---

## 🎯 最佳实践工作流程

### 标准审批流程（推荐）

```bash
# 步骤1: 列出待审核的待办
oa-todo list --type workflow --status pending

# 步骤2: 查看特定待办的详细信息
oa-todo show <完整fdId>

# 步骤3: 询问用户确认
# "我发现待办 [标题]，提交人：[姓名]，来自：[部门]"
# "确认要通过这个审批吗？"

# 步骤4: 用户确认后执行审批
oa-todo approve <完整ID> 通过

# 步骤5: （可选）添加审批意见
oa-todo approve <完整ID> 通过 --comment "同意"
```

### 批量审批流程

```bash
# 步骤1: 列出所有待审核
oa-todo list --status pending

# 步骤2: 选择要批量审批的待办ID
# 复制多个待办的完整ID

# 步骤3: 向智能体展示列表并确认
# "我将批量通过以下3个待办："
# 1. [待办标题1] - 提交人：张三 (ID: xxx1)
# 2. [待办标题2] - 提交人：李四 (ID: xxx2)
# "确认批量通过这2个待办吗？"

# 步骤4: 用户确认后，智能体自动逐个执行审批命令
# 智能体会执行：
# oa-todo approve xxx1 通过
# oa-todo approve xxx2 通过

# 注意：CLI不支持多ID命令，智能体会逐个调用单个命令
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

## 命令参考

**详细命令说明请参考 [references/commands.md](references/commands.md)**

| 命令 | 说明 | 示例 |
|------|------|------|
| `sync` | 同步待办 | `oa-todo sync --fetch-detail -c 5` |
| `list` | 列出待办 | `oa-todo list --type workflow` |
| `show` | 查看详情 | `oa-todo show <fdId>` |
| `approve` | 审批操作 | `oa-todo approve <fdId> 通过` |
| `status` | 统计信息 | `oa-todo status --by-type` |
| `daemon` | 管理守护进程 | `oa-todo daemon start` |

---

## 复杂审批流程

**需要深度审查的复杂审批（包含附件、文档、技术资料）请参考：[references/complex-approval.md](references/complex-approval.md)**

**适用场景**：
- 服务器采购、合同审批
- 技术方案评审
- 需要专业判断的审批
- 包含大量附件、文档的审批

**核心特性**：
- ✅ 智能体主动提取和总结审批资料
- ✅ 交互式审阅：用户指定关注点，智能体深度分析
- ✅ 智能建议：基于分析结果给出审批建议
- ✅ 暂停与恢复：支持暂时终止审批并保存断点

**快速开始**：
```bash
# 创建断点进行深度分析
oa-todo approve <fdId> --pause --timeout 15
```

---

## 使用场景

**更多场景示例请参考 [references/scenarios.md](references/scenarios.md)**

- 场景1：查看待办列表（同时查询列表和统计）
- 场景2：查看并审批单个待办
- 场景3：批量审批（Markdown表格展示+一次确认）
- 场景4：处理会议邀请
- 场景5：配置定时自动同步（推荐）
- 场景6：复杂审批流程（人工+智能体交互）

---

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `OA_USER_NAME` | ✅ | - | OA用户名 |
| `OA_USER_PASSWD` | ✅ | - | OA密码 |
| `OA_STATE_FILE` | ❌ | `~/.oa-todo/login_state.json` | 登录状态文件 |
| `OA_DB_PATH` | ❌ | `~/.oa-todo/oa_todos.db` | 数据库路径 |
| `OA_TODOS_DIR` | ❌ | `~/.oa-todo` | 待办目录 |
| `OA_DETAILS_DIR` | ❌ | `~/.oa-todo/details` | 详情目录 |
| `LOGIN_TIMEOUT_MINUTES` | ❌ | 25 | 登录状态超时（分钟） |
| `PAUSE_TIMEOUT_MINUTES` | ❌ | 10 | 断点超时时间（分钟） |

---

## 常见问题

**故障排除请参考 [references/troubleshooting.md](references/troubleshooting.md)**

- 登录状态过期？ → 重新同步会自动登录：`oa-todo sync`
- fdId太长？ → 从列表中复制完整的32位fdId，使用：`oa-todo show <完整fdId>`
- 调试登录问题？ → 使用可视化模式：`AGENT_BROWSER_HEADED=1 oa-todo sync`
- 同步超时？ → 配置定时任务自动同步，或使用 `--limit` 限制数量

---

## 依赖

- Node.js >= 14.0.0
- agent-browser（首次运行自动检查）

---

## 更多文档

- [命令详解](references/commands.md)
- [复杂审批流程](references/complex-approval.md)
- [使用场景](references/scenarios.md)
- [故障排除](references/troubleshooting.md)
- [高级用法与数据库结构](references/advanced.md)
- [旧版脚本迁移指南](references/legacy.md)
