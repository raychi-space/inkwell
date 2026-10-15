# inkwell · RayChi 管理台

先读 [README](README.md)，按任务读[模块说明](docs/module.md)、[编辑器约定](docs/editor-v0.1.md)、[写作助手](docs/writing-assistant-v1.md)或[管理界面](docs/management-ui.md)，核对 Issue/PR 与契约。

新需求先检查相关需求、设计/ADR 与现有代码和公共能力，提出范围、复用方案、接口影响和验收方式，获得用户明确实施确认后再修改功能代码、配置或数据库。重大偏离重新确认；确认范围内持续执行，不重复审批常规细节。部署/线上启用另需授权。

跨仓规则见[开发流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md#文档驱动开发)、[架构](https://github.com/raychi-space/raychi/blob/main/ARCHITECTURE.md)、[文档地图](https://github.com/raychi-space/raychi/blob/main/docs/README.md)和[验收](https://github.com/raychi-space/raychi/blob/main/docs/acceptance.md)。这些项目资料为私有；无权限时从本仓和授权提供的相关资料明确范围，由负责人补必要约束，不能把 404 当作不存在或自行重定义跨仓规则。

界面负责交互和未保存状态，内容规则、图片可见性、版本与 HTTP 定义归 [wellspring API](https://github.com/raychi-space/wellspring/tree/main/docs/api)。管理请求使用同源会话 Cookie 与 CSRF，不得直读数据库；请求复用 shared/api 和功能 API 层，app 组合跨功能，接口变动先评审提供方契约及兼容性。

验证入口在 README/CI：lint、format:check、build；认证/改密 test:auth，写作交互 test:writing。编辑器变化检查 Markdown 往返、图片权限、工作稿隔离、确认发布和建议接受/拒绝/撤销；模拟结果不能替代真实 API 联调。纯文档修改只查内容、链接与差异。PR 记录版本、命令、实际结果和未覆盖项，同步本仓说明；单仓通过不代表主功能完成。不得提交密钥、私有附件或临时预览 URL，第三方许可声明保留。GitHub 操作优先 gh CLI。
