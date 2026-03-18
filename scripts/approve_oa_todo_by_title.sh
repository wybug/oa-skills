#!/bin/bash

# OA系统待办审批脚本（通过标题检索）- 支持会议安排和流程管理两种类型
# 功能：通过标题搜索待办 -> 打开第一个匹配的待办 -> 执行审批
# 用法: 
#   会议安排: ./scripts/approve_oa_todo_by_title.sh <标题关键词> <参加|不参加> [留言]
#   流程管理: ./scripts/approve_oa_todo_by_title.sh <标题关键词> <通过|驳回|转办> [处理意见] [转办人员]
set -e

# 设置时区为北京/上海时间
export TZ=Asia/Shanghai

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查依赖
if ! "$SCRIPT_DIR/check_dependencies.sh"; then
    exit 1
fi

# 参数处理
TITLE_KEYWORD="$1"
ACTION="$2"
COMMENT="${3:-}"
TRANSFER_USER="${4:-}"

if [ -z "$TITLE_KEYWORD" ]; then
    echo "❌ 错误: 缺少标题关键词参数"
    echo ""
    echo "用法:"
    echo "  会议安排类:"
    echo "    ./scripts/approve_oa_todo_by_title.sh <标题关键词> <参加|不参加> [留言]"
    echo ""
    echo "  流程管理类:"
    echo "    ./scripts/approve_oa_todo_by_title.sh <标题关键词> <通过|驳回|转办> [处理意见] [转办人员]"
    echo ""
    echo "示例:"
    echo "  # 会议安排"
    echo "  ./scripts/approve_oa_todo_by_title.sh \"QuickBi会议\" 参加"
    echo "  ./scripts/approve_oa_todo_by_title.sh \"阿里云\" 不参加 \"已有其他安排\""
    echo ""
    echo "  # 流程管理"
    echo "  ./scripts/approve_oa_todo_by_title.sh \"报销申请\" 通过 \"同意\""
    echo "  ./scripts/approve_oa_todo_by_title.sh \"请假\" 驳回 \"信息不完整\""
    echo "  ./scripts/approve_oa_todo_by_title.sh \"采购\" 转办 \"请XX处理\" \"张三\""
    exit 1
fi

if [ -z "$ACTION" ]; then
    echo "❌ 错误: 缺少审批动作参数"
    echo ""
    echo "支持的审批动作:"
    echo "  会议安排: 参加 | 不参加"
    echo "  流程管理: 通过 | 驳回 | 转办"
    exit 1
fi

# 验证审批动作
if [[ "$ACTION" != "参加" && "$ACTION" != "不参加" && "$ACTION" != "通过" && "$ACTION" != "驳回" && "$ACTION" != "转办" ]]; then
    echo "❌ 错误: 无效的审批动作 '$ACTION'"
    echo ""
    echo "支持的审批动作:"
    echo "  会议安排: 参加 | 不参加"
    echo "  流程管理: 通过 | 驳回 | 转办"
    exit 1
fi

# 转办时检查人员参数
if [[ "$ACTION" == "转办" && -z "$TRANSFER_USER" ]]; then
    echo "❌ 错误: 转办操作需要提供转办人员"
    echo ""
    echo "用法:"
    echo "  ./scripts/approve_oa_todo_by_title.sh <标题关键词> 转办 <处理意见> <转办人员>"
    echo ""
    echo "示例:"
    echo "  ./scripts/approve_oa_todo_by_title.sh \"采购\" 转办 \"请XX处理\" \"张三\""
    exit 1
fi

# 索引文件路径
TODOS_DIR="/tmp/oa_todos"
INDEX_FILE="$TODOS_DIR/index.txt"

# 检查索引文件是否存在
if [ ! -f "$INDEX_FILE" ]; then
    echo "❌ 错误: 索引文件不存在"
    echo ""
    echo "请先执行同步脚本创建索引:"
    echo "  ./scripts/sync_oa_todos.sh"
    echo ""
    echo "或者先查询待办列表:"
    echo "  ./scripts/query_oa_todo.sh"
    exit 1
fi

echo "========================================"
echo "  OA系统待办审批（通过标题检索）"
echo "========================================"
echo "搜索关键词: $TITLE_KEYWORD"
echo "审批动作: $ACTION"
if [[ "$ACTION" == "转办" ]]; then
    echo "转办人员: $TRANSFER_USER"
fi
echo "处理意见: ${COMMENT:-无}"
echo "索引文件: $INDEX_FILE"
echo "========================================"
echo ""

# 从索引文件中搜索匹配的待办
echo "🔍 搜索匹配的待办..."

MATCHED_TODOS=$(grep -i "$TITLE_KEYWORD" "$INDEX_FILE" 2>/dev/null || true)

if [ -z "$MATCHED_TODOS" ]; then
    echo "❌ 未找到匹配的待办"
    echo ""
    echo "搜索关键词: $TITLE_KEYWORD"
    echo "索引文件: $INDEX_FILE"
    echo ""
    echo "请检查关键词是否正确，或先执行同步脚本更新索引:"
    echo "  ./scripts/sync_oa_todos.sh"
    exit 1
fi

# 显示所有匹配的待办
MATCH_COUNT=$(echo "$MATCHED_TODOS" | wc -l | tr -d ' ')
echo "找到 $MATCH_COUNT 个匹配的待办:"
echo ""
echo "$MATCHED_TODOS" | while IFS='|' read -r fdid title href; do
    echo "  [$fdid] ${title:0:60}"
done
echo ""

# 选择第一个匹配的待办
FIRST_MATCH=$(echo "$MATCHED_TODOS" | head -1)
FDID=$(echo "$FIRST_MATCH" | cut -d'|' -f1)
TITLE=$(echo "$FIRST_MATCH" | cut -d'|' -f2)
HREF=$(echo "$FIRST_MATCH" | cut -d'|' -f3)

echo "✅ 选择第一个匹配的待办:"
echo "   fdId: $FDID"
echo "   标题: ${TITLE:0:60}"
echo ""

# 检查是否已有详情文件（用于获取更多信息）
TODO_DIR="$TODOS_DIR/$FDID"
DETAIL_FILE="$TODO_DIR/detail.txt"

if [ -f "$DETAIL_FILE" ]; then
    echo "ℹ️  找到详情文件: $DETAIL_FILE"
    echo "   可以使用以下命令查看详情:"
    echo "   head -30 $DETAIL_FILE"
    echo ""
fi

# ============================================
# 后续流程与 approve_oa_todo.sh 相同
# ============================================

AGENT_BROWSER="npx agent-browser"
OA_URL="https://oa.xgd.com"
STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"
SESSION_NAME="oa-approve-title-$(date +%s%N)"
LOGIN_TIMEOUT_MINUTES=${LOGIN_TIMEOUT_MINUTES:-10}

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
    echo "✅ 复用现有登录状态"
else
    echo ""
    echo "⚠️  需要重新登录..."

    if [ -z "$OA_USER_NAME" ] || [ -z "$OA_USER_PASSWD" ]; then
        echo ""
        echo "❌ 错误: 环境变量未配置"
        echo ""
        echo "请在 CoPaw 的 Environments 中配置:"
        echo "  OA_USER_NAME=你的用户名"
        echo "  OA_USER_PASSWD=你的密码"
        exit 1
    fi

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

# ============================================
# 步骤2: 加载登录状态
# ============================================
echo "🔄 步骤2: 加载登录状态..."

$AGENT_BROWSER --session "$SESSION_NAME" close 2>/dev/null || true

$AGENT_BROWSER --session "$SESSION_NAME" open "about:blank"
sleep 1
$AGENT_BROWSER --session "$SESSION_NAME" state load "$STATE_FILE"
echo "✅ 登录状态已加载"

echo ""
echo "🚀 步骤3: 打开待办详情页面..."

# 构建完整URL
if [[ "$HREF" == /* ]]; then
    DETAIL_URL="https://oa.xgd.com${HREF}"
else
    DETAIL_URL="$HREF"
fi

echo "🔗 详情URL: $DETAIL_URL"

# 直接打开详情页面
$AGENT_BROWSER --session "$SESSION_NAME" open "$DETAIL_URL"
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

# 保存截图用于调试
echo "📷 保存页面截图..."
$AGENT_BROWSER --session "$SESSION_NAME" screenshot /tmp/oa_todo_detail_by_title.png
echo "✅ 截图已保存: /tmp/oa_todo_detail_by_title.png"

# ============================================
# 步骤4: 检测待办类型（会议安排 or 流程管理）
# ============================================
echo ""
echo "🔍 步骤4: 检测待办类型..."

TODO_TYPE=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const pageText = document.body.textContent;

  // 检测会议安排类型
  if (pageText.includes('会议通知') ||
      pageText.includes('会议安排') ||
      pageText.includes('会议邀请') ||
      pageText.includes('参加') && pageText.includes('不参加')) {
    return { type: 'meeting', name: '会议安排' };
  }

  // 检测流程管理类型
  if (pageText.includes('通过') ||
      pageText.includes('驳回') ||
      pageText.includes('转办') ||
      pageText.includes('审批')) {
    return { type: 'workflow', name: '流程管理' };
  }

  return { type: 'unknown', name: '未知类型' };
})()
EOF
)

TODO_TYPE_NAME=$(echo "$TODO_TYPE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('name', ''))
except:
    print('')
")
echo "📋 待办类型: $TODO_TYPE_NAME"

# ============================================
# 根据类型执行不同的审批逻辑
# ============================================

# 会议安排类型
if [[ "$TODO_TYPE" == *"meeting"* ]]; then
    echo ""
    echo "📅 检测到会议安排类型"
    echo ""
    echo "📋 步骤5: 处理会议安排..."
    
    # 步骤5.1: 选择参加/不参加
    echo "   选择: $ACTION"
    
    SELECT_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const action = "$ACTION";
  
  // 查找参加/不参加的单选按钮或复选框
  const allInputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  const targetInput = Array.from(allInputs).find(input => {
    const label = input.closest('label') || document.querySelector('label[for="' + input.id + '"]');
    const labelText = label ? label.textContent.trim() : '';
    const value = input.value || '';
    
    return (action === '参加' && (labelText.includes('参加') || value.includes('参加'))) ||
           (action === '不参加' && (labelText.includes('不参加') || value.includes('不参加')));
  });
  
  if (targetInput) {
    targetInput.click();
    console.log('已选择:', action);
    return { success: true, action: action };
  }
  
  return { success: false };
})()
EOF
)
    
    if [[ "$SELECT_RESULT" != *"success\": true"* ]]; then
        echo "❌ 未找到'$ACTION'选项"
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 1
    fi
    
    echo "✅ 已选择'$ACTION'"
    
    # 步骤5.2: 填写留言（如果有）
    if [ -n "$COMMENT" ]; then
        echo ""
        echo "📝 步骤6: 填写留言..."

        COMMENT_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const comment = "$COMMENT";
  
  // 查找留言框（可能是textarea或input[type="text"]）
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
  
  // 优先查找"留言"相关的输入框
  let commentField = null;
  
  // 查找所有输入框，通过标签文本匹配
  const allLabels = Array.from(document.querySelectorAll('label, td'));
  for (let label of allLabels) {
    const labelText = label.textContent.trim();
    if (labelText === '留言' || labelText.includes('留言')) {
      // 查找该标签后面或附近的输入框
      const parent = label.parentElement;
      if (parent) {
        const textarea = parent.querySelector('textarea');
        const input = parent.querySelector('input[type="text"]');
        const nextSibling = parent.nextElementSibling?.querySelector('textarea') ||
                          parent.nextElementSibling?.querySelector('input[type="text"]');
        
        commentField = textarea || input || nextSibling;
        if (commentField) break;
      }
    }
  }
  
  // 如果没找到，使用第一个textarea或text input
  if (!commentField) {
    commentField = textareas[0] || textInputs[0];
  }
  
  if (commentField) {
    // 清空原有内容
    commentField.value = comment;
    
    // 触发多个事件确保输入生效
    commentField.dispatchEvent(new Event('input', { bubbles: true }));
    commentField.dispatchEvent(new Event('change', { bubbles: true }));
    commentField.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    commentField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    
    // 失去焦点
    commentField.blur();
    
    console.log('已填写留言:', comment, '字段类型:', commentField.tagName);
    return { success: true, tagName: commentField.tagName };
  }
  
  return { success: false };
})()
EOF
)

        if [[ "$COMMENT_RESULT" == *"success\": true"* ]]; then
            echo "✅ 已填写留言: $COMMENT"
        else
            echo "⚠️  未找到留言输入框，跳过留言填写"
        fi
    fi
    
    # 步骤5.3: 提交
    echo ""
    echo "📋 步骤7: 提交会议安排..."

    SUBMIT_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  // 优先查找 .lui_toolbar_btn_l 类的DIV元素（OA系统常用提交按钮）
  let submitBtn = document.querySelector('.lui_toolbar_btn_l');
  
  // 如果没找到，查找其他可能的提交按钮
  if (!submitBtn) {
    const allElements = document.querySelectorAll('div, button, input[type="submit"], input[type="button"], a');
    submitBtn = Array.from(allElements).find(el => {
      const text = el.textContent.trim();
      const className = el.className || '';
      const value = el.value || '';
      return (text === '提交' || text === '确定' || text === '保存' ||
              value === '提交' || value === '确定' || value === '保存') &&
             el.offsetParent !== null && // 元素可见
             !className.includes('disabled'); // 未禁用
    });
  }
  
  if (submitBtn) {
    submitBtn.click();
    console.log('已点击提交按钮，元素类型:', submitBtn.tagName);
    return { success: true, tagName: submitBtn.tagName, className: submitBtn.className };
  }
  
  return { success: false };
})()
EOF
)

    if [[ "$SUBMIT_RESULT" != *"success\": true"* ]]; then
        echo "❌ 未找到提交按钮"
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 1
    fi

    echo "✅ 已提交会议安排"

# 流程管理类型
elif [[ "$TODO_TYPE" == *"workflow"* ]]; then
    echo ""
    echo "📋 检测到流程管理类型"
    echo ""
    echo "📋 步骤8: 滚动到页面底部..."
    
    # 滚动到底部
    $AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  window.scrollTo(0, document.body.scrollHeight);
  return { scrolled: true };
})()
EOF
    
    sleep 2
    echo "✅ 已滚动到底部"
    
    # 步骤8.1: 点击审批按钮（单选按钮）
    echo ""
    echo "📋 步骤9: 选择'$ACTION'..."

    if [[ "$ACTION" == "通过" ]]; then
        BUTTON_TEXT="通过"
    elif [[ "$ACTION" == "驳回" ]]; then
        BUTTON_TEXT="驳回"
    elif [[ "$ACTION" == "转办" ]]; then
        BUTTON_TEXT="转办"
    fi

    CLICK_BUTTON=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const buttonText = "$BUTTON_TEXT";

  // 查找单选按钮（radio）
  const radioButtons = document.querySelectorAll('input[type="radio"]');
  const targetRadio = Array.from(radioButtons).find(radio => {
    const label = radio.closest('label') || document.querySelector('label[for="' + radio.id + '"]');
    const labelText = label ? label.textContent.trim() : '';
    const value = radio.value || '';

    return labelText === buttonText || value === buttonText ||
           labelText.includes(buttonText) || value.includes(buttonText);
  });

  if (targetRadio) {
    targetRadio.click();
    console.log('已选择:', buttonText, ', checked:', targetRadio.checked);
    return { success: true, button: buttonText, checked: targetRadio.checked };
  }

  return { success: false };
})()
EOF
)

    if [[ "$CLICK_BUTTON" != *"success\": true"* ]]; then
        echo "❌ 未找到'$BUTTON_TEXT'选项"
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 1
    fi

    echo "✅ 已选择'$ACTION'"
    
    # 步骤8.2: 填写处理意见（如果有）
    if [ -n "$COMMENT" ]; then
        echo ""
        echo "📝 步骤10: 填写处理意见..."

        COMMENT_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const comment = "$COMMENT";
  
  // 查找处理意见输入框
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
  
  // 优先查找"意见"相关的输入框
  let commentField = null;
  
  const allLabels = Array.from(document.querySelectorAll('label, td'));
  for (let label of allLabels) {
    const labelText = label.textContent.trim();
    if (labelText.includes('意见') || labelText.includes('处理意见') || labelText.includes('审批意见')) {
      const parent = label.parentElement;
      if (parent) {
        const textarea = parent.querySelector('textarea');
        const input = parent.querySelector('input[type="text"]');
        const nextSibling = parent.nextElementSibling?.querySelector('textarea') ||
                          parent.nextElementSibling?.querySelector('input[type="text"]');
        
        commentField = textarea || input || nextSibling;
        if (commentField) break;
      }
    }
  }
  
  if (!commentField) {
    commentField = textareas[0] || textInputs[0];
  }
  
  if (commentField) {
    commentField.value = comment;
    commentField.dispatchEvent(new Event('input', { bubbles: true }));
    commentField.dispatchEvent(new Event('change', { bubbles: true }));
    commentField.blur();
    
    console.log('已填写处理意见:', comment);
    return { success: true };
  }
  
  return { success: false };
})()
EOF
)

        if [[ "$COMMENT_RESULT" == *"success\": true"* ]]; then
            echo "✅ 已填写处理意见: $COMMENT"
        else
            echo "⚠️  未找到处理意见输入框，跳过填写"
        fi
    fi
    
    # 步骤8.3: 处理驳回逻辑
    if [[ "$ACTION" == "驳回" ]]; then
        echo ""
        echo "📋 步骤11: 处理驳回选项..."
        sleep 2
        echo "ℹ️  默认打回上一节点"
    fi
    
    # 步骤8.4: 处理转办逻辑
    if [[ "$ACTION" == "转办" ]]; then
        echo ""
        echo "📋 步骤12: 选择转办人员..."
        sleep 2
        
        # TODO: 实现人员选择逻辑
        echo "⚠️  转办人员选择功能待完善"
        echo "   当前仅支持填写人员姓名: $TRANSFER_USER"
    fi
    
    # 步骤8.5: 提交
    echo ""
    echo "📋 步骤13: 提交审批..."

    sleep 1

    SUBMIT_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  // 查找提交按钮
  let submitBtn = null;
  
  // 优先查找包含"提交"的按钮
  const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a');
  submitBtn = Array.from(allButtons).find(btn => {
    const text = btn.textContent.trim();
    const value = btn.value || '';
    return text === '提交' || value === '提交' ||
           text === '确定' || value === '确定';
  });
  
  if (submitBtn) {
    submitBtn.click();
    console.log('已点击提交按钮:', submitBtn.textContent.trim());
    return { success: true };
  }
  
  return { success: false };
})()
EOF
)

    if [[ "$SUBMIT_RESULT" == *"success\": true"* ]]; then
        echo "✅ 已提交审批"
    else
        echo "⚠️  未找到提交按钮，可能已自动提交"
    fi

# 未知类型
else
    echo ""
    echo "❌ 无法识别待办类型"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

# 等待提交完成
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

echo ""
echo "========================================"
echo "  ✅ 审批完成"
echo "========================================"
echo "待办标题: ${TITLE:0:60}"
echo "审批动作: $ACTION"
echo "处理意见: ${COMMENT:-无}"
echo "========================================"

# 关闭会话
$AGENT_BROWSER --session "$SESSION_NAME" close

echo ""
echo "✅ 审批成功"
