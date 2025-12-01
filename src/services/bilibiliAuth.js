/**
 * B站登录认证服务
 * 支持二维码登录
 */

import { Capacitor } from '@capacitor/core'
import { httpGet } from './httpService'

const isNative = Capacitor.isNativePlatform()
const AUTH_STORAGE_KEY = 'bilibili-auth'

// 登录状态
let authInfo = {
  isLoggedIn: false,
  userId: null,
  userName: null,
  avatar: null,
  cookies: '',
  expiresAt: null
}

/**
 * 获取API URL（处理代理）
 */
function getApiUrl(path) {
  if (isNative) {
    return `https://passport.bilibili.com${path}`
  }
  // Web端使用代理
  return `/api/passport${path}`
}

/**
 * 获取主站API URL
 */
function getMainApiUrl(path) {
  if (isNative) {
    return `https://api.bilibili.com${path}`
  }
  return `/api/bili${path}`
}

function normalizeAvatar(url) {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return url.replace(/^http:/, 'https:')
  return url
}

/**
 * 从本地存储加载认证信息
 */
export function loadAuthFromStorage() {
  try {
    const data = localStorage.getItem(AUTH_STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      // 检查是否过期
      if (parsed.expiresAt && new Date(parsed.expiresAt) > new Date()) {
        authInfo = parsed
        return true
      } else {
        // 已过期，清除
        clearAuth()
      }
    }
  } catch (e) {
    console.error('加载B站认证信息失败:', e)
  }
  return false
}

/**
 * 保存认证信息到本地存储
 */
function saveAuthToStorage() {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authInfo))
  } catch (e) {
    console.error('保存B站认证信息失败:', e)
  }
}

/**
 * 清除认证信息
 */
export function clearAuth() {
  authInfo = {
    isLoggedIn: false,
    userId: null,
    userName: null,
    avatar: null,
    cookies: '',
    expiresAt: null
  }
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

/**
 * 获取当前认证状态
 */
export function getAuthInfo() {
  return { ...authInfo }
}

/**
 * 是否已登录
 */
export function isLoggedIn() {
  return authInfo.isLoggedIn && authInfo.cookies
}

/**
 * 获取登录Cookie（用于API请求）
 */
export function getAuthCookies() {
  return authInfo.cookies || ''
}

/**
 * 生成二维码登录密钥
 * @returns {Promise<{url: string, qrcode_key: string}>}
 */
export async function generateQRCode() {
  try {
    let data
    if (isNative) {
      // 原生端使用CapacitorHttp
      data = await httpGet('https://passport.bilibili.com/x/passport-login/web/qrcode/generate')
    } else {
      const response = await fetch(getApiUrl('/x/passport-login/web/qrcode/generate'))
      data = await response.json()
    }
    
    if (data.code !== 0) {
      throw new Error(data.message || '生成二维码失败')
    }
    
    return {
      url: data.data.url,        // 二维码内容URL
      qrcode_key: data.data.qrcode_key  // 用于轮询的key
    }
  } catch (error) {
    console.error('生成登录二维码失败:', error)
    throw error
  }
}

/**
 * 轮询检查二维码扫描状态
 * @param {string} qrcode_key - 二维码key
 * @returns {Promise<{status: number, message: string, cookies?: string}>}
 * 
 * status说明:
 * 86101 - 未扫码
 * 86090 - 已扫码未确认
 * 86038 - 二维码已过期
 * 0 - 登录成功
 */
export async function checkQRCodeStatus(qrcode_key) {
  try {
    let data, response
    
    if (isNative) {
      // 原生端使用CapacitorHttp
      data = await httpGet(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`)
    } else {
      response = await fetch(
        getApiUrl(`/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`)
      )
      data = await response.json()
    }
    
    const result = {
      status: data.data?.code ?? data.code,
      message: getStatusMessage(data.data?.code ?? data.code)
    }
    
    // 登录成功
    if (data.data?.code === 0) {
      // 从响应中提取Cookie
      const cookies = extractCookiesFromResponse(response, data.data)
      if (cookies) {
        result.cookies = cookies
        // 保存登录信息
        await saveLoginInfo(cookies, data.data)
      }
    }
    
    return result
  } catch (error) {
    console.error('检查二维码状态失败:', error)
    throw error
  }
}

/**
 * 获取状态消息
 */
function getStatusMessage(code) {
  const messages = {
    86101: '请扫描二维码',
    86090: '已扫码，请在手机上确认',
    86038: '二维码已过期，请刷新',
    0: '登录成功'
  }
  return messages[code] || '未知状态'
}

/**
 * 从响应中提取Cookie
 */
function extractCookiesFromResponse(response, data) {
  // 尝试从refresh_token构建Cookie字符串
  // 实际的Cookie会在Set-Cookie头中，但跨域无法获取
  // 这里使用url参数中的信息
  if (data.url) {
    const url = new URL(data.url)
    const params = new URLSearchParams(url.search)
    
    const cookies = []
    
    // B站登录成功后URL中会带有这些参数
    const DedeUserID = params.get('DedeUserID')
    const DedeUserID__ckMd5 = params.get('DedeUserID__ckMd5')
    const SESSDATA = params.get('SESSDATA')
    const bili_jct = params.get('bili_jct')
    
    if (DedeUserID) cookies.push(`DedeUserID=${DedeUserID}`)
    if (DedeUserID__ckMd5) cookies.push(`DedeUserID__ckMd5=${DedeUserID__ckMd5}`)
    if (SESSDATA) cookies.push(`SESSDATA=${SESSDATA}`)
    if (bili_jct) cookies.push(`bili_jct=${bili_jct}`)
    
    if (cookies.length > 0) {
      return cookies.join('; ')
    }
  }
  
  return null
}

/**
 * 保存登录信息
 */
async function saveLoginInfo(cookies, loginData) {
  authInfo.cookies = cookies
  authInfo.isLoggedIn = true
  
  // 设置过期时间（30天）
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  authInfo.expiresAt = expiresAt.toISOString()
  
  // 获取用户信息
  try {
    const userInfo = await fetchUserInfo()
    if (userInfo) {
      authInfo.userId = userInfo.mid
      authInfo.userName = userInfo.uname
      authInfo.avatar = normalizeAvatar(userInfo.face)
    }
  } catch (e) {
    console.warn('获取用户信息失败:', e)
  }
  
  saveAuthToStorage()
}

/**
 * 获取当前登录用户信息
 */
export async function fetchUserInfo() {
  if (!authInfo.cookies) return null
  
  try {
    let data
    if (isNative) {
      // 原生端使用CapacitorHttp
      data = await httpGet('https://api.bilibili.com/x/web-interface/nav', {
        headers: {
          'Cookie': authInfo.cookies
        }
      })
    } else {
      const response = await fetch(getMainApiUrl('/x/web-interface/nav'), {
        headers: {
          'Cookie': authInfo.cookies
        }
      })
      data = await response.json()
    }
    
    if (data.code === 0 && data.data?.isLogin) {
      return {
        mid: data.data.mid,
        uname: data.data.uname,
        face: data.data.face,
        vipType: data.data.vipType,
        vipStatus: data.data.vipStatus
      }
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
  }
  
  return null
}

/**
 * 使用Cookie字符串登录（手动输入方式）
 */
export async function loginWithCookies(cookieString) {
  if (!cookieString || !cookieString.includes('SESSDATA')) {
    throw new Error('Cookie格式不正确，需要包含SESSDATA')
  }
  
  authInfo.cookies = cookieString
  
  // 验证Cookie是否有效
  const userInfo = await fetchUserInfo()
  
  if (userInfo) {
    authInfo.isLoggedIn = true
    authInfo.userId = userInfo.mid
    authInfo.userName = userInfo.uname
    authInfo.avatar = normalizeAvatar(userInfo.face)
    
    // 设置过期时间
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)
    authInfo.expiresAt = expiresAt.toISOString()
    
    saveAuthToStorage()
    return userInfo
  } else {
    authInfo.cookies = ''
    throw new Error('Cookie无效或已过期')
  }
}

/**
 * 刷新登录状态
 */
export async function refreshAuthStatus() {
  if (!authInfo.cookies) {
    authInfo.isLoggedIn = false
    return false
  }
  
  const userInfo = await fetchUserInfo()
  if (userInfo) {
    authInfo.isLoggedIn = true
    authInfo.userId = userInfo.mid
    authInfo.userName = userInfo.uname
    authInfo.avatar = normalizeAvatar(userInfo.face)
    saveAuthToStorage()
    return true
  } else {
    clearAuth()
    return false
  }
}

// 初始化时加载认证信息
loadAuthFromStorage()

export default {
  loadAuthFromStorage,
  clearAuth,
  getAuthInfo,
  isLoggedIn,
  getAuthCookies,
  generateQRCode,
  checkQRCodeStatus,
  fetchUserInfo,
  loginWithCookies,
  refreshAuthStatus
}
