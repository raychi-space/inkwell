# inkwell · Raychi 管理台

先读 [README](README.md)、[模块说明](docs/module.md)和[编辑器约定](docs/editor-v0.1.md)。本仓负责站长登录、编辑、上传与发布界面；文章状态、图片可见性及 HTTP 契约属于 wellspring，不直接读写数据库。跨仓任务按 [Raychi 流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)关联 Issue/PR，接口改动先核对 [wellspring 契约](https://github.com/raychi-space/wellspring/blob/main/docs/api/contract-v0.1.md)。

改动后运行 `npm run build`；编辑器或权限变化还要按用户路径验证 Markdown 往返、粘贴图片、保存工作稿与再次发布，并在 PR 记录实际结果。不要把预览 URL、blob URL 或密钥写入正文或仓库。
