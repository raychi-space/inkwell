# inkwell

**Part of Raychi · 管理台**。站长在这里登录、写作并发布文章。React 19 + Vite + [MDXEditor](https://mdxeditor.dev/)；公开展示由 [lantern](https://github.com/raychi-space/lantern) 负责，内容规则与数据由 [wellspring](https://github.com/raychi-space/wellspring) 负责。

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

本仓模块边界见[模块说明](docs/module.md)，Agent 长期约定见 [AGENTS.md](AGENTS.md)。跨仓任务按[项目流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)处理；实时状态看[Raychi Project](https://github.com/orgs/raychi-space/projects/1)及对应 Issue/PR；Project 当前为私有。
