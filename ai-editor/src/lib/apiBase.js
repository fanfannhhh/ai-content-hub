/** Backend base URL; set VITE_API_BASE_URL in .env for local or custom deployment. */
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'https://ai-content-hub-zf5t.onrender.com'

/** Shown when fetch fails or times out (no hardcoded localhost). */
export const API_CONNECT_ERROR = '无法连接后端服务，请检查网络连接或稍后重试'

export const API_TIMEOUT_ERROR = '请求超时，请检查网络连接或稍后重试'
