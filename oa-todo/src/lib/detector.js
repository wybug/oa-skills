/**
 * 待办类型检测器
 * 从标题判断待办类型
 */

const { TODO_TYPE, APPROVE_ACTIONS } = require('../config');

/**
 * 从标题检测待办类型
 */
function detectTodoType(title) {
  if (!title) {
    return TODO_TYPE.UNKNOWN;
  }

  // 会邀类：标题包含"邀您参会"或"邀请您参加会议"或"召开时间变更"
  if (title.includes('邀您参会') || title.startsWith('邀请您参加会议') || title.includes('召开时间变更')) {
    return TODO_TYPE.MEETING;
  }

  // 流程审批类：标题以"请审批"开头
  if (title.startsWith('请审批')) {
    return TODO_TYPE.WORKFLOW;
  }

  // 报销类：标题包含"付款报销"或"费用报销"
  if (title.includes('付款报销') || title.includes('费用报销')) {
    return TODO_TYPE.EXPENSE;
  }

  // EHR类：标题包含"休假"、"年假"、"病假"、"事假"、"调休假"、"假"、"绩效考核"等
  if (title.includes('休假') || title.includes('年假') || title.includes('病假') ||
      title.includes('事假') || title.includes('调休假') || title.includes('假申请') || title.includes('绩效考核')) {
    return TODO_TYPE.EHR;
  }

  return TODO_TYPE.UNKNOWN;
}

/**
 * 从标题提取提交人和部门
 * 示例: "请审批[运维中心]张凯旋提交的流程：阿里云大数据架构探讨"
 */
function parseTitle(title) {
  const result = {
    type: detectTodoType(title),
    sourceDept: null,
    submitter: null,
    subject: title
  };

  if (result.type === TODO_TYPE.WORKFLOW) {
    // 提取 [部门]姓名
    const match = title.match(/\[([^\]]+)\]([^\u4e00-\u9fa5]*[\u4e00-\u9fa5]+)/);
    if (match) {
      result.sourceDept = match[1];
      result.submitter = match[2].replace('提交的流程：', '').trim();
      // 提取主题
      const subjectMatch = title.match(/流程[：:](.+)$/);
      if (subjectMatch) {
        result.subject = subjectMatch[1].trim();
      }
    }
  } else if (result.type === TODO_TYPE.MEETING) {
    // 提取会议主题
    const match = title.match(/会议[，,]召开时间[：:].+会议地点[：:].+[，,](.+)$/);
    if (match) {
      result.subject = match[1].trim();
    } else {
      // 简单提取（支持多种前缀格式）
      const prefixes = ['邀请您参加会议：', '邀您参会：', '邀请您参加会议', '邀您参会'];
      for (const prefix of prefixes) {
        if (title.startsWith(prefix)) {
          result.subject = title.slice(prefix.length).split('，')[0].trim();
          break;
        }
      }
      // 如果没有匹配前缀，使用原始标题
      if (result.subject === title) {
        result.subject = title.split('，')[0].replace(/^[：:]\s*/, '');
      }
    }
  }

  return result;
}

/**
 * 验证审批动作是否匹配类型
 */
function validateAction(todoType, action) {
  const validActions = APPROVE_ACTIONS[todoType] || [];
  return validActions.includes(action);
}

/**
 * 获取支持的动作列表
 */
function getValidActions(todoType) {
  return APPROVE_ACTIONS[todoType] || [];
}

module.exports = {
  detectTodoType,
  parseTitle,
  validateAction,
  getValidActions
};
