/**
 * B站登录认证与多会话支持
 */

import { Capacitor } from '@capacitor/core'
import { httpGet } from './httpService'
import { useUserStore, onUserSwitched, onUserRemoved } from '../stores/userStore'

const isNative = Capacitor.isNativePlatform()
const SESSION_STORAGE_KEY = 'bilibili-auth-sessions'
const DEFAULT_EXPIRE_DAYS = 30

let sessionsCache = loadSessionsFromStorage()
let activeSession = null

function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed.sessions || {}
  } catch (error) {
    console.error('加载B站会话失败:', error)
    return {}
  }
}

function persistSessions() {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ sessions: sessionsCache }))
  } catch (error) {
    console.error('保存B站会话失败:', error)
  }
}

function normalizeAvatar(url) {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return url.replace(/^http:/, 'https:')
  return url
}

function getExpireDate(days = DEFAULT_EXPIRE_DAYS) {
  const expires = new Date()
  expires.setDate(expires.getDate() + days)
  return expires.toISOString()
}

function safeUserStore() {
  try {
    return useUserStore()
  } catch {
    return null
  }
}

function getActiveUserId() {
  const store = safeUserStore()
  return store?.activeUserId || null
}

function isSessionExpired(session) {
  if (!session?.expiresAt) return false
  return new Date(session.expiresAt) <= new Date()
}

function syncActiveSession(userId = getActiveUserId()) {
  activeSession = userId ? sessionsCache[userId] || null : null
  if (activeSession && isSessionExpired(activeSession)) {
    clearSession(userId)
    activeSession = null
  }
}

function saveSession(userId, session) {
  if (!userId) return null
  sessionsCache[userId] = {
    ...session,
    userId: session.userId || userId.replace(/^bili:/, ''),
    userName: session.userName || session.displayName || '',
    avatar: normalizeAvatar(session.avatar),
    expiresAt: session.expiresAt || getExpireDate(),
    lastValidatedAt: session.lastValidatedAt || new Date().toISOString()
  }
  persistSessions()
  if (userId === getActiveUserId()) {
    activeSession = sessionsCache[userId]
  }
  return sessionsCache[userId]
}

function loadSessionFor(userId) {
  return sessionsCache[userId] || null
}

function clearSession(userId = getActiveUserId()) {
  if (!userId) return
  delete sessionsCache[userId]
  persistSessions()
  if (userId === getActiveUserId()) {
    activeSession = null
  }
}

syncActiveSession()

onUserSwitched((userId) => {
  syncActiveSession(userId)
})

onUserRemoved((userId) => {
  clearSession(userId)
})

/**
 * 获取API URL（处理代理）
 */
function getApiUrl(path) {
  if (isNative) {
    return `https://passport.bilibili.com${path}`
  }
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

/**
 * 读取当前会话信息
 */
export function getAuthInfo() {
  syncActiveSession()
  if (!activeSession) {
    return {
      isLoggedIn: false,
      userId: null,
      userName: null,
      avatar: null,
      cookies: '',
      sessionKey: null
    }
  }
  const sessionKey = getActiveUserId()
  return {
    ...activeSession,
    sessionKey,
    isLoggedIn: !!activeSession.cookies && !isSessionExpired(activeSession)
  }
}

export function isLoggedIn() {
  return getAuthInfo().isLoggedIn
}

export function getAuthCookies() {
  const info = getAuthInfo()
  return info.isLoggedIn ? (info.cookies || '') : ''
}

/**
 * 从本地读取会话，返回是否存在有效登录
 */
export function loadAuthFromStorage() {
  syncActiveSession()
  return isLoggedIn()
}

/**
 * 清除当前用户的登录状态
 */
export function clearAuth() {
  clearSession(getActiveUserId())
}

/**
 * 生成二维码登录密钥
 */
export async function generateQRCode() {
  try {
    let data
    if (isNative) {
      data = await httpGet('https://passport.bilibili.com/x/passport-login/web/qrcode/generate')
    } else {
      const response = await fetch(getApiUrl('/x/passport-login/web/qrcode/generate'))
      data = await response.json()
    }
    
    if (data.code !== 0) {
      throw new Error(data.message || '生成二维码失败')
    }
    
    return {
      url: data.data.url,
      qrcode_key: data.data.qrcode_key
    }
  } catch (error) {
    console.error('生成登录二维码失败:', error)
    throw error
  }
}

/**
 * 轮询检查二维码扫描状态
 */
export async function checkQRCodeStatus(qrcode_key) {
  try {
    let data, response
    
    if (isNative) {
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
    
    if (data.data?.code === 0) {
      const cookies = extractCookiesFromResponse(response, data.data)
      if (cookies) {
        const session = await finalizeLoginWithCookies(cookies)
        result.session = session
      }
    }
    
    return result
  } catch (error) {
    console.error('检查二维码状态失败:', error)
    throw error
  }
}

function getStatusMessage(code) {
  const messages = {
    86101: '请扫描二维码',
    86090: '已扫码，请在手机上确认',
    86038: '二维码已过期，请刷新',
    0: '登录成功'
  }
  return messages[code] || '未知状态'
}

function extractCookiesFromResponse(response, data) {
  if (data?.url) {
    const url = new URL(data.url)
    const params = new URLSearchParams(url.search)
    
    const cookies = []
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
 * 获取当前登录用户信息
 */
export async function fetchUserInfo(targetCookies = null) {
  const cookies = targetCookies || getAuthCookies()
  if (!cookies) return null
  
  try {
    let data
    if (isNative) {
      data = await httpGet('https://api.bilibili.com/x/web-interface/nav', {
        headers: {
          'Cookie': cookies
        }
      })
    } else {
      const response = await fetch(getMainApiUrl('/x/web-interface/nav'), {
        headers: {
          'Cookie': cookies
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

async function finalizeLoginWithCookies(cookieString) {
  if (!cookieString || !cookieString.includes('SESSDATA')) {
    throw new Error('Cookie格式不正确，需要包含SESSDATA')
  }
  const userInfo = await fetchUserInfo(cookieString)
  if (!userInfo) {
    throw new Error('Cookie无效或已过期')
  }
  const sessionKey = `bili:${userInfo.mid}`
  const session = saveSession(sessionKey, {
    cookies: cookieString,
    userId: String(userInfo.mid),
    userName: userInfo.uname,
    avatar: normalizeAvatar(userInfo.face),
    expiresAt: getExpireDate(),
    lastValidatedAt: new Date().toISOString()
  })
  const userStore = safeUserStore()
  if (userStore) {
    userStore.registerOrUpdate({
      uid: String(userInfo.mid),
      source: 'bilibili',
      displayName: userInfo.uname,
      avatar: session.avatar,
      sessionKey
    })
  }
  return { sessionKey, ...session }
}

/**
 * 使用Cookie字符串登录
 */
export async function loginWithCookies(cookieString) {
  return finalizeLoginWithCookies(cookieString)
}

/**
 * 刷新当前登录状态
 */
export async function refreshAuthStatus() {
  const cookies = getAuthCookies()
  if (!cookies) {
    clearAuth()
    return false
  }
  const userInfo = await fetchUserInfo(cookies)
  if (userInfo) {
    const sessionKey = `bili:${userInfo.mid}`
    saveSession(sessionKey, {
      ...(loadSessionFor(sessionKey) || {}),
      cookies,
      userId: String(userInfo.mid),
      userName: userInfo.uname,
      avatar: userInfo.face,
      lastValidatedAt: new Date().toISOString()
    })
    return true
  }
  clearAuth()
  return false
}

// 模块初始化时同步一次会话
loadAuthFromStorage()

export {
  saveSession,
  loadSessionFor,
  clearSession
}

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
  refreshAuthStatus,
  saveSession,
  loadSessionFor,
  clearSession
}
