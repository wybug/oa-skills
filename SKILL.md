---
name: query-oa-approval
description: 新国都集团OA费控系统审批自动化工具。**必须使用此技能当用户提到**：OA审批、费控审批、待办查询、OA待办、审批单据、同意单据、驳回单据、批量审批、费控系统、OA系统审批、查一下待办、批一下单子、处理OA待办、费控流程、审批流程、待审批列表、OA系统待办、我的待办、同步待办、导出待办、备份待办、通过fdId审批等任何与OA审批相关的操作。支持：费控系统查询（query_approval.sh）、费控系统审批（approve.sh）、批量审批（batch_approve.sh）、OA系统待办查询（query_oa_todo.sh）、OA系统待办审批（approve_oa_todo.sh）、OA系统待办同步（sync_oa_todos.sh）、OA系统待办审批（fdId）（approve_oa_todo_by_fdId.sh）。使用state save/load实现登录复用，性能提升50%以上。
---

# OA审批系统自动化

## 🎯 快速选择脚本

### 费控系统（报销/费用）

| 我要做什么 | 使用哪个脚本 | 示例 |
|-----------|------------|------|
| **查看费控待审批** | `query_approval.sh` | `./scripts/query_approval.sh` |
| **审批费控单据** | `approve.sh` | `./scripts/approve.sh FK001 同意` |
| **批量审批费控单据** | `batch_approve.sh` | `./scripts/batch_approve.sh list.csv` |
| **保存登录状态** | `login.sh` | `./scripts/login.sh` |

### OA系统（通用待办）

| 我要做什么 | 使用哪个脚本 | 示例 |
|-----------|------------|------|
| **查看OA系统待办** | `query_oa_todo.sh` | `./scripts/query_oa_todo.sh` |
| **审批OA系统待办（序号）** | `approve_oa_todo.sh` | `./scripts/approve_oa_todo.sh 1 参加` |
| **审批OA系统待办（fdId）** | `approve_oa_todo_by_fdId.sh` | `./scripts/approve_oa_todo_by_fdId.sh abc123def456 参加` |
| **同步所有待办详情** | `sync_oa_todos.sh` | `./scripts/sync_oa_todos.sh` |

**⚠️ 重要**：
- 费控系统用 `query_approval.sh` 和 `approve.sh`
- OA系统待办用 `query_oa_todo.sh` 和 `approve_oa_todo.sh`
- 不要混用！

---

## 功能概述

此技能提供新国都集团OA系统的完整审批自动化功能：

### 费控系统（报销/费用）
- ✅ **登录管理**: 独立登录脚本，保存登录状态供复用
- 🔍 **查询待办**: 查询费控系统待审批流程
- ⚡ **单据审批**: 根据单号执行同意或驳回操作
- 🚀 **批量审批**: 并发处理多个审批任务
- 🔐 **并发支持**: 使用独立session，支持多脚本同时执行

### OA系统（通用待办）
- 📋 **查询待办**: 查询OA系统"我的待办"列表
- ✅ **待办审批**: 审批OA系统待办事项（同意/驳回）
- 🔄 **待办同步**: 翻页获取所有待办，逐个打开详情并保存到本地
- 🔗 **独立session**: 一个审批一个session，互不干扰

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

### 场景 4：OA系统待办审批

```bash
# 步骤 1：登录保存状态（首次使用）
./scripts/login.sh

# 步骤 2：查询OA系统待办
./scripts/query_oa_todo.sh

# 输出示例:
# ========================================
#   待办列表（共 3 条）
# ========================================
# 【1】报销申请 - 张三 - 2025-03-18
# 【2】请假申请 - 李四 - 2025-03-18
# 【3】采购申请 - 王五 - 2025-03-18

# 步骤 3：审批第1条待办（同意）
./scripts/approve_oa_todo.sh 1 参加

# 步骤 4：审批第2条待办（驳回，带意见）
./scripts/approve_oa_todo.sh 2 通过 "同意"

# 步骤 5：通过关键词审批
./scripts/approve_oa_todo.sh "报销申请" 通过 "同意报销"
```

**query_oa_todo.sh 参数**：
- 无参数，直接查询OA系统"我的待办"列表

**approve_oa_todo.sh 参数**：
- `<序号或关键词>`: 待办事项的序号（如 1, 2, 3）或关键词（如 "报销申请"）
- `<参加|不参加|通过|驳回|转办>`: 审批动作
  - 会议安排类: 参加 | 不参加
  - 流程管理类: 通过 | 驳回 | 转办
- `[处理意见]`: 可选，建议填写
- `[转办人员]`: 转办时必需

**特点**：
- ✅ 自动检测待办类型（会议安排/流程管理）
- ✅ 会议安排：选择参加/不参加，填写留言
- ✅ 流程管理：滚动到底部，选择通过/驳回/转办
- ✅ 驳回时默认打回上一节点
- ✅ 转办需提供人员姓名
- ✅ 一个审批一个session，互不干扰
- ✅ 复用登录状态，避免重复登录

### 场景 5：批量处理OA系统待办

```bash
# 方式1: 交互模式（推荐）
./scripts/batch_approve_oa_todo.sh

# 方式2: 自动处理前10条
./scripts/batch_approve_oa_todo.sh 10

# 方式3: 处理指定范围（第1-5条）
./scripts/batch_approve_oa_todo.sh 1-5

# 方式4: 处理指定序号（第1,3,5条）
./scripts/batch_approve_oa_todo.sh 1,3,5
```

**batch_approve_oa_todo.sh 参数**：
- `[选择]`: 可选，不提供则进入交互模式
  - `10`: 处理前10条
  - `1-10`: 处理第1-10条
  - `1,3,5`: 处理第1,3,5条

**统一规则（方式B）**：
- 流程管理类: 自动选择"通过"，意见="同意"
- 会议安排类: 自动选择"参加"，无留言
- 转办操作: 自动跳过（需要指定人员）

**特点**：
- ✅ 先查询待办列表，显示给用户
- ✅ 支持交互式选择
- ✅ 自动识别待办类型
- ✅ 按统一规则批量处理
- ✅ 生成详细的处理结果报告
- ✅ 统计成功/失败/跳过数量

### 场景 6：同步所有待办详情

```bash
# 方式1: 同步所有待办详情
./scripts/sync_oa_todos.sh

# 方式2: 测试模式（仅获取前2条）
./scripts/sync_oa_todos.sh 2

# 方式3: 获取前10条
./scripts/sync_oa_todos.sh 10
```

**sync_oa_todos.sh 参数**：
- `[limit]`: 可选，限制获取数量
  - 不提供：获取所有待办
  - `2`: 测试模式，仅获取2条
  - `10`: 获取前10条

**输出文件**（保存在 `/tmp/oa_todos/` 目录）：
- `index.txt`: 待办索引（**fdId|标题|链接**），以fdId为关键字整行更新
- `summary.txt`: 汇总报告
- `[fdId]/`: 每个待办的详情目录（以fdId命名）
  - `detail.txt`: 待办详情（页面内容+快照）
  - `snapshot.txt`: 页面快照
  - `screenshot.png`: 页面截图

**特点**：
- ✅ 翻页获取所有待办
- ✅ 提取fdId作为唯一标识
- ✅ 索引文件以fdId为关键字整行更新
- ✅ 已存在的详情文件自动跳过
- ✅ 逐个打开待办详情页面
- ✅ 保存完整页面内容和快照
- ✅ 生成截图便于查看
- ✅ 支持限制数量（测试模式）
- ✅ 复用登录状态，性能优化

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

### query_oa_todo.sh - 查询OA系统待办

**用途**：查询OA系统"我的待办"列表（**仅查询，不审批**）

**使用**：
```bash
# 标准查询（包含自动登录）
./scripts/query_oa_todo.sh

# 可视化调试
AGENT_BROWSER_HEADED=1 ./scripts/query_oa_todo.sh
```

**输出**：
- 控制台输出待办列表（序号、标题、时间等信息）
- 统计待办数量

### approve_oa_todo.sh - 审批OA系统待办

**用途**：审批OA系统待办事项（**仅审批，不查询列表**）

**使用**：
```bash
# 通过序号审批
./scripts/approve_oa_todo.sh 1 同意
./scripts/approve_oa_todo.sh 2 驳回 "请假天数不足"

# 通过关键词审批
./scripts/approve_oa_todo.sh "报销申请" 同意 "同意报销"

# 可视化调试
AGENT_BROWSER_HEADED=1 ./scripts/approve_oa_todo.sh 1 同意
```

**智能功能**：
- ✅ 自动进入OA系统，点击"我的待办"
- ✅ 支持序号和关键词查找待办事项
- ✅ 一个审批一个session，互不干扰
- ✅ 支持填写审批意见
- ✅ 复用登录状态，避免重复登录

### sync_oa_todos.sh - 同步所有待办详情

**用途**：翻页获取所有待办，逐个打开详情并保存到本地

**使用**：
```bash
# 同步所有待办详情
./scripts/sync_oa_todos.sh

# 测试模式（仅获取前2条）
./scripts/sync_oa_todos.sh 2

# 可视化调试
AGENT_BROWSER_HEADED=1 ./scripts/sync_oa_todos.sh 2
```

**输出**（保存在 `/tmp/oa_todos/` 目录）：
- `index.txt`: 待办索引（**fdId|标题|链接**），以fdId为关键字整行更新
- `summary.txt`: 汇总报告（统计信息+文件列表）
- `[fdId]/`: 每个待办的详情目录（以fdId命名）
  - `detail.txt`: 待办详情（页面内容+快照）
  - `snapshot.txt`: 页面快照
  - `screenshot.png`: 页面截图

**工作流程**：
1. 检查登录状态，如过期则自动重新登录
2. 打开待办列表页面
3. 翻页获取所有待办链接和标题
4. 提取fdId，更新索引文件（整行替换）
5. 逐个打开待办详情页面（跳过已存在的）
6. 保存页面内容、快照和截图到对应fdId目录
7. 生成汇总报告

**特点**：
- ✅ 支持翻页，获取所有待办
- ✅ 提取fdId作为唯一标识
- ✅ 索引文件以fdId为关键字整行更新
- ✅ 已存在的详情文件自动跳过
- ✅ 保存完整的待办详情
- ✅ 支持限制数量（测试模式）
- ✅ 复用登录状态，性能优化
- ✅ 生成索引和汇总报告

### approve_oa_todo_by_fdId.sh - 通过fdId精确审批

**用途**：通过fdId精确定位并审批待办

**使用**：
```bash
# 会议安排类
./scripts/approve_oa_todo_by_fdId.sh 19bba01cb5a30a6668fdc15413daa5da 参加
./scripts/approve_oa_todo_by_fdId.sh 19bba01cb5a30a6668fdc15413daa5da 不参加 "已有其他安排"

# 流程管理类
./scripts/approve_oa_todo_by_fdId.sh 196a8d090affec19889720144edb5c5f 通过 "同意"
./scripts/approve_oa_todo_by_fdId.sh 196a8d090affec19889720144edb5c5f 驳回 "信息不完整"

# 可视化调试
AGENT_BROWSER_HEADED=1 ./scripts/approve_oa_todo_by_fdId.sh 19bba01cb5a30a6668fdc15413daa5da 参加
```

**参数**：
- `<fdId>`: 待办唯一标识符（从 `/tmp/oa_todos/index.txt` 获取）
- `<审批动作>`: 审批动作（参加/不参加/通过/驳回/转办）
- `[处理意见]`: 可选，建议填写
- `[转办人员]`: 转办时必需

**获取fdId**：
```bash
# 查看索引文件
cat /tmp/oa_todos/index.txt

# 或执行同步脚本
./scripts/sync_oa_todos.sh
```

**工作流程**：
1. 从索引文件 `/tmp/oa_todos/index.txt` 中精确查找fdId
2. 显示找到的待办信息
3. 使用fdId从索引中获取详情链接
4. 直接打开详情页面执行审批
5. 自动检测待办类型并执行相应操作
6. 审批成功后更新索引文件

**特点**：
- ✅ 通过fdId精确定位，避免同名待办混淆
- ✅ 直接从索引获取详情链接，无需列表查找
- ✅ 审批成功后自动更新索引文件
- ✅ 支持同名待办，每次处理一个
- ✅ 复用登录状态，性能优化
- ✅ 一个审批一个session，互不干扰

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

### v2.4.0 - 2025-03-18

**新增功能**:
- ✨ 新增 approve_oa_todo_by_fdId.sh 脚本
- 🔑 通过fdId精确定位待办
- ⚡ 直接从索引获取详情链接
- 🔄 审批成功后自动更新索引文件

**优化改进**:
- 🎯 避免同名待办混淆
- 📊 提升审批准确性和效率
- 🧪 测试通过，支持会议和流程两种类型

**使用场景**:
- 通过fdId精确审批同名待办
- 批量审批特定待办
- 配合脚本实现自动化流程

### v2.3.0 - 2025-03-18

**目录结构优化**:
- 📁 优化同步目录结构，统一使用 `/tmp/oa_todos/`
- 🔑 索引文件以 fdId 为关键字整行更新
- 📂 详情文件存储在 `/tmp/oa_todos/[fdId]/` 目录下
- ⚡ 已存在的详情文件自动跳过，提升性能

**新增功能**:
- ✨ 新增 approve_oa_todo_by_title.sh 脚本
- 🔍 支持通过标题关键词检索待办
- 🎯 自动选择第一个匹配的待办执行审批
- 📊 从索引文件快速获取待办信息

**使用场景**:
- 通过标题快速定位待办（如"报销"、"请假"等）
- 批量导出待办详情用于分析
- 定期备份待办信息
- 批量处理前的预检查

### v2.2.0 - 2025-03-18

**新增功能**:
- ✨ 新增 sync_oa_todos.sh 脚本，支持同步所有待办详情
- 🔄 支持翻页获取所有待办
- 📁 逐个打开待办详情并保存到本地
- 💾 保存页面内容、快照和截图
- 📊 生成索引和汇总报告
- 🧪 支持限制数量（测试模式）

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
