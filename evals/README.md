# 测试用例说明

## 概述

本目录包含 query-oa-approval 技能的测试用例，用于验证技能是否按预期工作。

## 测试用例列表

| ID | 名称 | 分类 | 描述 |
|----|------|------|------|
| 1 | query-pending-approvals | query | 测试查询待审批功能 |
| 2 | approve-single-document | approval | 测试单个单据审批（同意） |
| 3 | reject-with-reason | approval | 测试单据驳回并填写原因 |
| 4 | batch-approve-multiple | batch | 测试批量审批功能 |
| 5 | troubleshoot-not-found | troubleshooting | 测试单据未找到的故障排查 |
| 6 | casual-request | trigger | 测试口语化表达的触发识别 |
| 7 | view-todo-list | query | 测试查看待办的查询 |
| 8 | login-expired | troubleshooting | 测试登录状态过期处理 |

## 测试覆盖范围

- ✅ 查询待审批（2个用例）
- ✅ 单个审批 - 同意/驳回（2个用例）
- ✅ 批量审批（1个用例）
- ✅ 故障排查（2个用例）
- ✅ 触发准确性（1个用例）

## 运行测试

### 使用 skill-creator 运行

```bash
# 进入 skill-creator 目录
cd active_skills/skill-creator

# 运行测试
python -m scripts.run_evals \
  --eval-set ../query-oa-approval/evals/evals.json \
  --skill-path ../query-oa-approval \
  --output-dir ../query-oa-approval-workspace
```

### 手动测试

对于每个测试用例，可以手动执行：

```bash
# 示例：测试查询功能
# 提示词："帮我查一下OA系统里有哪些待审批的单子"
# 预期：使用 query_approval.sh

# 示例：测试审批功能
# 提示词："帮我审批一下单号 FK20250101001，同意"
# 预期：使用 approve.sh
```

## 断言说明

每个测试用例包含多个断言（assertions）：

- **critical: true** - 关键断言，必须通过
- **critical: false** - 非关键断言，建议通过

### 断言类型

1. **使用正确的脚本** - 验证是否推荐使用正确的脚本
2. **提供命令示例** - 验证是否提供完整的命令示例
3. **说明输出位置** - 验证是否说明输出文件位置
4. **识别意图** - 验证是否正确识别用户意图

## 测试结果评估

### 通过标准

- 所有关键断言（critical: true）必须通过
- 非关键断言通过率 > 80%
- 总体通过率 > 85%

### 评分维度

1. **准确性** - 是否使用正确的脚本和命令
2. **完整性** - 是否提供所有必要信息
3. **友好性** - 提示是否清晰易懂
4. **覆盖率** - 是否覆盖所有场景

## 持续改进

### 添加新测试用例

当发现新的场景或问题时：

1. 在 `evals.json` 中添加新的测试用例
2. 清晰描述预期行为
3. 添加合理的断言
4. 运行测试验证

### 更新现有用例

当技能功能更新时：

1. 检查相关测试用例是否需要更新
2. 更新预期行为和断言
3. 重新运行测试

## 测试数据

### 模拟数据

测试用例中使用的单号（如 FK20250101001）为模拟数据，仅用于测试目的。

### 环境要求

运行测试需要：

- agent-browser 已安装
- 环境变量已配置（OA_USER_NAME, OA_USER_PASSWD）
- 测试环境可访问 OA 系统

---

**维护者**: 技能开发团队
**最后更新**: 2025-03-18
