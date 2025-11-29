/**
 * 喜马拉雅登录与认证服务
 * 支持 Cookie 登录与二维码登录，Web 端带有 CORS 兜底
 */

import { Capacitor } from '@capacitor/core'
import { httpGet } from './httpService'
import { fetchJsonWithProxy } from './proxyService'

const XIMALAYA_AUTH_KEY = 'ximalaya-auth-data'
const isNative = Capacitor.isNativePlatform()

// 认证状态
let authData = {
  cookies: '',
  userId: '',
  userName: '',
  avatar: '',
  isVip: false,
  vipExpireTime: '',
  loginTime: null
}

// 二维码状态
let qrCodeData = {
  qrId: '',
  qrImg: '',
  pollingTimer: null
}

/**
 * 统一请求封装：优先直连，其次走通用代理，减少 CORS 失败
 */
async function requestXimalayaJson(
  urls,
  { headers = {}, includeCredentials = false, errorLabel = '请求失败', fallbackHint = '' } = {}
) {
  let lastError = null

  if (isNative) {
    try {
      return await httpGet(urls.native, { headers })
    } catch (error) {
      lastError = error
    }
  } else {
    try {
      const response = await fetch(urls.web, {
        headers,
        credentials: includeCredentials ? 'include' : 'omit'
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (urls.proxy) {
        try {
          return await fetchJsonWithProxy(urls.proxy, { headers })
        } catch (proxyError) {
          lastError = proxyError
        }
      }
    }
  }

  const hint = fallbackHint ? `，${fallbackHint}` : ''
  throw new Error(`${errorLabel}${hint}：${lastError?.message || '未知错误'}`)
}

/**
 * 从本地存储加载认证信息
 */
export function loadAuthFromStorage() {
  try {
    const data = localStorage.getItem(XIMALAYA_AUTH_KEY)
    if (data) {
      authData = JSON.parse(data)
    }
  } catch (e) {
    console.error('加载喜马拉雅认证信息失败:', e)
  }
}

/**
 * 保存认证信息到本地存储
 */
function saveAuthToStorage() {
  try {
    localStorage.setItem(XIMALAYA_AUTH_KEY, JSON.stringify(authData))
  } catch (e) {
    console.error('保存喜马拉雅认证信息失败:', e)
  }
}

/**
 * 检查是否已登录
 */
export function isLoggedIn() {
  return !!authData.cookies && !!authData.userId
}

/**
 * 检查是否为 VIP
 */
export function isVip() {
  return authData.isVip
}

/**
 * 获取认证信息
 */
export function getAuthInfo() {
  return { ...authData }
}

/**
 * 获取认证 Cookie
 */
export function getAuthCookies() {
  return authData.cookies || ''
}

/**
 * 通过 Cookie 登录
 * @param {string} cookieStr - Cookie 字符串
 */
export async function loginWithCookie(cookieStr) {
  if (!cookieStr || !cookieStr.trim()) {
    throw new Error('Cookie 不能为空')
  }

  authData.cookies = cookieStr.trim()

  try {
    await fetchUserInfo()
    authData.loginTime = new Date().toISOString()
    saveAuthToStorage()
    return getAuthInfo()
  } catch (error) {
    authData.cookies = ''
    throw error
  }
}

/**
 * 获取用户信息（用于 Cookie 登录验证）
 */
async function fetchUserInfo() {
  const data = await requestXimalayaJson(
    {
      native: 'https://www.ximalaya.com/revision/main/getCurrentUser',
      web: '/api/ximalaya/revision/main/getCurrentUser',
      proxy: 'https://www.ximalaya.com/revision/main/getCurrentUser'
    },
    {
      headers: { Cookie: authData.cookies },
      includeCredentials: true,
      errorLabel: 'Cookie 无效或已过期'
    }
  )

  if (data.ret !== 200 || !data.data) {
    throw new Error('Cookie 无效或已过期')
  }

  const user = data.data
  authData.userId = user.uid?.toString() || ''
  authData.userName = user.nickname || ''
  authData.avatar = user.cover || user.logoPic || ''
  authData.isVip = user.isVip || user.vipInfo?.isVip || false
  authData.vipExpireTime = user.vipInfo?.endTime || ''

  return authData
}

/**
 * 退出登录
 */
export function logout() {
  stopQRCodePolling()
  authData = {
    cookies: '',
    userId: '',
    userName: '',
    avatar: '',
    isVip: false,
    vipExpireTime: '',
    loginTime: null
  }
  localStorage.removeItem(XIMALAYA_AUTH_KEY)
}

// ========== 二维码登录相关 ==========

/**
 * 生成二维码
 * @returns {Promise<{qrId: string, qrImg: string}>}
 */
export async function generateQRCode() {
  const timestamp = Date.now()
  const data = await requestXimalayaJson(
    {
      native: `https://passport.ximalaya.com/web/qrCode/gen?source=pc&t=${timestamp}`,
      web: `/api/ximalaya-passport/web/qrCode/gen?source=pc&t=${timestamp}`,
      proxy: `https://passport.ximalaya.com/web/qrCode/gen?source=pc&t=${timestamp}`
    },
    {
      errorLabel: '生成喜马拉雅二维码失败',
      fallbackHint: '可尝试改用 Cookie 登录'
    }
  )

  if (data.ret !== 0 || !data.qrId) {
    throw new Error(data.msg || '生成喜马拉雅二维码失败')
  }

  qrCodeData.qrId = data.qrId
  qrCodeData.qrImg = `https://passport.ximalaya.com/web/qrCode/img?qrId=${data.qrId}&t=${timestamp}`

  return {
    qrId: qrCodeData.qrId,
    qrImg: qrCodeData.qrImg
  }
}

/**
 * 检查二维码状态
 * @returns {Promise<{status: number, message: string}>}
 * status: 0-待扫码, 1-已扫码待确认, 2-已确认登录 3-已过期 4-已取消
 */
export async function checkQRCodeStatus() {
  if (!qrCodeData.qrId) {
    throw new Error('请先生成二维码')
  }

  const timestamp = Date.now()
  const data = await requestXimalayaJson(
    {
      native: `https://passport.ximalaya.com/web/qrCode/check?qrId=${qrCodeData.qrId}&t=${timestamp}`,
      web: `/api/ximalaya-passport/web/qrCode/check?qrId=${qrCodeData.qrId}&t=${timestamp}`,
      proxy: `https://passport.ximalaya.com/web/qrCode/check?qrId=${qrCodeData.qrId}&t=${timestamp}`
    },
    {
      includeCredentials: true,
      errorLabel: '查询二维码状态失败',
      fallbackHint: '浏览器可能拦截了跨域，可改用 Cookie 登录'
    }
  )

  return {
    status: data.ret,
    message: getStatusMessage(data.ret)
  }
}

function getStatusMessage(status) {
  const messages = {
    0: '等待扫码',
    1: '已扫码，请在手机确认',
    2: '登录成功',
    3: '二维码已过期',
    4: '已取消'
  }
  return messages[status] || '未知状态'
}

/**
 * 开始轮询二维码状态
 * @param {function} onStatusChange - 状态变化回调
 * @param {function} onSuccess - 登录成功回调
 * @param {function} onExpired - 二维码过期回调
 */
export function startQRCodePolling(onStatusChange, onSuccess, onExpired) {
  stopQRCodePolling()

  qrCodeData.pollingTimer = setInterval(async () => {
    try {
      const result = await checkQRCodeStatus()
      onStatusChange?.(result)

      if (result.status === 2) {
        // 登录成功，尝试拉取用户信息
        stopQRCodePolling()
        try {
          await fetchUserInfoAfterQRLogin()
          authData.loginTime = new Date().toISOString()
          saveAuthToStorage()
          onSuccess?.(getAuthInfo())
        } catch (e) {
          console.error('二维码登录后获取用户信息失败:', e)
          onExpired?.()
        }
      } else if (result.status === 3 || result.status === 4) {
        stopQRCodePolling()
        onExpired?.()
      }
    } catch (error) {
      console.error('二维码轮询异常:', error)
    }
  }, 2000)
}

/**
 * 停止轮询
 */
export function stopQRCodePolling() {
  if (qrCodeData.pollingTimer) {
    clearInterval(qrCodeData.pollingTimer)
    qrCodeData.pollingTimer = null
  }
}

/**
 * 扫码登录成功后获取用户信息
 */
async function fetchUserInfoAfterQRLogin() {
  const data = await requestXimalayaJson(
    {
      native: 'https://www.ximalaya.com/revision/main/getCurrentUser',
      web: '/api/ximalaya/revision/main/getCurrentUser',
      proxy: 'https://www.ximalaya.com/revision/main/getCurrentUser'
    },
    {
      includeCredentials: true,
      errorLabel: '获取用户信息失败',
      fallbackHint: '可能是浏览器跨域限制，可改用 Cookie 登录'
    }
  )

  if (data.ret !== 200 || !data.data) {
    throw new Error('获取用户信息失败')
  }

  const user = data.data
  authData.userId = user.uid?.toString() || ''
  authData.userName = user.nickname || ''
  authData.avatar = user.cover || user.logoPic || ''
  authData.isVip = user.isVip || user.vipInfo?.isVip || false
  authData.vipExpireTime = user.vipInfo?.endTime || ''
  // 标记已登录（扫码时浏览器可能拿不到真实 Cookie）
  authData.cookies = authData.cookies || 'qr-login'

  return authData
}

/**
 * 获取 VIP 音频播放地址
 * @param {number} trackId - 音轨 ID
 */
export async function getVipPlayUrl(trackId) {
  const data = await requestXimalayaJson(
    {
      native: `https://mobile.ximalaya.com/v1/track/baseInfo?trackId=${trackId}&device=android`,
      web: `/api/ximalaya-mobile/v1/track/baseInfo?trackId=${trackId}&device=android`,
      proxy: `https://mobile.ximalaya.com/v1/track/baseInfo?trackId=${trackId}&device=android`
    },
    {
      headers: { Cookie: authData.cookies },
      errorLabel: '获取播放地址失败'
    }
  )

  const playUrl = data.playUrl64 || data.playUrl32 || data.playPathAacv224 || data.playPathAacv164

  if (!playUrl) {
    throw new Error('获取播放地址失败，可能需要购买或开通 VIP')
  }

  return playUrl
}

// 初始化时加载认证信息
loadAuthFromStorage()

export default {
  loadAuthFromStorage,
  isLoggedIn,
  isVip,
  getAuthInfo,
  getAuthCookies,
  loginWithCookie,
  logout,
  getVipPlayUrl,
  generateQRCode,
  checkQRCodeStatus,
  startQRCodePolling,
  stopQRCodePolling
}
