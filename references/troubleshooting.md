# 故障排查指南

## 安装问题

### 1. agent-browser 未安装

**症状**：运行脚本时提示 "❌ 错误: agent-browser 未安装"

**解决方案**：

#### 方式 1：自动安装（推荐）
脚本会自动检测并提供安装指引，按提示操作即可。

#### 方式 2：手动安装

```bash
# 全局安装（推荐）
npm install -g agent-browser

# 验证安装
npx agent-browser --version
```

**使用国内镜像加速**：
```bash
# 设置 npm 镜像
npm config set registry https://registry.npmmirror.com

# 安装
npm install -g agent-browser

# 恢复默认镜像（可选）
npm config set registry https://registry.npmjs.org
```

### 2. Node.js 未安装

**症状**：提示 "npx: command not found" 或 "npm: command not found"

**解决方案**：

#### macOS
```bash
# 使用 Homebrew
brew install node

# 或下载官方安装包
# https://nodejs.org/
```

#### Linux (Ubuntu/Debian)
```bash
# 使用 apt
sudo apt update
sudo apt install nodejs npm

# 或使用 nvm（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install --lts
```

#### Windows
```bash
# 下载官方安装包
# https://nodejs.org/

# 或使用 Chocolatey
choco install nodejs
```

### 3. 权限问题

**症状**：安装时提示 "EACCES" 或权限不足

**解决方案**：

#### macOS/Linux
```bash
# 方式 1：使用 sudo
sudo npm install -g agent-browser

# 方式 2：修改 npm 默认目录（推荐）
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g agent-browser
```

#### Windows
```bash
# 以管理员身份运行 PowerShell
# 右键点击 PowerShell -> "以管理员身份运行"
npm install -g agent-browser
```

### 4. 网络问题

**症状**：安装超时或失败

**解决方案**：

```bash
# 使用国内镜像
npm config set registry https://registry.npmmirror.com

# 或使用 cnpm
npm install -g cnpm --registry=https://registry.npmmirror.com
cnpm install -g agent-browser

# 设置代理（如有）
npm config set proxy http://proxy-server:port
npm config set https-proxy http://proxy-server:port
```

---

## 常见问题

### 1. 登录失败

**症状**：`login.sh` 报错或登录状态保存失败

**排查步骤**：
```bash
# 使用可视化模式查看登录过程
AGENT_BROWSER_HEADED=1 ./scripts/login.sh

# 检查环境变量
echo "用户名: $OA_USER_NAME"
echo "密码: ${OA_USER_PASSWD:0:2}***"  # 只显示前2位
```

**可能原因**：
- 环境变量未配置或配置错误
- OA系统不可访问
- 用户名或密码错误
- OA系统需要验证码（当前不支持）

**解决方案**：
1. 检查环境变量配置
2. 确认OA系统可访问
3. 验证用户名密码正确
4. 联系系统管理员

---

### 2. 登录状态过期

**症状**：`approve.sh` 报错 "未能进入费控系统"

**解决方案**：
```bash
# 重新登录保存状态
./scripts/login.sh

# 然后再执行审批
./scripts/approve.sh FK20250101001 同意
```

**预防措施**：
- 登录状态有效期约30分钟
- 批量审批建议在20分钟内完成
- 长时间任务可分批执行
- 可以在脚本中添加状态检查

---

### 3. 单据未找到

**症状**：`approve.sh` 提示单据不存在或已被处理

**智能查询功能**：脚本会自动在审批记录中查询

#### 情况1：单据已被审批

```
========================================
  ⚠️  单据已被处理
========================================
单号: FK20250101001
状态: 在审批记录中找到
审批结果: 已同意

说明: 该单据已完成审批，无法重复操作
========================================
```

#### 情况2：单据不存在

```
========================================
  ❌ 单据不存在
========================================
单号: FK20250101001

说明: 在待审批和审批记录中均未找到该单据
可能原因:
  1. 单号输入错误
  2. 单据不存在
  3. 没有审批权限
  4. 单据超出半年范围
========================================
```

**排查步骤**：
```bash
# 使用可视化模式查看整个过程
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK20250101001 同意

# 先查询待审批列表确认
./scripts/query_approval.sh
```

---

### 4. 审批按钮禁用

**症状**：审批失败，提示 "按钮已禁用"

**原因**：未成功勾选单据

**解决方案**：
```bash
# 使用可视化模式调试
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK20250101001 同意
```

**可能原因**：
- 单据已被其他人审批
- 页面加载不完整
- 权限不足

---

### 5. 并发冲突

**症状**：批量审批时部分任务失败

**解决方案**：
```bash
# 降低并发数
./scripts/batch_approve.sh approval_list.csv 2  # 从默认3降到2

# 查看失败日志
cat /tmp/oa_approve_*.log | grep "错误\|失败"
```

**预防措施**：
- 控制并发数在3-5个
- 大批量任务分批执行
- 监控系统负载

---

## 调试方法

### 可视化模式

所有脚本都支持可视化调试：

```bash
# 登录调试
AGENT_BROWSER_HEADED=1 ./scripts/login.sh

# 查询调试
AGENT_BROWSER_HEADED=1 ./scripts/query_approval.sh

# 审批调试
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK20250101001 同意

# 批量审批调试（查看第一个任务）
AGENT_BROWSER_HEADED=1 ./scripts/batch_approve.sh approval_list.csv 1
```

### 查看日志

```bash
# 批量审批日志
ls -lht /tmp/oa_approve_*.log | head -10

# 查看特定单据日志
cat /tmp/oa_approve_FK20250101001.log

# 批量审批结果汇总
cat /tmp/oa_batch_results.csv

# 实时监控日志
tail -f /tmp/oa_approve_*.log
```

---

## 日志文件说明

| 文件 | 说明 | 用途 |
|------|------|------|
| `/tmp/oa_login_state.json` | 登录状态文件 | 状态复用 |
| `/tmp/oa_approve_<单号>.log` | 单据审批日志 | 详细执行记录 |
| `/tmp/oa_batch_results.csv` | 批量审批结果 | 批量任务汇总 |

---

## 环境检查

### 检查环境变量

```bash
# 检查是否配置
echo "OA_USER_NAME: $OA_USER_NAME"
echo "OA_STATE_FILE: ${OA_STATE_FILE:-/tmp/oa_login_state.json}"

# 检查密码是否配置（不显示明文）
if [ -n "$OA_USER_PASSWD" ]; then
    echo "OA_USER_PASSWD: 已配置"
else
    echo "OA_USER_PASSWD: 未配置"
fi
```

### 检查依赖

```bash
# 检查 agent-browser 是否安装
which agent-browser

# 检查脚本执行权限
ls -l active_skills/query-oa-approval/scripts/

# 测试脚本可执行
./scripts/login.sh --help 2>/dev/null || echo "脚本需要执行权限"
```

### 检查网络

```bash
# 测试OA系统连通性
curl -I https://oa.xgd.com

# 测试DNS解析
nslookup oa.xgd.com
```

---

## 错误代码说明

### 通用错误

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| "环境变量未配置" | OA_USER_NAME 或 OA_USER_PASSWD 未设置 | 配置环境变量 |
| "登录失败" | 用户名密码错误或系统不可访问 | 检查凭据和网络 |
| "状态文件不存在" | 未执行 login.sh | 先执行登录脚本 |
| "未能进入费控系统" | 登录状态过期 | 重新执行 login.sh |

### 审批错误

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| "单据不存在" | 单号错误或无权限 | 验证单号，检查权限 |
| "按钮已禁用" | 未成功勾选单据 | 使用可视化模式调试 |
| "审批失败" | 网络或系统问题 | 查看日志，稍后重试 |

---

## 获取帮助

### 收集诊断信息

```bash
# 创建诊断包
mkdir -p /tmp/oa-diagnostic
cp /tmp/oa_*.log /tmp/oa-diagnostic/ 2>/dev/null
cp /tmp/oa_*.png /tmp/oa-diagnostic/ 2>/dev/null
env | grep OA_ > /tmp/oa-diagnostic/environment.txt

# 打包
tar -czf /tmp/oa-diagnostic-$(date +%Y%m%d_%H%M%S).tar.gz -C /tmp oa-diagnostic

echo "诊断包已创建: /tmp/oa-diagnostic-*.tar.gz"
```

### 联系支持

提供以下信息：
1. 错误截图
2. 日志文件
3. 环境变量配置（不含密码）
4. 复现步骤
