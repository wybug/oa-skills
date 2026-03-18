#!/bin/bash

# 费控系统批量审批脚本 - 支持并发审批多个单据
# 读取审批清单文件，并发执行审批
set -e

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查依赖
if ! "$SCRIPTS_DIR/check_dependencies.sh"; then
    exit 1
fi

STATE_FILE="${OA_STATE_FILE:-/tmp/oa_login_state.json}"

# 参数检查
if [ $# -lt 1 ]; then
    echo "用法: $0 <审批清单文件> [并发数]"
    echo ""
    echo "审批清单文件格式 (每行一个):"
    echo "  单号,动作,审批意见"
    echo ""
    echo "示例文件 content.csv:"
    echo "  FK20250101001,同意,"
    echo "  FK20250101002,驳回,费用超标"
    echo "  FK20250101003,同意,已核实"
    echo ""
    echo "并发数: 默认为3，建议不超过5"
    echo ""
    echo "示例:"
    echo "  $0 approval_list.csv"
    echo "  $0 approval_list.csv 5"
    exit 1
fi

LIST_FILE="$1"
CONCURRENT=${2:-3}

# 检查清单文件
if [ ! -f "$LIST_FILE" ]; then
    echo "❌ 错误: 审批清单文件不存在: $LIST_FILE"
    exit 1
fi

# 检查登录状态
if [ ! -f "$STATE_FILE" ]; then
    echo "❌ 错误: 登录状态文件不存在: $STATE_FILE"
    echo "请先执行: $SCRIPTS_DIR/login.sh"
    exit 1
fi

# 统计任务数量
TOTAL_TASKS=$(grep -c -v '^#' "$LIST_FILE" | grep -c '' || echo "0")

echo "========================================"
echo "  费控系统批量审批"
echo "========================================"
echo "清单文件: $LIST_FILE"
echo "总任务数: $TOTAL_TASKS"
echo "并发数: $CONCURRENT"
echo "状态文件: $STATE_FILE"
echo "========================================"
echo ""

# 创建任务队列
TASK_QUEUE=$(mktemp)
grep -v '^#' "$LIST_FILE" > "$TASK_QUEUE"

# 审批成功的计数器
SUCCESS_COUNT=0
FAIL_COUNT=0

# 并发审批函数
process_task() {
    local line="$1"
    local order_id=$(echo "$line" | cut -d',' -f1)
    local action=$(echo "$line" | cut -d',' -f2)
    local comment=$(echo "$line" | cut -d',' -f3-)
    
    echo "[开始] 处理单据: $order_id - $action"
    
    # 调用审批脚本（每个任务使用独立的session）
    if export OA_STATE_FILE="$STATE_FILE" && "$SCRIPTS_DIR/approve.sh" "$order_id" "$action" "$comment" > "/tmp/oa_approve_${order_id}.log" 2>&1; then
        echo "[成功] ✅ $order_id - $action"
        echo "$order_id,SUCCESS" >> /tmp/oa_batch_results.csv
        return 0
    else
        echo "[失败] ❌ $order_id - $action (日志: /tmp/oa_approve_${order_id}.log)"
        echo "$order_id,FAILED" >> /tmp/oa_batch_results.csv
        return 1
    fi
}

# 导出函数和变量供xargs使用
export -f process_task
export STATE_FILE SCRIPTS_DIR

# 初始化结果文件
echo "order_id,status" > /tmp/oa_batch_results.csv

echo "🚀 开始批量审批..."
echo ""

# 使用xargs实现并发控制
cat "$TASK_QUEUE" | xargs -I {} -P "$CONCURRENT" bash -c 'process_task "$@"' _ {}

# 统计结果
SUCCESS_COUNT=$(grep -c "SUCCESS" /tmp/oa_batch_results.csv || echo "0")
FAIL_COUNT=$(grep -c "FAILED" /tmp/oa_batch_results.csv || echo "0")

echo ""
echo "========================================"
echo "  批量审批完成"
echo "========================================"
echo "总数: $TOTAL_TASKS"
echo "成功: $SUCCESS_COUNT"
echo "失败: $FAIL_COUNT"
echo ""
echo "结果文件: /tmp/oa_batch_results.csv"
echo "日志目录: /tmp/oa_approve_*.log"
echo "========================================"

# 清理临时文件
rm -f "$TASK_QUEUE"

# 返回退出码
if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
else
    exit 0
fi
