# OA待办管理命令详解

## sync - 同步待办

从OA系统同步待办到本地数据库。

### 基本用法

```bash
oa-todo sync                      # 同步待办列表（默认不获取详情）
oa-todo sync --force <fdId>       # 强制更新指定待办详情
oa-todo sync --fetch-detail       # 获取缺失详情（跳过列表同步）
oa-todo sync --limit 10           # 限制同步数量（测试用）
oa-todo sync -c 3 --fetch-detail  # 使用3个并发获取详情
oa-todo sync --login              # 强制重新登录
oa-todo sync --force-update       # 重置skip状态为pending
```

### 智能同步说明

- 首次使用会自动同步待办列表
- **默认 `oa-todo sync` 仅同步待办列表，不获取详情**（速度快）
- 使用 `--fetch-detail` 获取待办详情（较慢，按需使用）
- 后续使用 `oa-todo list` 查看本地数据即可

### 超时注意事项

- **同步待办列表很快**，通常不会超时
- **获取待办详情较慢**：
  - 200条待办详情约需3分钟 - 可能触发超时
  - 建议使用 `-c` 降低并发数，或 `--limit` 限制数量
- **推荐：配置定时任务每小时同步一次待办列表**

### 获取详情策略

- 默认不获取详情（推荐）：`oa-todo sync`
- 需要详情时再获取：`oa-todo sync --fetch-detail`
- 限制详情数量：`oa-todo sync --fetch-detail --limit 10`
- 降低并发避免超时：`oa-todo sync -c 3 --fetch-detail`

### 定时同步配置（推荐）

**⚠️ 时区说明**：以下所有 cron 配置的时间均为**北京时间（UTC+8）**。

**使用场景**：避免手动同步超时，保持数据最新

**配置策略**：
```bash
# 1. 每天凌晨2点（北京时间）全量同步详情
0 2 * * * oa-todo sync --fetch-detail -c 5

# 2. 工作时间每小时同步待办列表 + 25条详情（北京时间 8:00-19:00）
0 8-19 * * 1-5 oa-todo sync && oa-todo sync --fetch-detail -c 5 --limit 25

# 说明：
# - 凌晨全量同步：获取所有待办的完整详情
# - 工作时间增量同步：每小时同步列表 + 25条最新详情
# - 1-5 表示周一到周五
# - 8-19 表示8:00到19:00的整点（北京时间）
```

### 完整cron配置示例

```bash
# 编辑crontab
crontab -e

# 添加以下任务（时间均为北京时间）
# OA待办同步 - 每天凌晨2点（北京时间）全量同步详情
0 2 * * * /usr/local/bin/oa-todo sync --fetch-detail -c 5 >> /tmp/oa-sync.log 2>&1

# OA待办同步 - 工作时间每小时同步列表+25条详情（周一到周五，北京时间 8:00-19:00）
0 8-19 * * 1-5 /usr/local/bin/oa-todo sync && /usr/local/bin/oa-todo sync --fetch-detail -c 5 --limit 25 >> /tmp/oa-sync.log 2>&1
```

### 验证定时任务

```bash
# 查看当前的cron任务
crontab -l

# 查看同步日志
tail -f /tmp/oa-sync.log
```

---

## list/ls - 列出待办

查看本地待办列表，**默认只显示待审核（pending）状态**，**显示完整ID和标题**。

### 基本用法

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

### 智能体获取待办列表行为规范

1. **默认行为**：用户要求查看待办时，**同时执行两个命令**：
   - `oa-todo list` - 获取待办列表详情
   - `oa-todo status` - 获取待办统计信息
   - 两个命令的结果都展示给用户，方便决策

2. **智能体构建优化表格**：
   - **智能体获取CLI数据后，自行构建优化表格输出**
   - **隐藏ID字段**（32位ID过长，影响显示效果）
   - **新增序号字段**（1, 2, 3...）方便用户通过序号操作
   - **保留核心字段**：序号、标题、提交人、接收时间/创建时间
   - 将类型字段翻译为中文自然语言
   - 将状态字段翻译为中文自然语言
   - **确保表格格式正确**：
     - 使用Markdown表格格式
     - 合理设置列宽，避免过宽或过窄
     - 确保对齐和边框显示正常

3. **提示下一步操作**（使用自然语言，减少CLI命令）：
   - 查看详情：`查看第N个`
   - 单个审批：`审批第N个，通过/驳回`
   - **批量审批（支持自然语言）**：
     - 按序号：`"通过第1、3、5个"` 或 `"批量审批1-3号"`
     - 按条件：`"通过所有张三提交的"` 或 `"批量审批前5个"`
   - 查看更多：`查看更多待办`

### 默认行为优化

- ✅ **默认只显示待审核（pending）状态** - 专注于需要处理的待办
- ✅ 完整的32位ID（方便复制）
- ✅ 完整标题（自动换行）
- ✅ 提交人/来源部门
- ✅ 同步时间

### 查看其他状态

- 使用 `--all` 查看所有状态
- 使用 `--status <状态>` 查看指定状态

### 状态值

- `pending` - 待审核 (默认)
- `approved` - 已同意
- `rejected` - 已驳回
- `attended` - 已参加 (会议)
- `not_attended` - 不参加 (会议)
- `skip` - 已跳过
- `transferred` - 已转办
- `other` - 其他

### 类型值

- `workflow` - 流程审批 (默认，按钮: 通过/驳回/转办)
- `meeting` - 会议邀请 (按钮: 参加/不参加)
- `ehr` - EHR 假期 (按钮: 同意/不同意)
- `expense` - 费用报销 (按钮: 同意/驳回)
- `unknown` - 未知类型

---

## show - 查看详情

```bash
oa-todo show <fdId>               # 查看详情（需要完整32位fdId）
oa-todo show <fdId> --refresh     # 强制刷新
oa-todo show <fdId> --open        # 在浏览器中打开
```

---

## approve - 审批操作

### 重要说明

**所有审批操作都需要用户确认**
- **单个审批**：展示单个待办详情 → 用户确认 → 执行
- **批量审批**：展示所有待办列表 → 用户一次性确认 → 智能体自动逐个执行

### 基本用法

```bash
# 单个流程审批
oa-todo approve <完整ID> 通过
oa-todo approve <完整ID> 驳回
oa-todo approve <完整ID> 转办

# 单个会议邀请
oa-todo approve <完整ID> 参加
oa-todo approve <完整ID> 不参加

# 带审批意见
oa-todo approve <完整ID> 通过 --comment "同意"

# 智能体确认后执行
oa-todo approve <完整ID> 通过 --force
```

### 注意事项

- CLI仅支持单个ID审批命令
- 批量审批时，智能体会逐个调用 `oa-todo approve <id> 通过` 命令
- 不支持 `oa-todo approve <id1> <id2> <id3>` 多ID格式

### 单个审批信息展示

智能体向用户展示待办信息，通过自然语言确认：

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
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

智能体确认后执行：`oa-todo approve <id> 通过 --force`

### 批量审批信息展示（智能体向用户展示）

```
📋 批量审批待办列表 (共3个):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. [基础架构部]吴庆 - 评审小组流程
   ID: 18798bf8c8b26e8fbfb50d34f0888f8f
2. [产品部]张三 - 请假申请
   ID: 2877517aca354d3b44b4ddb488fadd32
3. [研发部]李四 - 报销审批
   ID: 38902a8bdc465e4c55c5eec599fbee43
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
确认批量通过这3个待办吗？
```

### 安全确认流程

智能体通过自然语言与用户确认后，使用 `--force` 参数执行审批：

- **单个审批**：
  1. 智能体展示待办详情
  2. 自然语言确认："确认要通过这个审批吗？"
  3. 用户确认后执行：`oa-todo approve <id> 通过 --force`

- **批量审批**：
  1. 智能体展示待办列表
  2. 自然语言确认："确认批量通过这N个待办吗？"
  3. 用户确认后逐条执行：
     ```
     oa-todo approve <id1> 通过 --force
     oa-todo approve <id2> 通过 --force
     ```

**`--force` 使用场景**：智能体已通过自然语言确认用户意图，无需命令再次确认。

### 参数说明

| 参数 | 说明 |
|------|------|
| `--comment <text>` | 审批意见 |
| `--force` | 跳过确认直接执行（用于智能体已确认的场景） |

### 批量审批说明

- CLI仅支持单个ID命令：`oa-todo approve <id> 通过`
- 批量审批时，智能体会逐个调用单个命令
- 用户只需确认一次，智能体自动完成所有审批

### 批量审批流程

智能体处理批量审批时遵循以下流程：

1. **解析意图** - 理解用户自然语言指令并筛选待办
   - "通过前5个" → 获取前5条
   - "驳回张三的" → 按提交人筛选
   - "参加会议" → 按会议类型筛选

2. **展示列表** - 用表格展示待办和拟执行动作

3. **允许调整** - 支持用户修改审批动作
   - "把第2个改成不参加"
   - "第3个先跳过"

4. **确认执行** - 用户确认后逐条执行（使用 `--force`）

**注意**：根据待办类型使用正确的审批动作：
- 流程审批：通过/驳回/转办
- 会议邀请：参加/不参加
- EHR假期：同意/不同意
- 费用报销：同意/驳回

---

## status - 统计信息

```bash
oa-todo status              # 总体统计
oa-todo status --by-type    # 按类型统计
oa-todo status --by-status  # 按状态统计
oa-todo status --by-date    # 按日期统计
```

---

## daemon - 管理浏览器守护进程

```bash
oa-todo daemon              # 查看守护进程状态
oa-todo daemon start        # 启动守护进程（后台运行）
oa-todo daemon start --headed  # 启动可见浏览器模式
oa-todo daemon stop         # 停止守护进程
oa-todo daemon restart      # 重启守护进程
```

### 使用场景

守护进程保持浏览器会话，避免每次操作都重新登录：

```bash
# 启动守护进程后,审批操作会复用会话
oa-todo daemon start
oa-todo approve <fdId> 通过
oa-todo approve <fdId2> 驳回
oa-todo daemon stop  # 完成，关闭守护进程
```
