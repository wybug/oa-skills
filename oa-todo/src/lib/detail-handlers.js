/**
 * 详情页处理器 - 按类型分离处理逻辑
 */

const chalk = require('chalk');

/**
 * 详情页处理器基类
 */
class BaseDetailHandler {
  constructor(browser, todo) {
    this.browser = browser;
    this.todo = todo;
  }

  /**
   * 检测详情页是否可审批
   */
  async isApprovable() {
    const snapshot = await this.browser.snapshot();
    return this._hasSubmitButtons(snapshot);
  }

  _hasSubmitButtons(snapshot) {
    const submitKeywords = ['提交', '确定', '保存'];
    return submitKeywords.some(keyword =>
      snapshot.includes(keyword) && !snapshot.includes('已' + keyword)
    );
  }

  /**
   * 提取表单数据（子类实现）
   */
  async extractFormData(allTables) {
    throw new Error('子类必须实现 extractFormData');
  }

  /**
   * 获取支持的审批动作
   */
  getSupportedActions() {
    return [];
  }

  /**
   * 处理详情页
   */
  async handle(allTables) {
    const formData = await this.extractFormData(allTables);
    const isApprovable = await this.isApprovable();

    return {
      type: this.todo.todo_type,
      formData: formData,
      isApprovable: isApprovable,
      supportedActions: this.getSupportedActions(),
      reason: isApprovable ? null : '详情页无可审批按钮'
    };
  }
}

/**
 * 会议邀请处理器
 */
class MeetingDetailHandler extends BaseDetailHandler {
  async extractFormData(allTables) {
    // 查找包含"会议名称"的表格
    const targetTable = allTables.find(t => t.preview.includes('会议名称'));

    if (!targetTable) {
      return {
        info: {},
        markdown: '## 会议信息\n\n(未找到会议信息表格)'
      };
    }

    const tableData = await this.browser.extractTable(
      `table:nth-of-type(${targetTable.index + 1})`,
      { skipHeader: false }
    );

    if (!tableData.success) {
      return {
        info: {},
        markdown: '## 会议信息\n\n(提取失败)'
      };
    }

    // 转换为键值对和Markdown
    const info = {};
    const markdownLines = ['## 会议信息', ''];

    tableData.data.forEach(row => {
      for (let i = 0; i < row.length; i += 2) {
        if (i + 1 < row.length && row[i]) {
          const key = row[i].trim();
          const value = row[i + 1] ? row[i + 1].trim() : '';
          info[key] = value;
          markdownLines.push(`- **${key}**: ${value}`);
        }
      }
    });

    return { info, markdown: markdownLines.join('\n') };
  }

  getSupportedActions() {
    return ['参加', '不参加'];
  }

  async isApprovable() {
    const snapshot = await this.browser.snapshot();
    const hasOptions = snapshot.includes('参加') || snapshot.includes('不参加');
    const isProcessed = snapshot.includes('已召开') || snapshot.includes('已结束');
    return hasOptions && !isProcessed;
  }
}

/**
 * EHR 假期处理器
 */
class EhrDetailHandler extends BaseDetailHandler {
  async extractFormData(allTables) {
    // 跳过包含"会议名称"和"流程跟踪"的表格
    // 查找包含"假别"、"开始时间"等字段的表格
    const targetTable = allTables.find(t =>
      !t.preview.includes('会议名称') &&
      !t.preview.includes('流程跟踪') &&
      !t.preview.includes('节点') &&
      (t.preview.includes('假别') || t.preview.includes('开始时间') || t.preview.includes('假期类型')) &&
      t.rowCount > 1
    );

    if (!targetTable) {
      return {
        info: {},
        markdown: '## 请假信息\n\n(未找到请假信息表格)'
      };
    }

    const tableData = await this.browser.extractTable(
      `table:nth-of-type(${targetTable.index + 1})`,
      { skipHeader: false }
    );

    if (!tableData.success) {
      return {
        info: {},
        markdown: '## 请假信息\n\n(提取失败)'
      };
    }

    // 转换为键值对和Markdown
    const info = {};
    const markdownLines = ['## 请假信息', ''];

    tableData.data.forEach(row => {
      for (let i = 0; i < row.length; i += 2) {
        if (i + 1 < row.length && row[i]) {
          const key = row[i].trim();
          const value = row[i + 1] ? row[i + 1].trim() : '';
          info[key] = value;
          markdownLines.push(`- **${key}**: ${value}`);
        }
      }
    });

    return { info, markdown: markdownLines.join('\n') };
  }

  getSupportedActions() {
    return ['同意', '不同意'];
  }
}

/**
 * 费用报销处理器
 */
class ExpenseDetailHandler extends BaseDetailHandler {
  async extractFormData(allTables) {
    // 查找包含"金额"、"费用"、"报销"等字段的表格
    const targetTable = allTables.find(t =>
      !t.preview.includes('会议名称') &&
      !t.preview.includes('流程跟踪') &&
      !t.preview.includes('节点') &&
      (t.preview.includes('金额') || t.preview.includes('费用') || t.preview.includes('报销')) &&
      t.rowCount > 1
    );

    if (!targetTable) {
      return {
        info: {},
        markdown: '## 费用信息\n\n(未找到费用信息表格)'
      };
    }

    const tableData = await this.browser.extractTable(
      `table:nth-of-type(${targetTable.index + 1})`,
      { skipHeader: false }
    );

    if (!tableData.success) {
      return {
        info: {},
        markdown: '## 费用信息\n\n(提取失败)'
      };
    }

    // 转换为键值对和Markdown
    const info = {};
    const markdownLines = ['## 费用信息', ''];

    tableData.data.forEach(row => {
      for (let i = 0; i < row.length; i += 2) {
        if (i + 1 < row.length && row[i]) {
          const key = row[i].trim();
          const value = row[i + 1] ? row[i + 1].trim() : '';
          info[key] = value;
          markdownLines.push(`- **${key}**: ${value}`);
        }
      }
    });

    return { info, markdown: markdownLines.join('\n') };
  }

  getSupportedActions() {
    return ['同意', '驳回'];
  }

  async isApprovable() {
    const snapshot = await this.browser.snapshot();
    const isProcessed = snapshot.includes('已支付') || snapshot.includes('已打款');
    const hasButtons = snapshot.includes('同意') || snapshot.includes('驳回');
    return !isProcessed && hasButtons;
  }
}

/**
 * 通用流程处理器
 */
class WorkflowDetailHandler extends BaseDetailHandler {
  async extractFormData(allTables) {
    // 跳过包含"会议名称"和"流程跟踪"的表格
    // 查找第一个包含有效数据的表格
    const targetTable = allTables.find(t =>
      !t.preview.includes('会议名称') &&
      !t.preview.includes('流程跟踪') &&
      !t.preview.includes('节点') &&
      !t.preview.includes('处理人') &&
      t.rowCount > 1
    );

    if (!targetTable) {
      return {
        info: {},
        markdown: '## 表单信息\n\n(未找到表单数据)'
      };
    }

    const tableData = await this.browser.extractTable(
      `table:nth-of-type(${targetTable.index + 1})`,
      { skipHeader: false }
    );

    if (!tableData.success) {
      return {
        info: {},
        markdown: '## 表单信息\n\n(提取失败)'
      };
    }

    // 转换为键值对和Markdown
    const info = {};
    const markdownLines = ['## 表单信息', ''];

    tableData.data.forEach(row => {
      for (let i = 0; i < row.length; i += 2) {
        if (i + 1 < row.length && row[i]) {
          const key = row[i].trim();
          const value = row[i + 1] ? row[i + 1].trim() : '';
          info[key] = value;
          markdownLines.push(`- **${key}**: ${value}`);
        }
      }
    });

    return { info, markdown: markdownLines.join('\n') };
  }

  getSupportedActions() {
    return ['通过', '驳回', '转办'];
  }
}

/**
 * 处理器工厂
 */
function createDetailHandler(browser, todo) {
  switch (todo.todo_type) {
    case 'meeting': return new MeetingDetailHandler(browser, todo);
    case 'ehr': return new EhrDetailHandler(browser, todo);
    case 'expense': return new ExpenseDetailHandler(browser, todo);
    case 'workflow':
    default: return new WorkflowDetailHandler(browser, todo);
  }
}

module.exports = {
  createDetailHandler,
  BaseDetailHandler,
  MeetingDetailHandler,
  EhrDetailHandler,
  ExpenseDetailHandler,
  WorkflowDetailHandler
};
