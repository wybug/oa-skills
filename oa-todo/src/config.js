/**
 * 配置和常量定义
 */

// 待办状态
const TODO_STATUS = {
  SKIP: 'skip',                  // 跳过（无法处理）
  PENDING: 'pending',            // 待审核
  APPROVED: 'approved',          // 同意
  REJECTED: 'rejected',          // 驳回
  TRANSFERRED: 'transferred',    // 转办理
  ATTENDED: 'attended',          // 参加（会议）
  NOT_ATTENDED: 'not_attended',  // 不参加（会议）
  PROCESSED: 'processed',        // 已处理（从OA待办列表移除）
  OTHER: 'other'                 // 其他
};

// 待办类型
const TODO_TYPE = {
  MEETING: 'meeting',    // 会议邀请
  WORKFLOW: 'workflow',  // 流程审批
  EXPENSE: 'expense',    // 报销
  EHR: 'ehr',           // EHR
  UNKNOWN: 'unknown'     // 未知
};

// 状态显示名称
const STATUS_NAMES = {
  [TODO_STATUS.SKIP]: '已跳过',
  [TODO_STATUS.PENDING]: '待审核',
  [TODO_STATUS.APPROVED]: '已同意',
  [TODO_STATUS.REJECTED]: '已驳回',
  [TODO_STATUS.TRANSFERRED]: '已转办',
  [TODO_STATUS.ATTENDED]: '已参加',
  [TODO_STATUS.NOT_ATTENDED]: '不参加',
  [TODO_STATUS.PROCESSED]: '已处理',
  [TODO_STATUS.OTHER]: '其他'
};

// 类型显示名称
const TYPE_NAMES = {
  [TODO_TYPE.MEETING]: '会议邀请',
  [TODO_TYPE.WORKFLOW]: '流程审批',
  [TODO_TYPE.EXPENSE]: '报销',
  [TODO_TYPE.EHR]: 'EHR',
  [TODO_TYPE.UNKNOWN]: '未知'
};

// 状态颜色
const STATUS_COLORS = {
  [TODO_STATUS.SKIP]: 'gray',
  [TODO_STATUS.PENDING]: 'yellow',
  [TODO_STATUS.APPROVED]: 'green',
  [TODO_STATUS.REJECTED]: 'red',
  [TODO_STATUS.TRANSFERRED]: 'cyan',
  [TODO_STATUS.ATTENDED]: 'green',
  [TODO_STATUS.NOT_ATTENDED]: 'gray',
  [TODO_STATUS.PROCESSED]: 'gray',
  [TODO_STATUS.OTHER]: 'gray'
};

// 支持的审批动作
const APPROVE_ACTIONS = {
  [TODO_TYPE.MEETING]: ['参加', '不参加'],
  [TODO_TYPE.EHR]: ['同意', '不同意'],
  [TODO_TYPE.EXPENSE]: ['同意', '驳回'],
  [TODO_TYPE.WORKFLOW]: ['通过', '驳回', '转办'],
  [TODO_TYPE.UNKNOWN]: []
};

// 动作到状态映射
const ACTION_TO_STATUS = {
  '参加': TODO_STATUS.ATTENDED,
  '不参加': TODO_STATUS.NOT_ATTENDED,
  '同意': TODO_STATUS.APPROVED,
  '不同意': TODO_STATUS.REJECTED,
  '通过': TODO_STATUS.APPROVED,
  '驳回': TODO_STATUS.REJECTED,
  '转办': TODO_STATUS.TRANSFERRED,
  '跳过': TODO_STATUS.SKIP
};

module.exports = {
  TODO_STATUS,
  TODO_TYPE,
  STATUS_NAMES,
  TYPE_NAMES,
  STATUS_COLORS,
  APPROVE_ACTIONS,
  ACTION_TO_STATUS
};
