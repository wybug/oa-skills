# 最佳实践

## 推荐工作流

### 场景 1：独立查询（仅查看待办）

适用于：只需要查看有哪些待审批单据，不执行审批

```bash
# 一条命令完成查询
./scripts/query_approval.sh
```

**优势**：
- 简单快捷，无需预处理
- 自动完成登录和查询
- 控制台输出待审批列表

---

### 场景 2：单个审批（已知单号）

适用于：已知具体单号，需要审批1-2个单据

```bash
# 步骤 1：登录保存状态（首次使用）
./scripts/login.sh

# 步骤 2：执行审批
./scripts/approve.sh FK20250101001 同意

# 步骤 3：继续审批其他单据（复用登录状态）
./scripts/approve.sh FK20250101002 驳回 费用超标
```

**优势**：
- 登录一次，多次使用
- 执行速度快（~7秒/单据）
- 支持智能查询

---

### 场景 3：批量审批（多个单据）

适用于：需要审批多个单据（5个以上）

```bash
# 步骤 1：登录保存状态
./scripts/login.sh

# 步骤 2：创建审批清单
cat > approval_list.csv <<EOF
单号,动作,审批意见
FK20250101001,同意,
FK20250101002,驳回,费用超标
FK20250101003,同意,已核实
FK20250101004,同意,
FK20250101005,驳回,材料不全
EOF

# 步骤 3：执行批量审批（并发数3）
./scripts/batch_approve.sh approval_list.csv 3

# 步骤 4：查看结果
cat /tmp/oa_batch_results.csv

# 步骤 5：检查失败任务
grep "失败" /tmp/oa_batch_results.csv
```

**优势**：
- 并发执行，效率高
- 自动重试失败任务
- 详细的日志和结果

---

### 场景 4：完整工作流（查询+审批）

适用于：先查看待办，再选择性审批

```bash
# 步骤 1：查询待审批（自动登录）
./scripts/query_approval.sh

# 步骤 2：查看截图，确定要审批的单据
open /tmp/oa_feikong_approval_list.png

# 步骤 3：根据查询结果执行审批
./scripts/approve.sh FK20250101001 同意
./scripts/approve.sh FK20250101002 驳回 费用超标
./scripts/approve.sh FK20250101003 同意 已核实

# 步骤 4：如需批量处理，创建清单并执行
cat > approval_list.csv <<EOF
单号,动作,审批意见
FK20250101004,同意,
FK20250101005,同意,
EOF

./scripts/batch_approve.sh approval_list.csv
```

**优势**：
- 先查看，后操作
- 灵活选择审批方式
- 避免遗漏或误操作

---

## 性能优化

### 1. 登录状态复用

**最佳实践**：
- 每天首次使用时执行 `login.sh` 保存状态
- 后续所有操作复用该状态
- 批量任务在20分钟内完成

**示例**：
```bash
# 早上 9:00 - 登录保存状态
./scripts/login.sh

# 9:05-9:15 - 批量审批
./scripts/batch_approve.sh morning_list.csv 3

# 10:00 - 个别审批
./scripts/approve.sh FK001 同意

# 10:30 - 状态可能过期，重新登录
./scripts/login.sh
```

### 2. 并发控制

**推荐配置**：

| 单据数量 | 并发数 | 预计时间 |
|---------|--------|---------|
| 1-5 | 1（顺序执行） | 1-2分钟 |
| 6-20 | 3 | 1-2分钟 |
| 21-50 | 3-5 | 3-5分钟 |
| 50+ | 5（分批执行） | 每批5分钟 |

**示例**：
```bash
# 小批量：顺序执行即可
./scripts/batch_approve.sh small_list.csv 1

# 中批量：并发3
./scripts/batch_approve.sh medium_list.csv 3

# 大批量：分批执行
# 批次1
./scripts/batch_approve.sh batch1.csv 5
# 等待完成
sleep 120
# 批次2
./scripts/batch_approve.sh batch2.csv 5
```

### 3. 网络优化

**建议**：
- 使用稳定的网络连接
- 避免在网络高峰期执行大批量任务
- 监控网络延迟和丢包率

**检测网络**：
```bash
# 测试OA系统响应时间
curl -o /dev/null -s -w "Time: %{time_total}s\n" https://oa.xgd.com

# 如果响应时间 > 3秒，建议稍后再试
```

---

## 安全建议

### 1. 密码管理

**✅ 正确做法**：
- 使用环境变量存储密码
- 定期更换密码
- 使用强密码

**❌ 避免做法**：
- 在脚本中硬编码密码
- 在日志中记录密码
- 使用弱密码

**配置环境变量**：
```bash
# 在 ~/.bashrc 或 ~/.zshrc 中配置
export OA_USER_NAME="your_username"
export OA_USER_PASSWD="your_password"

# 或使用 CoPaw Environments 配置（推荐）
```

### 2. 状态文件保护

```bash
# 设置严格权限
chmod 600 /tmp/oa_login_state.json

# 查看权限
ls -l /tmp/oa_login_state.json
# 应显示: -rw------- 1 user user ...

# 定期清理旧的状态文件
find /tmp -name "oa_login_state*.json" -mtime +1 -delete
```

### 3. 日志管理

```bash
# 定期清理日志（保留7天）
find /tmp -name "oa_*.log" -mtime +7 -delete

# 或设置自动清理任务
cat > /tmp/cleanup_oa_logs.sh <<'EOF'
#!/bin/bash
find /tmp -name "oa_*.log" -mtime +7 -delete
EOF

chmod +x /tmp/cleanup_oa_logs.sh

# 添加到 crontab（每天凌晨3点执行）
# 0 3 * * * /tmp/cleanup_oa_logs.sh
```

---

## 定时任务

### 自动化审批

结合 cron 实现定时自动审批：

```bash
# 编辑 crontab
crontab -e

# 添加以下任务
# 每天上午9点登录保存状态
0 9 * * * /path/to/login.sh > /tmp/oa_cron_login.log 2>&1

# 每天上午10点批量审批
0 10 * * * /path/to/batch_approve.sh /path/to/daily_list.csv 3 > /tmp/oa_cron_approve.log 2>&1

# 每周五下午5点清理日志
0 17 * * 5 find /tmp -name "oa_*.log" -mtime +7 -delete
```

### 动态审批清单

```bash
#!/bin/bash
# generate_approval_list.sh - 动态生成审批清单

# 从数据库或API获取待审批单据
# 这里示例使用固定清单
cat > /tmp/daily_approval.csv <<EOF
单号,动作,审批意见
FK$(date +%Y%m%d)001,同意,
FK$(date +%Y%m%d)002,同意,
EOF

# 执行审批
/path/to/batch_approve.sh /tmp/daily_approval.csv 3
```

---

## 错误处理

### 自动重试

```bash
#!/bin/bash
# robust_approve.sh - 带重试机制的审批脚本

approve_with_retry() {
  local order_id=$1
  local action=$2
  local comment=$3
  local max_retries=3
  local retry=0

  while [ $retry -lt $max_retries ]; do
    if ./scripts/approve.sh "$order_id" "$action" "$comment"; then
      echo "✅ $order_id 审批成功"
      return 0
    fi

    retry=$((retry + 1))
    echo "⚠️  $order_id 第 $retry 次失败，重试中..."
    sleep 2
  done

  echo "❌ $order_id 审批失败，已达最大重试次数"
  return 1
}

# 使用示例
approve_with_retry "FK001" "同意" ""
approve_with_retry "FK002" "驳回" "费用超标"
```

### 异常通知

```bash
#!/bin/bash
# approve_with_notification.sh - 带通知的审批脚本

send_notification() {
  local message=$1
  # 可以集成企业微信、钉钉、邮件等通知方式
  # 示例：使用 macOS 通知
  osascript -e "display notification \"$message\" with title \"OA审批通知\""
}

# 执行审批
if ./scripts/approve.sh "$1" "$2" "$3"; then
  send_notification "审批成功: $1"
else
  send_notification "审批失败: $1"
  exit 1
fi
```

---

## 监控与统计

### 审批统计

```bash
#!/bin/bash
# approval_stats.sh - 审批统计脚本

# 统计今日审批数量
today=$(date +%Y-%m-%d)
grep "$today" /tmp/oa_batch_results.csv | wc -l

# 统计成功率
total=$(wc -l < /tmp/oa_batch_results.csv)
success=$(grep "成功" /tmp/oa_batch_results.csv | wc -l)
success_rate=$(awk "BEGIN {printf \"%.2f\", $success/$total*100}")
echo "成功率: $success_rate%"

# 统计审批类型分布
echo "审批类型分布:"
awk -F',' '{print $2}' /tmp/oa_batch_results.csv | sort | uniq -c
```

### 性能监控

```bash
#!/bin/bash
# monitor_approval.sh - 监控审批性能

start_time=$(date +%s)

# 执行审批
./scripts/approve.sh "$1" "$2" "$3"

end_time=$(date +%s)
duration=$((end_time - start_time))

echo "审批耗时: ${duration}秒"

# 如果耗时过长，发出警告
if [ $duration -gt 15 ]; then
  echo "⚠️  审批耗时过长，可能存在性能问题"
fi
```

---

## 团队协作

### 共享审批清单

```bash
# 将审批清单放在共享目录
SHARED_DIR="/shared/oa-approvals"

# 创建日期目录
mkdir -p "$SHARED_DIR/$(date +%Y-%m-%d)"

# 团队成员创建清单
cat > "$SHARED_DIR/$(date +%Y-%m-%d)/team_a.csv" <<EOF
单号,动作,审批意见
FK001,同意,
FK002,同意,
EOF

# 另一个团队成员补充
cat > "$SHARED_DIR/$(date +%Y-%m-%d)/team_b.csv" <<EOF
单号,动作,审批意见
FK003,驳回,费用超标
FK004,同意,
EOF

# 合并并执行
cat "$SHARED_DIR/$(date +%Y-%m-%d)"/*.csv > /tmp/combined.csv
./scripts/batch_approve.sh /tmp/combined.csv 5
```

### 审批日志共享

```bash
# 将日志同步到共享目录
sync_logs() {
  local date_dir="/shared/oa-logs/$(date +%Y-%m-%d)"
  mkdir -p "$date_dir"

  cp /tmp/oa_batch_results.csv "$date_dir/"
  cp /tmp/oa_approve_*.log "$date_dir/" 2>/dev/null

  echo "日志已同步到: $date_dir"
}

# 每天下班前同步
sync_logs
```

---

## 总结

### 核心原则

1. **安全第一**：保护密码和状态文件
2. **性能优先**：复用登录状态，合理并发
3. **可观测性**：详细日志，及时通知
4. **容错性**：自动重试，异常处理
5. **协作友好**：共享清单，统一标准

### 快速检查清单

- [ ] 环境变量已正确配置
- [ ] 登录状态已保存且未过期
- [ ] 审批清单格式正确
- [ ] 并发数设置合理（3-5）
- [ ] 网络连接稳定
- [ ] 日志保存位置已知
- [ ] 错误处理机制已就绪
