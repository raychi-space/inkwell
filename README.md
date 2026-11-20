# inkwell

RayChi 的内容管理台，使用 React 和 Vite。通过 [wellspring](https://github.com/raychi-space/wellspring) 登录、编辑和发布内容。

## 本地开发

使用 Node.js 26，并先本地启动 wellspring。

```bash
npm ci
npm run dev
```

开发入口默认在 `http://127.0.0.1:5173`。Vite 将本地 `/api` 请求转发到 `RAYCHI_API_URL`，默认值是 `http://127.0.0.1:8080`。

## 验证

```bash
npm run lint
npm run format:check
npm run test:auth
npm run test:cache
npm run build
```

浏览器回归使用 `npm run test:writing`。macOS 使用 Chrome，Linux CI 安装 Playwright Chromium。

第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 文章编辑

粘贴 Markdown 源文到文章正文时，标题、粗体、列表和 GFM 表格会转换为可编辑内容。按一次撤销即可恢复粘贴前的正文。普通文本直接插入，剪贴板图片会自动上传。

## 个人设置

头像、昵称和密码各自编辑、保存和取消。昵称保存后更新管理台显示名，沿用当前登录会话。修改密码需要当前密码和两次新密码，成功后使用新密码重新登录。页面会在离开实际有未保存修改的编辑时提醒。
