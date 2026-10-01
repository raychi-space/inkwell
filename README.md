# inkwell

**Part of Raychi · 管理台**。站长在这里登录，编辑并发布文章和帖子，同时管理草稿、分类、标签与站点设置。React 19 + Vite + [MDXEditor](https://mdxeditor.dev/)；公开展示由 [lantern](https://github.com/raychi-space/lantern) 负责，内容规则与数据由 [wellspring](https://github.com/raychi-space/wellspring) 负责。

正文在同一个编辑区域所见即所得，保存时转换为 Markdown。直接粘贴 PNG/JPEG 图片会上传到私有附件目录，编辑器用认证地址显示，Markdown 中保存稳定的公开地址。未发布图片的公开直链返回 404。已发布文章的“保存工作稿”不会影响访客；点击“发布更新”才替换公开快照。

## 本机运行

需要 Node.js 20.9+，以及已运行的 wellspring。

```bash
cp .env.example .env.local
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173>。Vite 将 `/api` 代理到 `RAYCHI_API_URL`（默认 `http://127.0.0.1:8080`）；生产环境需在同源入口转发 `/api`。执行 `npm run build` 检查类型并构建。

格式与编辑器边界见[编辑器约定](docs/editor-v0.1.md)。本仓库独立构建，不读取相邻仓库的文件。

模块内部职责见[模块说明](docs/module.md)，v0.2 范围见[任务文档 PR #3](https://github.com/raychi-space/inkwell/pull/3)；Agent 长期约定见 [AGENTS.md](AGENTS.md)。跨仓任务按[项目流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)处理；实时状态看[Raychi Project](https://github.com/orgs/raychi-space/projects/1)及对应 Issue/PR。

## 目录约束

- `src/main.tsx` 仅挂载应用；`src/app/` 组合页面状态和功能组件。
- `src/features/auth/` 保存会话请求、类型和登录视图；`src/features/articles/` 保存内容请求、类型及编辑器组件；`src/features/taxonomy/` 和 `src/features/settings/` 分别管理分类标签与站点配置。
- `src/shared/api/` 统一处理 HTTP、Cookie 和 CSRF；`src/shared/` 只放可复用且不依赖具体业务的工具。
- 功能组件从自身功能目录或 `shared/` 导入；跨功能协作由 `app/` 完成。新增接口路径放在对应功能的 `api.ts`，不要散落在组件中。
- `docs/` 存放技术约定；构建配置、环境示例和 CI 留在仓库根目录。

## 写作助手

[写作助手 v1](docs/writing-assistant-v1.md) 说明服务商/助手管理、连续对话、选区预览确认、摘要建议及第一期支持的选区范围。需 wellspring 启用独立 Agent 服务；正文修改和摘要建议由用户确认，生成不会保存或发布文章。
