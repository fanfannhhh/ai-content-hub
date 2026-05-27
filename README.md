```markdown
# AI Content Hub (全栈 Multi-Agent 智能创作平台)

基于 **React + Tiptap** 与 **FastAPI** 构建的现代全栈 AI 写作辅助与排版平台。核心突破在于引入了 **Multi-Agent（多智能体）工作流**，告别单点模型调用，实现从“灵感发散 -> 深度续写 -> 质量审核 -> 结构化排版”的全链路自动化生成。

🟢 **线上预览 (Live Demo):** [https://ai-content-hub-pi.vercel.app](https://ai-content-hub-pi.vercel.app)  
*(由于后端部署于 Render 免费实例，首次冷启动可能需要 30-50 秒，请耐心等待)*

### 🎥 项目演示
![Demo GIF](GIF/动画.gif)

---

## ✨ 核心亮点 (Core Features)

- 🤖 **Multi-Agent 协同引擎 (核心)：** 
  内置定制化多智能体流（Planner-Writer-Reviewer 架构）。当用户框选文本请求“续写”或“润色”时，后台自动进行任务拆解，多 Agent 协作输出高质量、上下文连贯的内容，大幅降低大模型幻觉。
- 📝 **沉浸式 AI 富文本体验：**
  基于无头框架 Tiptap 深度定制，将 AI 交互（划词漂浮菜单、一键生成大纲）无缝融合进丝滑的现代编辑器 UI 中，摆脱传统富文本编辑器的死板界面。
- 📊 **结构化课件引擎：**
  打通内容交付最后一公里，一键将多智能体生成的长文大纲，利用 `python-pptx` 转化为结构清晰、分页合理的本地 `.pptx` 演示文稿。
- ☁️ **云原生与 Serverless 部署：**
  打通跨域 (CORS) 与复杂依赖链，前端通过 Vercel CDN 全球加速分发，后端托管于 Render 容器，实现高可用、零运维的自动化部署体验。

---

## 🛠 技术栈 (Tech Stack)

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端 (Frontend)** | React 18, Vite, Tiptap, TailwindCSS | 极致响应速度，高度可定制的无头编辑器 UI |
| **后端 (Backend)** | Python 3.10+, FastAPI, Uvicorn | 异步高并发处理，原生支持大模型耗时 I/O 请求 |
| **AI 引擎 (LLM)** | DeepSeek API | 极具性价比与代码/文本生成能力的国产大模型核心 |
| **文件处理 (File I/O)** | python-pptx | 将后端生成的 Markdown 数据流动态转化为可下载的幻灯片 |
| **云端部署 (DevOps)** | Vercel, Render, Git | CI/CD 自动化构建与全网分发 |

---

## 🚀 本地开发指南 (Local Development)

本项目采用前后端分离架构，本地开发需分别启动前后端服务。

### 1. 后端服务 (FastAPI)

```bash
# 1. 进入项目根目录
cd ai-content-hub

# 2. 安装 Python 依赖
pip install -r requirements.txt

# 3. 配置环境变量
# 在根目录创建 .env 文件并填入你的模型密钥：
# DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 4. 启动服务
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

```

后端启动后，可访问自动生成的 Swagger 接口文档：`http://127.0.0.1:8000/docs`

### 2. 前端服务 (React + Vite)

```bash
# 1. 另起一个终端，进入前端独立目录
cd ai-editor

# 2. 安装 Node.js 依赖
npm install

# 3. 配置环境变量
# 在 ai-editor 目录下创建 .env 文件，指向本地后端：
# VITE_API_BASE_URL=[http://127.0.0.1:8000](http://127.0.0.1:8000)

# 4. 启动开发服务器
npm run dev

```

前端启动后，浏览器访问：`http://localhost:5173`

---

## 📦 云端部署说明 (Deployment)

* **后端 (Render):**
* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `uvicorn main:app --host 0.0.0.0 --port 10000`
* *环境要求:* 需在 Render 仪表盘的 Environment 选项卡中注入 `DEEPSEEK_API_KEY`。


* **前端 (Vercel):**
* **Root Directory:** `ai-editor`
* **Install Command:** `npm install --legacy-peer-deps` *(解决 Tiptap 核心包严格依赖冲突)*
* *环境要求:* 需在 Vercel 环境变量中配置 `VITE_API_BASE_URL`，指向 Render 分配的线上域名。



---

## 🔌 核心 API 路由 (API Routes)

| 请求方法 | 路由路径 | 功能说明 |
| --- | --- | --- |
| `POST` | `/api/ai/complete` | **[Multi-Agent 驱动]** 接收上下文片段，返回 AI 润色、续写或改写后的文本内容。 |
| `POST` | `/api/ppt/outline` | 接收汇报主题 `topic`，生成层级分明的结构化大纲 (Markdown)。 |
| `POST` | `/api/ppt/download` | 根据确认的大纲流，生成并返回 `.pptx` 文件的二进制数据流。 |

## 📄 许可证 (License)

本项目为全栈开发与 AI 应用集成实践示例，欢迎自由 Fork、修改与交流学习。

```
```

