/**
 * B站视频解析服务
 * 负责所有与B站相关的请求：视频信息、播放地址、搜索、收藏、历史等
 * Web 端通过 Vite 代理，原生端使用 CapacitorHttp 直连并绕过 CORS
 */

import { Capacitor } from '@capacitor/core'
import { getAuthCookies, isLoggedIn } from './bilibiliAuth'
import { httpGet } from './httpService'

// 平台判断
const isNative = Capacitor.isNativePlatform()

// 通用头与缓存配置
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const REFERER = 'https://www.bilibili.com/'
const ORIGIN = 'https://www.bilibili.com'
// 缓存时间配置（登录后使用官方API，可以更积极地缓存）
const CACHE_TTL = 1000 * 60 * 5      // 默认5分钟（播放地址等时效性数据）
const VIDEO_INFO_TTL = 1000 * 60 * 30 // 视频信息30分钟（基本不变）

// 简单缓存 + 并发合并，减少同一时间的重复请求
const cacheStore = new Map()
const inflightMap = new Map()

// B站视频清晰度标识
const QUALITY_MAP = {
  127: '8K 超高清',
  126: '杜比视界',
  125: 'HDR 真彩色',
  120: '4K 超清',
  116: '1080P60 高帧率',
  112: '1080P+ 高码率',
  80: '1080P 高清',
  74: '720P60 高帧率',
  64: '720P 高清',
  32: '480P 清晰',
  16: '360P 流畅'
}

// 音频质量标识
const AUDIO_QUALITY_MAP = {
  30251: 'Hi-Res 无损',
  30250: '杜比全景声',
  30280: '320kbps',
  30232: '128kbps',
  30216: '64kbps'
}

function ensureLogin() {
  if (!isLoggedIn()) {
    throw new Error('请先登录B站账号')
  }
}

function normalizeCover(url) {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return url.replace(/^http:/, 'https:')
  return url
}

function getCache(key) {
  const hit = cacheStore.get(key)
  if (hit && hit.expires > Date.now()) {
    return hit.value
  }
  cacheStore.delete(key)
  return null
}

function setCache(key, value, ttl = CACHE_TTL) {
  cacheStore.set(key, { value, expires: Date.now() + ttl })
}

async function withCache(key, fetcher, useCache = true, ttl = CACHE_TTL) {
  if (!useCache) {
    return fetcher()
  }

  const cached = getCache(key)
  if (cached !== null) {
    return cached
  }

  if (inflightMap.has(key)) {
    return inflightMap.get(key)
  }

  const promise = (async () => {
    try {
      const value = await fetcher()
      setCache(key, value, ttl)
      return value
    } finally {
      inflightMap.delete(key)
    }
  })()

  inflightMap.set(key, promise)
  return promise
}

function buildHeaders(cookies) {
  return {
    'X-Bilibili-Cookie': cookies,
    'User-Agent': UA,
    Referer: REFERER,
    Origin: ORIGIN
  }
}

/**
 * 发起 API 请求
 * @param {string} path - `/x/xxx` 形式的路径
 * @param {object|boolean} options - 支持布尔值兼容旧签名
 * @param {boolean} options.isSearch - 是否走搜索代理
 * @param {boolean} options.useCache - 是否缓存/合并请求
 * @param {string} options.cacheKey - 自定义缓存 key
 * @param {number} options.cacheTtl - 自定义缓存时间（毫秒）
 * @param {boolean} options.skipLogin - 跳过登录校验（默认需要登录）
 * @param {AbortSignal} options.signal - 可选的中断信号
 */
async function fetchApi(path, options = {}) {
  const opts = typeof options === 'boolean' ? { isSearch: options } : options
  const {
    isSearch = false,
    useCache = false,
    cacheKey,
    cacheTtl = CACHE_TTL,
    skipLogin = false,
    signal
  } = opts

  if (!skipLogin) {
    ensureLogin()
  }

  const cookies = getAuthCookies()
  const requestHeaders = buildHeaders(cookies)
  const key = cacheKey || `${isSearch ? 'search' : 'api'}:${path}`

  const request = async () => {
    if (isNative) {
      const url = `https://api.bilibili.com${path}`
      return httpGet(url, {
        headers: {
          Cookie: cookies,
          'User-Agent': UA,
          Referer: REFERER,
          Origin: ORIGIN
        }
      })
    }

    const prefix = isSearch ? '/api/bili-search' : '/api/bili'
    const url = `${prefix}${path}`
    const response = await fetch(url, {
      headers: requestHeaders,
      credentials: 'include',
      signal
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch (error) {
      console.error('API返回非JSON，前200字符：', text.slice(0, 200))
      throw new Error('API返回格式错误')
    }
  }

  return withCache(key, request, useCache, cacheTtl)
}

/**
 * 从B站URL中提取视频ID
 * @param {string} url - B站视频链接
 * @returns {object} - { bvid, aid, cid, page, shortUrl }
 */
export function extractBilibiliId(url) {
  const result = { bvid: null, aid: null, cid: null, page: null, shortUrl: null }
  if (!url) return result

  if (url.includes('b23.tv')) {
    return { ...result, shortUrl: url }
  }

  const bvMatch = url.match(/BV[\w]+/i)
  if (bvMatch) {
    result.bvid = bvMatch[0]
  }

  const avMatch = url.match(/av(\d+)/i)
  if (avMatch) {
    result.aid = parseInt(avMatch[1])
  }

  const pMatch = url.match(/[?&]p=(\d+)/)
  if (pMatch) {
    result.page = parseInt(pMatch[1])
  }

  return result
}

/**
 * 获取视频基本信息
 * @param {string} bvid
 * @returns {Promise<object>}
 */
export async function getVideoInfo(bvid) {
  // 视频基本信息缓存30分钟，减少重复请求
  const data = await fetchApi(`/x/web-interface/view?bvid=${bvid}`, {
    useCache: true,
    cacheKey: `view:${bvid}`,
    cacheTtl: VIDEO_INFO_TTL
  })

  if (data.code !== 0) {
    throw new Error(data.message || '获取视频信息失败')
  }

  const info = data.data
  return {
    title: info.title,
    desc: info.desc,
    cover: normalizeCover(info.pic),
    duration: info.duration,
    owner: info.owner,
    cid: info.cid,
    aid: info.aid,
    bvid: info.bvid,
    pages: info.pages || [{ cid: info.cid, part: info.title, page: 1 }],
    stat: {
      view: info.stat.view,
      danmaku: info.stat.danmaku,
      like: info.stat.like,
      coin: info.stat.coin,
      favorite: info.stat.favorite
    }
  }
}

/**
 * 获取视频播放地址（需要登录）
 */
export async function getPlayUrl(bvid, cid, quality = 80) {
  ensureLogin()
  try {
    return await getPlayUrlWebMode(bvid, cid, quality)
  } catch (error) {
    console.error('获取B站播放地址失败:', error)
    throw error
  }
}

/**
 * 标准 Web 模式播放地址
 */
async function getPlayUrlWebMode(bvid, cid, quality = 80) {
  const params = new URLSearchParams({
    bvid,
    cid,
    qn: quality,
    fnval: 4048,
    fnver: 0,
    fourk: 1
  })

  const data = await fetchApi(`/x/player/wbi/playurl?${params}`, {
    useCache: true,
    cacheKey: `play:${bvid}:${cid}:${quality}`
  })

  if (data.code !== 0) {
    throw new Error(data.message || '获取播放地址失败')
  }

  return parsePlayUrl(data.data)
}

/**
 * 解析播放地址响应
 */
function parsePlayUrl(data) {
  const result = {
    quality: data.quality,
    qualityName: QUALITY_MAP[data.quality] || '未知',
    duration: data.timelength / 1000,
    acceptQuality: data.accept_quality || [],
    videos: [],
    audios: []
  }

  if (data.dash) {
    if (data.dash.video) {
      result.videos = data.dash.video.map(v => ({
        id: v.id,
        quality: QUALITY_MAP[v.id] || `${v.id}`,
        url: v.baseUrl || v.base_url,
        backupUrl: v.backupUrl || v.backup_url || [],
        bandwidth: v.bandwidth,
        codecs: v.codecs,
        width: v.width,
        height: v.height,
        frameRate: v.frameRate || v.frame_rate
      }))
    }

    if (data.dash.audio) {
      result.audios = data.dash.audio.map(a => ({
        id: a.id,
        quality: AUDIO_QUALITY_MAP[a.id] || `${a.id}`,
        url: a.baseUrl || a.base_url,
        backupUrl: a.backupUrl || a.backup_url || [],
        bandwidth: a.bandwidth,
        codecs: a.codecs
      }))
    }

    if (data.dash.flac?.audio) {
      const flac = data.dash.flac.audio
      result.audios.unshift({
        id: flac.id || 30251,
        quality: 'Hi-Res 无损',
        url: flac.baseUrl || flac.base_url,
        backupUrl: flac.backupUrl || flac.backup_url || [],
        bandwidth: flac.bandwidth,
        codecs: flac.codecs,
        isFlac: true
      })
    }

    if (data.dash.dolby?.audio?.length > 0) {
      const dolby = data.dash.dolby.audio[0]
      result.audios.unshift({
        id: dolby.id || 30250,
        quality: '杜比全景声',
        url: dolby.baseUrl || dolby.base_url,
        backupUrl: dolby.backupUrl || dolby.backup_url || [],
        bandwidth: dolby.bandwidth,
        codecs: dolby.codecs,
        isDolby: true
      })
    }
  }

  if (data.durl) {
    result.durl = data.durl.map(d => ({
      url: d.url,
      backupUrl: d.backup_url || [],
      size: d.size,
      duration: d.length / 1000
    }))
  }

  return result
}

/**
 * 获取最佳音频流 URL（听书场景使用）
 */
export async function getBestAudioUrl(bvid, cid) {
  ensureLogin()
  const playInfo = await getPlayUrl(bvid, cid)

  if (playInfo.audios?.length) {
    const sortedAudios = [...playInfo.audios].sort((a, b) => b.bandwidth - a.bandwidth)
    const bestAudio = sortedAudios[0]
    return bestAudio.url
  }

  if (playInfo.durl?.length) {
    return playInfo.durl[0].url
  }

  throw new Error('无法获取音频地址')
}

/**
 * 获取音频 URL 列表（包含备用地址）
 */
export async function getAudioUrls(bvid, cid, options = {}) {
  const { mode = 'official' } = typeof options === 'string' ? { mode: options } : options
  ensureLogin()
  const urls = []
  const playInfo = await getPlayUrl(bvid, cid)
  const preferProgressive = mode === 'compat'

  const pushDashAudios = () => {
    if (playInfo.audios?.length) {
      const sortedAudios = [...playInfo.audios].sort((a, b) => b.bandwidth - a.bandwidth)
      for (const audio of sortedAudios) {
        if (audio.url) urls.push(audio.url)
        if (audio.backupUrl?.length) {
          urls.push(...audio.backupUrl)
        }
      }
    }
  }

  const pushProgressive = () => {
    if (playInfo.durl?.length) {
      for (const d of playInfo.durl) {
        if (d.url) urls.push(d.url)
        if (d.backupUrl?.length) urls.push(...d.backupUrl)
      }
    }
  }

  if (preferProgressive) {
    pushProgressive()
    pushDashAudios()
  } else {
    pushDashAudios()
    pushProgressive()
  }

  let uniqueUrls = [...new Set(urls)]

  // 官方源托管：在 Web 端预先经过后端代理，提升跨域/Referer 兼容性
  if (mode === 'official-hosted' && !isNative) {
    uniqueUrls = uniqueUrls.map(url => {
      return url.startsWith('/api/bili-proxy')
        ? url
        : `/api/bili-proxy?url=${encodeURIComponent(url)}`
    })
  }

  return uniqueUrls
}

/**
 * 获取 UP 主视频列表
 */
export async function getUploaderVideos(mid, page = 1, pageSize = 30) {
  try {
    const params = new URLSearchParams({
      mid,
      ps: pageSize,
      pn: page,
      order: 'pubdate'
    })

    const data = await fetchApi(`/x/space/arc/search?${params}`, {
      useCache: true,
      cacheKey: `uploader:${mid}:${page}:${pageSize}`
    })

    if (data.code !== 0) {
      throw new Error(data.message || '获取视频列表失败')
    }

    return {
      total: data.data.page.count,
      page: data.data.page.pn,
      pageSize: data.data.page.ps,
      videos: data.data.list.vlist.map(v => ({
        bvid: v.bvid,
        aid: v.aid,
        title: v.title,
        cover: normalizeCover(v.pic),
        duration: v.length,
        created: v.created,
        play: v.play,
        description: v.description
      }))
    }
  } catch (error) {
    console.error('获取UP主视频列表失败:', error)
    throw error
  }
}

/**
 * 获取视频合集/系列
 */
export async function getVideoSeries(bvid) {
  try {
    const videoInfo = await getVideoInfo(bvid)

    if (videoInfo.pages && videoInfo.pages.length > 1) {
      return {
        type: 'pages',
        title: videoInfo.title,
        items: videoInfo.pages.map(p => ({
          page: p.page,
          cid: p.cid,
          title: p.part,
          duration: p.duration,
          bvid: videoInfo.bvid
        }))
      }
    }

    return {
      type: 'single',
      title: videoInfo.title,
      items: [
        {
          page: 1,
          cid: videoInfo.cid,
          title: videoInfo.title,
          duration: videoInfo.duration,
          bvid: videoInfo.bvid
        }
      ]
    }
  } catch (error) {
    console.error('获取视频合集失败:', error)
    throw error
  }
}

/**
 * B站内容分区ID映射（适合听的内容）
 */
export const AUDIO_FRIENDLY_ZONES = {
  // 有声书 & 故事类
  audiobook: {
    name: '有声书/故事',
    tids: [247, 244, 71, 137],  // 电台(247)、翻唱(244)、综艺(71)、配音(137)
    keywords: ['有声小说', '有声书', '睡前故事', '广播剧', '配音', '朗读'],
    preferLong: true  // 偏好长视频
  },
  // 知识类
  knowledge: {
    name: '知识科普',
    tids: [201, 124, 228, 207, 208, 209],  // 科学科普、社科人文、人文历史、财经商业、校园学习、职业职场
    keywords: ['科普', '知识', '讲解', '课程', '教程'],
    preferLong: true
  },
  // ASMR
  asmr: {
    name: 'ASMR助眠',
    tids: [254],  // ASMR分区
    keywords: ['ASMR', '助眠', '白噪音', '放松', '耳音'],
    preferLong: true
  },
  // 音乐
  music: {
    name: '音乐',
    tids: [3, 29, 28, 59, 31],  // 音乐主区、音乐综合、原创音乐、演奏、翻唱
    keywords: ['音乐', '歌曲', '翻唱', '纯音乐'],
    preferLong: false
  },
  // 播客/脱口秀
  podcast: {
    name: '播客/谈话',
    tids: [241, 21, 182],  // 娱乐杂谈、日常、影视杂谈
    keywords: ['播客', '脱口秀', '聊天', '访谈', '电台'],
    preferLong: true
  }
}

/**
 * 解析时长字符串为秒数
 */
function parseDuration(durationStr) {
  if (!durationStr) return 0
  if (typeof durationStr === 'number') return durationStr
  
  const parts = String(durationStr).split(':').map(Number)
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return parseInt(durationStr) || 0
}

/**
 * 搜索B站视频（增强版，支持分区筛选）
 * @param {string} keyword - 搜索关键词
 * @param {object} options - 搜索选项
 * @param {string} options.order - 排序方式
 * @param {number} options.duration - 时长筛选 (0:不限 1:<10分钟 2:10-30分钟 3:30-60分钟 4:>60分钟)
 * @param {number} options.page - 页码
 * @param {string} options.tids - 分区ID，多个用逗号分隔
 * @param {string} options.zone - 内容分区预设（audiobook/knowledge/asmr/music/podcast）
 */
export async function searchVideos(keyword, options = {}) {
  try {
    const { order = '', duration = 0, page = 1, tids = '', zone = '' } = options
    
    // 构建搜索参数
    const params = new URLSearchParams({
      keyword,
      search_type: 'video',
      page,
      order: order || 'totalrank',
      duration
    })
    
    // 如果指定了分区预设，使用对应的分区ID
    let effectiveTids = tids
    if (zone && AUDIO_FRIENDLY_ZONES[zone]) {
      effectiveTids = AUDIO_FRIENDLY_ZONES[zone].tids.join(',')
    }
    
    // 添加分区筛选（tids参数）
    if (effectiveTids) {
      params.set('tids', effectiveTids)
    }

    const data = await fetchApi(`/x/web-interface/search/type?${params}`, {
      isSearch: true
    })

    if (data.code !== 0) {
      throw new Error(data.message || '搜索失败')
    }

    // 结果后处理：根据分区预设进行智能排序/筛选
    let results = (data.data?.result || []).map(v => ({
      bvid: v.bvid,
      aid: v.aid,
      title: (v.title || '').replace(/<[^>]+>/g, ''),
      cover: normalizeCover(v.pic),
      duration: v.duration,
      durationSeconds: parseDuration(v.duration),
      author: v.author,
      mid: v.mid,
      play: v.play,
      description: v.description,
      typeid: v.typeid  // 保留分区ID用于后续筛选
    }))
    
    // 如果选择了偏好长视频的分区，优先显示长视频
    if (zone && AUDIO_FRIENDLY_ZONES[zone]?.preferLong) {
      results = results.sort((a, b) => {
        // 优先显示超过10分钟的视频
        const aLong = a.durationSeconds >= 600 ? 1 : 0
        const bLong = b.durationSeconds >= 600 ? 1 : 0
        return bLong - aLong
      })
    }

    return {
      total: data.data?.numResults || 0,
      page: data.data?.page || 1,
      pageSize: data.data?.pagesize || 20,
      results
    }
  } catch (error) {
    console.error('B站搜索失败:', error)
    throw error
  }
}

/**
 * 获取用户收藏夹列表（需要登录）
 */
export async function getFavoriteList(mid = null) {
  ensureLogin()
  try {
    if (!mid) {
      const cookies = getAuthCookies()
      const match = cookies.match(/DedeUserID=(\d+)/)
      if (match) {
        mid = parseInt(match[1])
      } else {
        throw new Error('无法获取用户ID')
      }
    }

    const params = new URLSearchParams({
      up_mid: mid,
      type: 0,
      rid: 0,
      ps: 20,
      pn: 1
    })

    const data = await fetchApi(`/x/v3/fav/folder/created/list-all?${params}`, {
      useCache: true,
      cacheKey: `fav:list:${mid}`
    })

    if (data.code !== 0) {
      throw new Error(data.message || '获取收藏夹列表失败')
    }

    return {
      count: data.data?.count || 0,
      list: (data.data?.list || []).map(f => ({
        id: f.id,
        fid: f.fid,
        mid: f.mid,
        title: f.title,
        cover: normalizeCover(f.cover),
        mediaCount: f.media_count,
        ctime: f.ctime,
        mtime: f.mtime
      }))
    }
  } catch (error) {
    console.error('获取收藏夹列表失败:', error)
    throw error
  }
}

/**
 * 获取收藏夹内容（需要登录）
 */
export async function getFavoriteContent(mediaId, page = 1, pageSize = 20) {
  ensureLogin()
  try {
    const params = new URLSearchParams({
      media_id: mediaId,
      ps: pageSize,
      pn: page,
      keyword: '',
      order: 'mtime',
      type: 0,
      tid: 0,
      platform: 'web'
    })

    const data = await fetchApi(`/x/v3/fav/resource/list?${params}`)

    if (data.code !== 0) {
      throw new Error(data.message || '获取收藏夹内容失败')
    }

    const info = data.data?.info || {}
    const medias = data.data?.medias || []

    return {
      info: {
        id: info.id,
        title: info.title,
        cover: normalizeCover(info.cover),
        mediaCount: info.media_count
      },
      hasMore: data.data?.has_more || false,
      total: data.data?.info?.media_count || 0,
      list: medias.map(m => ({
        id: m.id,
        bvid: m.bvid,
        aid: m.id,
        title: m.title,
        cover: normalizeCover(m.cover),
        duration: m.duration,
        author: m.upper?.name || '',
        mid: m.upper?.mid || 0,
        pubdate: m.pubtime,
        favTime: m.fav_time,
        play: m.cnt_info?.play || 0,
        isValid: m.attr !== 9
      }))
    }
  } catch (error) {
    console.error('获取收藏夹内容失败:', error)
    throw error
  }
}

/**
 * 获取播放历史记录（需要登录）
 */
export async function getHistory(max = 0, viewAt = 0, pageSize = 20) {
  ensureLogin()
  try {
    const params = new URLSearchParams({
      max,
      view_at: viewAt,
      ps: pageSize,
      business: 'archive'
    })

    const data = await fetchApi(`/x/web-interface/history/cursor?${params}`)

    if (data.code !== 0) {
      throw new Error(data.message || '获取历史记录失败')
    }

    const cursor = data.data?.cursor || {}
    const list = data.data?.list || []

    return {
      cursor: {
        max: cursor.max || 0,
        viewAt: cursor.view_at || 0,
        business: cursor.business || 'archive'
      },
      hasMore: list.length >= pageSize,
      list: list
        .map(h => ({
          id: h.history?.oid || 0,
          bvid: h.history?.bvid || '',
          cid: h.history?.cid || 0,
          title: h.title || '',
          cover: normalizeCover(h.cover || ''),
          duration: h.duration || 0,
          progress: h.progress || 0,
          author: h.author_name || '',
          mid: h.author_mid || 0,
          viewAt: h.view_at || 0,
          viewAtText: formatViewAt(h.view_at),
          business: h.history?.business || 'archive'
        }))
        .filter(h => h.business === 'archive')
    }
  } catch (error) {
    console.error('获取历史记录失败:', error)
    throw error
  }
}

function formatViewAt(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 172800000) return '昨天'
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/**
 * 获取UP主信息
 */
export async function getUploaderInfo(mid) {
  try {
    const data = await fetchApi(`/x/space/wbi/acc/info?mid=${mid}`, {
      useCache: true,
      cacheKey: `uploader:info:${mid}`
    })

    if (data.code !== 0) {
      throw new Error(data.message || '获取UP主信息失败')
    }

    const info = data.data
    return {
      mid: info.mid,
      name: info.name,
      face: normalizeCover(info.face),
      sign: info.sign,
      level: info.level,
      official: {
        type: info.official?.type ?? -1,
        title: info.official?.title || '',
        desc: info.official?.desc || ''
      },
      vip: {
        type: info.vip?.type || 0,
        status: info.vip?.status || 0,
        label: info.vip?.label?.text || ''
      }
    }
  } catch (error) {
    console.error('获取UP主信息失败:', error)
    throw error
  }
}

/**
 * 获取UP主粉丝/关注统计
 */
export async function getUploaderStat(mid) {
  try {
    const data = await fetchApi(`/x/relation/stat?vmid=${mid}`, {
      useCache: true,
      cacheKey: `uploader:stat:${mid}`
    })

    if (data.code !== 0) {
      throw new Error(data.message || '获取UP主统计失败')
    }

    return {
      mid: data.data?.mid || mid,
      following: data.data?.following || 0,
      follower: data.data?.follower || 0
    }
  } catch (error) {
    console.error('获取UP主统计失败:', error)
    throw error
  }
}

/**
 * 获取首页推荐（个性化）
 */
export async function getRecommendVideos(freshIdx = 1, pageSize = 12) {
  try {
    const params = new URLSearchParams({
      fresh_idx: freshIdx,
      ps: pageSize,
      fresh_type: 4,
      version: 1,
      web_location: 1430650
    })

    const data = await fetchApi(`/x/web-interface/index/top/rcmd?${params}`)

    if (data.code !== 0) {
      throw new Error(data.message || '获取推荐失败')
    }

    const items = data.data?.item || []

    return {
      freshIdx: freshIdx + 1,
      list: items
        .map(v => ({
          bvid: v.bvid,
          aid: v.id,
          cid: v.cid,
          title: v.title,
          cover: normalizeCover(v.pic),
          duration: v.duration,
          author: v.owner?.name || '',
          mid: v.owner?.mid || 0,
          face: v.owner?.face || '',
          play: v.stat?.view || 0,
          danmaku: v.stat?.danmaku || 0,
          like: v.stat?.like || 0,
          pubdate: v.pubdate,
          rcmdReason: v.rcmd_reason?.content || '',
          isAd: v.is_ad || false
        }))
        .filter(v => !v.isAd)
    }
  } catch (error) {
    console.error('获取首页推荐失败:', error)
    throw error
  }
}

/**
 * 获取热门视频排行
 */
export async function getPopularVideos(page = 1, pageSize = 20) {
  try {
    const params = new URLSearchParams({
      pn: page,
      ps: pageSize
    })

    const data = await fetchApi(`/x/web-interface/popular?${params}`)

    if (data.code !== 0) {
      throw new Error(data.message || '获取热门视频失败')
    }

    const list = data.data?.list || []

    return {
      hasMore: !data.data?.no_more,
      list: list.map(v => ({
        bvid: v.bvid,
        aid: v.aid,
        cid: v.cid,
        title: v.title,
        cover: normalizeCover(v.pic),
        duration: v.duration,
        author: v.owner?.name || '',
        mid: v.owner?.mid || 0,
        face: v.owner?.face || '',
        play: v.stat?.view || 0,
        danmaku: v.stat?.danmaku || 0,
        like: v.stat?.like || 0,
        pubdate: v.pubdate,
        rcmdReason: v.rcmd_reason || ''
      }))
    }
  } catch (error) {
    console.error('获取热门视频失败:', error)
    throw error
  }
}

/**
 * 获取关注UP主的最新投稿（需要登录）
 */
export async function getFollowingVideos(page = 1, pageSize = 20) {
  ensureLogin()
  try {
    const params = new URLSearchParams({
      pn: page,
      ps: pageSize,
      type: 0
    })

    const data = await fetchApi(`/x/polymer/web-dynamic/v1/feed/all?${params}`)

    if (data.code !== 0) {
      throw new Error(data.message || '获取动态失败')
    }

    const items = data.data?.items || []

    const videoItems = items.filter(
      item => item.type === 'DYNAMIC_TYPE_AV' && item.modules?.module_dynamic?.major?.archive
    )

    return {
      hasMore: data.data?.has_more || false,
      offset: data.data?.offset || '',
      list: videoItems.map(item => {
        const archive = item.modules.module_dynamic.major.archive
        const author = item.modules?.module_author || {}
        return {
          bvid: archive.bvid,
          aid: archive.aid,
          title: archive.title,
          cover: normalizeCover(archive.cover),
          duration: parseDuration(archive.duration_text),
          durationText: archive.duration_text,
          author: author.name || '',
          mid: author.mid || 0,
          face: author.face || '',
          play: parseCount(archive.stat?.play),
          danmaku: parseCount(archive.stat?.danmaku),
          pubdate: author.pub_ts || 0,
          pubText: author.pub_time || ''
        }
      })
    }
  } catch (error) {
    console.error('获取关注动态失败:', error)
    throw error
  }
}

function parseCount(text) {
  if (typeof text === 'number') return text
  if (!text) return 0
  if (text.includes('万')) {
    return Math.round(parseFloat(text) * 10000)
  }
  return parseInt(text, 10) || 0
}

/**
 * 获取分区热门排行榜
 * @param {number} tid - 分区ID
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 */
export async function getZoneRanking(tid, page = 1, pageSize = 20) {
  try {
    const params = new URLSearchParams({
      rid: tid,
      pn: page,
      ps: pageSize
    })

    const data = await fetchApi(`/x/web-interface/dynamic/region?${params}`, {
      skipLogin: true,
      useCache: true,
      cacheKey: `zone:ranking:${tid}:${page}`,
      cacheTtl: 1000 * 60 * 10  // 缓存10分钟
    })

    if (data.code !== 0) {
      throw new Error(data.message || '获取分区排行失败')
    }

    return {
      list: (data.data?.archives || []).map(v => ({
        bvid: v.bvid,
        aid: v.aid,
        title: v.title,
        cover: normalizeCover(v.pic),
        duration: v.duration,
        author: v.owner?.name || '',
        mid: v.owner?.mid || 0,
        face: v.owner?.face || '',
        play: v.stat?.view || 0,
        danmaku: v.stat?.danmaku || 0,
        pubdate: v.pubdate,
        description: v.desc,
        typeid: v.tid
      })),
      hasMore: (data.data?.archives || []).length >= pageSize
    }
  } catch (error) {
    console.error('获取分区排行失败:', error)
    throw error
  }
}

/**
 * 获取指定分区预设的热门内容
 * @param {string} zone - 分区预设（audiobook/knowledge/asmr/music/podcast）
 * @param {number} page - 页码
 */
export async function getZoneHotVideos(zone, page = 1) {
  if (!AUDIO_FRIENDLY_ZONES[zone]) {
    throw new Error('无效的分区预设')
  }
  
  const zoneConfig = AUDIO_FRIENDLY_ZONES[zone]
  const allResults = []
  
  // 从每个子分区获取热门内容
  for (const tid of zoneConfig.tids.slice(0, 3)) {  // 最多取3个分区避免请求过多
    try {
      const result = await getZoneRanking(tid, page, 10)
      allResults.push(...result.list)
    } catch (e) {
      console.warn(`获取分区 ${tid} 失败:`, e)
    }
  }
  
  // 去重并排序（按播放量）
  const uniqueMap = new Map()
  allResults.forEach(v => {
    if (!uniqueMap.has(v.bvid)) {
      uniqueMap.set(v.bvid, v)
    }
  })
  
  let results = Array.from(uniqueMap.values())
  
  // 如果偏好长视频，优先显示长视频
  if (zoneConfig.preferLong) {
    results = results.sort((a, b) => {
      const aLong = a.duration >= 600 ? 1 : 0
      const bLong = b.duration >= 600 ? 1 : 0
      if (aLong !== bLong) return bLong - aLong
      return b.play - a.play
    })
  } else {
    results.sort((a, b) => b.play - a.play)
  }
  
  return {
    list: results.slice(0, 20),
    hasMore: results.length > 20,
    zoneName: zoneConfig.name
  }
}

export default {
  extractBilibiliId,
  getVideoInfo,
  getPlayUrl,
  getBestAudioUrl,
  getAudioUrls,
  getUploaderVideos,
  searchVideos,
  getFavoriteList,
  getFavoriteContent,
  getHistory,
  getUploaderInfo,
  getUploaderStat,
  getRecommendVideos,
  getPopularVideos,
  getFollowingVideos,
  getZoneRanking,
  getZoneHotVideos,
  QUALITY_MAP,
  AUDIO_QUALITY_MAP,
  AUDIO_FRIENDLY_ZONES
}
