# AI 课堂 PPT 自动生成工具

基于 **FastAPI**、**DeepSeek API** 与 **python-pptx** 的轻量工具：输入课堂汇报主题，自动生成结构化大纲，并导出多页 `.pptx` 课件（封面、目录、分章节分页正文）。

## 环境要求

- Python 3.10+（推荐 3.11）
- 已注册的 [DeepSeek](https://platform.deepseek.com/) API 密钥

## 1. 安装依赖

在项目根目录（含 `main.py`、`requirements.txt` 的目录）执行：

```bash
pip install -r requirements.txt
```

若使用虚拟环境：

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. 配置密钥

复制或编辑根目录下的 `.env` 文件，将 `DEEPSEEK_API_KEY` 替换为你的密钥：

```env
DEEPSEEK_API_KEY=你的DeepSeek_API密钥
```

**注意**：不要将真实密钥提交到公共代码仓库。

## 3. 启动后端服务

仍在项目根目录执行：

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

看到 `Uvicorn running on http://127.0.0.1:8000` 即表示启动成功。

## 4. 打开网页

在浏览器访问：

**http://127.0.0.1:8000/**

**A4 写作编辑器**请在 `ai-editor` 目录执行 `npm run dev`，浏览器打开 http://localhost:5173（API 经 Vite 代理到 8000 端口）。后端 API 文档见 http://127.0.0.1:8000/docs 。

## 5. 使用步骤

1. 在输入框填写汇报主题（如课程名、章节名）。
2. 点击 **「生成大纲」**：调用 DeepSeek 生成结构化大纲，并在页面展示。
3. 点击 **「下载 PPT」**：再次调用模型生成一致结构，并由服务器生成多页 PPT，浏览器保存 `.pptx` 文件。

下载采用 **Blob + 用户点击触发** 的方式，有利于减少浏览器的下载拦截。

## API 说明

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ppt/outline` | 请求体 JSON：`{"topic":"主题"}`，返回 `outline`（Markdown 文本）等 |
| POST | `/api/ppt/download` | 同上，返回 PPT 二进制流，`Content-Disposition` 为附件 |

## 依赖列表

- `fastapi`：Web 框架  
- `uvicorn`：ASGI 服务  
- `requests`：调用 DeepSeek HTTP API  
- `python-dotenv`：读取 `.env`  
- `python-pptx`：生成 PowerPoint 文件  

## 常见问题

- **提示未配置 DEEPSEEK_API_KEY**：检查 `.env` 是否在项目根目录、变量名是否拼写正确，修改后需重启 `uvicorn`。  
- **502 / DeepSeek 错误**：检查密钥是否有效、网络是否能访问 `api.deepseek.com`。  
- **下载无反应**：请使用 `http://127.0.0.1:8000/` 打开页面；关闭浏览器对多文件下载的拦截后再试。

## 许可证

示例项目，可自由修改用于教学或个人用途。
