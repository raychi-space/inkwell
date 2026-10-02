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

## 管理页面

[管理台使用说明](docs/management-ui.md) 介绍网站设置、可收缩的图标侧栏与头像账户菜单。内容管理、草稿箱、网站管理和助手管理使用一致的页面框架；桌面端页头与侧栏固定，内容区域独立滚动。

## 目录约束

- `src/main.tsx` 仅挂载应用；`src/app/` 组合页面状态和功能组件。
- `src/features/auth/` 保存会话请求、类型和登录视图；`src/features/articles/` 保存内容请求、类型及编辑器组件；`src/features/taxonomy/` 和 `src/features/settings/` 分别管理分类标签与站点配置。
- `src/shared/api/` 统一处理 HTTP、Cookie 和 CSRF；`src/shared/ui/` 放通用界面组件，`src/shared/lib/` 放不依赖具体业务的工具。
- 功能组件从自身功能目录或 `shared/` 导入；`index.ts` 是 auth/articles/settings/taxonomy 的公开入口，跨功能协作由 `app/` 完成。SettingsEditor 位于 settings/components；设置与分类标签类型分别在各功能的 types.ts。编辑器从 LazyRichEditor 懒加载，入口不提前加载 MDXEditor。新增接口路径放在对应功能的 `api.ts`，不要散落在组件中。
- `docs/` 存放技术约定；构建配置、环境示例和 CI 留在仓库根目录。

## 写作助手

[写作助手 v1](docs/writing-assistant-v1.md) 说明服务商/助手管理、连续对话、选区预览确认、自动摘要及第一期支持的选区范围。需 wellspring 启用独立 Agent 服务；正文改写需用户确认；摘要在文章发布成功后由后台自动生成并保存；编辑停顿、草稿保存不会触发。正文改写仍需确认。


## 发布与编辑元数据（2026-10-02）

标题从正文首个顶层 Markdown 标题提取（代码块/引用中的标题不计）；新建日期地址由 API 自动分配，已发布地址不变。没有独立标题、封面输入；既有封面数据保留。摘要区为只读，展示最新发布任务状态。发布请求传当前选中的助手；任务由后台持久化，离开页面仍可完成，模型故障不阻断发布，再次发布可重试。自动摘要仅更新匹配的快照，不发布用户继续编辑的工作稿。客户端根据 summaryStatus 轮询文章，不创建摘要任务；后台摘要唯一改变 version 时，保存可安全重试一次，其他内容冲突要求重新打开。

分类与标签位于 WRITING SPACE/正文标题下方、编辑器工具栏上方。输入时过滤全部已有词，鼠标或方向键选中；按回车复用已有名称或创建新名称，支持中文输入法组合。分类单选，标签多选且可移除；未确认的新词在点击保存/发布前创建并纳入这次保存。新词创建冲突后刷新并复用目录；不会重复加入同一个标签。

## 登录会话

初次加载先检查会话，再展示登录页或管理台。管理接口返回 `401 AUTH_REQUIRED` 时统一返回登录页，卸载受保护界面并取消其他管理请求；文章、工作稿、设置和助手状态不沿用到下一次登录。切换管理页面、浏览器重新获得焦点或标签重新可见时重新检查。网络故障、普通权限错误、服务商认证错误不会被当作站长退出。CSRF 失败会额外核对会话，但不自动重发保存/发布请求。运行 `npm run test:auth` 验证并发失效、过期响应与错误边界。

## 代码与故障回归（2026-10-03）

`npm run lint` 检查功能和 shared 依赖边界；`npm run format:check` 检查统一排版，`npm run format` 修复排版。CI 执行上述检查。网站级 HTTP 回归脚本位于 raychi 的 `scripts/site-e2e.py`，只允许显式确认的隔离环境；运行方式见项目的完整网站验收文档。

管理列表在后端按状态、类型、分类、标签筛选并排序，每页最多 50 条；更改筛选重置页码。字数、文章数、帖子数明确显示为本页统计，列表总数来自筛选后的 total。摘要轮询与管理列表请求分别由专用 hook 管理。

账户头像菜单支持修改密码：校验当前密码，确认新密码，成功后清除受保护状态并使用新密码重新登录；其他设备的登录同步失效。见[管理台使用说明](docs/management-ui.md#修改密码)。
