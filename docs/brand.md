# 鳐鱼品牌资源

关联：raychi-space/raychi#109、inkwell#63。使用用户确认的朝右游动鳐鱼，与公开站保持同一设计。资源由内置 imagegen 生成，原始母版与提示词记录在 [lantern 品牌说明](https://github.com/raychi-space/lantern/blob/main/docs/brand/README.md)。

本仓保存独立副本：`src/shared/assets/brand/manta-light.webp`、`manta-dark.webp`，以及 `public/favicon.ico`、`icon.png`、`apple-icon.png`；构建与运行不读取相邻仓库。后续品牌更新应同时核对两个前端的资源内容，不能只更新其中一处。

`shared/ui/BrandMark` 统一渲染装饰性图片，浅/深主题复用现有 `data-theme`。侧栏背景始终较深，通过 `inverse` 固定使用深色版；不改变 Logo 的返回概览/展开操作及导航无障碍名称。登录页显示 84 × 56px，空状态 72 × 48px；侧栏复用已有固定图标区域，在手机/折叠状态下不扩大导航栏。

HTML 的 favicon 与 Apple 图标使用 `%BASE_URL%`，生产 `vite build --base=/studio/` 后指向本站 `/studio/` 下的资源，避免误用公开站根路径。ICO 包含 16/32/48px，PNG 为 64px，Apple 图标为 180px；简化图标固定米白底，确保浏览器深浅背景可辨识。

本轮只替换站点品牌占位标记，并为登录页增加同一标识；保留用户头像和头像加载失败时的用户图标、助手图标库、模型服务商 Logo 及操作功能图标。无 API、认证、数据库或内容保存行为变化。
