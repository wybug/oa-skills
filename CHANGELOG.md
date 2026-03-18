# OA审批系统 - 变更记录

## 2025-03-18 - Python 版本移除

### 变更原因
- Python 版本在审批动作参数上与用户习惯不符（用户使用"同意"，但脚本只支持"通过"）
- Bash 版本已经稳定运行，功能完整
- 为避免混淆和维护成本，决定保持 Bash 版本，移除 Python 版本

### 已删除的文件
- `venv/` - Python 虚拟环境目录
- `scripts/login.py` - Python 登录脚本
- `scripts/query_oa_todo.py` - Python 查询待办脚本
- `scripts/approve_oa_todo.py` - Python 审批待办脚本
- `oa.py` - Python 统一入口脚本
- `requirements.txt` - Python 依赖声明
- `PYTHON_SCRIPTS.md` - Python 脚本说明文档
- `VENV_SETUP.md` - 虚拟环境配置文档
- `QUICK_START.md` - 快速使用指南
- `PROJECT_SUMMARY.md` - 项目总结文档
- `README.md` - 项目主文档

### 保留的文件
- 所有 Bash 脚本（`.sh` 文件）
- `SKILL.md` - 技能说明文档（已移除 Python 相关内容）
- `references/` - 参考文档目录
- 其他现有文档

### 当前版本
- **版本号**: v2.1.0
- **脚本语言**: Bash
- **状态**: ✅ 稳定运行

### 使用方式
```bash
# 查询待办
./scripts/query_oa_todo.sh

# 审批待办
./scripts/approve_oa_todo.sh 1 参加      # 会议安排
./scripts/approve_oa_todo.sh 2 通过 "同意" # 流程管理
```

### 支持的审批动作
- **会议安排**: 参加 | 不参加
- **流程管理**: 通过 | 驳回 | 转办

---

**注意**: Bash 版本功能完整，性能稳定，推荐继续使用。
