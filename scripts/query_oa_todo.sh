#!/bin/bash

# 查询OA系统待办事项脚本 - 复用登录状态版
# 功能：检查登录状态有效期 -> 自动重新登录（如需要） -> 查询OA系统待办事项
# 支持处理待办在新TAB中打开的情况
set -e

# 设置时区为北京/上海时间
export TZ=Asia/Shanghai

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查依赖
if ! "$SCRIPT_DIR/check_dependencies.sh"; then
    exit 1
fi

AGENT_BROWSER="npx agent-browser"
OA_URL="https://oa.xgd.com"
STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"
SESSION_NAME="oa-query-todo-$(date +%s%N)"
LOGIN_TIMEOUT_MINUTES=${LOGIN_TIMEOUT_MINUTES:-10}

echo "========================================"
echo "  查询OA系统待办事项"
echo "========================================"
echo ""

# ============================================
# 函数：检查登录状态是否有效
# ============================================
check_login_valid() {
    local state_file="$1"
    local timeout_minutes="$2"

    if [ ! -f "$state_file" ]; then
        echo "❌ 登录状态文件不存在"
        return 1
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        local file_time=$(stat -f %m "$state_file" 2>/dev/null)
    else
        # Linux
        local file_time=$(stat -c %Y "$state_file" 2>/dev/null)
    fi

    if [ -z "$file_time" ] || [ "$file_time" -eq 0 ]; then
        echo "❌ 无法获取文件时间"
        return 1
    fi

    local current_time=$(date +%s)
    local age_seconds=$((current_time - file_time))
    local age_minutes=$((age_seconds / 60))
    local timeout_seconds=$((timeout_minutes * 60))

    echo "📊 登录状态信息:"
    echo "   文件: $state_file"
    echo "   距今: ${age_minutes} 分钟"

    if [ "$age_seconds" -gt "$timeout_seconds" ]; then
        echo "   状态: ⚠️  已过期（超过 ${timeout_minutes} 分钟）"
        return 1
    else
        local remaining=$((timeout_minutes - age_minutes))
        echo "   状态: ✅ 有效（剩余约 ${remaining} 分钟）"
        return 0
    fi
}

# ============================================
# 步骤1: 检查并确保登录状态有效
# ============================================
echo "🔐 步骤1: 检查登录状态..."

if check_login_valid "$STATE_FILE" "$LOGIN_TIMEOUT_MINUTES"; then
    echo "✅ 登录状态有效，复用现有状态"
else
    echo ""
    echo "⚠️  需要重新登录..."

    # 检查环境变量
    if [ -z "$OA_USER_NAME" ] || [ -z "$OA_USER_PASSWD" ]; then
        echo ""
        echo "❌ 错误: 环境变量未配置"
        echo ""
        echo "请在 CoPaw 的 Environments 中配置:"
        echo "  OA_USER_NAME=你的用户名"
        echo "  OA_USER_PASSWD=你的密码"
        echo ""
        echo "⚠️  安全提示: 请勿在对话中透露用户名和密码"
        exit 1
    fi

    # 调用登录脚本
    if [ -f "$SCRIPT_DIR/login.sh" ]; then
        echo "🔄 执行登录脚本..."
        bash "$SCRIPT_DIR/login.sh"
        if [ $? -ne 0 ]; then
            echo ""
            echo "❌ 登录失败"
            exit 1
        fi
        echo ""
        echo "✅ 登录成功，继续查询..."
    else
        echo "❌ 找不到登录脚本: $SCRIPT_DIR/login.sh"
        exit 1
    fi
fi

echo ""

# ============================================
# 步骤2: 加载登录状态
# ============================================
echo "🔄 步骤2: 加载登录状态..."

# 关闭之前的会话
$AGENT_BROWSER --session "$SESSION_NAME" close 2>/dev/null || true

# 打开空白页并加载状态
$AGENT_BROWSER --session "$SESSION_NAME" open "about:blank"
sleep 1
$AGENT_BROWSER --session "$SESSION_NAME" state load "$STATE_FILE"
echo "✅ 登录状态已加载"

echo ""
echo "🚀 步骤3: 打开OA系统..."

# 打开OA系统
$AGENT_BROWSER --session "$SESSION_NAME" open "$OA_URL"
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# 检查是否成功进入OA系统
CURRENT_URL=$($AGENT_BROWSER --session "$SESSION_NAME" get url)
echo "📍 当前URL: $CURRENT_URL"

if [[ "$CURRENT_URL" != *"oa.xgd.com"* ]] && [[ "$CURRENT_URL" != *"sso-oa.xgd.com"* ]]; then
    echo "❌ 未能进入OA系统，登录状态可能已过期"
    echo "请重新执行: ./scripts/login.sh"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 已进入OA系统"

# ============================================
# 步骤4: 直接打开待办页面
# ============================================
echo ""
echo "📋 步骤4: 打开待办页面..."

TODO_URL="https://oa.xgd.com/xgd/reviewperson/person_todo/todo.jsp?fdModelName=&nodeType=node&&dataType=todo&s_path=%E6%90%9C%E7%B4%A2%E5%88%86%E7%B1%BB%E3%80%80%3E%E3%80%80%E6%89%80%E6%9C%89%E5%BE%85%E5%8A%9E&s_css=default"
$AGENT_BROWSER --session "$SESSION_NAME" open "$TODO_URL"
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

CURRENT_URL=$($AGENT_BROWSER --session "$SESSION_NAME" get url)
echo "📍 待办页面URL: $CURRENT_URL"
echo "✅ 已打开待办页面"

# ============================================
# 步骤5: 等待待办列表加载
# ============================================
echo ""
echo "⏳ 步骤5: 等待待办列表加载..."

sleep 5  # 增加等待时间，确保页面完全加载
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# 额外等待，确保动态内容加载完成
sleep 3

# ============================================
# 步骤6: 截图
# ============================================
echo ""
echo "📷 步骤6: 保存页面截图..."

$AGENT_BROWSER --session "$SESSION_NAME" screenshot /tmp/oa_todo_list.png
echo "✅ 截图已保存: /tmp/oa_todo_list.png"

# ============================================
# 步骤7: 提取待办列表
# ============================================
echo ""
echo "📄 步骤7: 提取待办列表..."

# 获取页面快照以了解页面结构
SNAPSHOT=$($AGENT_BROWSER --session "$SESSION_NAME" snapshot)
echo "📋 页面快照:"
echo "$SNAPSHOT" | head -50

echo ""
echo "📄 页面完整内容:"

# 直接获取页面文本
TODO_LIST=$($AGENT_BROWSER --session "$SESSION_NAME" get text body)

echo ""
echo "========================================"
echo "  OA系统待办事项列表"
echo "========================================"
echo "$TODO_LIST"
echo "========================================"

echo ""
echo "========================================"
echo "  OA系统待办事项列表"
echo "========================================"
echo "$TODO_LIST"
echo "========================================"

# 关闭会话
$AGENT_BROWSER --session "$SESSION_NAME" close

echo ""
echo "✅ 查询完成"
