#!/bin/bash

# OA页面学习辅助脚本
# 用于在新页面结构时学习和探索页面元素

set -e

export TZ=Asia/Shanghai

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  OA 页面学习模式${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# 参数处理
FDID="$1"
ACTION="${2:-通过}"

if [ -z "$FDID" ]; then
    echo -e "${YELLOW}用法: $0 <fdId> [action]${NC}"
    echo ""
    echo "示例:"
    echo "  $0 1862fcf9fc8e864009220764132a4911 通过"
    echo "  $0 1862fcf9fc8e864009220764132a4911 驳回"
    echo ""
    exit 1
fi

# 生成唯一的会话名和输出目录
TIMESTAMP=$(date +%s)
LEARN_DIR="/tmp/oa_learn_${TIMESTAMP}"
SNAPSHOT_FILE="${LEARN_DIR}/page_snapshot.txt"
ANALYSIS_FILE="${LEARN_DIR}/analysis.json"

mkdir -p "$LEARN_DIR"

echo -e "${BLUE}学习目录: ${LEARN_DIR}${NC}"
echo -e "${BLUE}快照文件: ${SNAPSHOT_FILE}${NC}"
echo ""

# 启动oa-todo in wait模式
echo -e "${YELLOW}步骤 1: 启动审批流程（等待模式）...${NC}"
echo "node bin/oa-todo.js approve --wait --force $FDID $ACTION"

# 使用expect或直接运行（需要用户按回车退出）
# 这里我们创建一个临时的expect脚本来自动化按回车
cat > /tmp/learn_expect_$TIMESTAMP.exp << 'EXPECT_EOF'
set timeout 300
spawn node bin/oa-todo.js approve --wait [lindex $argv 0] [lindex $argv 1]
expect {
    "按 Enter 键继续" {
        puts "\n\033[0;36m========================================\033[0m"
        puts "\033[0;36m  已进入学习模式\033[0m"
        puts "\033[0;36m========================================\033[0m"
        puts "\033[1;33m浏览器已打开并停留在审批页面\033[0m"
        puts ""
        puts "请执行以下命令探索页面:"
        puts "  source scripts/learn-helper.sh explore"
        puts ""
        puts "探索完成后，按 Enter 键关闭浏览器..."
        puts "\033[0;36m========================================\033[0m"
        expect_user -re "(.*)\r"
        send "\r"
        exp_continue
    }
    timeout {
        puts "操作超时"
        exit 1
    }
    eof
}
EXPECT_EOF

# 运行expect脚本
if command -v expect &> /dev/null; then
    expect /tmp/learn_expect_$TIMESTAMP.exp "$FDID" "$ACTION"
else
    echo -e "${YELLOW}未安装expect，直接运行命令...${NC}"
    echo "" | node bin/oa-todo.js approve --wait --force "$FDID" "$ACTION"
fi

# 清理临时文件
rm -f /tmp/learn_expect_$TIMESTAMP.exp

echo ""
echo -e "${GREEN}学习模式已结束${NC}"
echo -e "${BLUE}请查看文档: docs/LEARNING_WORKFLOW.md${NC}"
echo ""
