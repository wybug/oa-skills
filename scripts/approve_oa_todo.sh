#!/bin/bash

# OA系统待办审批脚本 - 支持会议安排和流程管理两种类型
# 功能：检查登录状态有效期 -> 自动重新登录（如需要） -> 进入OA系统 -> 审批指定待办事项
# 用法: 
#   会议安排: ./scripts/approve_oa_todo.sh <序号或关键词> <参加|不参加> [留言]
#   流程管理: ./scripts/approve_oa_todo.sh <序号或关键词> <通过|驳回|转办> [处理意见] [转办人员]
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
TODO_INDEX="$1"
ACTION="$2"
COMMENT="${3:-}"
TRANSFER_USER="${4:-}"

if [ -z "$TODO_INDEX" ]; then
    echo "❌ 错误: 缺少待办事项参数"
    echo ""
    echo "用法:"
    echo "  会议安排类:"
    echo "    ./scripts/approve_oa_todo.sh <序号或关键词> <参加|不参加> [留言]"
    echo ""
    echo "  流程管理类:"
    echo "    ./scripts/approve_oa_todo.sh <序号或关键词> <通过|驳回|转办> [处理意见] [转办人员]"
    echo ""
    echo "示例:"
    echo "  # 会议安排"
    echo "  ./scripts/approve_oa_todo.sh 1 参加"
    echo "  ./scripts/approve_oa_todo.sh 2 不参加 \"已有其他安排\""
    echo ""
    echo "  # 流程管理"
    echo "  ./scripts/approve_oa_todo.sh 1 通过 \"同意\""
    echo "  ./scripts/approve_oa_todo.sh 2 驳回 \"信息不完整\""
    echo "  ./scripts/approve_oa_todo.sh 3 转办 \"请XX处理\" \"张三\""
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
    echo "  ./scripts/approve_oa_todo.sh <序号或关键词> 转办 <处理意见> <转办人员>"
    echo ""
    echo "示例:"
    echo "  ./scripts/approve_oa_todo.sh 1 转办 \"请XX处理\" \"张三\""
    exit 1
fi

echo "========================================"
echo "  OA系统待办审批"
echo "========================================"
echo "待办事项: $TODO_INDEX"
echo "审批动作: $ACTION"
if [[ "$ACTION" == "转办" ]]; then
    echo "转办人员: $TRANSFER_USER"
fi
echo "处理意见: ${COMMENT:-无}"
echo "Session: $(date +%s%N)"
echo "========================================"
echo ""

AGENT_BROWSER="npx agent-browser"
OA_URL="https://oa.xgd.com"
STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"
SESSION_NAME="oa-approve-todo-$(date +%s%N)"
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
        echo ""
        echo "⚠️  安全提示: 请勿在对话中透露用户名和密码"
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
echo "🚀 步骤3: 进入OA系统..."

$AGENT_BROWSER --session "$SESSION_NAME" open "$OA_URL"
sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

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

sleep 3
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle

CURRENT_URL=$($AGENT_BROWSER --session "$SESSION_NAME" get url)
echo "📍 当前URL: $CURRENT_URL"

# ============================================
# 步骤6: 查找并点击待办事项
# ============================================
echo ""
echo "📋 步骤6: 查找并点击待办事项..."

CLICK_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  console.log('开始查找待办事项...');

  let targetElement = null;
  let titleLink = null;

  // 通过序号查找
  const index = parseInt("$TODO_INDEX");
  if (!isNaN(index) && index > 0) {
    console.log('通过序号查找:', index);

    // 查找所有待办行（排除表头、翻页控制行和工具行）
    const rows = Array.from(document.querySelectorAll('table tbody tr, table tr')).filter(row => {
      // 确保不是表头
      if (row.querySelector('th')) return false;

      const text = row.textContent.trim();

      // 排除翻页控制行（只有单选框和工具按钮的行）
      const checkboxes = row.querySelectorAll('input[type="checkbox"]');
      const toolbarLinks = row.querySelectorAll('.lui_paging_t_notpre, .lui_paging_t_hasnext, .lui_paging_t_refresh');

      // 如果只有单选框和工具链接，且没有其他内容，则是翻页控制行
      if (checkboxes.length > 0 && toolbarLinks.length >= 2) {
        return false;
      }

      // 排除翻页行（如 "1 / 18" 这种只有数字和斜杠的）
      if (/^\s*\d+\s*\/\s*\d+\s*$/.test(text)) {
        return false;
      }

      // 排除工具行（如 "批量打开"）
      if (/批量打开/.test(text)) {
        return false;
      }

      // 必须有 data-href 属性的链接（待办数据行的标志）
      const dataHrefLink = row.querySelector('a[data-href]');
      if (!dataHrefLink) {
        return false;
      }

      // 确保有实质内容
      return text.length > 0;
    });

    console.log('找到', rows.length, '行待办数据');

    if (rows.length >= index) {
      targetElement = rows[index - 1];
      console.log('选中第', index, '行');

      // 输出行内所有链接
      const allLinks = Array.from(targetElement.querySelectorAll('a'));
      console.log('该行包含', allLinks.length, '个链接');
      allLinks.forEach((link, i) => {
        console.log('  链接', i, ': text=', link.textContent.trim().substring(0, 30), ', href=', link.href, ', onclick=', link.onclick ? 'yes' : 'no');
      });

      // 优先查找有 data-href 属性的链接（OA系统待办链接存储方式）
      titleLink = allLinks.find(link => {
        const dataHref = link.getAttribute('data-href');
        return dataHref && dataHref.startsWith('/sys/notify/');
      });

      if (titleLink) {
        console.log('找到带有 data-href 的链接');
      } else {
        console.log('未找到 data-href 链接，尝试其他方式');

        // 在行内查找标题链接（通常是第2列的<a>标签）
        const cells = targetElement.querySelectorAll('td');
        console.log('该行有', cells.length, '列');

        if (cells.length >= 2) {
          // 标题通常在第2列
          titleLink = cells[1].querySelector('a');
          console.log('在第2列找到链接:', titleLink ? 'yes' : 'no');
        }

        // 如果第2列没找到，尝试在整个行中查找第一个有意义的<a>标签
        if (!titleLink && allLinks.length > 0) {
          // 跳过"javascript:;"的链接
          titleLink = allLinks.find(link => {
            const href = link.href || '';
            return href && !href.includes('javascript:;') && !href.includes('javascript:void(0)');
          });
          console.log('使用第一个有效链接:', titleLink ? 'yes' : 'no');
        }

        // 如果还是没找到，使用第一个链接
        if (!titleLink && allLinks.length > 0) {
          titleLink = allLinks[0];
          console.log('使用第一个链接作为备选');
        }
      }
    }
  }

  // 通过关键词查找
  if (!targetElement && typeof "$TODO_INDEX" === 'string') {
    console.log('通过关键词查找:', "$TODO_INDEX");

    const allRows = Array.from(document.querySelectorAll('table tbody tr, table tr')).filter(row => {
      return !row.querySelector('th') && row.textContent.includes("$TODO_INDEX");
    });

    console.log('找到', allRows.length, '行匹配关键词');

    if (allRows.length > 0) {
      targetElement = allRows[0];
      titleLink = targetElement.querySelector('a');
    }
  }

  console.log('最终结果:');
  console.log('  targetElement:', targetElement ? 'yes' : 'no');
  console.log('  titleLink:', titleLink ? 'yes' : 'no');

  // 优先使用链接的href或data-href直接打开，而不是点击（更可靠）
  if (titleLink) {
    console.log('链接信息:');
    console.log('  text:', titleLink.textContent.trim());
    console.log('  href:', titleLink.href);
    console.log('  onclick:', titleLink.onclick ? 'yes' : 'no');
    console.log('  data-href:', titleLink.dataset.href || titleLink.getAttribute('data-href') || 'none');

    // 优先使用 data-href（OA系统待办链接存储方式）
    const dataHref = titleLink.getAttribute('data-href') || titleLink.dataset.href;
    const finalHref = dataHref || titleLink.href;

    return {
      success: true,
      text: titleLink.textContent.trim().substring(0, 200),
      href: finalHref,
      clickedElement: 'title_link',
      hrefSource: dataHref ? 'data-href' : 'href',
      // 判断是否为"请审批"开头的流程
      isApproval: titleLink.textContent.trim().startsWith('请审批')
    };
  }

  // 如果没有找到链接，尝试点击元素
  const clickTarget = targetElement || titleLink;
  if (clickTarget) {
    console.log('将点击元素:', clickTarget.textContent.trim().substring(0, 50));
    return {
      success: true,
      text: clickTarget.textContent.trim().substring(0, 100),
      clickedElement: 'row'
    };
  }

  console.log('未找到任何元素');
  return { success: false };
})()
EOF
)

if [[ "$CLICK_RESULT" != *"success\": true"* ]]; then
    echo "❌ 未找到待办事项: $TODO_INDEX"
    echo "💡 请先运行查询脚本查看待办列表"
    echo "   ./scripts/query_oa_todo.sh"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

# 提取JSON字段（使用Python更可靠，注意处理特殊字符）
EXTRACTED_DATA=$(echo "$CLICK_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('clickedElement=' + str(data.get('clickedElement', '')))
    print('href=' + str(data.get('href', '')))
    print('hrefSource=' + str(data.get('hrefSource', '')))
    print('isApproval=' + str(data.get('isApproval', False)))
    print('text=' + str(data.get('text', '')))
except Exception as e:
    print('error=' + str(e))
")

# 提取各字段
CLICKED_ELEMENT=$(echo "$EXTRACTED_DATA" | grep "^clickedElement=" | cut -d'=' -f2-)
TODO_HREF=$(echo "$EXTRACTED_DATA" | grep "^href=" | cut -d'=' -f2-)
HREF_SOURCE=$(echo "$EXTRACTED_DATA" | grep "^hrefSource=" | cut -d'=' -f2-)
IS_APPROVAL=$(echo "$EXTRACTED_DATA" | grep "^isApproval=" | cut -d'=' -f2-)
TODO_TEXT=$(echo "$EXTRACTED_DATA" | grep "^text=" | cut -d'=' -f2-)

echo "📊 点击结果详情:"
echo "   标题: ${TODO_TEXT:0:80}"
echo "   链接: $TODO_HREF"
echo "   来源: ${HREF_SOURCE:-未知}"
echo "   类型: $([[ "$IS_APPROVAL" == "True" ]] && echo "流程审批" || echo "会议安排")"

# 检查是否为"请审批"开头的流程（优先于页面内容判断）
if [[ "$IS_APPROVAL" == "True" || "$IS_APPROVAL" == "true" ]]; then
    IS_APPROVAL_FLAG=1
else
    IS_APPROVAL_FLAG=0
fi

# 检查是否为"邀您参会"类型
if [[ "$TODO_TEXT" == *"邀您参会"* ]]; then
    IS_INVITE_MEETING=1
else
    IS_INVITE_MEETING=0
fi

if [ -n "$TODO_HREF" ] && [[ "$TODO_HREF" != *"null"* ]] && [[ "$TODO_HREF" != "None" ]]; then
    echo "🔗 找到详情链接，直接打开"

    # 检查是否为相对路径，如果是则拼接完整URL
    if [[ "$TODO_HREF" == /* ]]; then
        TODO_FULL_URL="https://oa.xgd.com${TODO_HREF}"
        echo "   链接来源: ${HREF_SOURCE} (相对路径)"
        echo "   完整URL: $TODO_FULL_URL"
    else
        TODO_FULL_URL="$TODO_HREF"
        echo "   链接地址: $TODO_HREF"
    fi

    # 直接打开详情链接
    $AGENT_BROWSER --session "$SESSION_NAME" open "$TODO_FULL_URL"
    sleep 3
    $AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
else
    echo "❌ 未找到有效的详情链接"
    $AGENT_BROWSER --session "$SESSION_NAME" close
    exit 1
fi

# 保存截图用于调试
echo "📷 保存页面截图..."
$AGENT_BROWSER --session "$SESSION_NAME" screenshot /tmp/oa_todo_detail.png
echo "✅ 截图已保存: /tmp/oa_todo_detail.png"

# 获取页面快照
echo "📄 获取页面快照..."
SNAPSHOT=$($AGENT_BROWSER --session "$SESSION_NAME" snapshot)
echo "$SNAPSHOT" | head -100 > /tmp/oa_todo_snapshot.txt
echo "✅ 快照已保存: /tmp/oa_todo_snapshot.txt"

# ============================================
# 步骤7: 检查会议是否已过期（仅对"邀您参会"类型的待办）
# ============================================
echo ""
echo "🔍 步骤7: 检查会议状态..."

# 如果标题包含"邀您参会"，则检查是否过期
if [ "$IS_INVITE_MEETING" -eq 1 ]; then
    MEETING_STATUS=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const pageText = document.body.textContent;

  // 检查是否有会议已开始的提示
  if (pageText.includes('抱歉！会议已开始，不能进行回执') ||
      pageText.includes('会议已开始') ||
      pageText.includes('不能进行回执')) {
    return { expired: true, message: '会议已开始，无需处理' };
  }

  return { expired: false, message: '会议未过期，可以处理' };
})()
EOF
)

    MEETING_EXPIRED=$(echo "$MEETING_STATUS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('1' if data.get('expired', False) else '0')
except:
    print('0')
")

    MEETING_MESSAGE=$(echo "$MEETING_STATUS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('message', ''))
except:
    print('')
")

    if [ "$MEETING_EXPIRED" -gt 0 ]; then
        echo "⚠️  $MEETING_MESSAGE"
        echo ""
        echo "========================================"
        echo "  ⚠️  会议已过期，无需处理"
        echo "========================================"
        echo "待办事项: $TODO_INDEX"
        echo "标题: ${TODO_TEXT:0:100}"
        echo "状态: 会议已开始，不能进行回执"
        echo "处理方式: 跳过"
        echo "========================================"

        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 0
    else
        echo "✅ $MEETING_MESSAGE"
    fi
else
    echo "ℹ️  非邀您参会类型，跳过过期检查"
fi

# ============================================
# 步骤8: 检测待办类型（会议安排 or 流程管理）
# ============================================
echo ""
echo "🔍 步骤8: 检测待办类型..."

# 优先使用步骤6中根据标题判断的类型
if [[ "$IS_APPROVAL" == "True" || "$IS_APPROVAL" == "true" ]]; then
    echo "📋 待办类型: 流程管理（根据标题判断：以'请审批'开头）"
    TODO_TYPE='{"type":"workflow","name":"流程管理"}'
else
    # 否则根据页面内容判断
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
fi

# ============================================
# 根据类型执行不同的审批逻辑
# ============================================

# 会议安排类型
if [[ "$TODO_TYPE" == *"meeting"* ]]; then
    echo ""
    echo "📅 检测到会议安排类型"
    echo ""
    echo "📋 步骤9: 处理会议安排..."
    
    # 步骤8.1: 选择参加/不参加
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
    
    # 步骤9.2: 填写留言（如果有）
    if [ -n "$COMMENT" ]; then
        echo ""
        echo "📝 步骤10: 填写留言..."

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
  
  return { success: false, message: '未找到留言输入框', textareaCount: textareas.length, inputCount: textInputs.length };
})()
EOF
)

        if [[ "$COMMENT_RESULT" == *"success\": true"* ]]; then
            echo "✅ 已填写留言: $COMMENT"
        else
            echo "⚠️  未找到留言输入框，跳过留言填写"
            echo "   原因: $(echo "$COMMENT_RESULT" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
        fi
    fi
    
    # 步骤9.3: 提交
    echo ""
    echo "📋 步骤11: 提交会议安排..."

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
  
  // 返回页面上所有可点击的元素用于调试
  const clickableElements = Array.from(document.querySelectorAll('div, button, input, a'))
    .filter(el => el.offsetParent !== null)
    .map(el => ({
      tagName: el.tagName,
      text: el.textContent.trim().substring(0, 20),
      className: el.className
    }))
    .filter(el => el.text && el.text.length > 0)
    .slice(0, 10);
  
  return {
    success: false,
    message: '未找到提交按钮',
    clickableElements: clickableElements
  };
})()
EOF
)

    if [[ "$SUBMIT_RESULT" != *"success\": true"* ]]; then
        echo "❌ 未找到提交按钮"
        echo "💡 可点击的元素:"
        echo "$SUBMIT_RESULT" | grep -o '"text":"[^"]*"' | head -10
        $AGENT_BROWSER --session "$SESSION_NAME" close
        exit 1
    fi

    echo "✅ 已提交会议安排"

# 流程管理类型
elif [[ "$TODO_TYPE" == *"workflow"* ]]; then
    echo ""
    echo "📋 检测到流程管理类型"
    echo ""
    echo "📋 步骤12: 滚动到页面底部..."
    
    # 滚动到底部
    $AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  window.scrollTo(0, document.body.scrollHeight);
  return { scrolled: true };
})()
EOF
    
    sleep 2
    echo "✅ 已滚动到底部"
    
    # 步骤12.1: 点击审批按钮（单选按钮）
    echo ""
    echo "📋 步骤13: 选择'$ACTION'..."

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

  // 如果没找到单选按钮，尝试查找普通按钮
  const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a');
  const targetButton = Array.from(allButtons).find(btn => {
    const text = btn.textContent.trim();
    const value = btn.value || '';
    return text === buttonText || value === buttonText ||
           text.includes(buttonText) || value.includes(buttonText);
  });

  if (targetButton) {
    targetButton.click();
    console.log('已点击按钮:', buttonText);
    return { success: true, button: buttonText };
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
    
    # 步骤12.2: 处理驳回逻辑
    if [[ "$ACTION" == "驳回" ]]; then
        echo ""
        echo "📋 步骤14: 处理驳回选项..."
        
        # 等待驳回选项加载
        sleep 2
        
        # 默认打回上一节点（不操作，使用默认值）
        echo "ℹ️  默认打回上一节点"
        
        # 如果需要用户确认，可以在这里添加交互
        # echo "💡 驳回选项说明：默认打回上一节点"
    fi
    
    # 步骤12.3: 处理转办逻辑
    if [[ "$ACTION" == "转办" ]]; then
        echo ""
        echo "📋 步骤15: 选择转办人员..."
        
        # 等待人员选择器加载
        sleep 2
        
        # 查找并选择人员
        SELECT_USER=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const userName = "$TRANSFER_USER";
  
  // 查找人员选择框
  const allInputs = document.querySelectorAll('input[type="text"], input[type="search"]');
  const userSelect = Array.from(allInputs).find(input => 
    input.placeholder?.includes('人员') || 
    input.placeholder?.includes('姓名') ||
    input.name?.includes('user') ||
    input.name?.includes('person')
  );
  
  if (userSelect) {
    userSelect.value = userName;
    userSelect.dispatchEvent(new Event('input', { bubbles: true }));
    userSelect.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 等待下拉选项出现并选择
    setTimeout(() => {
      const options = document.querySelectorAll('.dropdown-menu li, .select2-results li, [role="option"]');
      const targetOption = Array.from(options).find(opt => 
        opt.textContent.includes(userName)
      );
      if (targetOption) {
        targetOption.click();
      }
    }, 500);
    
    console.log('已选择转办人员:', userName);
    return { success: true, user: userName };
  }
  
  return { success: false };
})()
EOF
)
        
        if [[ "$SELECT_USER" != *"success\": true"* ]]; then
            echo "⚠️  未找到人员选择框，请手动选择"
        else
            echo "✅ 已选择转办人员: $TRANSFER_USER"
        fi
    fi
    
    # 步骤12.4: 填写处理意见
    if [ -n "$COMMENT" ]; then
        echo ""
        echo "📝 步骤16: 填写处理意见..."
        
        COMMENT_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<EOF
(() => {
  const comment = "$COMMENT";
  const textareas = document.querySelectorAll('textarea');
  const inputs = document.querySelectorAll('input[type="text"]');
  
  let commentField = null;
  
  // 优先查找处理意见/审批意见相关的输入框
  if (textareas.length > 0) {
    commentField = Array.from(textareas).find(ta => 
      ta.placeholder?.includes('意见') || 
      ta.placeholder?.includes('备注') ||
      ta.name?.includes('comment') ||
      ta.name?.includes('opinion')
    ) || textareas[0];
  }
  
  if (!commentField && inputs.length > 0) {
    commentField = Array.from(inputs).find(input => 
      input.placeholder?.includes('意见') || 
      input.placeholder?.includes('备注')
    );
  }
  
  if (commentField) {
    commentField.value = comment;
    commentField.dispatchEvent(new Event('input', { bubbles: true }));
    commentField.dispatchEvent(new Event('change', { bubbles: true }));
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
            echo "⚠️  未找到处理意见输入框"
        fi
    fi
    
    # 步骤12.5: 提交
    echo ""
    echo "📋 步骤17: 确认提交..."
    
    sleep 2
    
    SUBMIT_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a');
  
  const submitButton = Array.from(allButtons).find(btn => {
    const text = btn.textContent.trim();
    const value = btn.value || '';
    return text === '确定' || text === '提交' || text === '确认' ||
           value === '确定' || value === '提交' || value === '确认';
  });
  
  if (submitButton) {
    submitButton.click();
    console.log('已点击确认按钮');
    return { success: true };
  }
  
  return { success: false };
})()
EOF
)
    
    if [[ "$SUBMIT_RESULT" != *"success\": true"* ]]; then
        echo "⚠️  未找到确认按钮，可能已自动提交"
    else
        echo "✅ 已确认提交"
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

# 关闭session
$AGENT_BROWSER --session "$SESSION_NAME" close

echo ""
echo "========================================"
echo "  ✅ 审批完成"
echo "========================================"
echo "待办事项: $TODO_INDEX"
echo "审批动作: $ACTION"
if [[ "$ACTION" == "转办" ]]; then
    echo "转办人员: $TRANSFER_USER"
fi
echo "处理意见: ${COMMENT:-无}"
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""
