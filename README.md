# OA费控系统审批自动化技能

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.1.0-green.svg)](https://github.com/wybug/oa-skills)

新国都集团OA系统费控审批自动化工具，支持查询待审批、单据审批、批量审批等功能。

## ✨ 特性

- 🚀 **高效执行** - 使用登录状态复用，单个审批从 ~15秒 降至 ~7秒
- 🔐 **安全可靠** - 密码通过环境变量管理，不硬编码在脚本中
- 🎯 **智能查询** - 自动在待审批和审批记录中查询单据状态
- ⚡ **批量处理** - 支持并发审批（3-5个并发），效率提升 77%
- 📝 **详细日志** - 完整的执行日志和结果汇总
- 🔧 **易于调试** - 支持可视化调试模式

## 📦 安装

详细安装指南请查看 [INSTALL.md](INSTALL.md)

### 快速安装

#### 1. 安装 Node.js

```bash
# macOS (使用 Homebrew)
brew install node

# Linux (Ubuntu/Debian)
sudo apt update && sudo apt install nodejs npm

# Windows
# 下载官方安装包: https://nodejs.org/
```

#### 2. 克隆仓库

```bash
git clone https://github.com/wybug/oa-skills.git
cd oa-skills
```

#### 3. 安装 agent-browser

```bash
# 自动安装（推荐）
./scripts/login.sh  # 首次运行会自动检测并提供安装指引

# 或手动安装
npm install -g agent-browser
```

#### 4. 配置环境变量

```bash
# 在 CoPaw 的 Environments 中配置
OA_USER_NAME=你的用户名
OA_USER_PASSWD=你的密码

# 或通过命令行
export OA_USER_NAME="你的用户名"
export OA_USER_PASSWD="你的密码"
```

### 验证安装

```bash
# 检查 Node.js
node --version  # 应 >= 14.0.0

# 检查 agent-browser
npx agent-browser --version

# 测试运行
./scripts/login.sh
```

## 🚀 快速开始

### 查询待审批

```bash
./scripts/query_approval.sh
```

### 单据审批

```bash
# 同意
./scripts/approve.sh FK20250101001 同意

# 驳回
./scripts/approve.sh FK20250101002 驳回 费用超标
```

### 批量审批

```bash
# 创建审批清单
cat > approval_list.csv <<EOF
单号,动作,审批意见
FK20250101001,同意,
FK20250101002,驳回,费用超标
EOF

# 执行批量审批
./scripts/batch_approve.sh approval_list.csv 3
```

## 📚 文档

- [快速开始](SKILL.md#快速开始)
- [脚本说明](SKILL.md#脚本说明)
- [常见问题](SKILL.md#常见问题)
- [架构设计](references/architecture.md)
- [最佳实践](references/best-practices.md)
- [故障排查](references/troubleshooting.md)
- [技术细节](references/technical-details.md)

## 🎯 核心功能

### 查询待审批
- 自动登录OA系统
- 进入费控系统
- 获取待审批列表
- 输出到控制台

### 单据审批
- 智能查询单据（待审批+审批记录）
- 执行同意/驳回操作
- 支持审批意见
- 验证审批结果

### 批量审批
- CSV清单管理
- 并发执行（可配置并发数）
- 自动重试失败任务
- 结果汇总报告

## 🔧 调试

### 可视化模式

```bash
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK001 同意
```

### 查看日志

```bash
# 单据日志
cat /tmp/oa_approve_FK001.log

# 批量结果
cat /tmp/oa_batch_results.csv
```

## 📊 性能数据

| 操作 | 传统方式 | 优化后 | 提升 |
|------|---------|--------|------|
| 单个审批 | ~15秒 | ~7秒 | 53% |
| 批量审批（10个） | ~150秒 | ~35秒 | 77% |
| 登录流程 | 每次登录 | 复用状态 | 100% |

## 🛡️ 安全性

- ✅ 密码通过环境变量管理
- ✅ 登录状态文件权限保护
- ✅ 定期清理日志文件
- ✅ 不在脚本中硬编码敏感信息

## 📝 更新日志

### v2.1.0 (2025-03-18)

**新增功能**:
- ✨ 智能查询功能（自动在审批记录中查询）
- ✨ 登录状态保存/加载机制
- ✨ 批量并发审批
- ✨ Session 隔离

**优化改进**:
- 🚀 移除所有截图操作，性能提升 10%
- 📚 重构文档结构（Progressive Disclosure）
- 🎯 强化触发机制（15+ 关键词）
- 🧪 创建测试用例（8个测试）

**性能提升**:
- 单个审批任务从 ~15秒 降至 ~7秒
- 支持3-5个任务并发执行
- 登录状态可复用，减少登录次数

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

## 👤 作者

- GitHub: [@wybug](https://github.com/wybug)

## 🙏 致谢

感谢所有贡献者的支持！
