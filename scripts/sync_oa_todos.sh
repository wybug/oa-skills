#!/bin/bash

# 同步OA系统待办详情脚本
# 功能：翻页获取所有待办 -> 逐个打开详情页面 -> 保存详情到文件
# 用法: ./scripts/sync_oa_todos.sh [limit]
# 参数: limit - 限制获取数量（可选，默认获取全部，用于测试）
# 
# 目录结构：
#   /tmp/oa_todos/
#     ├── index.txt          # 索引文件：fdId|title|href
#     ├── summary.txt        # 汇总报告
#     └── [fdId]/            # 每个待办的详情目录
#         ├── detail.txt     # 待办详情（页面内容+快照）
#         ├── snapshot.txt   # 页面快照
#         └── screenshot.png # 页面截图
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
LIMIT="${1:-0}"  # 0表示不限制

AGENT_BROWSER="npx agent-browser"
OA_URL="https://oa.xgd.com"
STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"
SESSION_NAME="oa-sync-todos-$(date +%s%N)"
LOGIN_TIMEOUT_MINUTES=${LOGIN_TIMEOUT_MINUTES:-10}
TODOS_DIR="/tmp/oa_todos"
INDEX_FILE="$TODOS_DIR/index.txt"
SUMMARY_FILE="$TODOS_DIR/summary.txt"

echo "========================================"
echo "  同步OA系统待办详情"
echo "========================================"
echo "输出目录: $TODOS_DIR"
if [ "$LIMIT" -gt 0 ]; then
    echo "限制数量: $LIMIT 条（测试模式）"
else
    echo "获取数量: 全部"
fi
echo "Session: $SESSION_NAME"
echo "========================================"
echo ""

# 创建输出目录
mkdir -p "$TODOS_DIR"

# 如果索引文件不存在，创建空文件
if [ ! -f "$INDEX_FILE" ]; then
    touch "$INDEX_FILE"
    echo "✅ 创建索引文件: $INDEX_FILE"
fi

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
# 函数：从URL中提取fdId
# ============================================
extract_fdid() {
    local url="$1"
    # 从URL中提取fdId参数
    # 例如：/sys/notify/sys_notify_todo/sysNotifyTodo.do?method=view&fdId=19bba01cb5a30a6668fdc15413daa5da
    echo "$url" | grep -o 'fdId=[^&]*' | cut -d'=' -f2
}

# ============================================
# 函数：更新索引文件（以fdId为关键字，整行替换）
# ============================================
update_index() {
    local fdid="$1"
    local title="$2"
    local href="$3"
    local index_file="$4"
    
    # 临时文件
    local temp_file=$(mktemp)
    
    # 标记是否已更新
    local updated=0
    
    # 读取索引文件，如果找到相同fdId则替换，否则保留
    while IFS='|' read -r existing_fdid existing_title existing_href; do
        if [ "$existing_fdid" = "$fdid" ]; then
            # 找到相同的fdId，替换整行
            echo "${fdid}|${title}|${href}" >> "$temp_file"
            updated=1
        else
            # 保留原有行
            echo "${existing_fdid}|${existing_title}|${existing_href}" >> "$temp_file"
        fi
    done < "$index_file"
    
    # 如果没有找到相同的fdId，追加新行
    if [ "$updated" -eq 0 ]; then
        echo "${fdid}|${title}|${href}" >> "$temp_file"
    fi
    
    # 替换原文件
    mv "$temp_file" "$index_file"
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
        echo "✅ 登录成功，继续同步..."
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
echo "🚀 步骤3: 打开OA系统..."

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

sleep 5
$AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
sleep 3

# ============================================
# 步骤6: 翻页获取所有待办链接
# ============================================
echo ""
echo "📋 步骤6: 翻页获取所有待办链接..."

# 初始化
PAGE_NUM=1
TOTAL_COUNT=0
NEW_COUNT=0
UPDATED_COUNT=0

# 循环翻页
while true; do
    echo ""
    echo "📄 第 $PAGE_NUM 页..."
    
    # 获取当前页的待办列表
    PAGE_RESULT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const todos = [];
  
  // 查找所有待办行（排除表头、翻页控制行和工具行）
  const rows = Array.from(document.querySelectorAll('table tbody tr, table tr')).filter(row => {
    // 确保不是表头
    if (row.querySelector('th')) return false;
    
    const text = row.textContent.trim();
    
    // 排除翻页控制行
    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    const toolbarLinks = row.querySelectorAll('.lui_paging_t_notpre, .lui_paging_t_hasnext, .lui_paging_t_refresh');
    
    if (checkboxes.length > 0 && toolbarLinks.length >= 2) {
      return false;
    }
    
    // 排除翻页行（如 "1 / 18"）
    if (/^\s*\d+\s*\/\s*\d+\s*$/.test(text)) {
      return false;
    }
    
    // 排除工具行
    if (/批量打开/.test(text)) {
      return false;
    }
    
    // 必须有 data-href 属性的链接
    const dataHrefLink = row.querySelector('a[data-href]');
    if (!dataHrefLink) {
      return false;
    }
    
    return text.length > 0;
  });
  
  console.log('找到', rows.length, '行待办数据');
  
  // 提取每行的信息
  rows.forEach((row, index) => {
    const allLinks = Array.from(row.querySelectorAll('a'));
    
    // 查找带有 data-href 的链接
    const titleLink = allLinks.find(link => {
      const dataHref = link.getAttribute('data-href');
      return dataHref && dataHref.startsWith('/sys/notify/');
    });
    
    if (titleLink) {
      const dataHref = titleLink.getAttribute('data-href') || titleLink.dataset.href;
      const cells = row.querySelectorAll('td');
      
      todos.push({
        index: index + 1,
        title: titleLink.textContent.trim(),
        href: dataHref || titleLink.href,
        cells: Array.from(cells).map(cell => cell.textContent.trim())
      });
    }
  });
  
  // 检查是否有下一页
  const hasNextButton = document.querySelector('.lui_paging_t_hasnext:not(.lui_paging_t_hasnext_n)');
  const hasNext = hasNextButton && hasNextButton.offsetParent !== null;
  
  return {
    success: true,
    todos: todos,
    count: todos.length,
    hasNext: hasNext
  };
})()
EOF
)

    if [[ "$PAGE_RESULT" != *"success\": true"* ]]; then
        echo "❌ 获取待办列表失败"
        break
    fi
    
    # 提取待办数量和是否有下一页
    PAGE_COUNT=$(echo "$PAGE_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('count', 0))
except:
    print(0)
")
    
    HAS_NEXT=$(echo "$PAGE_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('1' if data.get('hasNext', False) else '0')
except:
    print('0')
")
    
    echo "   本页待办数: $PAGE_COUNT"
    
    # 保存当前页的待办信息
    if [ "$PAGE_COUNT" -gt 0 ]; then
        # 提取待办列表JSON
        TODOS_JSON=$(echo "$PAGE_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    todos = data.get('todos', [])
    for todo in todos:
        print(f\"{todo['index']}|{todo['title']}|{todo['href']}\")
except Exception as e:
    pass
")
        
        # 处理每个待办
        while IFS='|' read -r IDX TITLE HREF; do
            TOTAL_COUNT=$((TOTAL_COUNT + 1))
            
            # 提取fdId
            FDID=$(extract_fdid "$HREF")
            
            if [ -z "$FDID" ]; then
                echo "   ⚠️  无法提取fdId: ${TITLE:0:40}..."
                continue
            fi
            
            echo "   [$TOTAL_COUNT] fdId=$FDID ${TITLE:0:50}..."
            
            # 检查索引中是否已存在
            if grep -q "^${FDID}|" "$INDEX_FILE" 2>/dev/null; then
                # 已存在，更新记录
                update_index "$FDID" "$TITLE" "$HREF" "$INDEX_FILE"
                UPDATED_COUNT=$((UPDATED_COUNT + 1))
                echo "      📝 已更新索引"
            else
                # 新记录，添加到索引
                echo "${FDID}|${TITLE}|${HREF}" >> "$INDEX_FILE"
                NEW_COUNT=$((NEW_COUNT + 1))
                echo "      ✨ 新增索引"
            fi
            
            # 检查是否达到限制
            if [ "$LIMIT" -gt 0 ] && [ "$TOTAL_COUNT" -ge "$LIMIT" ]; then
                echo ""
                echo "ℹ️  已达到限制数量 ($LIMIT)，停止获取"
                HAS_NEXT=0
                break
            fi
        done <<< "$TODOS_JSON"
    fi
    
    # 检查是否继续翻页
    if [ "$HAS_NEXT" -eq 1 ]; then
        if [ "$LIMIT" -eq 0 ] || [ "$TOTAL_COUNT" -lt "$LIMIT" ]; then
            echo "   翻到下一页..."
            
            # 点击下一页按钮
            CLICK_NEXT=$($AGENT_BROWSER --session "$SESSION_NAME" eval --stdin <<'EOF'
(() => {
  const nextBtn = document.querySelector('.lui_paging_t_hasnext:not(.lui_paging_t_hasnext_n)');
  if (nextBtn && nextBtn.offsetParent !== null) {
    nextBtn.click();
    return { success: true };
  }
  return { success: false };
})()
EOF
)
            
            if [[ "$CLICK_NEXT" == *"success\": true"* ]]; then
                PAGE_NUM=$((PAGE_NUM + 1))
                sleep 3
                $AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
                sleep 2
            else
                echo "   ⚠️  无法点击下一页按钮"
                break
            fi
        else
            break
        fi
    else
        echo "   ✅ 已到最后一页"
        break
    fi
done

echo ""
echo "========================================"
echo "  待办列表获取完成"
echo "========================================"
echo "总页数: $PAGE_NUM"
echo "总待办数: $TOTAL_COUNT"
echo "新增: $NEW_COUNT"
echo "更新: $UPDATED_COUNT"
echo "========================================"

# ============================================
# 步骤7: 逐个获取待办详情
# ============================================
echo ""
echo "📋 步骤7: 逐个获取待办详情..."

PROCESSED=0
SUCCESS=0
FAILED=0
SKIPPED=0

# 读取索引文件，逐个处理
while IFS='|' read -r FDID TITLE HREF; do
    # 跳过空行
    [ -z "$FDID" ] && continue
    
    PROCESSED=$((PROCESSED + 1))
    
    echo ""
    echo "========================================"
    echo "  [$PROCESSED/$TOTAL_COUNT] ${TITLE:0:50}..."
    echo "========================================"
    echo "   fdId: $FDID"
    
    # 创建待办目录
    TODO_DIR="$TODOS_DIR/$FDID"
    DETAIL_FILE="$TODO_DIR/detail.txt"
    SNAPSHOT_FILE="$TODO_DIR/snapshot.txt"
    SCREENSHOT_FILE="$TODO_DIR/screenshot.png"
    
    # 检查是否已存在详情文件
    if [ -f "$DETAIL_FILE" ]; then
        echo "   ⏭️  已存在详情文件，跳过获取"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    mkdir -p "$TODO_DIR"
    
    # 构建完整URL
    if [[ "$HREF" == /* ]]; then
        DETAIL_URL="https://oa.xgd.com${HREF}"
    else
        DETAIL_URL="$HREF"
    fi
    
    echo "   🔗 详情URL: $DETAIL_URL"
    
    # 打开详情页面
    $AGENT_BROWSER --session "$SESSION_NAME" open "$DETAIL_URL"
    sleep 3
    $AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
    sleep 2
    
    # 获取页面内容
    echo "   📄 获取页面内容..."
    DETAIL_CONTENT=$($AGENT_BROWSER --session "$SESSION_NAME" get text body)
    
    # 获取页面快照
    echo "   📸 获取页面快照..."
    SNAPSHOT=$($AGENT_BROWSER --session "$SESSION_NAME" snapshot)
    
    # 截图
    echo "   📷 保存截图..."
    $AGENT_BROWSER --session "$SESSION_NAME" screenshot "$SCREENSHOT_FILE"
    
    # 保存详情
    {
        echo "========================================"
        echo "  待办详情"
        echo "========================================"
        echo "fdId: $FDID"
        echo "标题: $TITLE"
        echo "链接: $DETAIL_URL"
        echo "获取时间: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "========================================"
        echo ""
        echo "--- 页面内容 ---"
        echo "$DETAIL_CONTENT"
        echo ""
        echo "--- 页面快照 ---"
        echo "$SNAPSHOT"
    } > "$DETAIL_FILE"
    
    # 保存快照到单独文件
    echo "$SNAPSHOT" > "$SNAPSHOT_FILE"
    
    if [ -f "$DETAIL_FILE" ]; then
        SUCCESS=$((SUCCESS + 1))
        echo "   ✅ 已保存: $DETAIL_FILE"
        echo "   ✅ 已保存: $SNAPSHOT_FILE"
        echo "   ✅ 已保存: $SCREENSHOT_FILE"
    else
        FAILED=$((FAILED + 1))
        echo "   ❌ 保存失败: $DETAIL_FILE"
    fi
    
    # 返回待办列表页面
    echo "   🔙 返回待办列表..."
    $AGENT_BROWSER --session "$SESSION_NAME" open "$TODO_URL"
    sleep 3
    $AGENT_BROWSER --session "$SESSION_NAME" wait --load networkidle
    sleep 2
    
    # 检查是否达到限制
    if [ "$LIMIT" -gt 0 ] && [ "$PROCESSED" -ge "$LIMIT" ]; then
        echo ""
        echo "ℹ️  已达到限制数量 ($LIMIT)，停止获取详情"
        break
    fi
    
done < "$INDEX_FILE"

# ============================================
# 步骤8: 生成汇总报告
# ============================================
echo ""
echo "========================================"
echo "  同步完成"
echo "========================================"
echo "总待办数: $TOTAL_COUNT"
echo "新增索引: $NEW_COUNT"
echo "更新索引: $UPDATED_COUNT"
echo "已处理详情: $PROCESSED"
echo "成功获取: $SUCCESS"
echo "跳过（已存在）: $SKIPPED"
echo "失败: $FAILED"
echo "输出目录: $TODOS_DIR"
echo "========================================"

# 生成汇总文件
{
    echo "OA待办同步报告"
    echo "生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "========================================"
    echo "  统计信息"
    echo "========================================"
    echo "总待办数: $TOTAL_COUNT"
    echo "新增索引: $NEW_COUNT"
    echo "更新索引: $UPDATED_COUNT"
    echo "已处理详情: $PROCESSED"
    echo "成功获取: $SUCCESS"
    echo "跳过（已存在）: $SKIPPED"
    echo "失败: $FAILED"
    echo ""
    echo "========================================"
    echo "  目录结构"
    echo "========================================"
    echo "索引文件: $INDEX_FILE"
    echo "汇总文件: $SUMMARY_FILE"
    echo "待办目录: $TODOS_DIR/[fdId]/"
    echo "  - detail.txt     详情（页面内容+快照）"
    echo "  - snapshot.txt   页面快照"
    echo "  - screenshot.png 页面截图"
    echo ""
    echo "========================================"
    echo "  索引文件格式"
    echo "========================================"
    echo "格式: fdId|title|href"
    echo "示例:"
    head -5 "$INDEX_FILE"
    echo ""
    echo "========================================"
    echo "  已同步待办列表"
    echo "========================================"
    cat "$INDEX_FILE" | while IFS='|' read -r fdid title href; do
        echo "[$fdid] ${title:0:60}"
    done
} > "$SUMMARY_FILE"

echo "✅ 汇总报告已生成: $SUMMARY_FILE"

# 关闭会话
$AGENT_BROWSER --session "$SESSION_NAME" close

echo ""
echo "✅ 同步完成"
