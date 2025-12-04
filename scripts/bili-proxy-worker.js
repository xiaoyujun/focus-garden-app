/**
 * B站视频代理 - Cloudflare Worker
 * 
 * 部署步骤：
 * 1. 登录 https://dash.cloudflare.com/
 * 2. 进入 Workers & Pages -> Create Application -> Create Worker
 * 3. 粘贴此代码并部署
 * 4. 复制生成的 Worker URL，配置到 .env 文件的 VITE_BILI_PROXY_URL
 *    例如: VITE_BILI_PROXY_URL=https://your-worker.your-subdomain.workers.dev/?url=
 * 
 * 免费额度：每天 100,000 请求
 */

// B站 CDN 域名白名单
const ALLOWED_DOMAINS = [
  'bilivideo.com',
  'bilivideo.cn',
  'hdslb.com',
  'akamaized.net',
  'biliapi.net'
]

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const targetUrl = url.searchParams.get('url')

    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
          'Access-Control-Max-Age': '86400'
        }
      })
    }

    // 验证参数
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: '缺少 url 参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 解析目标 URL
    let target
    try {
      target = new URL(targetUrl)
    } catch (e) {
      return new Response(JSON.stringify({ error: '无效的目标 URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 域名白名单校验
    const isAllowed = ALLOWED_DOMAINS.some(d => target.hostname.endsWith(d))
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: '域名不在允许列表中' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 构建请求头
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Origin': 'https://www.bilibili.com'
    }

    // 转发 Range 请求头（视频 seek 需要）
    const range = request.headers.get('Range')
    if (range) {
      headers['Range'] = range
    }

    try {
      // 发起请求
      const response = await fetch(targetUrl, { headers })

      // 处理重定向
      if (response.status >= 300 && response.status < 400) {
        const redirectUrl = response.headers.get('Location')
        if (redirectUrl) {
          // 重新代理重定向地址
          const newUrl = new URL(request.url)
          newUrl.searchParams.set('url', redirectUrl)
          return Response.redirect(newUrl.toString(), 302)
        }
      }

      // 构建响应头
      const responseHeaders = new Headers()
      responseHeaders.set('Access-Control-Allow-Origin', '*')
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
      responseHeaders.set('Cache-Control', 'public, max-age=3600')

      // 保留必要的响应头
      const headersToKeep = ['content-type', 'content-length', 'content-range', 'accept-ranges']
      for (const header of headersToKeep) {
        const value = response.headers.get(header)
        if (value) {
          responseHeaders.set(header, value)
        }
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: '代理请求失败: ' + e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
}
