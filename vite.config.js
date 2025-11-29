import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // B站登录API代理（必须放在前面，避免被/api/bili匹配）
      '/api/passport': {
        target: 'https://passport.bilibili.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/passport/, ''),
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://www.bilibili.com'
        }
      },
      // B站搜索API代理
      '/api/bili-search': {
        target: 'https://api.bilibili.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/bili-search/, ''),
        headers: {
          'Referer': 'https://search.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': 'buvid3=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX12345infoc; b_nut=1700000000; _uuid=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX12345infoc'
        }
      },
      // B站主站API代理
      '/api/bili': {
        target: 'https://api.bilibili.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/bili/, ''),
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://www.bilibili.com'
        }
      }
    },
  },
})
