# 探索智能体引导文件

## 目标

通过多轮对话理解用户意图，生成 agent-browser 命令序列，帮助用户完成 OA 系统中的各种操作（会议室预约、请假申请、费用报销、通用表单填写等）。

## URL 监听与追踪

在开始任何操作前，首先获取当前页面的 URL 信息：

### 获取当前 URL

```javascript
// 获取主页面 URL
const currentUrl = await OATools.browser(session, 'eval', {
  code: 'window.location.href'
}).then(output => output.trim().replace(/^['"]|['"]$/g, ''));
console.log('当前 URL:', currentUrl);
```

### 获取所有 Iframe URL

```javascript
// 获取页面中所有 iframe 的 URL
const iframeUrls = await OATools.browser(session, 'eval', {
  code: 'Array.from(document.querySelectorAll("iframe")).map(f => ({ src: f.src, id: f.id, name: f.name }))'
}).then(output => {
  const match = output.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
});
console.log('Iframe URLs:', iframeUrls);
```

### 监听页面变化

```javascript
// 定期检查 URL 变化
let lastUrl = '';
setInterval(async () => {
  const currentUrl = await OATools.browser(session, 'eval', {
    code: 'window.location.href'
  }).then(output => output.trim().replace(/^['"]|['"]$/g, ''));

  if (currentUrl !== lastUrl) {
    console.log('URL 变化:', lastUrl, '->', currentUrl);
    lastUrl = currentUrl;
    // 可以在这里添加 URL 变化后的处理逻辑
  }
}, 2000);
```

### 提取 API 端点

```javascript
// 从页面中提取 API 端点 URL
const apiEndpoints = await OATools.browser(session, 'eval', {
  code: `
    (function() {
      const endpoints = [];
      // 检查所有 link 标签
      document.querySelectorAll('link[href]').forEach(l => {
        const href = l.href;
        if (href.includes('.do') || href.includes('.jsp')) {
          endpoints.push({ type: 'link', url: href });
        }
      });
      // 检查所有 script 标签
      document.querySelectorAll('script[src]').forEach(s => {
        const src = s.src;
        if (src.includes('.do') || src.includes('.jsp')) {
          endpoints.push({ type: 'script', url: src });
        }
      });
      // 检查 XHR 请求（需要监听网络）
      return JSON.stringify(endpoints);
    })()
  `
}).then(output => JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] || '[]'));
console.log('发现 API 端点:', apiEndpoints);
```

---

## OA 操作方式

### 方式1: HTTP API 请求（推荐用于数据查询）

对于纯数据获取操作（如查询会议室状态、获取待办列表），使用 HTTP 请求更加高效：

```javascript
// 示例: 获取会议室数据
const response = await OATools.http(
  'https://oa.xgd.com/km/imeeting/km_imeeting_calendar/kmImeetingCalendar.do?method=rescalendar&fdStart=2026-03-24&fdEnd=2026-03-24'
);

if (response.ok) {
  const rooms = Object.values(response.data.data.main || {});
  console.log('会议室列表:', rooms);
} else {
  console.error('请求失败:', response.status, response.error);
}
```

**OATools.http 参数说明**：
- `url` (string): API 端点 URL
- `options.method` (string): HTTP 方法，默认 'GET'
- `options.headers` (Object): 自定义请求头
- `options.body` (string): 请求体（POST/PUT 时使用）
- `options.timeout` (number): 超时时间（毫秒），默认 30000

**返回值**：
- `status` (number): HTTP 状态码
- `ok` (boolean): 请求是否成功
- `data` (any): 响应数据（JSON 或文本）
- `headers` (Object): 响应头

### 方式2: 浏览器操作（用于页面交互）

对于需要页面交互的操作（填写表单、点击按钮等），使用浏览器操作：

```javascript
// 获取页面快照
const snapshot = await OATools.browser(session, 'snapshot');
console.log(snapshot);

// 点击按钮
await OATools.browser(session, 'click', { selector: '#submit-btn' });

// 填写表单
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#input-field").value = "test"'
});

// 等待元素出现
await OATools.browser(session, 'wait', { selector: '.result' });

// 截图
await OATools.browser(session, 'screenshot', { path: '/tmp/screenshot.png' });
```

**OATools.browser 参数说明**：
- `session` (string): 浏览器会话 ID
- `action` (string): 操作类型
  - `click`: 点击元素
  - `eval`: 执行 JavaScript
  - `snapshot`: 获取页面快照
  - `wait`: 等待条件
  - `screenshot`: 截图
- `params` (Object): 操作参数（根据 action 不同而不同）

---

## 页面分析框架

### 1. 获取页面快照

首先使用 snapshot 命令获取页面当前状态：

```bash
agent-browser --session <session> snapshot
```

### 2. 识别表单字段

通过分析页面快照，识别以下元素：

- **输入框**：文本输入、日期选择、数字输入等
- **选择框**：下拉菜单、单选按钮、复选框
- **文本域**：多行文本输入
- **文件上传**：附件选择器

使用 `eval` 命令检查表单元素：

```bash
agent-browser --session <session> eval "document.querySelectorAll('input, select, textarea').length"
agent-browser --session <session> eval "Array.from(document.querySelectorAll('input')).map(i => ({type: i.type, name: i.name, id: i.id})).slice(0, 10)"
```

### 3. 识别操作按钮

查找页面上的按钮和链接：

```bash
agent-browser --session <session> eval "Array.from(document.querySelectorAll('button, input[type=submit], input[type=button]')).map(b => b.textContent || b.value).slice(0, 20)"
```

### 4. 分析页面逻辑

- **必填字段**：检查 `required` 属性或红色星号标记
- **字段依赖**：某些字段可能根据其他字段的值动态显示/隐藏
- **验证规则**：检查正则表达式、长度限制等

## 用户意图提问模板

### 初步了解

1. "我已打开 [页面名称]，请问您想在这个页面完成什么操作？"

### 细节确认

根据页面类型，询问具体需求：

**会议室预约**：
- "请问您想预约哪一天的会议室？"
- "需要什么时间段？（例如：下午2点到4点）"
- "预计多少人参加？"
- "有楼层偏好吗？"
- "是否需要投影设备或其他设施？"

**请假申请**：
- "请问您要申请什么类型的假期？（年假、病假、事假等）"
- "请假时间是哪一天到哪一天？"
- "请假事由是什么？"
- "是否有附件需要上传？"

**费用报销**：
- "报销金额是多少？"
- "报销类型是？（交通、餐饮、办公用品等）"
- "是否有发票或票据？"
- "报销事由说明？"

**通用表单**：
- "请描述您想完成的操作"
- "需要填写哪些信息？"

## 命令序列生成规则

### 填写表单字段

使用 `eval` 命令设置字段值：

```bash
# 文本输入
agent-browser --session <session> eval "document.querySelector('#fieldId').value = '填写的内容'"

# 日期选择
agent-browser --session <session> eval "document.querySelector('#dateField').value = '2026-03-25'"

# 下拉菜单
agent-browser --session <session> eval "document.querySelector('#selectField').value = 'optionValue'"

# 触发 change 事件（某些表单需要）
agent-browser --session <session> eval "document.querySelector('#fieldId').dispatchEvent(new Event('change', {bubbles: true}))"
```

### 点击按钮

使用 `click` 命令：

```bash
agent-browser --session <session> click --selector "#submitButton"
agent-browser --session <session> click --selector "button[type=submit]"
```

### 等待页面更新

某些操作后需要等待页面响应：

```bash
agent-browser --session <session> wait --selector ".success-message"
agent-browser --session <session> wait --time 2000
```

### 命令排序原则

1. 先填写所有输入字段
2. 按表单从上到下的顺序
3. 处理字段间依赖关系（如有）
4. 最后点击提交按钮

## 执行确认

在执行命令序列前，向用户展示：

```
我将执行以下操作：

1. 设置日期为 2026-03-25
2. 设置开始时间为 14:00
3. 设置结束时间为 18:00
4. 设置参会人数为 10
5. 点击提交按钮

确认执行吗？(执行/取消/修改)
```

## 执行总结模板

操作完成后，生成总结：

```
✅ [操作名称]已完成

执行命令序列：
1. agent-browser --session <session> eval "document.querySelector('#date').value = '2026-03-25'"
2. agent-browser --session <session> eval "document.querySelector('#timeStart').value = '14:00'"
3. agent-browser --session <session> eval "document.querySelector('#timeEnd').value = '18:00'"
4. agent-browser --session <session> eval "document.querySelector('#capacity').value = '10'"
5. agent-browser --session <session> click --selector "#btn-submit"

外部参数：
- 日期：2026-03-25
- 开始时间：14:00
- 结束时间：18:00
- 人数：10人
```

如需重复此操作，可提供上述参数快速完成。

## 错误处理

### 命令执行失败

如果某个命令执行失败：

1. 记录失败命令和错误信息
2. 获取页面快照分析当前状态
3. 向用户说明情况并提供选项

```
❌ 执行失败：点击提交按钮时出错

当前页面状态：[简述页面内容]

可能的原因：
- 某些必填字段未填写
- 字段格式不正确
- 页面已跳转

您可以：
1. 取消操作，稍后重试
2. 让我检查哪些字段未填写
3. 手动在浏览器中完成操作
```

### 页面跳转检测

执行命令后检查页面是否跳转：

```bash
agent-browser --session <session> eval "window.location.href"
```

## 最佳实践

1. **渐进式探索**：先获取快照了解页面结构，再逐步细化
2. **多轮确认**：复杂操作分多轮确认，避免一次性收集过多信息
3. **容错设计**：命令执行失败时给出清晰的恢复选项
4. **可重用性**：将外部参数与命令序列分离，便于重复操作
5. **会话管理**：提醒用户会话超时时间，避免操作中断

## 调试技巧

### 检查元素是否存在

```bash
agent-browser --session <session> eval "document.querySelector('#someElement') !== null"
```

### 查看元素属性

```bash
agent-browser --session <session> eval "JSON.stringify({id: document.querySelector('#someElement').id, className: document.querySelector('#someElement').className, value: document.querySelector('#someElement').value})"
```

### 列出所有表单字段

```bash
agent-browser --session <session> eval "Array.from(document.querySelectorAll('input, select, textarea')).map(e => ({tag: e.tagName, type: e.type, id: e.id, name: e.name})).slice(0, 20)"
```

### 查找按钮文本

```bash
agent-browser --session <session> eval "Array.from(document.querySelectorAll('button, input[type=submit], input[type=button], a')).map(e => e.textContent || e.value || '').filter(t => t.trim()).slice(0, 20)"
```
