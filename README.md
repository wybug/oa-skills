# oa-todo

新国都集团 OA 系统待办管理 CLI 工具。自动化处理 OA 审批流程：同步待办、查询详情、一键审批。

## 支持的审批类型

| 类型 | 审批动作 | 按钮文本 |
|------|----------|----------|
| 会议邀请 | 参加、不参加 | 参加 / 不参加 |
| EHR 假期 | 同意、不同意 | 同意 / 不同意 |
| 费用报销 | 同意、驳回 | 同意 / 驳回 |
| 通用流程 | 通过、驳回、转办 | 通过 / 驳回 |

## 功能特性

- **SQLite 本地存储** — 待办数据持久化，支持离线查询与状态管理
- **智能同步** — 增量同步待办列表，支持并发获取详情
- **状态管理** — 追踪每条待办的处理状态（pending / approved / rejected / transferred 等）
- **暂停点系统** — `--pause` 模式支持 AI 代理交互式审查后再审批
- **CDP 模式** — 可连接外部 Chrome 实例，便于调试
- **并发安全** — 浏览器池支持多实例并发抓取详情
- **文件日志** — 按天轮转，7 天保留，记录关键操作
- **会议室查询** — 查询会议室占用情况和空闲时段

## 快速开始

### 环境要求

- Node.js >= 16.0.0

### 安装

**源码安装**：

```bash
cd oa-todo
npm install
npm link
```

**内部 registry 安装**：

```bash
npm install -g oa-todo --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/
```

### 配置

在 CoPaw Environments 中配置以下环境变量：

```bash
OA_USER_NAME=your_username
OA_USER_PASSWD=your_password
```

> **安全提示**：不要在命令行或代码中直接输入凭据。

### 首次运行

```bash
oa-todo sync          # 同步待办
oa-todo list          # 查看待办列表
```

### 定时同步

支持通过 CoPaw Cron 配置定时任务，实现自动同步待办。详见 [SKILL.md](SKILL.md)。

## 命令速查

| 命令 | 说明 | 示例 |
|------|------|------|
| `sync` | 从 OA 系统同步待办 | `oa-todo sync --fetch-detail -c 5` |
| `list` | 列出待办 | `oa-todo list --type meeting` |
| `show` | 查看待办详情 | `oa-todo show <fdId>` |
| `approve` | 审批待办 | `oa-todo approve <fdId> 同意` |
| `status` | 统计信息 | `oa-todo status --by-type` |
| `daemon` | 管理浏览器守护进程 | `oa-todo daemon start` |
| `session` | 管理浏览器会话 | `oa-todo session list` |
| `rooms` | 查询会议室 | `oa-todo rooms 2026-04-01` |

完整命令参数说明见 [references/commands.md](references/commands.md)。

## 项目结构

```
├── oa-todo/          # CLI 源码（入口、命令、核心模块）
│   ├── bin/          # CLI 入口
│   ├── src/          # 源代码（命令、库模块）
│   └── scripts/      # RPA 审批脚本
├── references/       # 详细文档（命令、架构、最佳实践等）
├── docs/             # 开发文档
├── evals/            # 测试用例
├── SKILL.md          # AI 智能体技能定义
└── CLAUDE.md         # 开发者指南
```

## 数据存储

默认位置：`~/.oa-todo/`

```
~/.oa-todo/
├── oa_todos.db          # SQLite 数据库
├── details/             # 待办详情（按 fdId 分目录）
│   └── <fdId>/
│       ├── data.json    # 结构化数据
│       ├── detail.txt   # 文本详情
│       ├── snapshot.txt # 页面快照
│       └── screenshot.png
├── logs/                # 日志文件（按天轮转，保留 7 天）
├── pauses/              # 暂停会话数据
└── login_state.json     # 登录状态
```

可通过环境变量自定义路径，详见 [CLAUDE.md](CLAUDE.md)。

## 开发与调试

### 调试模式

```bash
oa-todo --debug sync                # 详细日志输出
oa-todo daemon start --headed       # 显示浏览器窗口
OA_CDP_URL=ws://localhost:9222 oa-todo sync  # 连接外部 Chrome
```

### RPA 脚本开发

`oa-todo/scripts/` 目录下包含各类型审批的 RPA 脚本。开发新脚本可使用 `--pause` 模式交互式探索页面结构，参考 [rpa-generator-prompt.md](oa-todo/scripts/rpa-generator-prompt.md) 中的 AI 提示词模板。

## 文档索引

| 文档 | 说明 |
|------|------|
| [SKILL.md](SKILL.md) | AI 智能体技能定义与工作流程 |
| [CLAUDE.md](CLAUDE.md) | 开发者指南（架构、模块、开发规范） |
| [INSTALL.md](INSTALL.md) | 安装指南 |
| [EXAMPLES.md](EXAMPLES.md) | 使用示例 |
| [CHANGELOG.md](CHANGELOG.md) | 版本更新日志 |
| [references/commands.md](references/commands.md) | 命令详解 |
| [references/architecture.md](references/architecture.md) | 系统架构 |
| [references/scenarios.md](references/scenarios.md) | 使用场景 |
| [references/troubleshooting.md](references/troubleshooting.md) | 故障排除 |
| [references/advanced.md](references/advanced.md) | 高级用法 |
| [references/best-practices.md](references/best-practices.md) | 最佳实践 |

## License

[MIT](LICENSE)
