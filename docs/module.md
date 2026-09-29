# inkwell 模块说明

`src/main.tsx` 挂载应用；`src/app/` 组合页面状态。`src/features/auth/` 处理会话与登录，`src/features/articles/` 处理文章、帖子请求、列表与文章 MDXEditor 编辑器；`src/features/taxonomy/` 和 `src/features/settings/` 管理分类标签及站点设置，`src/shared/api/` 统一请求、Cookie 和 CSRF。功能组件只调用本功能 API 层；跨功能编排在 `app/`，不把请求路径散落在界面组件中。

Vite 将同源 `/api` 代理到 wellspring。正文的持久格式是 Markdown；图片上传到后端后，正文保存稳定的公开地址，编辑区通过管理地址显示私密图片。保存工作稿不会替换访客可见的发布快照；明确发布才会更新。字段、状态码和错误格式以 [wellspring v0.2 契约](https://github.com/raychi-space/wellspring/blob/main/docs/api/contract-v0.2.md)为准，编辑能力与尚待验证的格式边界见[编辑器约定](editor-v0.1.md)。公开展示归 [lantern](https://github.com/raychi-space/lantern)。

运行 `npm run build` 可检查类型与生产构建；仓库目前没有独立的前端测试脚本。改动编辑器时用当前后端实际检查“加载→编辑→保存→重新打开→发布”，以及上传失败、未发布图片匿名 404、已发布文章仅保存后访客仍看旧版。将操作和实际结果写进 PR，跨仓验收按[项目流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)进行。
