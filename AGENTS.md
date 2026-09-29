# inkwell · Raychi 管理台入口

开始任务先读本仓 [README](README.md)、当前 Issue/PR、[Raychi 仓库地图](https://github.com/raychi-space/raychi#仓库地图)、[开发流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)、[接口与联调](https://github.com/raychi-space/raychi/blob/main/docs/integration.md)及[验收规则](https://github.com/raychi-space/raychi/blob/main/docs/acceptance.md)；具体职责与编辑格式见[模块说明](docs/module.md)和[编辑器约定](docs/editor-v0.1.md)。

本仓负责站长登录、编辑、上传与发布界面；文章状态、图片可见性、HTTP 契约归 wellspring，不直接读写数据库。接口以 [wellspring 契约目录](https://github.com/raychi-space/wellspring/tree/main/docs/api)及 Issue 指定的 PR/提交为准。接口变化先协调 OpenAPI/语义文档和消费方评审，在 PR 说明兼容性及跨仓影响。

改动后按 README 执行 npm run build；编辑器或权限变化还须验证 Markdown 往返、图片、工作稿与再次发布等受影响路径。PR 关联 Issue，写命令、版本、实际结果与未覆盖项。本仓检查通过不代表主 Issue 验收通过；联调组合和最终结果在主 Issue 记录。不要提交密钥或临时预览 URL。GitHub 操作优先 gh CLI，不可用时用网页。
