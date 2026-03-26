# 技术实现细节

## 审批操作流程

### approve.sh 详细流程

1. **加载登录状态**
   ```bash
   agent-browser state load /tmp/oa_login_state.json
   ```

2. **直接访问费控**
   - 使用 SSO URL 绕过 OA 首页
   - 自动跳转到费控系统

3. **进入待办**
   - 点击待办菜单
   - 等待页面加载

4. **搜索单号**
   - 在搜索框输入单号
   - 触发搜索事件

5. **勾选单据**
   - 找到对应行
   - 勾选 checkbox

6. **执行审批**
   - 点击"同意"或"驳回"按钮
   - 处理可能的确认弹窗

7. **验证结果**
   - 检查审批是否成功
   - 截图保存证据

---

## JavaScript 交互示例

### 搜索单号

```javascript
// 查找搜索框
const searchBox = document.querySelector('input[placeholder*="单号"]');

// 设置搜索值
searchBox.value = 'FK20250101001';

// 触发 input 事件
searchBox.dispatchEvent(new Event('input', { bubbles: true }));

// 触发 change 事件
searchBox.dispatchEvent(new Event('change', { bubbles: true }));

// 模拟回车搜索
searchBox.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Enter',
  code: 'Enter',
  keyCode: 13,
  bubbles: true
}));
```

### 勾选单据

```javascript
// 查找包含单号的行
const row = Array.from(document.querySelectorAll('tr'))
  .find(r => r.textContent.includes('FK20250101001'));

// 找到 checkbox 并点击
const checkbox = row.querySelector('input[type="checkbox"]');
checkbox.click();

// 验证是否勾选成功
if (checkbox.checked) {
  console.log('单据已成功勾选');
} else {
  console.log('勾选失败，可能需要滚动到可见区域');
}
```

### 点击审批按钮

```javascript
// 查找"同意"按钮
const approveBtn = Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.trim() === '同意');

// 检查按钮是否可用
if (!approveBtn.disabled) {
  approveBtn.click();
  console.log('审批按钮已点击');
} else {
  console.log('审批按钮被禁用，可能未勾选单据');
}

// 查找"驳回"按钮
const rejectBtn = Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.trim() === '驳回');
```

### 填写审批意见

```javascript
// 查找审批意见输入框
const commentBox = document.querySelector('textarea[placeholder*="意见"]');

// 填写意见
commentBox.value = '费用超标，请重新提交';

// 触发事件
commentBox.dispatchEvent(new Event('input', { bubbles: true }));
```

### 处理确认弹窗

```javascript
// 等待确认弹窗出现
setTimeout(() => {
  // 查找确认按钮
  const confirmBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('确定') || b.textContent.includes('确认'));

  if (confirmBtn) {
    confirmBtn.click();
    console.log('确认弹窗已处理');
  }
}, 1000);
```

---

## 主要工具命令

### agent-browser 命令参考

| 命令 | 用途 | 示例 |
|------|------|------|
| `open` | 打开URL | `open "https://oa.xgd.com"` |
| `state save` | 保存状态 | `state save /tmp/state.json` |
| `state load` | 加载状态 | `state load /tmp/state.json` |
| `fill` | 填充表单 | `fill @e6 "username"` |
| `eval` | 执行JS | `eval --stdin <<'EOF' ...` |
| `snapshot -i` | 页面快照 | `snapshot -i` |
| `screenshot` | 截图 | `screenshot /tmp/s.png` |
| `get text` | 提取文本 | `get text body` |
| `wait` | 等待加载 | `wait --load networkidle` |
| `click` | 点击元素 | `click @btn-submit` |
| `type` | 输入文本 | `type @search "FK001"` |

### 元素选择器

```bash
# 使用 CSS 选择器
click "#submit-button"
click ".approval-btn"
click "button[type='submit']"

# 使用 @id 选择器（更稳定）
click @btn-approve
click @input-search

# 使用文本选择器
click "button:contains('同意')"

# 使用组合选择器
click "div.modal button.primary"
```

---

## 等待策略

### 等待页面加载

```bash
# 等待网络空闲
agent-browser wait --load networkidle

# 等待特定元素出现
agent-browser wait --selector "#approval-list"

# 等待固定时间（毫秒）
agent-browser wait --time 2000
```

### 智能等待示例

```bash
# 等待待审批列表加载
wait_for_list() {
  local max_attempts=10
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if agent-browser eval --stdin <<'EOF'
      document.querySelector('#approval-list') !== null
EOF
    then
      echo "列表已加载"
      return 0
    fi

    attempt=$((attempt + 1))
    sleep 1
  done

  echo "等待超时"
  return 1
}
```

---

## 错误处理

### 超时处理

```bash
# 设置超时时间
TIMEOUT=30

# 使用 timeout 命令
timeout $TIMEOUT agent-browser open "https://oa.xgd.com" || {
  echo "页面加载超时"
  exit 1
}
```

### 重试机制

```bash
retry_approval() {
  local max_retries=3
  local retry=0

  while [ $retry -lt $max_retries ]; do
    if ./scripts/approve.sh "$1" "$2" "$3"; then
      echo "审批成功"
      return 0
    fi

    retry=$((retry + 1))
    echo "第 $retry 次重试..."
    sleep 2
  done

  echo "审批失败，已达最大重试次数"
  return 1
}
```

---

## 性能优化技巧

### 减少页面加载时间

```bash
# 1. 使用 state load 跳过登录
agent-browser state load /tmp/oa_login_state.json

# 2. 直接访问目标URL（避免多次跳转）
agent-browser open "https://feikong.xgd.com/todo"

# 3. 禁用不必要的资源加载
agent-browser open --block-images --block-styles "https://oa.xgd.com"
```

### 并发执行

```bash
# 使用后台任务并行执行
approve_async() {
  ./scripts/approve.sh "$1" "$2" "$3" &
}

# 批量启动
approve_async "FK001" "同意" &
approve_async "FK002" "同意" &
approve_async "FK003" "驳回" "费用超标" &

# 等待所有任务完成
wait
```

---

## 调试技巧

### 使用可视化模式

```bash
# 启用 headed 模式
export AGENT_BROWSER_HEADED=1

# 或在命令前添加
AGENT_BROWSER_HEADED=1 ./scripts/approve.sh FK001 同意
```

### 详细日志

```bash
# 启用调试日志
export AGENT_BROWSER_DEBUG=1

# 或在命令中添加
agent-browser --verbose open "https://oa.xgd.com"
```

### 截图调试

```bash
# 在关键步骤截图
screenshot_step() {
  local step_name=$1
  local timestamp=$(date +%Y%m%d_%H%M%S)
  agent-browser screenshot "/tmp/debug_${step_name}_${timestamp}.png"
}

# 使用
screenshot_step "before_search"
agent-browser type @search "FK001"
screenshot_step "after_search"
```

---

## 安全考虑

### 密码保护

```bash
# 不要在脚本中硬编码密码
# ❌ 错误示例
PASSWORD="my_password_123"

# ✅ 正确示例：使用环境变量
PASSWORD=$OA_USER_PASSWD

# ✅ 正确示例：从安全存储读取
PASSWORD=$(security find-generic-password -a "$USER" -s "oa-password" -w)
```

### 状态文件保护

```bash
# 设置严格的文件权限
chmod 600 /tmp/oa_login_state.json

# 定期清理
find /tmp -name "oa_*.json" -mtime +1 -delete
```

### 审计日志

```bash
# 记录审批操作
log_approval() {
  local order_id=$1
  local action=$2
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  echo "[$timestamp] 审批操作: $order_id - $action" >> /var/log/oa_approval.log
}

# 使用
log_approval "FK001" "同意"
```
