# inkwell 模块说明

本仓是 Raychi 管理台。当前 `main` 的 `src/main.tsx` 挂载应用，`src/App.tsx` 组合登录、文章列表、编辑和发布操作；`src/api.ts` 处理会话、文章及上传请求。所见即所得编辑使用 MDXEditor，样式在 `src/style.css`；功能拆分时应保持 API 访问集中并在同一 PR 更新此说明。

Vite 将同源 `/api` 代理到 wellspring。正文持久格式是 Markdown；图片上传后正文保存稳定公开地址，编辑区通过管理地址显示私密图片。保存工作稿不会替换访客可见的发布快照；明确发布才会更新。字段、状态码和错误格式以 [wellspring 契约](https://github.com/raychi-space/wellspring/blob/main/docs/api/contract-v0.1.md)为准，编辑能力与尚待验证的格式边界见[编辑器约定](editor-v0.1.md)。公开展示归 [lantern](https://github.com/raychi-space/lantern)。

运行 `npm run build` 可检查类型与生产构建；仓库目前没有独立前端测试脚本。改动编辑器时用当前后端实际检查“加载→编辑→保存→重新打开→发布”，以及上传失败、未发布图片匿名 404、已发布文章仅保存后访客仍看旧版。将操作和实际结果写进 PR，跨仓验收按[项目流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)进行。
