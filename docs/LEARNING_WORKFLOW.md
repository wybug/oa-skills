# 页面学习工作流 (Page Learning Workflow)

## 概述

当遇到新的页面结构或不确定的操作流程时，使用此工作流来学习和理解页面元素，然后更新自动化脚本。

## 工作流程

### 1. 启动学习模式

```bash
# 使用 --wait 参数停留在目标页面
oa-todo approve --wait <fdId> <action>

# 例如：学习驳回流程
oa-todo approve --wait 1862fcf9fc8e864009220764132a4911 驳回
```

### 2. 页面停留在关键界面

浏览器会打开并停留在审批页面，此时可以：
- 手动检查页面元素
- 执行 agent-browser 命令探索
- 测试不同的操作流程

### 3. 手动探索页面

使用 agent-browser 命令探索页面结构：

```bash
# 设置会话名称（根据终端显示的session名称）
SESSION="oa-todo-xxxxxxxxx"

# 获取页面快照
npx agent-browser --session $SESSION snapshot > /tmp/page_snapshot.txt

# 查找特定元素
grep -E "(button|radio|select|textarea)" /tmp/page_snapshot.txt

# 执行JavaScript获取元素信息
cat > /tmp/analyze.js << 'EOF'
(() => {
  // 分析代码
  return result;
})()
EOF
npx agent-browser --session $SESSION eval --stdin < /tmp/analyze.js

# 测试点击元素
npx agent-browser --session $SESSION click "selector"

# 测试填写表单
npx agent-browser --session $SESSION type "textarea" "测试内容"
```

### 4. 记录发现

在本文档中记录页面结构信息：

```markdown
## 页面名称：XXX审批页

### URL模式
```
https://oa.xgd.com/xxx/path?method=view&fdId={fdId}
```

### 关键元素

| 元素 | 选择器 | 类型 | 值/文本 | 备注 |
|------|--------|------|---------|------|
| 通过按钮 | `input[value="handler_pass:通过"]` | radio | - | name="oprGroup" |
| 驳回按钮 | `input[value="handler_superRefuse:驳回"]` | radio | - | name="oprGroup" |
| 提交按钮 | `input[value="提交"]` | button | - | type="button" |
| 意见框 | `textarea` | textarea | - | 默认"同意" |

### 操作流程

1. 点击对应动作的单选按钮
2. [可选] 填写审批意见
3. 点击提交按钮
```

### 5. 更新自动化脚本

根据发现更新 `src/lib/browser.js`：

```javascript
async approveWorkflow(action, comment = '') {
  // 1. 点击动作按钮
  const clickRadioJs = `(() => {
    const targetRadio = Array.from(document.querySelectorAll('input[type="radio"]'))
      .find(r => r.value.includes('${action}'));
    if (targetRadio) {
      targetRadio.click();
      return { success: true };
    }
    return { success: false };
  })()`;

  // 执行点击...

  // 2. [如果有] 处理特殊选项
  if (action === '驳回') {
    // 选择驳回节点
  }

  // 3. 填写意见
  // ...

  // 4. 提交
  // ...
}
```

### 6. 验证并测试

```bash
# 使用调试模式观察执行过程
oa-todo approve --debug <fdId> <action>

# 确认无误后正常执行
oa-todo approve <fdId> <action>
```

## 已学习的页面

### 1. 流程审批页面

**URL:** `https://oa.xgd.com/sys/notify/sys_notify_todo/sysNotifyTodo.do?method=view&fdId={fdId}`

**关键元素:**

| 元素 | 选择器 | 类型 | 说明 |
|------|--------|------|------|
| 通过 | `input[value="handler_pass:通过"]` | radio | name="oprGroup" |
| 驳回 | `input[value="handler_superRefuse:驳回"]` | radio | name="oprGroup" |
| 转办 | `input[value="handler_commission:转办"]` | radio | name="oprGroup" |
| 驳回节点 | `select[name="jumpToNodeIdSelectObj"]` | select | 驳回时显示 |
| 审批意见 | `textarea` | textarea | 默认"同意" |
| 提交 | `input[value="提交"]` | button | type="button" |

**特殊处理:**
- 选择"驳回"后，需要从 `jumpToNodeIdSelectObj` 下拉框选择驳回节点
- 默认选择第一个选项（通常是起草节点）

### 2. 会议邀请页面

**URL:** 会议详情页面（重定向后）

**关键元素:**

| 元素 | 选择器 | 类型 | 说明 |
|------|--------|------|------|
| 参加 | `input` (label包含"参加") | radio/checkbox | - |
| 不参加 | `input` (label包含"不参加") | radio/checkbox | - |
| 提交 | `.lui_toolbar_btn_l` 或 text="提交" | button/div | - |

## 学习检查清单

当遇到新页面时，按以下清单学习：

- [ ] 启动 `--wait` 模式停留在页面
- [ ] 获取页面快照保存到文件
- [ ] 识别所有表单元素（按钮、输入框、下拉框）
- [ ] 记录每个元素的 selector、type、value
- [ ] 测试关键操作流程
- [ ] 记录特殊处理需求（如驳回时的节点选择）
- [ ] 更新浏览器封装代码
- [ ] 使用 `--debug` 模式验证
- [ ] 更新本文档记录新页面

## 调试技巧

### 快速探索命令

```bash
# 查找所有按钮
npx agent-browser --session $SESSION eval "
  Array.from(document.querySelectorAll('button, input[type=\"button\"]'))
    .map(b => ({ text: b.textContent, value: b.value, type: b.type }))
"

# 查找所有单选按钮
npx agent-browser --session $SESSION eval "
  Array.from(document.querySelectorAll('input[type=\"radio\"]'))
    .map(r => ({ name: r.name, value: r.value, checked: r.checked }))
"

# 查找所有下拉框
npx agent-browser --session $SESSION eval "
  Array.from(document.querySelectorAll('select'))
    .map(s => ({ name: s.name, options: Array.from(s.options).map(o => o.text) }))
"

# 查找可见元素
npx agent-browser --session $SESSION eval "
  Array.from(document.querySelectorAll('*'))
    .filter(el => el.offsetParent !== null && el.textContent.trim().includes('关键字'))
    .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 50) }))
"
```

### 常见问题排查

**问题：找不到元素**
```bash
# 检查元素是否在iframe中
npx agent-browser --session $SESSION eval "document.querySelectorAll('iframe').length"

# 检查元素是否可见
npx agent-browser --session $SESSION eval "document.querySelector('selector')?.offsetParent !== null"
```

**问题：点击无响应**
```bash
# 检查元素是否被遮挡
npx agent-browser --session $SESSION eval "
  const el = document.querySelector('selector');
  const rect = el.getBoundingClientRect();
  return { visible: rect.width > 0 && rect.height > 0 };
"
```

## 相关命令

| 命令 | 说明 |
|------|------|
| `oa-todo approve --wait <fdId> <action>` | 停留在审批页面学习 |
| `oa-todo approve --debug <fdId> <action>` | 调试模式观察执行 |
| `npx agent-browser --session <name> snapshot` | 获取页面快照 |
| `npx agent-browser --session <name> eval --stdin < file.js` | 执行JavaScript文件 |
| `npx agent-browser --session <name> close` | 关闭浏览器会话 |

## 自动化脚本位置

| 脚本 | 路径 | 说明 |
|------|------|------|
| Browser类 | `src/lib/browser.js` | 核心浏览器封装 |
| 审批命令 | `src/commands/approve.js` | 审批逻辑 |
| CLI入口 | `bin/oa-todo.js` | 命令行接口 |
