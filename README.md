# md.github.io

这是一个可以部署到 GitHub Pages 的静态 Markdown 在线笔记本，支持在线编辑、实时预览、本地自动保存和导出功能。

快速使用说明：

- 本地打开：直接在浏览器中打开 `index.html`（推荐使用本地静态服务器以避免某些浏览器对本地文件的限制）。
- 本地服务器示例（PowerShell）：

```powershell
# 使用 Python3 提供一个临时静态服务器（在项目根目录运行）
python -m http.server 8000
# 然后在浏览器打开 http://localhost:8000
```

部署到 GitHub Pages：

1. 将仓库推送到 GitHub（比如 `main` 分支）。
2. 在仓库 Settings -> Pages 中选择要发布的分支（例如 `main`）并保存。
3. GitHub 会在几分钟内生成网站，访问 `https://<your-username>.github.io/<repo-name>/`。

主要功能：

- 实时预览：编辑区（左）↔ 预览区（右），使用 `marked` 渲染 Markdown。
- 自动保存：内容会自动保存到浏览器的 `localStorage`（键：`markdownFiles`）。
- 文件管理：支持创建、重命名、删除、导出（下载 .md 文件）。
- 导出：将当前笔记导出为本地 `.md` 文件。
- 保存到 GitHub：可选择将当前笔记以 Gist 形式保存到 GitHub（需要用户提供带 gist 权限的个人访问令牌）。

安全说明：

- 应用不会将任何令牌发送到第三方服务器。若使用“保存到 GitHub(Gist)”功能，需在弹窗中输入你的个人访问令牌（PAT），该令牌仅会保存在 `sessionStorage`（浏览器会话）中，页面关闭后将失效。
- 不要在公共环境下保存长时有效的敏感令牌。

如需我把 README.md 进一步扩展成部署脚本或添加 CI/CD 自动发布到 Pages，我可以继续帮你配置。