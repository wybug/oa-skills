# OA费控审批 - 使用示例

## 快速开始

### 1. 首次使用 - 保存登录状态

```bash
cd /Users/wangyun/.copaw/active_skills/query-oa-approval

# 执行登录脚本
./scripts/login.sh
```

**预期输出**:
```
========================================
  OA系统登录 - 保存登录状态
========================================

🔐 步骤1: 打开OA登录页面...
📝 步骤2: 填写登录表单...
🚀 步骤3: 提交登录...
✅ 登录成功！
💾 步骤4: 保存登录状态...
✅ 登录状态已保存到: /tmp/oa_login_state.json

========================================
  ✅ 登录状态保存完成
========================================
```

### 2. 查询待审批

```bash
# 方式1: 查询所有待审批（自动检查登录状态）
./scripts/query_approval.sh

# 方式2: 查询指定单号是否在待审批列表中
./scripts/query_approval.sh FK20250101001
```

#### 查询指定单号示例

**找到单据：**
```bash
./scripts/query_approval.sh FK20250101001
```

**输出：**
```
========================================
  查询指定单据: FK20250101001
========================================

🔍 正在搜索单号: FK20250101001

========================================
  ✅ 找到单据: FK20250101001
========================================

📋 单据信息:
单号: FK20250101001
标题: 差旅报销申请
申请人: 张三
金额: ¥5,000.00

✅ 该单据在待审批列表中

📷 单据截图: /tmp/oa_order_FK20250101001.png
```

**未找到单据：**
```bash
./scripts/query_approval.sh FK20250101999
```

**输出：**
```
========================================
  查询指定单据: FK20250101999
========================================

🔍 正在搜索单号: FK20250101999

========================================
  ❌ 未找到单据: FK20250101999
========================================

可能的原因:
  1. 该单据不在待审批列表中
  2. 该单据已被处理（同意或驳回）
  3. 该单据号输入错误

建议操作:
  - 检查单号是否正确
  - 在'审批记录'中查看该单据状态
  - 执行 ./scripts/query_approval.sh 查看所有待审批列表
```

### 3. 执行单个审批

```bash
# 同意单据
./scripts/approve.sh FK20250101001 同意

# 驳回单据（建议填写原因）
./scripts/approve.sh FK20250101002 驳回 费用超标，请核实后重新提交

# 驳回单据（简单原因）
./scripts/approve.sh FK20250101003 驳回 理由不充分
```

**预期输出**:
```
========================================
  费控系统审批
========================================
单号: FK20250101001
动作: 同意
意见: 无
Session: oa-approve-1739512345678901234
状态文件: /tmp/oa_login_state.json
========================================

🔐 步骤1: 加载登录状态...
✅ 登录状态已加载

🚀 步骤2: 打开费控系统...
📍 当前URL: https://dd2.hosecloud.com/web/thirdparty.html...
✅ 已进入费控系统

📋 步骤3: 进入待办页面...
✅ 已进入待办

🔍 步骤4: 搜索单号 FK20250101001 ...
✅ 已输入单号

✅ 步骤5: 勾选单据...
✅ 已勾选单据

⚡ 步骤6: 执行审批 - 同意 ...
✅ 已点击同意按钮

📊 步骤7: 验证审批结果...
📷 审批结果截图: /tmp/oa_approve_result.png

========================================
  ✅ 审批完成
========================================
```

### 4. 批量审批

#### 4.1 创建审批清单

```bash
# 创建CSV文件
cat > approval_list.csv <<'EOF'
# 单号,动作,审批意见
FK20250101001,同意,
FK20250101002,同意,已核实
FK20250101003,驳回,费用超标
FK20250101004,同意,
FK20250101005,驳回,缺少附件
EOF
```

#### 4.2 执行批量审批

```bash
# 默认并发数3
./scripts/batch_approve.sh approval_list.csv

# 指定并发数5
./scripts/batch_approve.sh approval_list.csv 5

# 降低并发数（网络较慢时）
./scripts/batch_approve.sh approval_list.csv 2
```

**预期输出**:
```
========================================
  费控系统批量审批
========================================
清单文件: approval_list.csv
总任务数: 5
并发数: 3
状态文件: /tmp/oa_login_state.json
========================================

🚀 开始批量审批...

[开始] 处理单据: FK20250101001 - 同意
[开始] 处理单据: FK20250101002 - 同意
[开始] 处理单据: FK20250101003 - 驳回
[成功] ✅ FK20250101001 - 同意
[开始] 处理单据: FK20250101004 - 同意
[成功] ✅ FK20250101002 - 同意
[开始] 处理单据: FK20250101005 - 驳回
[成功] ✅ FK20250101003 - 驳回
[成功] ✅ FK20250101004 - 同意
[成功] ✅ FK20250101005 - 驳回

========================================
  批量审批完成
========================================
总数: 5
成功: 5
失败: 0

结果文件: /tmp/oa_batch_results.csv
========================================
```

#### 4.3 查看结果

```bash
# 查看批量审批结果
cat /tmp/oa_batch_results.csv

# 输出示例:
# order_id,status
# FK20250101001,SUCCESS
# FK20250101002,SUCCESS
# FK20250101003,SUCCESS
# FK20250101004,SUCCESS
# FK20250101005,SUCCESS

# 查看某个单据的详细日志
cat /tmp/oa_approve_FK20250101001.log

# 查看所有失败的日志
grep -l "失败\|错误" /tmp/oa_approve_*.log
```

## 调试示例

### 可视化调试

```bash
# 查看登录过程
AGENT_BROWSER_HEADED=1 ./scripts/login.sh

# 查看审批过程
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK20250101001 同意
```

### 查看截图

```bash
# macOS
open /tmp/oa_approve_result.png

# Linux
xdg-open /tmp/oa_approve_result.png

# 查看所有截图
ls -lht /tmp/oa_*.png | head -10
```

## 高级用法

### 场景1: 定时批量审批

```bash
# 创建每日审批清单
cat > daily_approval.sh <<'EOF'
#!/bin/bash
cd /Users/wangyun/.copaw/active_skills/query-oa-approval

# 1. 早上9点登录保存状态
./scripts/login.sh

# 2. 读取当日审批清单（假设从其他系统生成）
if [ -f /path/to/daily_$(date +%Y%m%d).csv ]; then
    ./scripts/batch_approve.sh /path/to/daily_$(date +%Y%m%d).csv 3
fi

# 3. 发送结果通知（可选）
# echo "审批完成" | mail -s "OA审批通知" user@example.com
EOF

chmod +x daily_approval.sh
```

### 场景2: 交互式审批

```bash
# 创建交互式脚本
cat > interactive_approve.sh <<'EOF'
#!/bin/bash
cd /Users/wangyun/.copaw/active_skills/query-oa-approval

echo "OA费控审批助手"
echo "==============="

# 检查登录状态
if [ ! -f /tmp/oa_login_state.json ]; then
    echo "未检测到登录状态，正在登录..."
    ./scripts/login.sh
fi

# 输入单号
read -p "请输入单号: " ORDER_ID
read -p "审批动作 (同意/驳回): " ACTION
read -p "审批意见 (可选): " COMMENT

# 执行审批
./scripts/approve.sh "$ORDER_ID" "$ACTION" "$COMMENT"
EOF

chmod +x interactive_approve.sh
./interactive_approve.sh
```

### 场景3: 审批结果通知

```bash
# 批量审批并发送通知
./scripts/batch_approve.sh approval_list.csv 3

# 检查结果
if grep -q "FAILED" /tmp/oa_batch_results.csv; then
    echo "部分审批失败，请检查日志"
    # 发送失败通知
else
    echo "全部审批成功"
    # 发送成功通知
fi
```

## 常见问题处理

### 问题1: 登录状态过期

```bash
# 现象
# ❌ 未能进入费控系统，可能登录状态已过期

# 解决方案
./scripts/login.sh  # 重新登录
./scripts/approve.sh FK20250101001 同意  # 再次执行审批
```

### 问题2: 单据未找到

```bash
# 现象
# ❌ 未找到单号为 FK20250101001 的单据

# 排查步骤
# 1. 先查询待审批列表
./scripts/query_approval.sh

# 2. 确认单号是否正确
# 3. 确认单据是否在待审批列表中

# 4. 使用可视化模式调试
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK20250101001 同意
```

### 问题3: 批量审批部分失败

```bash
# 查看失败的记录
grep "FAILED" /tmp/oa_batch_results.csv

# 查看失败日志
for order in $(awk -F',' '$2=="FAILED" {print $1}' /tmp/oa_batch_results.csv); do
    echo "=== $order ==="
    cat /tmp/oa_approve_$order.log | tail -20
done

# 重新处理失败的记录
awk -F',' '$2=="FAILED" {print $1",同意,"}' /tmp/oa_batch_results.csv > retry_list.csv
./scripts/batch_approve.sh retry_list.csv 2
```

## 性能参考

### 单个审批

| 操作 | 耗时 |
|------|------|
| 加载登录状态 | ~1秒 |
| 打开费控系统 | ~3秒 |
| 搜索+勾选 | ~2秒 |
| 执行审批 | ~1秒 |
| **总计** | **~7秒** |

### 批量审批（10个单据）

| 并发数 | 耗时 |
|--------|------|
| 1（串行） | ~70秒 |
| 2 | ~40秒 |
| 3 | ~30秒 |
| 5 | ~25秒 |

**建议**: 
- 小批量（<10个）：并发数3
- 中批量（10-50个）：并发数3-5
- 大批量（>50个）：分批执行，每批20-30个

---

**提示**: 首次使用建议先用可视化模式（`AGENT_BROWSER_HEADED=1`）熟悉流程。
