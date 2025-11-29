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
      },
      // 喜马拉雅API代理
      '/api/ximalaya': {
        target: 'https://www.ximalaya.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ximalaya/, ''),
        headers: {
          'Referer': 'https://www.ximalaya.com',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        }
      },
      // 喜马拉雅移动端API
      '/api/ximalaya-mobile': {
        target: 'https://mobile.ximalaya.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ximalaya-mobile/, ''),
        headers: {
          'User-Agent': 'ting_v6.6.90_c0_Android'
        }
      },
      // 喜马拉雅登录API
      '/api/ximalaya-passport': {
        target: 'https://passport.ximalaya.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ximalaya-passport/, ''),
        headers: {
          'Referer': 'https://www.ximalaya.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      // 蜻蜓FM API代理
      '/api/qingting': {
        target: 'https://search.qingting.fm',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/qingting/, ''),
        headers: {
          'Referer': 'https://www.qingting.fm',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
        }
      },
      // 通用代理 - 用于第三方书源请求
      '/api/proxy': {
        target: 'https://placeholder.com',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 从查询参数中获取目标URL
            const url = new URL(req.url, 'http://localhost')
            const targetUrl = url.searchParams.get('url')
            if (targetUrl) {
              try {
                const target = new URL(targetUrl)
                proxyReq.setHeader('Host', target.host)
                proxyReq.path = target.pathname + target.search
              } catch (e) {
                console.error('代理URL解析失败:', e)
              }
            }
          })
        },
        router: (req) => {
          const url = new URL(req.url, 'http://localhost')
          const targetUrl = url.searchParams.get('url')
          if (targetUrl) {
            try {
              const target = new URL(targetUrl)
              return target.origin
            } catch {
              return 'https://placeholder.com'
            }
          }
          return 'https://placeholder.com'
        },
        rewrite: (p) => {
          const url = new URL(p, 'http://localhost')
          const targetUrl = url.searchParams.get('url')
          if (targetUrl) {
            try {
              const target = new URL(targetUrl)
              return target.pathname + target.search
            } catch {
              return p
            }
          }
          return p
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    },
  },
})
