/**
 * 代理服务
 * 用于解决跨域请求问题
 */

// 公共CORS代理列表（按优先级排序）
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest='
]

let currentProxyIndex = 0

/**
 * 使用代理获取URL内容
 * @param {string} url - 目标URL
 * @param {object} options - fetch选项
 * @returns {Promise<Response>}
 */
export async function fetchWithProxy(url, options = {}) {
  // 首先尝试直接请求
  try {
    const response = await fetch(url, {
      ...options,
      mode: 'cors'
    })
    if (response.ok) return response
  } catch (e) {
    console.log('直接请求失败，尝试代理:', e.message)
  }
  
  // 尝试使用代理
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length
    const proxy = CORS_PROXIES[proxyIndex]
    
    try {
      const proxyUrl = proxy + encodeURIComponent(url)
      const response = await fetch(proxyUrl, {
        ...options,
        mode: 'cors'
      })
      
      if (response.ok) {
        currentProxyIndex = proxyIndex // 记住可用的代理
        return response
      }
    } catch (e) {
      console.log(`代理 ${proxy} 失败:`, e.message)
    }
  }
  
  throw new Error('所有代理请求均失败')
}

/**
 * 使用代理获取JSON
 */
export async function fetchJsonWithProxy(url, options = {}) {
  const response = await fetchWithProxy(url, options)
  const contentType = response.headers.get('content-type') || ''
  
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('代理返回的内容不是JSON')
  }
  
  return response.json()
}

/**
 * 用于B站API的特殊处理
 * B站某些API需要特定的headers
 */
export async function fetchBilibiliApi(url, options = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com'
  }
  
  return fetchJsonWithProxy(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  })
}

export default {
  fetchWithProxy,
  fetchJsonWithProxy,
  fetchBilibiliApi
}
