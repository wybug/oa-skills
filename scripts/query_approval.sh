#!/bin/bash

# 查询费控系统待审批流程脚本 - 复用登录状态版
# 功能：检查登录状态有效期 -> 自动重新登录（如需要） -> 查询待审批（支持单号查询）
set -e

AGENT_BROWSER="npx agent-browser"
STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"
SESSION_NAME="oa-query-$(date +%s%N)"
LOGIN_TIMEOUT_MINUTES=${LOGIN_TIMEOUT_MINUTES:-10}

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================================
# 参数处理
# ============================================
ORDER_ID="${1:-}"  # 可选的单号参数

if [ -n "$ORDER_ID" ]; then
    echo "========================================"
    echo "  查询指定单据: $ORDER_ID"
    echo "========================================"
else
    echo "========================================"
    echo "  查询费控系统待审批流程"
    echo "========================================"
fi
echo ""

# ============================================
# 函数：检查登录状态是否有效
# ============================================
check_login_valid() {
    local state_file="$1"
    local timeout_minutes="$2"

    # 检查文件是否存在
    if [ ! -f "$state_file" ]; then
        echo "❌ 登录状态文件不存在"
        return 1
    fi

    # 获取文件修改时间（秒）
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
# 步骤2: 加载登录状态并进入费控系统
# ============================================
echo "🚀 步骤2: 加载登录状态..."

# 关闭之前的会话
$AGENT_BROWSER --session "$SESSION_NAME" close 2>/dev/null || true

# 打开空白页并加载状态
$AGENT_BROWSER --session "$SESSION_NAME" open "about:blank"
sleep 1
$AGENT_BROWSER --session "$SESSION_NAME" state load "$STATE_FILE"
echo "✅ 登录状态已加载"

echo ""
echo "📋 步骤3: 进入费控系统..."

# 直接打开费控系统URL（从登录后的OA首页）
$AGENT_BROWSER --session "$SESSION_NAME" open "https://oa.xgd.com"
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# 检查是否在OA系统
CURRENT_URL=$($AGENT_BROWSER --session "$SESSION_NAME" get url)
echo "📍 当前URL: $CURRENT_URL"

if [[ "$CURRENT_URL" != *"oa.xgd.com"* ]] && [[ "$CURRENT_URL" != *"sso-oa.xgd.com"* ]]; then
    echo "❌ 未能进入OA系统，登录状态可能已失效"
    echo "💡 建议: 删除状态文件并重新登录"
    echo "   rm -f $STATE_FILE"
    echo "   ./scripts/login.sh"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 已进入OA系统"

# ============================================
# 步骤4: 点击费控系统
# ============================================
echo ""
echo "📋 步骤4: 点击费控系统..."

# 设置window.open拦截器
$AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  window.capturedUrls = [];
  const originalOpen = window.open;
  window.open = function(url, ...args) {
    console.log('Intercepted window.open:', url);
    window.capturedUrls.push(url);
    return originalOpen.call(this, url, ...args);
  };
  return { interceptorInstalled: true };
})()
EOF

# 查找并点击费控系统div
CLICK_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const allDivs = Array.from(document.querySelectorAll('div'));

  const feikongDiv = allDivs.find(div => {
    const text = div.textContent.trim();
    return (text === '费控系统' || text === '费控') && div.children.length < 5;
  });

  if (feikongDiv) {
    feikongDiv.click();
    return {
      success: true,
      text: feikongDiv.textContent.trim()
    };
  }

  return { success: false };
})()
EOF
)

if [[ "$CLICK_RESULT" != *"success\": true"* ]]; then
    echo "❌ 未找到费控系统入口"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 已点击费控系统"

# ============================================
# 步骤5: 打开费控系统新标签页
# ============================================
echo ""
echo "⏳ 步骤5: 等待费控系统加载..."
sleep 2

# 获取拦截到的URL
CAPTURED_URL=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const urls = window.capturedUrls || [];
  return urls.length > 0 ? urls[0] : null;
})()
EOF
)

FEIKONG_URL=$(echo "$CAPTURED_URL" | grep -o 'https://[^"]*' || echo "")

if [ -n "$FEIKONG_URL" ]; then
    echo "✅ 获取到费控系统URL"
    $AGENT_BROWSER --session "$SESSION_NAME" tab new "$FEIKONG_URL"
    sleep 5
    $AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
else
    echo "⚠️  未获取到URL，等待新标签页..."
    sleep 8
fi

echo "📷 费控系统截图: /tmp/oa_feikong_page.png"

# ============================================
# 步骤6: 点击待办
# ============================================
echo ""
echo "📋 步骤6: 点击待办..."

CLICK_TODO=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const allElements = Array.from(document.querySelectorAll('a, button, span, div, li'));

  const todoElement = allElements.find(el => {
    const text = el.textContent.trim();
    return (text === '待办' ||
            text === '待办理' ||
            text === '我的待办') &&
           !text.includes('已办');
  });

  if (todoElement) {
    todoElement.click();
    return { success: true, text: todoElement.textContent.trim() };
  }

  return { success: false };
})()
EOF
)

echo "点击结果: $CLICK_TODO"
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# ============================================
# 步骤7: 获取待审批列表
# ============================================
echo ""
echo "📄 步骤7: 提取待审批列表..."

APPROVAL_INFO=$($AGENT_BROWSER --session "$SESSION_NAME" get text body)

# ============================================
# 如果提供了单号，则搜索该单号
# ============================================
if [ -n "$ORDER_ID" ]; then
    echo ""
    echo "🔍 正在搜索单号: $ORDER_ID"
    
    # 在文本中搜索单号
    if echo "$APPROVAL_INFO" | grep -q "$ORDER_ID"; then
        echo ""
        echo "========================================"
        echo "  ✅ 找到单据: $ORDER_ID"
        echo "========================================"
        
        # 提取包含该单号的行及上下文
        echo ""
        echo "📋 单据信息:"
        echo "$APPROVAL_INFO" | grep -B 2 -A 2 "$ORDER_ID"
        echo ""
        echo "✅ 该单据在待审批列表中"
        
        # 保存截图
        echo "📷 单据截图: /tmp/oa_order_${ORDER_ID}.png"
    else
        echo ""
        echo "========================================"
        echo "  ❌ 未找到单据: $ORDER_ID"
        echo "========================================"
        echo ""
        echo "可能的原因:"
        echo "  1. 该单据不在待审批列表中"
        echo "  2. 该单据已被处理（同意或驳回）"
        echo "  3. 该单据号输入错误"
        echo ""
        echo "建议操作:"
        echo "  - 检查单号是否正确"
        echo "  - 在'审批记录'中查看该单据状态"
        echo "  - 执行 ./scripts/query_approval.sh 查看所有待审批列表"
        
        # 显示部分待审批列表供参考
        echo ""
        echo "========================================"
        echo "  当前待审批列表（前10行）"
        echo "========================================"
        echo "$APPROVAL_INFO" | head -20
        echo "========================================"
        
        echo "📷 完整列表截图: /tmp/oa_approval_list.png"
    fi
else
    # 未提供单号，显示完整列表
    echo ""
    echo "========================================"
    echo "  费控系统待审批流程列表"
    echo "========================================"
    echo "$APPROVAL_INFO"
    echo "========================================"
    
    echo ""
    echo "📷 列表截图: /tmp/oa_approval_list.png"
fi

# 关闭会话
$AGENT_BROWSER --session "$SESSION_NAME" close

echo ""
echo "✅ 查询完成"
