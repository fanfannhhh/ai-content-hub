import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const RENDER_API = 'https://ai-content-hub-zf5t.onrender.com'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_BASE_URL || RENDER_API

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes, req) => {
              const accept = req.headers?.accept || ''
              if (accept.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache, no-transform'
                proxyRes.headers['x-accel-buffering'] = 'no'
              }
            })
          },
        },
      },
    },
  }
})
