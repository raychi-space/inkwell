# inkwell 模块说明

`src/main.tsx` 挂载应用；`src/app/` 组合页面状态。`src/features/auth/` 处理会话与登录，`src/features/articles/` 处理文章、帖子请求、列表、MDXEditor 与发布预览；`src/features/ai/` 处理助手/服务商配置、对话、选区建议与图标；`src/features/taxonomy/` 和 `src/features/settings/` 管理分类标签及站点设置，`src/shared/api/` 统一请求、Cookie 和 CSRF。功能组件只调用本功能 API 层；跨功能编排在 `app/`，不把请求路径散落在界面组件中。

Vite 将同源 `/api` 代理到 wellspring。正文的持久格式是 Markdown；图片上传到后端后，正文保存稳定的公开地址，编辑区通过管理地址显示私密图片。保存工作稿不会替换访客可见的发布快照；明确发布才会更新。字段、状态码和错误格式以 [wellspring v0.2 契约](https://github.com/raychi-space/wellspring/blob/main/docs/api/contract-v0.2.md)为准，编辑能力与尚待验证的格式边界见[编辑器约定](editor-v0.1.md)。公开展示归 [lantern](https://github.com/raychi-space/lantern)。

运行 `npm run build` 检查类型与生产构建，`npm run lint` 和 `npm run format:check` 检查边界与格式；`npm run test:auth` 覆盖认证/改密，`npm run test:writing` 覆盖发布预览浏览器交互。浏览器测试的模拟响应不替代真实后端联调。改动编辑器时用当前后端实际检查“加载→编辑→保存→重新打开→发布预览→确认”，以及上传失败、未发布图片匿名 404、已发布文章仅保存后访客仍看旧版。将操作和实际结果写进 PR，跨仓验收按[项目流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)进行。

访问统计接入见 [wellspring 统计契约](https://github.com/raychi-space/wellspring/blob/main/docs/api/analytics-v1.md)。采集服务和聚合状态归独立 waymarks；应用不访问其 SQLite，浏览器不接收服务 token。

内容导出属于 `features/articles`，由其API通过统一 `apiResponse` 处理认证和下载取消；app只组合当前已保存ID/版本与忙碌状态。工作稿、发布快照和图片的完整包及容量边界由 wellspring 负责，不在管理台拼装数据或读附件文件。

修订历史也归 `features/articles`，只消费管理员元数据/快照及恢复API。app在明确恢复成功后更新当前文章并增加独立编辑器generation，正常保存不重建编辑器；富文本初始化规范化回调不标脏，真正用户输入及采纳建议仍标脏。历史正文预览用转义文本，不执行HTML。

回收站也归features/articles：只读分页元数据、统一API/CSRF/版本，写入前native dialog明确确认，脏稿禁用移入，忙碌状态由app组合以阻止离开；恢复后app载入草稿，无自动公开。永久删除由后端事务和附件队列负责，不在浏览器删除文件。
