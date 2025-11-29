/**
 * HTTP请求服务
 * 原生端使用CapacitorHttp绑过CORS限制
 * Web端使用Vite代理
 */

import { Capacitor } from '@capacitor/core'
import { CapacitorHttp } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

/**
 * 发起HTTP GET请求
 * @param {string} url - 请求URL
 * @param {object} options - 请求选项
 * @returns {Promise<object>}
 */
export async function httpGet(url, options = {}) {
  if (isNative) {
    // 原生端使用CapacitorHttp
    try {
      const response = await CapacitorHttp.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.bilibili.com/',
          ...options.headers
        }
      })
      
      // CapacitorHttp返回的data已经是解析后的对象
      if (typeof response.data === 'string') {
        try {
          return JSON.parse(response.data)
        } catch {
          return response.data
        }
      }
      return response.data
    } catch (error) {
      console.error('CapacitorHttp请求失败:', error)
      throw error
    }
  } else {
    // Web端使用fetch
    const response = await fetch(url, {
      headers: options.headers
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
}

/**
 * 发起HTTP POST请求
 * @param {string} url - 请求URL
 * @param {object} data - 请求数据
 * @param {object} options - 请求选项
 * @returns {Promise<object>}
 */
export async function httpPost(url, data = {}, options = {}) {
  if (isNative) {
    try {
      const response = await CapacitorHttp.post({
        url,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.bilibili.com/',
          ...options.headers
        },
        data
      })
      
      if (typeof response.data === 'string') {
        try {
          return JSON.parse(response.data)
        } catch {
          return response.data
        }
      }
      return response.data
    } catch (error) {
      console.error('CapacitorHttp POST请求失败:', error)
      throw error
    }
  } else {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    return response.json()
  }
}

export default {
  get: httpGet,
  post: httpPost
}
