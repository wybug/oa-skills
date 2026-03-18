#!/bin/bash

# 依赖检查和安装脚本
# 检查 agent-browser 是否已安装，如未安装则提供安装指引

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查 npx 是否可用
check_npx() {
    if ! command_exists npx; then
        echo -e "${RED}❌ 错误: npx 未安装${NC}"
        echo ""
        echo "npx 是 npm 5.2.0+ 自带的包执行工具"
        echo ""
        echo "请先安装 Node.js:"
        echo ""
        echo -e "${BLUE}方式 1: 使用官方安装包（推荐）${NC}"
        echo "  1. 访问 https://nodejs.org/"
        echo "  2. 下载 LTS 版本（长期支持版）"
        echo "  3. 运行安装程序"
        echo "  4. 重启终端"
        echo ""
        echo -e "${BLUE}方式 2: 使用 Homebrew（macOS）${NC}"
        echo "  brew install node"
        echo ""
        echo -e "${BLUE}方式 3: 使用包管理器（Linux）${NC}"
        echo "  # Ubuntu/Debian"
        echo "  sudo apt update"
        echo "  sudo apt install nodejs npm"
        echo ""
        echo "  # CentOS/RHEL"
        echo "  sudo yum install nodejs npm"
        echo ""
        return 1
    fi
    return 0
}

# 检查 agent-browser 是否已安装
check_agent_browser() {
    echo -e "${BLUE}🔍 检查 agent-browser...${NC}"
    
    # 检查 npx
    if ! check_npx; then
        return 1
    fi
    
    # 检查 agent-browser
    if npx agent-browser --version >/dev/null 2>&1; then
        echo -e "${GREEN}✅ agent-browser 已安装${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  agent-browser 未安装${NC}"
        echo ""
        return 2
    fi
}

# 安装 agent-browser
install_agent_browser() {
    echo ""
    echo -e "${BLUE}📦 安装 agent-browser...${NC}"
    echo ""
    
    # 全局安装
    echo "正在全局安装 agent-browser..."
    if npm install -g agent-browser; then
        echo ""
        echo -e "${GREEN}✅ agent-browser 安装成功！${NC}"
        echo ""
        return 0
    else
        echo ""
        echo -e "${RED}❌ 安装失败${NC}"
        echo ""
        echo "请尝试手动安装："
        echo "  npm install -g agent-browser"
        echo ""
        echo "或使用 npx 直接运行（首次会自动下载）："
        echo "  npx agent-browser --version"
        echo ""
        return 1
    fi
}

# 显示安装指引
show_install_guide() {
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║          agent-browser 安装指引                       ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}agent-browser 是什么？${NC}"
    echo "  agent-browser 是一个强大的浏览器自动化工具，"
    echo "  支持 headless 模式、状态保存、并发执行等功能。"
    echo ""
    echo -e "${BLUE}安装方式：${NC}"
    echo ""
    echo -e "${GREEN}方式 1: 自动安装（推荐）${NC}"
    echo "  ./scripts/install_dependencies.sh"
    echo ""
    echo -e "${GREEN}方式 2: 手动安装${NC}"
    echo "  npm install -g agent-browser"
    echo ""
    echo -e "${GREEN}方式 3: 使用 npx（无需全局安装）${NC}"
    echo "  npx agent-browser --version"
    echo "  （首次运行会自动下载，后续直接使用）"
    echo ""
    echo -e "${BLUE}验证安装：${NC}"
    echo "  agent-browser --version"
    echo "  或"
    echo "  npx agent-browser --version"
    echo ""
    echo -e "${BLUE}常见问题：${NC}"
    echo ""
    echo "Q: npm 安装速度慢？"
    echo "A: 使用国内镜像："
    echo "   npm config set registry https://registry.npmmirror.com"
    echo "   npm install -g agent-browser"
    echo ""
    echo "Q: 权限不足？"
    echo "A: macOS/Linux 使用 sudo："
    echo "   sudo npm install -g agent-browser"
    echo ""
    echo "Q: Windows 安装失败？"
    echo "A: 以管理员身份运行 PowerShell，然后执行："
    echo "   npm install -g agent-browser"
    echo ""
}

# 主检查函数
check_and_install() {
    local check_result=$(check_agent_browser)
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        # 已安装，继续执行
        return 0
    elif [ $exit_code -eq 2 ]; then
        # 未安装，询问是否安装
        echo ""
        read -p "是否现在安装 agent-browser? (y/n): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            install_agent_browser
            return $?
        else
            show_install_guide
            return 1
        fi
    else
        # npx 未安装
        return 1
    fi
}

# 如果直接运行此脚本
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    check_and_install
fi
