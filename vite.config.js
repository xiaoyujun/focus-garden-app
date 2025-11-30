import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import https from 'https'
import http from 'http'

// 通用代理插件 - 用于第三方书源请求
function proxyPlugin() {
  return {
    name: 'universal-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const reqUrl = new URL(req.url, 'http://localhost')
        const targetUrl = reqUrl.searchParams.get('url')
        const forceMethod = reqUrl.searchParams.get('method') // 支持强制 POST
        
        console.log('[代理] 收到请求:', req.method, req.url?.substring(0, 100))
        console.log('[代理] 目标URL:', targetUrl?.substring(0, 100))
        
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: '缺少 url 参数' }))
          return
        }
        
        // 读取 POST 请求体
        let requestBody = ''
        if (req.method === 'POST') {
          requestBody = await new Promise((resolve) => {
            let data = ''
            req.on('data', chunk => data += chunk)
            req.on('end', () => resolve(data))
          })
          console.log('[代理] 请求体:', requestBody?.substring(0, 200))
        }
        
        // 递归请求函数，支持重定向跟随
        function doRequest(url, redirectCount = 0, body = requestBody) {
          const maxRedirects = 5
          if (redirectCount > maxRedirects) {
            console.error('[代理] 重定向次数过多')
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '重定向次数过多' }))
            }
            return
          }
          
          let target
          try {
            target = new URL(url)
          } catch (e) {
            console.error('[代理] URL解析失败:', e.message)
            if (!res.headersSent) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '无效的目标 URL: ' + e.message }))
            }
            return
          }
          
          // 确保路径正确编码中文
          const encodedPath = target.pathname.split('/').map(p => encodeURIComponent(decodeURIComponent(p))).join('/') + target.search
          console.log('[代理] 请求路径:', encodedPath, redirectCount > 0 ? `(重定向 #${redirectCount})` : '')
          
          const client = target.protocol === 'https:' ? https : http
          const method = forceMethod || req.method || 'GET'
          const options = {
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: encodedPath,
            method: method,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain;q=0.8,*/*;q=0.7',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'Host': target.host,
              'Referer': target.origin + '/'
            }
          }
          
          // 添加 POST 请求的 Content-Type
          if (method === 'POST' && body) {
            options.headers['Content-Type'] = 'application/json'
            options.headers['Content-Length'] = Buffer.byteLength(body)
          }
          
          console.log('[代理] 发起请求:', method, target.hostname, encodedPath?.substring(0, 50))
          
          const proxyReq = client.request(options, (proxyRes) => {
            console.log('[代理] 响应状态:', proxyRes.statusCode, '类型:', proxyRes.headers['content-type'])
            
            // 处理重定向 - 跟随 3xx 响应
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
              const redirectUrl = proxyRes.headers.location.startsWith('http') 
                ? proxyRes.headers.location 
                : new URL(proxyRes.headers.location, url).href
              console.log('[代理] 跟随重定向到:', redirectUrl)
              doRequest(redirectUrl, redirectCount + 1)
              return
            }
            
            // 移除可能导致问题的响应头
            const headers = { ...proxyRes.headers }
            delete headers['content-security-policy']
            delete headers['x-frame-options']
            
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Headers', '*')
            res.writeHead(proxyRes.statusCode, headers)
            proxyRes.pipe(res)
          })
          
          proxyReq.on('error', (err) => {
            console.error('[代理] 请求失败:', err.message)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '代理请求失败: ' + err.message }))
            }
          })
          
          // 写入请求体（POST 请求）
          if (method === 'POST' && body) {
            proxyReq.write(body)
          }
          proxyReq.end()
        }
        
        doRequest(targetUrl)
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), proxyPlugin()],
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
    },
  },
})
