# AI 开发 RPA 脚本指南

本指南面向 AI 辅助开发 OA 系统的 RPA 自动化脚本，使用 `oa-todo explore --pause` 命令提供支持。

## 1. 快速开始

### 1.1 启动探索会话

```bash
# 创建暂停会话（自动提供 agentUXContext）
oa-todo explore "<目标URL>" --pause

# 示例：探索会议管理页面
oa-todo explore "https://oa.xgd.com/km/imeeting/index.jsp" --pause

# 示例：探索待办详情页面
oa-todo explore "https://oa.xgd.com/km/review/km_review_main/kmReviewMain.do?method=view&fdId=<ID>" --pause
```

### 1.2 会话输出格式

```json
{
  "status": "checkpoint_created",
  "session": "oa-todo-explore-explore-1234567890-xxxxx",
  "url": "https://oa.xgd.com/...",
  "timeout": 600,
  "agentUXContext": "// OA 操作脚本...\n# 探索智能体引导文件..."
}
```

**关键字段**:
- `session`: 浏览器会话 ID，用于后续操作
- `agentUXContext`: 包含完整的操作脚本模板和引导文档

## 2. 两种操作方式

### 2.1 方式1: HTTP API 请求（推荐用于数据查询）

对于纯数据获取操作（如查询会议室、获取待办列表），使用 HTTP 请求更加高效：

```javascript
// 在 agentUXContext 中可直接使用的代码模板
const response = await OATools.http(
  'https://oa.xgd.com/km/imeeting/km_imeeting_calendar/kmImeetingCalendar.do?method=rescalendar&t=' + Date.now() + '&pageno=1&selectedCategories=all&fdStart=2026-03-24+00%3A00&fdEnd=2026-03-26+00%3A00&s_seq=' + Math.random() + '&s_ajax=true',
  { referer: 'https://oa.xgd.com/km/imeeting/km_imeeting_calendar/index_content_place.jsp' }
);

if (response.ok) {
  const rooms = Object.values(response.data.main || {});
  console.log('会议室总数:', rooms.length);
  rooms.forEach((room, i) => {
    console.log((i+1) + '.', room.name, '-', room.floor, room.seats + '人');
  });
} else {
  console.error('请求失败:', response.status, response.error);
}
```

**OATools.http 参数说明**:
- `url` (string): API 端点 URL
- `options.method` (string): HTTP 方法，默认 'GET'
- `options.headers` (Object): 自定义请求头
- `options.body` (string): 请求体（POST/PUT 时使用）
- `options.timeout` (number): 超时时间（毫秒），默认 30000
- `options.referer` (string): Referer 头（OA 系统需要）

**返回值**:
- `status` (number): HTTP 状态码
- `ok` (boolean): 请求是否成功
- `data` (any): 响应数据（JSON 或文本）
- `headers` (Object): 响应头

### 2.2 方式2: 浏览器操作（用于页面交互）

对于需要页面交互的操作（填写表单、点击按钮等），使用浏览器操作：

```javascript
// 获取页面快照
const snapshot = await OATools.browser(session, 'snapshot');

// 点击按钮
await OATools.browser(session, 'click', { selector: '#submit-btn' });

// 填写表单
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#input-field").value = "test"'
});

// 等待元素出现
await OATools.browser(session, 'wait', { selector: '.result' });

// 截图保存
await OATools.browser(session, 'screenshot', { path: '/tmp/screenshot.png' });
```

**OATools.browser 参数说明**:
- `session` (string): 浏览器会话 ID（从 checkpoint 输出获取）
- `action` (string): 操作类型
  - `click`: 点击元素
  - `eval`: 执行 JavaScript
  - `snapshot`: 获取页面快照
  - `wait`: 等待条件
  - `screenshot`: 截图
- `params` (Object): 操作参数（根据 action 不同而不同）

## 3. URL 监听与追踪

### 3.1 获取当前页面信息

```javascript
// 获取主页面 URL
const currentUrl = await OATools.browser(session, 'eval', {
  code: 'window.location.href'
}).then(output => output.trim().replace(/^['"]|['"]$/g, ''));
console.log('当前 URL:', currentUrl);

// 获取页面标题
const pageTitle = await OATools.browser(session, 'eval', {
  code: 'document.title'
}).then(output => output.trim().replace(/^['"]|['"]$/g, ''));
console.log('页面标题:', pageTitle);

// 获取所有 iframe 的 URL
const iframeUrls = await OATools.browser(session, 'eval', {
  code: 'Array.from(document.querySelectorAll("iframe")).map(f => ({ src: f.src, id: f.id, name: f.name }))'
}).then(output => JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] || '{}'));
console.log('Iframe URLs:', iframeUrls);
```

### 3.2 监听页面变化

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

## 4. 页面分析框架

### 4.1 获取页面快照

```bash
agent-browser --session <session> snapshot
```

### 4.2 识别表单字段

```javascript
// 获取所有表单字段
const fields = await OATools.browser(session, 'eval', {
  code: 'Array.from(document.querySelectorAll("input, select, textarea")).map(e => ({tag: e.tagName, type: e.type, id: e.id, name: e.name, placeholder: e.placeholder})).slice(0, 20)'
}).then(output => JSON.parse(output.match(/\[[\s\S]*\]/)?.[0] || '[]'));

console.log('表单字段:', fields);
```

### 4.3 识别操作按钮

```javascript
// 获取所有按钮
const buttons = await OATools.browser(session, 'eval', {
  code: 'Array.from(document.querySelectorAll("button, input[type=submit], input[type=button]")).map(b => ({text: b.textContent || b.value, id: b.id, className: b.className})).slice(0, 20)'
}).then(output => JSON.parse(output.match(/\[[\s\S]*\]/)?.[0] || '[]'));

console.log('页面按钮:', buttons);
```

### 4.4 查找特定元素

```javascript
// 查找包含特定文本的元素
const element = await OATools.browser(session, 'eval', {
  code: 'Array.from(document.querySelectorAll("*")).find(e => e.textContent.includes("提交") && (e.tagName === "BUTTON" || e.tagName === "A"))?.id'
}).then(output => output.trim().replace(/^['"]|['"]$/g, ''));

console.log('提交按钮 ID:', element);
```

## 5. 完整脚本示例

### 5.1 会议室查询脚本

```javascript
// getMeetingRooms.js
const fs = require('fs');

// 从状态文件中提取 Cookie
const stateFile = '/Users/wangyun/.oa-todo/login_state.json';
const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const cookie = stateData.cookies.map(c => `${c.name}=${c.value}`).join('; ');

// OA 系统请求配置
const OATools = {
  async http(url, options = {}) {
    const opts = {
      method: options.method || 'GET',
      headers: {
        'Cookie': cookie,
        'Accept': 'text/plain, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': options.referer || 'https://oa.xgd.com/',
        ...options.headers
      },
      timeout: options.timeout || 30000
    };

    const response = await fetch(url, opts);
    const data = await response.json();

    return {
      status: response.status,
      ok: response.ok,
      data
    };
  }
};

// 获取会议室数据
async function getMeetingRooms(startDate, endDate) {
  const url = `https://oa.xgd.com/km/imeeting/km_imeeting_calendar/kmImeetingCalendar.do?method=rescalendar&t=${Date.now()}&pageno=1&selectedCategories=all&fdStart=${startDate}+00%3A00&fdEnd=${endDate}+00%3A00&s_seq=${Math.random()}&s_ajax=true`;

  const response = await OATools.http(url, {
    referer: 'https://oa.xgd.com/km/imeeting/km_imeeting_calendar/index_content_place.jsp'
  });

  if (response.ok) {
    const rooms = Object.values(response.data.main || {});
    return {
      total: response.data.resource.total,
      rooms: rooms.map(r => ({
        name: r.name,
        floor: r.floor,
        seats: r.seats,
        bookings: (r.list || []).map(b => ({
          title: b.title,
          start: b.start,
          end: b.end,
          status: b.statusText
        }))
      }))
    };
  }
  throw new Error(`请求失败: ${response.status}`);
}

// 使用示例
(async () => {
  const result = await getMeetingRooms('2026-03-24', '2026-03-26');
  console.log(`会议室总数: ${result.total}`);
  result.rooms.forEach(room => {
    console.log(`${room.name} (${room.floor}, ${room.seats}人) - 今日${room.bookings.length}场预约`);
  });
})();
```

### 5.2 表单填写脚本

```javascript
// fillForm.js
const { execSync } = require('child_process');

const session = 'oa-todo-explore-explore-1234567890-xxxxx';

// OA 系统浏览器操作
const OATools = {
  async browser(action, params = {}) {
    const { execSync } = require('child_process');
    let cmd = `agent-browser --session ${session}`;

    switch (action) {
      case 'click':
        cmd += ` click --selector "${params.selector}"`;
        break;
      case 'eval':
        cmd += ` eval "${params.code.replace(/"/g, '\\"')}"`;
        break;
      case 'wait':
        if (params.selector) {
          cmd += ` wait --selector "${params.selector}"`;
        } else if (params.time) {
          cmd += ` wait --time ${params.time}`;
        } else {
          cmd += ` wait --load networkidle`;
        }
        break;
    }

    return execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  }
};

// 填写会议室预约表单
async function bookMeetingRoom(data) {
  // 选择日期
  await OATools.browser('eval', {
    code: `document.querySelector("#fdDate").value = "${data.date}"`
  });

  // 选择时间
  await OATools.browser('eval', {
    code: `document.querySelector("#fdStartTime").value = "${data.startTime}"`
  });
  await OATools.browser('eval', {
    code: `document.querySelector("#fdEndTime").value = "${data.endTime}"`
  });

  // 选择会议室
  await OATools.browser('eval', {
    code: `document.querySelector("#fdPlaceId").value = "${data.roomId}"`
  });

  // 填写主题
  await OATools.browser('eval', {
    code: `document.querySelector("#fdTopic").value = "${data.topic}"`
  });

  // 点击提交
  await OATools.browser('click', { selector: '#btn-submit' });

  // 等待提交完成
  await OATools.browser('wait', { selector: '.success-message' });
}

// 使用示例
(async () => {
  await bookMeetingRoom({
    date: '2026-03-25',
    startTime: '14:00',
    endTime: '16:00',
    roomId: 'xxx',
    topic: '项目讨论会议'
  });
  console.log('预约成功！');
})();
```

### 5.3 待办审批脚本

```javascript
// approveTodo.js
const { execSync } = require('child_process');

const session = 'oa-todo-explore-explore-1234567890-xxxxx';

const OATools = {
  async browser(action, params = {}) {
    let cmd = `agent-browser --session ${session}`;
    // ... (同上)
  }
};

// 审批待办
async function approveTodo(fdId, action, comment = '') {
  // 打开待办详情
  await OATools.browser('eval', {
    code: `window.location.href = "https://oa.xgd.com/km/review/km_review_main/kmReviewMain.do?method=view&fdId=${fdId}"`
  });

  // 等待页面加载
  await OATools.browser('wait', { time: 2000 });

  // 点击审批按钮
  const buttonMap = {
    '同意': '#btn-agree',
    '驳回': '#btn-reject',
    '通过': '#btn-pass',
    '转办': '#btn-transfer'
  };

  const selector = buttonMap[action];
  if (!selector) {
    throw new Error(`未知操作: ${action}`);
  }

  await OATools.browser('click', { selector });

  // 如果有审批意见，填写意见
  if (comment) {
    await OATools.browser('wait', { selector: '#fdOpinion' });
    await OATools.browser('eval', {
      code: `document.querySelector("#fdOpinion").value = "${comment}"`
    });
  }

  // 确认提交
  await OATools.browser('click', { selector: '#btn-submit' });

  // 等待提交完成
  await OATools.browser('wait', { selector: '.success-message' });
}

// 使用示例
(async () => {
  await approveTodo('xxx', '同意', '同意该申请');
  console.log('审批成功！');
})();
```

## 6. 调试技巧

### 6.1 使用 snapshot 分析页面

```bash
# 获取页面快照
agent-browser --session <session> snapshot

# 保存快照到文件
agent-browser --session <session> snapshot > /tmp/page_snapshot.txt
```

### 6.2 使用 eval 测试代码

```bash
# 测试元素查找
agent-browser --session <session> eval "document.querySelector('#submit-btn') !== null"

# 获取元素属性
agent-browser --session <session> eval "JSON.stringify({id: document.querySelector('#someElement').id, className: document.querySelector('#someElement').className})"

# 列出所有表单字段
agent-browser --session <session> eval "Array.from(document.querySelectorAll('input, select, textarea')).map(e => ({tag: e.tagName, type: e.type, id: e.id, name: e.name}))"
```

### 6.3 使用 screenshot 可视化

```bash
# 截图保存
agent-browser --session <session> screenshot /tmp/debug.png

# 在 macOS 中打开查看
open /tmp/debug.png
```

## 7. 会话管理

### 7.1 关闭会话

```bash
oa-todo explore --close <sessionId>
```

### 7.2 会话续期

同一 URL 重复调用会自动续期：

```bash
# 第一次调用：创建会话
oa-todo explore "https://oa.xgd.com/km/imeeting/index.jsp" --pause

# 第二次调用：自动续期（延长超时时间）
oa-todo explore "https://oa.xgd.com/km/imeeting/index.jsp" --pause
```

### 7.3 超时设置

```bash
# 设置超时时间为 20 分钟
oa-todo explore "<URL>" --pause --timeout 20
```

## 8. 常见场景

### 8.1 会议室查询 - 内置命令

`oa-todo rooms` 是内置的会议室查询命令，无需开发即可直接使用：

```bash
# 查询今天
oa-todo rooms

# 查询指定日期 (YYYY-MM-DD 格式)
oa-todo rooms 2026-03-25

# 查询指定日期 (YYYYMMDD 简写格式)
oa-todo rooms 20260325
```

**输出信息**：
- 会议室列表（按楼层分组）
- 占用情况统计
- 可用会议室列表
- 每个会议室的可用时间段
- JSON数据导出（保存到 /tmp/meeting_rooms_YYYYMMDD.json）

**技术说明**：
- 自动处理登录状态
- 与 sync 命令独立，使用独立的登录会话
- 内部使用 HTTP API 获取数据，高效可靠

### 8.2 自定义会议室查询脚本

如果需要自定义数据处理逻辑，可以使用 `explore --pause` 开发自己的脚本：

```javascript
// 1. 创建会话
// oa-todo explore "https://oa.xgd.com/km/imeeting/index.jsp" --pause

// 2. 使用 HTTP API 获取数据
const response = await OATools.http(
  'https://oa.xgd.com/km/imeeting/km_imeeting_calendar/kmImeetingCalendar.do?method=rescalendar&t=' + Date.now() + '&pageno=1&selectedCategories=all&fdStart=2026-03-24+00%3A00&fdEnd=2026-03-24+00%3A00&s_seq=' + Math.random() + '&s_ajax=true',
  { referer: 'https://oa.xgd.com/km/imeeting/km_imeeting_calendar/index_content_place.jsp' }
);

// 3. 解析数据
const rooms = Object.values(response.data.main || {});
rooms.forEach(room => {
  console.log(`${room.name} - ${room.floor} - ${room.seats}人`);
  const bookingsToday = (room.list || []).filter(b => b.start.includes('2026-03-24'));
  console.log(`  今日预约: ${bookingsToday.length}场`);
});
```

**注意**：单天查询时 OA API 不会返回预约数据，需要扩展日期范围（前后各一天）并在结果中筛选。

### 8.3 请假申请

```javascript
// 1. 创建会话
// oa-todo explore "https://oa.xgd.com/km/ehr/km_ehr_leave/kmEhrLeave.do?method=add" --pause

// 2. 填写表单
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fdLeaveType").value = "年假"'
});
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fdStartTime").value = "2026-03-25 09:00"'
});
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fdEndTime").value = "2026-03-25 18:00"'
});
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fdReason").value = "个人事务"'
});

// 3. 提交
await OATools.browser(session, 'click', { selector: '#btn-submit' });
```

### 8.4 费用报销

```javascript
// 1. 创建会话
// oa-todo explore "https://oa.xgd.com/km/expense/km_expense_main/kmExpenseMain.do?method=add" --pause

// 2. 填写表单
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fdAmount").value = "1000.00"'
});
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fdType").value = "交通费"'
});
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fdReason").value = "客户出差交通费用"'
});

// 3. 上传附件
await OATools.browser(session, 'eval', {
  code: 'document.querySelector("#fileUpload").click()'
});
// (需要额外的文件上传处理逻辑)

// 4. 提交
await OATools.browser(session, 'click', { selector: '#btn-submit' });
```

## 9. 错误处理

### 9.1 常见错误

| 错误类型 | 描述 | 处理方式 |
|---------|------|----------|
| LOGIN_EXPIRED | 登录状态过期 | 重新登录 |
| ELEMENT_NOT_FOUND | 元素未找到 | 检查选择器，使用 snapshot 分析页面 |
| TIMEOUT | 操作超时 | 增加等待时间或检查网络 |
| ACCESS_DENIED | 无权访问 | 检查权限或联系管理员 |

### 9.2 错误处理示例

```javascript
async function safeExecute(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      console.log(`重试 ${i + 1}/${retries}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// 使用示例
await safeExecute(async () => {
  await OATools.browser(session, 'click', { selector: '#submit-btn' });
});
```

## 10. 参考资料

- [oa-todo README](../README.md)
- [项目 CLAUDE.md](../../CLAUDE.md)
- [explore 命令文档](../src/agents/explore-agent.md)
