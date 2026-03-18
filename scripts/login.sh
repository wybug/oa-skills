#!/bin/bash

# OA系统登录脚本 - 保存登录状态供其他脚本复用
# 使用 agent-browser state save 功能保存cookies和session
set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查依赖
if ! "$SCRIPT_DIR/check_dependencies.sh"; then
    exit 1
fi

AGENT_BROWSER="npx agent-browser"
OA_URL="https://oa.xgd.com"
SESSION_NAME="oa-login-$(date +%s)"
STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"

echo "========================================"
echo "  OA系统登录 - 保存登录状态"
echo "========================================"
echo ""

# 检查环境变量
if [ -z "$OA_USER_NAME" ] || [ -z "$OA_USER_PASSWD" ]; then
    echo "❌ 错误: 环境变量未配置"
    echo ""
    echo "请在 CoPaw 的 Environments 中配置以下环境变量:"
    echo ""
    echo "  OA_USER_NAME=你的用户名"
    echo "  OA_USER_PASSWD=你的密码"
    echo ""
    echo "配置步骤:"
    echo "  1. 打开 CoPaw 设置"
    echo "  2. 进入 Environments 配置"
    echo "  3. 添加上述环境变量"
    echo "  4. 保存并重新运行此脚本"
    echo ""
    echo "⚠️  安全提示:"
    echo "  - 请勿在对话中透露用户名和密码"
    echo "  - 环境变量仅在本地存储，不会上传到云端"
    echo "  - 定期更换密码以保护账号安全"
    echo ""
    exit 1
fi

# 验证环境变量格式（基本检查，不显示具体值）
if [ ${#OA_USER_NAME} -lt 2 ] || [ ${#OA_USER_PASSWD} -lt 4 ]; then
    echo "❌ 错误: 用户名或密码格式不正确"
    echo ""
    echo "请检查环境变量配置:"
    echo "  - 用户名长度应不少于2个字符"
    echo "  - 密码长度应不少于4个字符"
    echo ""
    exit 1
fi

# 关闭之前的会话（如果存在）
$AGENT_BROWSER --session "$SESSION_NAME" close 2>/dev/null || true

echo "🔐 步骤1: 打开OA登录页面..."
$AGENT_BROWSER --session "$SESSION_NAME" open "$OA_URL"
sleep 2
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

echo "📝 步骤2: 填写登录表单..."
$AGENT_BROWSER --session "$SESSION_NAME" snapshot -i

# 填写用户名和密码
$AGENT_BROWSER --session "$SESSION_NAME" fill @e6 "$OA_USER_NAME"
sleep 0.5
$AGENT_BROWSER --session "$SESSION_NAME" fill @e7 "$OA_USER_PASSWD"
sleep 0.5

echo "🚀 步骤3: 提交登录..."
$AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
const form = document.querySelector('form');
if (form) form.submit();
EOF

sleep 5
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# 验证登录成功
CURRENT_URL=$($AGENT_BROWSER --session "$SESSION_NAME" get url)
if [[ "$CURRENT_URL" == *"login"* ]]; then
    echo "❌ 登录失败，仍在登录页面"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 登录成功！"

echo "💾 步骤4: 保存登录状态..."
# 使用 state save 保存登录状态
$AGENT_BROWSER --session "$SESSION_NAME" state save "$STATE_FILE"

if [ -f "$STATE_FILE" ]; then
    echo "✅ 登录状态已保存到: $STATE_FILE"
    echo "   文件大小: $(ls -lh "$STATE_FILE" | awk '{print $5}')"
else
    echo "❌ 保存登录状态失败"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

# 关闭会话
$AGENT_BROWSER --session "$SESSION_NAME" close

echo ""
echo "========================================"
echo "  ✅ 登录状态保存完成"
echo "========================================"
echo "状态文件: $STATE_FILE"
echo "有效期: 约30分钟（取决于OA系统session配置）"
echo ""
echo "使用方式："
echo "  export OA_STATE_FILE=$STATE_FILE"
echo "  ./scripts/approve.sh <单号> <同意|驳回> [审批意见]"
echo "========================================"
