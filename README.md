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

模块内部职责见[模块说明](docs/module.md)，早期 v0.2 范围见[产品范围文档](docs/product-scope-v0.2.md)；当前操作见下文，Agent 长期约定见 [AGENTS.md](AGENTS.md)。跨仓任务按[项目流程](https://github.com/raychi-space/raychi/blob/main/docs/workflow.md)处理；实时状态看[Raychi Project](https://github.com/orgs/raychi-space/projects/1)及对应 Issue/PR。

## 管理页面

[管理台使用说明](docs/management-ui.md) 介绍网站设置、可收缩的图标侧栏与头像账户菜单。内容管理、草稿箱、网站管理和助手管理使用一致的页面框架；桌面端页头与侧栏固定，内容区域独立滚动。

## 目录约束

- `src/main.tsx` 仅挂载应用；`src/app/` 组合页面状态和功能组件。
- `src/features/auth/` 保存会话请求、类型和登录视图；`src/features/articles/` 保存内容请求、类型及编辑器组件；`src/features/taxonomy/` 和 `src/features/settings/` 分别管理分类标签与站点配置。
- `src/shared/api/` 统一处理 HTTP、Cookie 和 CSRF；`src/shared/ui/` 放通用界面组件，`src/shared/lib/` 放不依赖具体业务的工具。
- 功能组件从自身功能目录或 `shared/` 导入；`index.ts` 是 auth/articles/settings/taxonomy 的公开入口，跨功能协作由 `app/` 完成。SettingsEditor 位于 settings/components；设置与分类标签类型分别在各功能的 types.ts。编辑器从 LazyRichEditor 懒加载，入口不提前加载 MDXEditor。新增接口路径放在对应功能的 `api.ts`，不要散落在组件中。
- `docs/` 存放技术约定；构建配置、环境示例和 CI 留在仓库根目录。

## 写作助手

[写作助手 v1](docs/writing-assistant-v1.md) 说明服务商/助手管理、连续流式对话、选区与全文预览确认、发布元数据及第一期支持的选区范围。需 wellspring 启用独立 Agent 服务；正文改写需用户确认；摘要和发布信息在保存工作稿后生成，确认发布前可以编辑。

正文编辑区和工具栏固定在写作页面内，正文与助手历史分别滚动。普通对话通过 SSE 更新同一回复气泡，工具参数不显示；没有选区时可以生成全文修改建议。接受前后校验正文快照，接受标记未保存并形成一次撤销记录，拒绝不改正文。对话显示当前账户头像与助手身份。对话输入支持回车发送、展开为多行及中文输入法；助手管理可选择并保存 Lucide/Emoji 图标。配置和发布证据见[固定工作区与图标验收](https://github.com/raychi-space/raychi/issues/39#issuecomment-5971077966)。


## 保存与发布预览（2026-10-03）

写作页左侧正文、右侧助手。文章保存先持久化工作稿，再通过选中的助手生成发布标题、摘要和英文地址别名，全程不弹窗，也不公开。发布按钮先完成相同保存步骤，再在发布预览弹窗内确认；生成期间禁止提交，完成后可编辑标题、摘要与新文章别名。已发布文章保留原地址。别名取英文标题前五词并使用连字符连接；重名时自动附加内容 ID 短后缀，预览中仍可改写。

文章模型失败保留已保存工作稿并可重试；没有已启用助手时提示先配置。帖子仅保存正文和标签，不需要标题、摘要或模型；地址由服务器生成随机 UUID，发布后保持不变。生成期间暂时锁定编辑，防止结果覆盖较新的正文；关闭浏览器可中断元数据回写，正文已保存。相同已准备工作稿再次点击发布会复用结果。确认发布采用新 metadataReviewed 契约，后台不再覆盖确认的摘要。旧客户端仍支持原发布后摘要任务。发布标题与正文标题独立，手动修改发布标题不会改写正文。

运行 `npm run test:writing` 验证浏览器交互（安装 Chromium：`npx playwright install chromium`；macOS 使用 Chrome）。测试模拟 HTTP/模型结果，真实后端兼容性由 wellspring 测试和跨仓验收记录证明。

分类与标签在发布预览弹窗编辑，正文区不再展示。输入时过滤已有词，鼠标或方向键选中，支持中文输入法；分类单选，标签多选且可移除。新标签先留在本地或工作稿，回车、保存和取消预览均不创建标签目录；确认发布时由后端在同一事务中创建缺失标签并发布快照。分类仍通过分类接口创建。候选菜单浮到弹窗外层，窄屏可操作。

## 登录会话

初次加载先检查会话，再展示登录页或管理台。管理接口返回 `401 AUTH_REQUIRED` 时统一返回登录页，卸载受保护界面并取消其他管理请求；文章、工作稿、设置和助手状态不沿用到下一次登录。切换管理页面、浏览器重新获得焦点或标签重新可见时重新检查。网络故障、普通权限错误、服务商认证错误不会被当作站长退出。CSRF 失败会额外核对会话，但不自动重发保存/发布请求。运行 `npm run test:auth` 验证并发失效、过期响应与错误边界。

## 代码与故障回归（2026-10-03）

`npm run lint` 检查功能和 shared 依赖边界；`npm run format:check` 检查统一排版，`npm run format` 修复排版。CI 执行上述检查。网站级 HTTP 回归脚本位于 raychi 的 `scripts/site-e2e.py`，只允许显式确认的隔离环境；运行方式见项目的完整网站验收文档。

筛选刷新期间保留现有列表与本页统计，忽略旧筛选的晚到响应；刷新失败显示错误并保留内容。管理列表在后端按状态、类型、分类、标签筛选并排序，每页最多 50 条；更改筛选重置页码。字数、文章数、帖子数明确显示为本页统计，列表总数来自筛选后的 total。发布准备流程与管理列表请求分别由专用 hook 管理。

账户头像菜单支持修改密码：校验当前密码，确认新密码，成功后清除受保护状态并使用新密码重新登录；其他设备的登录同步失效。见[管理台使用说明](docs/management-ui.md#修改密码)。

## 搜索引擎收录

管理台 HTML 带 `robots: noindex, nofollow`，登录和编辑入口不参与公开站收录；内容授权仍由服务端会话与权限处理。公开站 SEO/RSS 在 lantern 实现，见[主任务 #43](https://github.com/raychi-space/raychi/issues/43)。
