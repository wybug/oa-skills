# 安装指南

本文档提供详细的安装步骤和故障排查方法。

## 📋 系统要求

### 必需软件

| 软件 | 最低版本 | 推荐版本 | 检查命令 |
|------|---------|---------|---------|
| Node.js | 14.0.0 | 18.x LTS | `node --version` |
| npm | 6.0.0 | 9.x | `npm --version` |
| agent-browser | 最新版 | 最新版 | `agent-browser --version` |

### 操作系统支持

- ✅ macOS 10.15+
- ✅ Windows 10/11
- ✅ Linux (Ubuntu 18.04+, Debian 10+, CentOS 7+)

---

## 🚀 快速安装

### 1. 安装 Node.js

#### macOS

**方式 1: Homebrew（推荐）**
```bash
# 安装 Homebrew（如未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Node.js
brew install node

# 验证安装
node --version
npm --version
```

**方式 2: 官方安装包**
1. 访问 https://nodejs.org/
2. 下载 LTS 版本（长期支持版）
3. 运行安装程序
4. 重启终端

**方式 3: nvm（推荐给开发者）**
```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重启终端，然后安装 Node.js
nvm install --lts
nvm use --lts
```

#### Linux (Ubuntu/Debian)

```bash
# 方式 1: 使用 apt
sudo apt update
sudo apt install nodejs npm

# 方式 2: 使用 NodeSource（推荐，获取最新版本）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

#### Linux (CentOS/RHEL)

```bash
# 使用 NodeSource
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node --version
npm --version
```

#### Windows

**方式 1: 官方安装包**
1. 访问 https://nodejs.org/
2. 下载 LTS 版本（.msi 安装包）
3. 运行安装程序
4. 重启 PowerShell 或命令提示符

**方式 2: Chocolatey**
```powershell
# 安装 Chocolatey（如未安装）
# 以管理员身份运行 PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

# 安装 Node.js
choco install nodejs

# 验证安装
node --version
npm --version
```

---

### 2. 安装 agent-browser

#### 方式 1: 自动安装（推荐）

首次运行任何脚本时，会自动检查并提供安装指引：

```bash
./scripts/login.sh
# 系统会检测 agent-browser，如未安装会提示
```

#### 方式 2: 全局安装（推荐）

```bash
# 标准安装
npm install -g agent-browser

# 验证安装
agent-browser --version
```

#### 方式 3: 使用 npx（无需全局安装）

所有脚本已内置支持 npx，无需全局安装：

```bash
# 脚本会自动使用 agent-browser
./scripts/login.sh
```

#### 方式 4: 使用国内镜像（加速）

```bash
# 设置 npm 镜像
npm config set registry https://registry.npmmirror.com

# 安装
npm install -g agent-browser

# 恢复默认镜像（可选）
npm config set registry https://registry.npmjs.org
```

---

## 🔧 配置环境变量

### 方式 1: 在 CoPaw 中配置（推荐）

1. 打开 CoPaw 设置
2. 进入 **Environments** 配置
3. 添加环境变量：
   ```
   OA_USER_NAME=你的用户名
   OA_USER_PASSWD=你的密码
   ```
4. 保存配置

### 方式 2: 在 Shell 配置文件中设置

**macOS/Linux (bash)**:
```bash
echo 'export OA_USER_NAME="你的用户名"' >> ~/.bashrc
echo 'export OA_USER_PASSWD="你的密码"' >> ~/.bashrc
source ~/.bashrc
```

**macOS/Linux (zsh)**:
```bash
echo 'export OA_USER_NAME="你的用户名"' >> ~/.zshrc
echo 'export OA_USER_PASSWD="你的密码"' >> ~/.zshrc
source ~/.zshrc
```

**Windows (PowerShell)**:
```powershell
# 临时设置（当前会话）
$env:OA_USER_NAME = "你的用户名"
$env:OA_USER_PASSWD = "你的密码"

# 永久设置（用户级别）
[Environment]::SetEnvironmentVariable("OA_USER_NAME", "你的用户名", "User")
[Environment]::SetEnvironmentVariable("OA_USER_PASSWD", "你的密码", "User")
```

---

## ✅ 验证安装

### 1. 检查 Node.js

```bash
node --version
# 应输出: v14.x.x 或更高

npm --version
# 应输出: 6.x.x 或更高
```

### 2. 检查 agent-browser

```bash
# 方式 1: 全局安装检查
agent-browser --version

# 方式 2: npx 检查
agent-browser --version
```

### 3. 检查环境变量

```bash
# macOS/Linux
echo $OA_USER_NAME
echo $OA_USER_PASSWD

# Windows (PowerShell)
$env:OA_USER_NAME
$env:OA_USER_PASSWD
```

### 4. 测试运行

```bash
# 尝试运行登录脚本
./scripts/login.sh

# 如显示登录界面，说明安装成功
```

---

## 🐛 常见问题

### 问题 1: npm 权限错误

**错误信息**: `EACCES: permission denied`

**解决方案**:

**macOS/Linux**:
```bash
# 方式 1: 使用 sudo（快速但不推荐）
sudo npm install -g agent-browser

# 方式 2: 修改 npm 目录（推荐）
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g agent-browser
```

**Windows**:
```powershell
# 以管理员身份运行 PowerShell
# 右键点击 PowerShell -> "以管理员身份运行"
npm install -g agent-browser
```

### 问题 2: 网络超时

**错误信息**: `ETIMEDOUT` 或连接超时

**解决方案**:

```bash
# 使用国内镜像
npm config set registry https://registry.npmmirror.com

# 或使用代理
npm config set proxy http://proxy-server:port
npm config set https-proxy http://proxy-server:port

# 安装
npm install -g agent-browser

# 清除代理设置（可选）
npm config delete proxy
npm config delete https-proxy
```

### 问题 3: Node.js 版本过低

**错误信息**: `engine "node" is incompatible`

**解决方案**:

```bash
# 升级 Node.js 到 LTS 版本
# macOS (使用 Homebrew)
brew upgrade node

# Linux (使用 nvm)
nvm install --lts
nvm use --lts

# Windows
# 重新下载安装包: https://nodejs.org/
```

### 问题 4: Windows 脚本执行权限

**错误信息**: `无法加载文件，因为在此系统上禁止运行脚本`

**解决方案**:

```powershell
# 以管理员身份运行 PowerShell
# 修改执行策略
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# 或临时允许（当前会话）
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
```

### 问题 5: 脚本无法执行

**错误信息**: `Permission denied`

**解决方案**:

```bash
# macOS/Linux: 添加执行权限
chmod +x scripts/*.sh

# 或对所有脚本
chmod +x scripts/*.sh

# Windows: 使用 Git Bash 或 WSL
```

---

## 📚 进阶配置

### 使用 .npmrc 配置文件

创建 `~/.npmrc` 文件：

```ini
# 设置镜像
registry=https://registry.npmmirror.com

# 设置代理（如需要）
# proxy=http://proxy-server:port
# https-proxy=http://proxy-server:port

# 设置安装目录
prefix=~/.npm-global
```

### 使用环境变量文件

创建 `.env` 文件（不要提交到 Git）：

```bash
# OA 系统凭据
OA_USER_NAME=你的用户名
OA_USER_PASSWD=你的密码

# 可选：自定义状态文件路径
OA_STATE_FILE=/custom/path/oa_state.json
```

然后在脚本中加载：

```bash
export $(cat .env | xargs)
./scripts/login.sh
```

---

## 🔄 卸载和重装

### 完全卸载

```bash
# 卸载 agent-browser
npm uninstall -g agent-browser

# 清理 npm 缓存
npm cache clean --force

# 删除配置文件（可选）
rm -rf ~/.npmrc
rm -rf ~/.npm
```

### 重新安装

```bash
# 重新安装 agent-browser
npm install -g agent-browser

# 验证
agent-browser --version
```

---

## 📖 相关资源

- [Node.js 官网](https://nodejs.org/)
- [npm 文档](https://docs.npmjs.com/)
- [agent-browser 文档](https://www.npmjs.com/package/agent-browser)
- [常见问题](references/troubleshooting.md)
- [最佳实践](references/best-practices.md)

---

## 🆘 获取帮助

如遇到问题：

1. 查看 [故障排查指南](references/troubleshooting.md)
2. 检查 [GitHub Issues](https://github.com/wybug/oa-skills/issues)
3. 提交新的 Issue（请附带错误日志和环境信息）

---

**安装完成后，请查看 [快速开始](README.md#-快速开始) 开始使用！**
