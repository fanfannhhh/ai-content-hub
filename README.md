
# AI Content Hub (全栈 AI 智能创作平台)

基于 **React + Tiptap** 与 **FastAPI + DeepSeek API** 构建的轻量级全栈 AI 写作与排版平台。支持 AI 上下文润色、续写，以及从文本到结构化 `.pptx` 课件的一键生成。

🟢 **线上预览 (Live Demo):** [https://ai-content-hub-pi.vercel.app](https://ai-content-hub-pi.vercel.app)  
*(前端托管于 Vercel，后端 API 托管于 Render)*

---

## 🛠 技术栈

- **前端:** React 18, Vite, Tiptap (无头富文本编辑器), TailwindCSS
- **后端:** Python 3.10+, FastAPI, Uvicorn
- **AI 引擎:** DeepSeek API
- **部署:** Vercel (前端 CDN), Render (后端 Serverless 容器)

---

## 🚀 本地开发指南

本项目采用前后端分离架构，本地开发需分别启动前端与后端服务。

### 1. 后端服务 (FastAPI)

```bash
# 进入项目根目录
cd ai-content-hub

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
# 在根目录创建 .env 文件并填入：
# DEEPSEEK_API_KEY=你的_DeepSeek_API_Key

# 启动服务
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

```
后端启动后，接口文档访问地址：http://127.0.0.1:8000/docs
### 2. 前端服务 (React + Vite)
```bash
# 另起一个终端，进入前端目录
cd ai-editor

# 安装依赖
npm install

# 配置环境变量
# 在 ai-editor 目录下创建 .env 文件并填入本地后端地址：
# VITE_API_BASE_URL=[http://127.0.0.1:8000](http://127.0.0.1:8000)

# 启动开发服务器
npm run dev

```
前端启动后，浏览器访问：http://localhost:5173
## 📦 云端部署说明
 * **后端 (Render):**
   构建命令：pip install -r requirements.txt
   启动命令：uvicorn main:app --host 0.0.0.0 --port 10000
   *需在 Render 后台配置 DEEPSEEK_API_KEY 环境变量。*
 * **前端 (Vercel):**
   Root Directory 设置为 ai-editor。
   *需在 Vercel 后台配置 VITE_API_BASE_URL 指向你的线上后端地址。*
## 🔌 核心 API 路由说明
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/ppt/outline | 传入 {"topic":"主题"}，调用 DeepSeek 生成结构化大纲 |
| POST | /api/ppt/download | 根据生成的大纲，利用 python-pptx 动态生成 PPT 二进制流 |
| POST | /api/ai/complete | (如有) 文本 AI 润色与续写接口 |
## 📄 许可证
本项目为示例项目，可自由修改用于教学或个人用途。
```
