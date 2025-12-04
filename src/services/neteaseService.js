import { Capacitor } from '@capacitor/core'
import { httpGet } from './httpService'
import { fetchJsonWithProxy } from './proxyService'

// 默认 API 地址，可在 .env 中通过 VITE_NETEASE_API 覆盖
const DEFAULT_API_BASE = (import.meta?.env?.VITE_NETEASE_API) || '/api/netease'
const NETEASE_HEADERS = {
  Referer: 'https://music.163.com',
  Origin: 'https://music.163.com',
  'User-Agent': 'Mozilla/5.0'
}
const isNative = Capacitor.isNativePlatform()

function normalizeBase(baseUrl) {
  const raw = baseUrl || DEFAULT_API_BASE
  if (raw.startsWith('http')) {
    return raw.endsWith('/') ? raw.slice(0, -1) : raw
  }
  const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'http://localhost'
  const merged = raw.startsWith('/') ? `${origin}${raw}` : `${origin}/${raw}`
  return merged.endsWith('/') ? merged.slice(0, -1) : merged
}

function buildUrl(path, baseUrl, params = {}) {
  const url = new URL(path, normalizeBase(baseUrl))
  const finalParams = {
    timestamp: Date.now(),
    ...params
  }
  Object.entries(finalParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  return url.toString()
}

async function getJson(path, { baseUrl, params = {}, cookie, useProxyFallback = true } = {}) {
  const url = buildUrl(path, baseUrl, params)
  // 构建请求头，如果有 cookie 则通过自定义 header 传递
  const headers = { ...NETEASE_HEADERS }
  if (cookie) {
    headers['X-Netease-Cookie'] = cookie
  }
  try {
    return await httpGet(url, { headers })
  } catch (error) {
    // Web 端尝试使用通用代理兜底
    if (!isNative && useProxyFallback) {
      return await fetchJsonWithProxy(url, { headers })
    }
    throw error
  }
}

export async function createLoginQrKey(options = {}) {
  return await getJson('/login/qr/key', { ...options, params: { timestamp: Date.now() } })
}

export async function createLoginQrImage(key, options = {}) {
  return await getJson('/login/qr/create', {
    ...options,
    params: { key, qrimg: true, timestamp: Date.now() }
  })
}

export async function checkQrStatus(key, options = {}) {
  return await getJson('/login/qr/check', {
    ...options,
    params: { key, noCookie: true, timestamp: Date.now() }
  })
}

export async function getLoginStatus(options = {}) {
  return await getJson('/login/status', options)
}

export async function getDailySongs(options = {}) {
  return await getJson('/recommend/songs', options)
}

export async function getUserPlaylists(uid, options = {}) {
  return await getJson('/user/playlist', {
    ...options,
    params: { uid }
  })
}

export async function getSongUrl(id, options = {}) {
  return await getJson('/song/url/v1', {
    ...options,
    params: { id, level: 'standard' }
  })
}

export async function addTrackToPlaylist(pid, trackId, options = {}) {
  try {
    return await getJson('/playlist/track/add', {
      ...options,
      params: { pid, ids: trackId }
    })
  } catch (error) {
    // 老接口兜底
    return await getJson('/playlist/tracks', {
      ...options,
      params: { op: 'add', pid, tracks: trackId }
    })
  }
}

export default {
  createLoginQrKey,
  createLoginQrImage,
  checkQrStatus,
  getLoginStatus,
  getDailySongs,
  getUserPlaylists,
  getSongUrl,
  addTrackToPlaylist
}
