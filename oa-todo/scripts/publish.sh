#!/bin/bash
set -e

echo "========================================="
echo "  发布 oa-todo 到内部 npm registry"
echo "========================================="

# 检查是否已登录
echo "📋 检查 npm 登录状态..."
npm whoami --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/ || {
    echo "❌ 未登录，请先执行："
    echo "   npm login --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/"
    exit 1
}

# 进入 oa-todo 目录
cd "$(dirname "$0")/.."

# 显示当前版本
VERSION=$(node -p "require('./package.json').version")
echo "当前版本: $VERSION"

# 确认发布
read -p "确认发布版本 $VERSION? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消"
    exit 1
fi

# 发布
echo "📦 正在发布..."
npm publish --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/

echo "✅ 发布完成!"
echo "安装方式:"
echo "   npm install -g oa-todo --registry=https://packages.aliyun.com/65965d7d0cab697efe133840/npm/npm-registry/"
