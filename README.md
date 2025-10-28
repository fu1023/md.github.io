# 在线 Markdown 编辑器（可部署到 GitHub Pages）

这是一个简单的静态网站，提供在线 Markdown 编辑、实时预览与保存功能。可以直接把本仓库推到 GitHub 并启用 GitHub Pages（`main` 或 `gh-pages` 分支）。

功能：

- 实时预览（使用 marked + DOMPurify）
- 自动保存到 localStorage（浏览器本地）
- 下载为 `.md` 文件
- 可选择创建 GitHub Gist（需提供 Personal Access Token，可选）

部署：

1. 将仓库推到 GitHub（例如 `username/repo`）。
2. 在仓库设置 -> Pages 中选择分支（`main` 或 `gh-pages`），保存。几分钟后站点可访问。

安全提醒：

- 创建 Gist 时若使用 Personal Access Token（PAT），请确保只赋予必要权限（通常 `gist` 权限即可），并避免在不安全环境下泄露。

本地测试：

1. 打开 `index.html`（双击或通过本地静态服务器），即可使用编辑器。
2. 推荐使用 VS Code Live Server 或 Python 的简单 HTTP 服务器进行测试：

```powershell
# 在项目根目录运行（Windows PowerShell）
# Python 3
python -m http.server 8000
# 然后访问 http://localhost:8000
```

后续改进建议：

- 增加主题切换（浅色/深色）
- 增加文件历史版本与恢复功能
- 支持直接保存到仓库（需 OAuth 应用或 PAT）

---

已生成的文件：

- `index.html` — 主页面
- `styles.css` — 样式表
- `script.js` — 主逻辑
- `README.md` — 使用与部署说明
