# inkwell 模块说明

所有者：inkwell；核对：2026-10-15。本文描述已提交的模块基线，功能开发分支的扩展另行验证。系统边界见[架构](https://github.com/raychi-space/raychi/blob/main/ARCHITECTURE.md)，本仓契约与代码仍需按任务指定提交核对。

`src/main.tsx` 挂载应用；`src/app/` 组合页面状态。`src/features/auth/` 处理会话与登录，`src/features/articles/` 处理文章、帖子请求、列表、MDXEditor 与发布预览；`src/features/ai/` 处理助手/服务商配置、对话、选区建议与图标；`src/features/reading/` 在 AIHOT 模式读取连接/更新时间，在兼容模式管理旧来源、检查状态与翻译助手绑定；`src/features/taxonomy/` 和 `src/features/settings/` 管理分类标签及站点设置，`src/shared/api/` 统一请求、Cookie 和 CSRF。功能组件只调用本功能 API 层；跨功能编排在 `app/`，不把请求路径散落在界面组件中。

Vite 将同源 `/api` 代理到 wellspring。正文的持久格式是 Markdown；图片上传到后端后，正文保存稳定的公开地址，编辑区通过管理地址显示私密图片。保存工作稿不会替换访客可见的发布快照；明确发布才会更新。字段、状态码和错误格式以 [wellspring v0.2 契约](https://github.com/raychi-space/wellspring/blob/main/docs/api/contract-v0.2.md)为准，编辑能力与尚待验证的格式边界见[编辑器约定](editor-v0.1.md)。公开展示归 [lantern](https://github.com/raychi-space/lantern)。

运行 `npm run build` 检查类型与生产构建，`npm run lint` 和 `npm run format:check` 检查边界与格式；`npm run test:auth` 覆盖认证/改密，`npm run test:writing` 覆盖发布预览浏览器交互。浏览器测试的模拟响应不替代真实后端联调。改动编辑器时用当前后端实际检查“加载→编辑→保存→重新打开→发布预览→确认”，以及上传失败、未发布图片匿名 404、已发布文章仅保存后访客仍看旧版。将操作和实际结果写进 PR，跨仓验收按[项目流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)进行。

访问统计接入见 [wellspring 统计契约](https://github.com/raychi-space/wellspring/blob/main/docs/api/analytics-v2.md)。采集服务和聚合状态归独立 waymarks；应用不访问其 SQLite，浏览器不接收服务 token。

内容导出属于 `features/articles`，由其API通过统一 `apiResponse` 处理认证和下载取消；app只组合当前已保存ID/版本与忙碌状态。工作稿、发布快照和图片的完整包及容量边界由 wellspring 负责，不在管理台拼装数据或读附件文件。

修订历史也归 `features/articles`，只消费管理员元数据/快照及恢复API。app在明确恢复成功后更新当前文章并增加独立编辑器generation，正常保存不重建编辑器；富文本初始化规范化回调不标脏，真正用户输入及采纳建议仍标脏。历史正文预览用转义文本，不执行HTML。

回收站也归features/articles：只读分页元数据、统一API/CSRF/版本，写入前native dialog明确确认，脏稿禁用移入，忙碌状态由app组合以阻止离开；恢复后app载入草稿，无自动公开。永久删除由后端事务和附件队列负责，不在浏览器删除文件。

## 新增功能入口

写作对话的 `WritingProposal` 保存和展示结构化建议状态及有界差异，不把状态拼入可见回复；发给模型的历史由 `WritingAssistant` 组合。共享 `MarkdownMessage` 负责安全 Markdown/GFM 显示。`editorAgentAdapter` 使用 Lexical 节点书签及涉及块结构快照校验格式化选区，单块局部替换保留既有块类型；建议仍来自既有工具契约，未新增任务服务或改写接口。

`app/OverviewDashboard.tsx` 组合内容、访问统计和拾阅三个功能的既有管理 API 与统计折线；各区域独立读取、取消旧请求和处理故障。内容列表按需传入分页大小和取消信号，计数使用服务端 total，最近内容最多读取五条。概览不拥有统计口径，也不直接调用独立内核或执行采集任务。

`features/analytics/` 拥有统计请求与显示：`api.ts` 只维护当前管理界面使用的 settings/overview/events 封装，经统一 API/会话层访问 wellspring；Dashboard 组合筛选与分页，Charts 展示折线提示与地区，Sources 展示来源排行并回调 Dashboard 沿用已应用条件查询，Collection 维护持久开关和写入失败后的重新加载。来源占比分母使用当前 `trend` 的 PV 合计，不能拿累计四卡或最多 100 组来源的合计代替；来源字段复用现有站点 v2 契约，无需增加采集或迁移。页面不展示访问路径，API 的可选 path 过滤能力保留供后续消费方使用。统计口径归内核/站点契约，已无消费方的旧报表前端封装不再保留。`features/reading/` 是拾阅管理入口，只通过统一 API 读取 AIHOT 接入状态，后端为旧模式时再使用原来源和翻译助手接口；不直连 AIHOT。编辑器、导出、修订、回收站内部逻辑归 articles，业务权限与持久化归后端。


管理主题由 `shared/lib/theme.ts` 在挂载前初始化，`style.css` 的 `--studio-*` 颜色角色同时供页面、MDXEditor、对话和差异展示使用；账户菜单仅保存非敏感主题偏好。管理查询缓存由 `shared/api/sessionCache.ts` 管理有界结果、在途请求和导航控件，`readApi.ts` 是功能 API 的显式只读入口；原 `api` 和 `apiResponse` 保持认证、写入、任务、流和下载职责。会话重置清除内存并拒绝旧响应，写响应统一失效但不替换活动表单；有效期及扩展约束见[管理界面](management-ui.md#会话内查询缓存)。缓存测试在 `npm run test:cache`，CI 与认证、浏览器测试一同执行。
