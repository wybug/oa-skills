#!/bin/bash

# 费控系统审批脚本 - 支持并发审批 + 自动登录状态检查
# 功能：检查登录状态有效期 -> 自动重新登录（如需要） -> 执行审批
set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查依赖
if ! "$SCRIPT_DIR/check_dependencies.sh"; then
    exit 1
fi

AGENT_BROWSER="npx agent-browser"
FEIKONG_SSO_URL="https://sso-oa.xgd.com/sso/login?service=https://ekuaibao.xgd.com:9080/ykb/single/sso?type=login"
STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"
SESSION_NAME="oa-approve-$(date +%s%N)"
LOGIN_TIMEOUT_MINUTES=${LOGIN_TIMEOUT_MINUTES:-10}

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
        local file_time=$(stat -f %m "$state_file" 2>/dev/null)
    else
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

    echo "📊 登录状态: 距今 ${age_minutes} 分钟"

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
# 参数检查
# ============================================
if [ $# -lt 2 ]; then
    cat << 'EOF'
用法: ./scripts/approve.sh <单号> <同意|驳回> [审批意见]

参数说明:
  单号        : 费控系统中的单据编号
  同意|驳回   : 审批动作
  审批意见    : 可选，审批说明（驳回时建议填写）

示例:
  ./scripts/approve.sh FK20250101001 同意
  ./scripts/approve.sh FK20250101001 驳回 费用不合理

环境变量:
  OA_STATE_FILE      : 登录状态文件路径 (默认: /tmp/oa_login_state.json)
  LOGIN_TIMEOUT_MINUTES : 登录有效期（分钟，默认: 10）

⚠️  安全提示:
  - 请勿在对话中透露用户名和密码
  - 环境变量仅在本地存储，不会上传到云端
  - 定期更换密码以保护账号安全
EOF
    exit 1
fi

ORDER_ID="$1"
ACTION="$2"
COMMENT="${3:-}"

# 验证审批动作
if [[ "$ACTION" != "同意" && "$ACTION" != "驳回" ]]; then
    echo "❌ 错误: 审批动作必须是 '同意' 或 '驳回'"
    exit 1
fi

echo "========================================"
echo "  费控系统审批"
echo "========================================"
echo "单号: $ORDER_ID"
echo "动作: $ACTION"
echo "意见: ${COMMENT:-无}"
echo "Session: $SESSION_NAME"
echo "========================================"
echo ""

# ============================================
# 检查并确保登录状态有效
# ============================================
echo "🔐 步骤1: 检查登录状态..."

if check_login_valid "$STATE_FILE" "$LOGIN_TIMEOUT_MINUTES"; then
    echo "✅ 复用现有登录状态"
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
        echo "✅ 登录成功，继续审批..."
    else
        echo "❌ 找不到登录脚本: $SCRIPT_DIR/login.sh"
        exit 1
    fi
fi

echo ""

# 关闭之前的会话（如果存在）
$AGENT_BROWSER --session "$SESSION_NAME" close 2>/dev/null || true

echo "🔄 步骤2: 加载登录状态..."
# 创建新session并加载登录状态
$AGENT_BROWSER --session "$SESSION_NAME" open "about:blank"
sleep 1
$AGENT_BROWSER --session "$SESSION_NAME" state load "$STATE_FILE"
echo "✅ 登录状态已加载"

echo ""
echo "🚀 步骤3: 打开费控系统..."
$AGENT_BROWSER --session "$SESSION_NAME" open "$FEIKONG_SSO_URL"
sleep 5
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# 检查是否成功进入费控系统
CURRENT_URL=$($AGENT_BROWSER --session "$SESSION_NAME" get url)
echo "📍 当前URL: $CURRENT_URL"

if [[ "$CURRENT_URL" != *"hosecloud.com"* ]] && [[ "$CURRENT_URL" != *"ekuaibao"* ]]; then
    echo "❌ 未能进入费控系统，登录状态可能已过期"
    echo "请重新执行: ./scripts/login.sh"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 已进入费控系统"

echo ""
echo "📋 步骤3: 进入待办页面..."
# 点击待办菜单
CLICK_TODO=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const allElements = Array.from(document.querySelectorAll('a, button, span, div, li'));
  
  const todoElement = allElements.find(el => {
    const text = el.textContent.trim();
    return (text === '待办' || text === '待办理') && !text.includes('已办');
  });

  if (todoElement) {
    todoElement.click();
    return { success: true, text: todoElement.textContent.trim() };
  }

  return { success: false, error: '未找到待办菜单' };
})()
EOF
)

if [[ "$CLICK_TODO" != *"success\": true"* ]]; then
    echo "❌ 点击待办失败"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 已进入待办"
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

echo ""
echo "🔍 步骤4: 搜索单号 $ORDER_ID ..."
# 先获取页面快照，找到搜索框
$AGENT_BROWSER --session "$SESSION_NAME" snapshot -i

# 在搜索框输入单号
SEARCH_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  // 查找搜索框
  const searchBox = document.querySelector('input[placeholder*="搜索"], input[placeholder*="标题"], input[placeholder*="单号"]');
  
  if (searchBox) {
    // 清空并输入单号
    searchBox.value = '';
    searchBox.focus();
    searchBox.value = '$ORDER_ID';
    
    // 触发input事件
    searchBox.dispatchEvent(new Event('input', { bubbles: true }));
    searchBox.dispatchEvent(new Event('change', { bubbles: true }));
    
    return { success: true, value: searchBox.value };
  }
  
  return { success: false, error: '未找到搜索框' };
})()
EOF
)

if [[ "$SEARCH_RESULT" != *"success\": true"* ]]; then
    echo "❌ 输入单号失败: $SEARCH_RESULT"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 已输入单号"

# 点击搜索按钮或按回车
$AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  // 查找搜索按钮
  const searchBtn = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('搜索') || btn.querySelector('svg')
  );
  
  if (searchBtn) {
    searchBtn.click();
    return { success: true, method: 'button' };
  }
  
  // 如果没有搜索按钮，在搜索框按回车
  const searchBox = document.querySelector('input[placeholder*="搜索"], input[placeholder*="单号"]');
  if (searchBox) {
    searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }));
    return { success: true, method: 'enter' };
  }
  
  return { success: false };
})()
EOF

sleep 2
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

echo ""
echo "✅ 步骤5: 勾选单据..."
# 获取页面快照，找到单据
$AGENT_BROWSER --session "$SESSION_NAME" snapshot -i

# 勾选单据
CHECK_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  // 查找包含单号的行
  const allRows = Array.from(document.querySelectorAll('tr, div[role="row"], div[class*="row"]'));
  const targetRow = allRows.find(row => row.textContent.includes('$ORDER_ID'));
  
  if (!targetRow) {
    return { success: false, error: '未找到单号为 $ORDER_ID 的单据' };
  }
  
  // 在该行中查找checkbox
  const checkbox = targetRow.querySelector('input[type="checkbox"]') || 
                   targetRow.querySelector('div[class*="checkbox"]');
  
  if (checkbox && !checkbox.checked) {
    checkbox.click();
    return { success: true, orderId: '$ORDER_ID' };
  } else if (checkbox && checkbox.checked) {
    return { success: true, orderId: '$ORDER_ID', alreadyChecked: true };
  }
  
  return { success: false, error: '未找到复选框' };
})()
EOF
)

if [[ "$CHECK_RESULT" != *"success\": true"* ]]; then
    echo "⚠️  待审批中未找到单据，切换到审批记录查询..."
    
    # 步骤5.1: 切换到"审批记录"标签页
    echo ""
    echo "📋 步骤5.1: 进入审批记录..."
    CLICK_RECORD=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  // 查找"审批记录"标签
  const recordTab = Array.from(document.querySelectorAll('[role="tab"], button, a, div')).find(el => 
    el.textContent.trim() === '审批记录'
  );

  if (recordTab) {
    recordTab.click();
    return { success: true, tab: '审批记录' };
  }

  return { success: false, error: '未找到审批记录标签' };
})()
EOF
)

    if [[ "$CLICK_RECORD" != *"success\": true"* ]]; then
        echo "❌ 无法切换到审批记录: $CLICK_RECORD"
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 1
    fi

    sleep 2
    $AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
    echo "✅ 已进入审批记录"

    # 步骤5.2: 在审批记录中搜索单号
    echo ""
    echo "🔍 步骤5.2: 在审批记录中搜索 $ORDER_ID ..."
    $AGENT_BROWSER --session "$SESSION_NAME" snapshot -i

    # 输入单号搜索
    SEARCH_RECORD=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  // 查找搜索框
  const searchBox = document.querySelector('input[placeholder*="搜索"], input[placeholder*="标题"], input[placeholder*="单号"]');
  
  if (searchBox) {
    searchBox.value = '';
    searchBox.focus();
    searchBox.value = '$ORDER_ID';
    searchBox.dispatchEvent(new Event('input', { bubbles: true }));
    searchBox.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, value: searchBox.value };
  }
  
  return { success: false, error: '未找到搜索框' };
})()
EOF
)

    if [[ "$SEARCH_RECORD" != *"success\": true"* ]]; then
        echo "❌ 审批记录搜索失败: $SEARCH_RECORD"
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 1
    fi

    # 执行搜索
    $AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const searchBtn = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('搜索') || btn.querySelector('svg')
  );
  if (searchBtn) {
    searchBtn.click();
    return { success: true, method: 'button' };
  }
  const searchBox = document.querySelector('input[placeholder*="搜索"], input[placeholder*="单号"]');
  if (searchBox) {
    searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }));
    return { success: true, method: 'enter' };
  }
  return { success: false };
})()
EOF

    sleep 2
    $AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
    echo "✅ 已搜索审批记录"

    # 步骤5.3: 检查审批记录中是否存在该单据
    echo ""
    echo "🔍 步骤5.3: 检查单据是否在审批记录中..."
    RECORD_CHECK=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const pageText = document.body.textContent;
  const hasOrder = pageText.includes('$ORDER_ID');
  
  if (hasOrder) {
    // 在审批记录中，直接查找所有gridcell
    const allCells = Array.from(document.querySelectorAll('[role="gridcell"]'));
    
    // 找到包含单号的cell
    const orderCell = allCells.find(cell => cell.textContent.includes('$ORDER_ID'));
    
    if (orderCell) {
      // 获取这个cell的索引
      const orderIndex = allCells.indexOf(orderCell);
      
      // 审批时间通常在单号前面的列（索引-1或-2）
      // 操作类型（同意/驳回）也在前面
      let status = '未知';
      let approveTime = '';
      
      // 检查前面的几个cell
      for (let i = Math.max(0, orderIndex - 5); i < orderIndex; i++) {
        const cellText = allCells[i].textContent.trim();
        
        // 检查审批时间（格式：YYYY-MM-DD HH:mm:ss）
        if (cellText.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/)) {
          approveTime = cellText;
        }
        
        // 检查操作类型
        if (cellText === '同意' || cellText.includes('同意')) {
          status = '已同意';
        } else if (cellText === '驳回' || cellText.includes('驳回')) {
          status = '已驳回';
        }
      }
      
      return { 
        success: true, 
        found: true, 
        orderId: '$ORDER_ID',
        status: status,
        approveTime: approveTime
      };
    }
    
    // 备用方案：直接从整个页面文本提取
    const orderPattern = new RegExp('(\\\\d{4}-\\\\d{2}-\\\\d{2}\\\\s\\\\d{2}:\\\\d{2}:\\\\d{2}).*?(同意|驳回).*?$ORDER_ID', 's');
    const match = pageText.match(orderPattern);
    
    if (match) {
      return {
        success: true,
        found: true,
        orderId: '$ORDER_ID',
        status: match[2] === '同意' ? '已同意' : '已驳回',
        approveTime: match[1]
      };
    }
    
    return { success: true, found: true, orderId: '$ORDER_ID', status: '已处理' };
  }
  
  return { success: true, found: false, orderId: '$ORDER_ID' };
})()
EOF
)

    echo "📷 审批记录截图: /tmp/oa_approve_record_search.png"

    if [[ "$RECORD_CHECK" == *"\"found\": true"* ]]; then
        # 直接从JSON中提取信息
        echo ""
        echo "========================================"
        echo "  ⚠️  单据已被处理"
        echo "========================================"
        echo "单号: $ORDER_ID"
        
        # 提取并显示审批信息
        echo "$RECORD_CHECK" | grep -o '"status":"[^"]*"' | sed 's/"status":"//;s/"$//' | while read status; do
            [ "$status" != "未知" ] && [ -n "$status" ] && echo "审批结果: $status"
        done
        
        echo "$RECORD_CHECK" | grep -o '"approveTime":"[^"]*"' | sed 's/"approveTime":"//;s/"$//' | while read time; do
            [ -n "$time" ] && echo "审批时间: $time"
        done
        
        echo ""
        echo "说明: 该单据已完成审批，无法重复操作"
        echo "========================================"
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 0
    else
        echo ""
        echo "========================================"
        echo "  ❌ 单据不存在"
        echo "========================================"
        echo "单号: $ORDER_ID"
        echo ""
        echo "说明: 在待审批和审批记录中均未找到该单据"
        echo "可能原因:"
        echo "  1. 单号输入错误"
        echo "  2. 单据不存在"
        echo "  3. 没有审批权限"
        echo "  4. 单据超出半年范围"
        echo "========================================"
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 1
    fi
fi

echo "✅ 已勾选单据"
sleep 1

echo ""
echo "⚡ 步骤6: 执行审批 - $ACTION ..."

# 如果有审批意见，先填写意见
if [ -n "$COMMENT" ]; then
    echo "💬 填写审批意见: $COMMENT"
    $AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  // 查找审批意见输入框（可能在弹窗中）
  const commentBox = document.querySelector('textarea[placeholder*="意见"], textarea[placeholder*="说明"], input[placeholder*="意见"]');
  
  if (commentBox) {
    commentBox.value = '$COMMENT';
    commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    return { success: true };
  }
  
  // 如果没有找到，可能需要先点击审批按钮后才会出现
  return { success: false, needClickFirst: true };
})()
EOF
    sleep 0.5
fi

# 点击同意或驳回按钮
BUTTON_TEXT="$ACTION"
APPROVE_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  // 查找审批按钮
  const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
  const targetBtn = buttons.find(btn => btn.textContent.trim() === '$BUTTON_TEXT');
  
  if (targetBtn) {
    // 检查按钮是否禁用
    if (targetBtn.disabled || targetBtn.classList.contains('disabled')) {
      return { success: false, error: '按钮已禁用，可能未勾选单据' };
    }
    
    targetBtn.click();
    return { success: true, action: '$BUTTON_TEXT' };
  }
  
  return { success: false, error: '未找到$BUTTON_TEXT按钮' };
})()
EOF
)

if [[ "$APPROVE_RESULT" != *"success\": true"* ]]; then
    echo "❌ 审批失败: $APPROVE_RESULT"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

echo "✅ 已点击$ACTION按钮"
sleep 2

# 处理可能的确认弹窗
$AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  // 查找确认按钮
  const confirmBtn = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('确定') || 
    btn.textContent.includes('确认') ||
    btn.textContent.includes('是')
  );
  
  if (confirmBtn) {
    confirmBtn.click();
    return { success: true, confirmed: true };
  }
  
  return { success: true, confirmed: false };
})()
EOF

sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# 验证审批结果
echo ""
echo "📊 步骤7: 验证审批结果..."
echo "📷 审批结果截图: /tmp/oa_approve_result.png"

# 检查是否还有该单据
VERIFY_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const pageText = document.body.textContent;
  const hasOrder = pageText.includes('$ORDER_ID');
  
  // 检查是否有成功提示
  const successMsg = pageText.includes('成功') || pageText.includes('完成') || pageText.includes('已');
  
  return { 
    success: true, 
    orderStillVisible: hasOrder,
    hasSuccessMessage: successMsg 
  };
})()
EOF
)

echo "验证结果: $VERIFY_RESULT"

# 关闭会话
$AGENT_BROWSER --session "$SESSION_NAME" close

echo ""
echo "========================================"
echo "  ✅ 审批完成"
echo "========================================"
echo "单号: $ORDER_ID"
echo "动作: $ACTION"
echo "意见: ${COMMENT:-无}"
echo ""
echo "截图文件:"
echo "  /tmp/oa_approve_feikong.png"
echo "  /tmp/oa_approve_result.png"
echo "========================================"
