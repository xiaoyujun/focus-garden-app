/**
 * B站视频解析服务
 * 用于解析B站视频/音频地址，支持听书、音乐等场景
 */

import { Capacitor } from '@capacitor/core'
import { getAuthCookies, isLoggedIn } from './bilibiliAuth'
import { httpGet } from './httpService'

// 判断是否是原生平台
const isNative = Capacitor.isNativePlatform()

/**
 * 发起API请求
 * Web端使用Vite代理，原生端使用CapacitorHttp绑过CORS
 * 自动携带登录Cookie
 */
async function fetchApi(path, isSearch = false) {
  // 构建请求选项
  const options = {
    headers: {}
  }
  
  // 如果已登录，添加Cookie
  const cookies = getAuthCookies()
  if (cookies) {
    options.headers['Cookie'] = cookies
  }
  
  let url
  if (isNative) {
    // 原生端直接请求B站API（使用CapacitorHttp）
    url = `https://api.bilibili.com${path}`
    return await httpGet(url, options)
  } else {
    // Web端使用Vite代理
    const prefix = isSearch ? '/api/bili-search' : '/api/bili'
    url = `${prefix}${path}`
    
    try {
      const response = await fetch(url, options)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const text = await response.text()
      
      // 检查是否是JSON
      try {
        return JSON.parse(text)
      } catch {
        console.error('响应不是JSON:', text.substring(0, 200))
        throw new Error('API返回格式错误')
      }
    } catch (error) {
      console.error('API请求失败:', error)
      throw error
    }
  }
}

/**
 * 使用第三方解析服务获取播放地址（备用方案）
 */
async function getPlayUrlFromThirdParty(bvid, cid) {
  // 使用公开的解析接口
  const apis = [
    `https://api.injahow.cn/bparse/?bv=${bvid}&p=1&type=json`,
    `https://tenapi.cn/v2/biliaudio?bv=${bvid}`
  ]
  
  for (const api of apis) {
    try {
      let data
      if (isNative) {
        // 原生端使用CapacitorHttp
        data = await httpGet(api)
      } else {
        const response = await fetch(api)
        data = await response.json()
      }
      
      if (data.code === 200 || data.url || data.data?.url) {
        return data.url || data.data?.url || data.audio
      }
    } catch (e) {
      console.warn('第三方解析失败:', api, e.message)
    }
  }
  
  throw new Error('所有解析方式均失败')
}

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

/**
 * 从B站URL中提取视频ID
 * @param {string} url - B站视频链接
 * @returns {object} - { bvid, aid, cid }
 */
export function extractBilibiliId(url) {
  const result = { bvid: null, aid: null, cid: null }
  
  if (!url) return result
  
  // 处理短链接 b23.tv
  if (url.includes('b23.tv')) {
    return { ...result, shortUrl: url }
  }
  
  // 提取 BV 号
  const bvMatch = url.match(/BV[\w]+/i)
  if (bvMatch) {
    result.bvid = bvMatch[0]
  }
  
  // 提取 av 号
  const avMatch = url.match(/av(\d+)/i)
  if (avMatch) {
    result.aid = parseInt(avMatch[1])
  }
  
  // 提取分P信息
  const pMatch = url.match(/[?&]p=(\d+)/)
  if (pMatch) {
    result.page = parseInt(pMatch[1])
  }
  
  return result
}

/**
 * 获取视频基本信息
 * @param {string} bvid - BV号
 * @returns {Promise<object>} - 视频信息
 */
export async function getVideoInfo(bvid) {
  try {
    const data = await fetchApi(`/x/web-interface/view?bvid=${bvid}`)
    
    if (data.code !== 0) {
      throw new Error(data.message || '获取视频信息失败')
    }
    
    const info = data.data
    return {
      title: info.title,
      desc: info.desc,
      cover: info.pic,
      duration: info.duration,
      owner: info.owner,
      cid: info.cid,
      aid: info.aid,
      bvid: info.bvid,
      pages: info.pages || [{ cid: info.cid, part: info.title, page: 1 }],
      // 视频统计
      stat: {
        view: info.stat.view,
        danmaku: info.stat.danmaku,
        like: info.stat.like,
        coin: info.stat.coin,
        favorite: info.stat.favorite
      }
    }
  } catch (error) {
    console.error('获取B站视频信息失败:', error)
    throw error
  }
}

/**
 * 获取视频播放地址
 * 登录用户使用标准Web模式获取更高清晰度，未登录使用html5模式绕过防盗链
 * @param {string} bvid - BV号
 * @param {number} cid - 视频cid
 * @param {number} quality - 画质，默认80(1080P)
 * @returns {Promise<object>} - 播放地址信息
 */
export async function getPlayUrl(bvid, cid, quality = 80) {
  const loggedIn = isLoggedIn()
  
  // 登录用户优先使用标准Web模式（更高清晰度）
  if (loggedIn) {
    try {
      const result = await getPlayUrlWebMode(bvid, cid, quality)
      if (result) return result
    } catch (error) {
      console.warn('Web模式获取失败，回退到html5模式:', error.message)
    }
  }
  
  // 未登录或Web模式失败时，使用html5模式
  try {
    return await getPlayUrlHtml5Mode(bvid, cid, quality)
  } catch (error) {
    console.error('获取B站播放地址失败:', error)
    throw error
  }
}

/**
 * 使用标准Web模式获取播放地址（需要登录，支持高清）
 */
async function getPlayUrlWebMode(bvid, cid, quality = 80) {
  // fnval=4048 可获取所有格式：DASH + HDR + 4K + 杜比 + 8K + AV1
  const params = new URLSearchParams({
    bvid,
    cid,
    qn: quality,
    fnval: 4048,
    fnver: 0,
    fourk: 1
  })
  
  const data = await fetchApi(`/x/player/wbi/playurl?${params}`)
  
  if (data.code !== 0) {
    throw new Error(data.message || '获取播放地址失败')
  }
  
  return parsePlayUrl(data.data)
}

/**
 * 使用html5模式获取播放地址（无需登录，清晰度受限）
 */
async function getPlayUrlHtml5Mode(bvid, cid, quality = 80) {
  const params = new URLSearchParams({
    bvid,
    cid,
    qn: quality,
    fnval: 16, // DASH格式
    fnver: 0,
    fourk: 1,
    platform: 'html5',
    high_quality: 1
  })
  
  const data = await fetchApi(`/x/player/playurl?${params}`)
  
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
    duration: data.timelength / 1000, // 转换为秒
    acceptQuality: data.accept_quality || [],
    videos: [],
    audios: []
  }
  
  // DASH 格式
  if (data.dash) {
    // 视频流
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
    
    // 音频流
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
    
    // Hi-Res 无损音频（登录用户/大会员可用）
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
    
    // 杜比全景声（大会员可用）
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
  
  // 传统格式 (durl)
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
 * 获取最佳音频流URL（用于听书场景）
 * 返回带有备用URL的对象，便于重试
 * @param {string} bvid - BV号
 * @param {number} cid - 视频cid
 * @returns {Promise<string>} - 音频URL
 */
export async function getBestAudioUrl(bvid, cid) {
  // 首先尝试官方API
  try {
    const playInfo = await getPlayUrl(bvid, cid)
    
    if (playInfo.audios && playInfo.audios.length > 0) {
      // 按带宽排序，返回最高质量的音频
      const sortedAudios = [...playInfo.audios].sort((a, b) => b.bandwidth - a.bandwidth)
      const bestAudio = sortedAudios[0]
      
      // 如果有备用URL，尝试找一个不同域名的
      if (bestAudio.backupUrl && bestAudio.backupUrl.length > 0) {
        // 优先返回主URL，备用URL作为fallback存储
        console.log('获取到音频URL，有', bestAudio.backupUrl.length, '个备用地址')
      }
      
      return bestAudio.url
    }
    
    // 如果没有单独的音频流，返回视频流URL（包含音频）
    if (playInfo.durl && playInfo.durl.length > 0) {
      return playInfo.durl[0].url
    }
  } catch (error) {
    console.warn('官方API获取失败，尝试第三方解析:', error.message)
  }
  
  // 使用第三方解析作为备用
  try {
    return await getPlayUrlFromThirdParty(bvid, cid)
  } catch (error) {
    console.error('第三方解析也失败:', error)
  }
  
  throw new Error('无法获取音频地址，请稍后重试')
}

/**
 * 获取音频URL列表（包含备用地址）
 * @param {string} bvid - BV号
 * @param {number} cid - 视频cid
 * @returns {Promise<string[]>} - 音频URL列表，第一个为首选
 */
export async function getAudioUrls(bvid, cid) {
  const urls = []
  
  try {
    const playInfo = await getPlayUrl(bvid, cid)
    
    if (playInfo.audios && playInfo.audios.length > 0) {
      // 按带宽排序
      const sortedAudios = [...playInfo.audios].sort((a, b) => b.bandwidth - a.bandwidth)
      
      // 收集所有URL（主URL + 备用URL）
      for (const audio of sortedAudios) {
        if (audio.url) urls.push(audio.url)
        if (audio.backupUrl) {
          urls.push(...audio.backupUrl)
        }
      }
    }
    
    // durl格式的URL
    if (playInfo.durl && playInfo.durl.length > 0) {
      for (const d of playInfo.durl) {
        if (d.url) urls.push(d.url)
        if (d.backupUrl) urls.push(...d.backupUrl)
      }
    }
  } catch (error) {
    console.warn('官方API获取失败:', error.message)
  }
  
  // 添加第三方解析结果
  try {
    const thirdPartyUrl = await getPlayUrlFromThirdParty(bvid, cid)
    if (thirdPartyUrl) urls.push(thirdPartyUrl)
  } catch (error) {
    // 忽略
  }
  
  // 去重
  return [...new Set(urls)]
}

/**
 * 获取UP主的视频列表（用于获取合集/播放列表）
 * @param {number} mid - UP主ID
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Promise<object>}
 */
export async function getUploaderVideos(mid, page = 1, pageSize = 30) {
  try {
    const params = new URLSearchParams({
      mid,
      ps: pageSize,
      pn: page,
      order: 'pubdate'
    })
    
    const data = await fetchApi(`/x/space/arc/search?${params}`)
    
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
        cover: v.pic,
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
 * @param {string} bvid - BV号
 * @returns {Promise<object>}
 */
export async function getVideoSeries(bvid) {
  try {
    // 先获取视频信息以获取合集ID
    const videoInfo = await getVideoInfo(bvid)
    
    // 如果有多P，返回分P列表
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
      items: [{
        page: 1,
        cid: videoInfo.cid,
        title: videoInfo.title,
        duration: videoInfo.duration,
        bvid: videoInfo.bvid
      }]
    }
  } catch (error) {
    console.error('获取视频合集失败:', error)
    throw error
  }
}

/**
 * 搜索B站视频
 * @param {string} keyword - 搜索关键词
 * @param {object} options - 搜索选项
 * @param {string} options.order - 排序方式: '' | 'click' | 'pubdate' | 'dm'
 * @param {number} options.duration - 时长: 0不限 1-10分钟 2-30分钟 3-60分钟 4-60分钟以上
 * @param {number} options.page - 页码
 * @returns {Promise<object>}
 */
export async function searchVideos(keyword, options = {}) {
  try {
    const { order = '', duration = 0, page = 1 } = options
    
    const params = new URLSearchParams({
      keyword,
      search_type: 'video',
      page,
      order: order || 'totalrank',  // 默认综合排序
      duration  // 时长筛选
    })
    
    // 搜索API使用专用代理（需要特殊headers）
    const data = await fetchApi(`/x/web-interface/search/type?${params}`, true)
    
    if (data.code !== 0) {
      throw new Error(data.message || '搜索失败')
    }
    
    return {
      total: data.data?.numResults || 0,
      page: data.data?.page || 1,
      pageSize: data.data?.pagesize || 20,
      results: (data.data?.result || []).map(v => ({
        bvid: v.bvid,
        aid: v.aid,
        title: (v.title || '').replace(/<[^>]+>/g, ''), // 移除高亮标签
        cover: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
        duration: v.duration,
        author: v.author,
        mid: v.mid,
        play: v.play,
        description: v.description
      }))
    }
  } catch (error) {
    console.error('B站搜索失败:', error)
    throw error
  }
}

/**
 * 获取用户收藏夹列表（需要登录）
 * @param {number} mid - 用户ID，不传则获取当前登录用户
 * @returns {Promise<object>}
 */
export async function getFavoriteList(mid = null) {
  if (!isLoggedIn()) {
    throw new Error('请先登录B站账号')
  }
  
  try {
    // 如果没传mid，先获取当前用户ID
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
      type: 0,  // 0-全部 1-视频 2-番剧 21-合集
      rid: 0,
      ps: 20,
      pn: 1
    })
    
    const data = await fetchApi(`/x/v3/fav/folder/created/list-all?${params}`)
    
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
        cover: f.cover,
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
 * 获取收藏夹内容
 * @param {number} mediaId - 收藏夹ID
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Promise<object>}
 */
export async function getFavoriteContent(mediaId, page = 1, pageSize = 20) {
  if (!isLoggedIn()) {
    throw new Error('请先登录B站账号')
  }
  
  try {
    const params = new URLSearchParams({
      media_id: mediaId,
      ps: pageSize,
      pn: page,
      keyword: '',
      order: 'mtime', // mtime-最近收藏 view-最多播放 pubtime-最新投稿
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
        cover: info.cover,
        mediaCount: info.media_count
      },
      hasMore: data.data?.has_more || false,
      total: data.data?.info?.media_count || 0,
      list: medias.map(m => ({
        id: m.id,
        bvid: m.bvid,
        aid: m.id,
        title: m.title,
        cover: m.cover,
        duration: m.duration,
        author: m.upper?.name || '',
        mid: m.upper?.mid || 0,
        pubdate: m.pubtime,
        favTime: m.fav_time,
        play: m.cnt_info?.play || 0,
        // 标记失效视频
        isValid: m.attr !== 9  // attr=9 表示已失效
      }))
    }
  } catch (error) {
    console.error('获取收藏夹内容失败:', error)
    throw error
  }
}

/**
 * 获取播放历史记录（需要登录）
 * @param {number} max - 历史记录最大值（用于分页）
 * @param {number} viewAt - 上一页最后一条的观看时间（用于分页）
 * @param {number} pageSize - 每页数量
 * @returns {Promise<object>}
 */
export async function getHistory(max = 0, viewAt = 0, pageSize = 20) {
  if (!isLoggedIn()) {
    throw new Error('请先登录B站账号')
  }
  
  try {
    const params = new URLSearchParams({
      max: max,
      view_at: viewAt,
      ps: pageSize,
      business: 'archive'  // archive-视频 live-直播 article-专栏
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
      list: list.map(h => ({
        id: h.history?.oid || 0,
        bvid: h.history?.bvid || '',
        cid: h.history?.cid || 0,
        title: h.title || '',
        cover: h.cover || '',
        duration: h.duration || 0,
        progress: h.progress || 0,  // 观看进度（秒）
        author: h.author_name || '',
        mid: h.author_mid || 0,
        viewAt: h.view_at || 0,
        // 格式化观看时间
        viewAtText: formatViewAt(h.view_at),
        // 标记直播等特殊类型
        business: h.history?.business || 'archive'
      })).filter(h => h.business === 'archive')  // 只保留视频
    }
  } catch (error) {
    console.error('获取历史记录失败:', error)
    throw error
  }
}

/**
 * 格式化观看时间
 */
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
 * @param {number} mid - UP主ID
 * @returns {Promise<object>}
 */
export async function getUploaderInfo(mid) {
  try {
    const data = await fetchApi(`/x/space/wbi/acc/info?mid=${mid}`)
    
    if (data.code !== 0) {
      throw new Error(data.message || '获取UP主信息失败')
    }
    
    const info = data.data
    return {
      mid: info.mid,
      name: info.name,
      face: info.face,
      sign: info.sign,
      level: info.level,
      // 认证信息
      official: {
        type: info.official?.type ?? -1,
        title: info.official?.title || '',
        desc: info.official?.desc || ''
      },
      // VIP信息
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
 * 获取UP主投稿统计
 * @param {number} mid - UP主ID
 * @returns {Promise<object>}
 */
export async function getUploaderStat(mid) {
  try {
    const data = await fetchApi(`/x/relation/stat?vmid=${mid}`)
    
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
 * 获取首页推荐视频（登录后为个性化推荐）
 * @param {number} freshIdx - 刷新索引，用于分页
 * @param {number} pageSize - 每页数量
 * @returns {Promise<object>}
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
      list: items.map(v => ({
        bvid: v.bvid,
        aid: v.id,
        cid: v.cid,
        title: v.title,
        cover: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
        duration: v.duration,
        author: v.owner?.name || '',
        mid: v.owner?.mid || 0,
        face: v.owner?.face || '',
        play: v.stat?.view || 0,
        danmaku: v.stat?.danmaku || 0,
        like: v.stat?.like || 0,
        pubdate: v.pubdate,
        // 推荐理由
        rcmdReason: v.rcmd_reason?.content || '',
        // 是否为广告
        isAd: v.is_ad || false
      })).filter(v => !v.isAd)  // 过滤广告
    }
  } catch (error) {
    console.error('获取首页推荐失败:', error)
    throw error
  }
}

/**
 * 获取热门视频排行榜
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Promise<object>}
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
        cover: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
        duration: v.duration,
        author: v.owner?.name || '',
        mid: v.owner?.mid || 0,
        face: v.owner?.face || '',
        play: v.stat?.view || 0,
        danmaku: v.stat?.danmaku || 0,
        like: v.stat?.like || 0,
        pubdate: v.pubdate,
        // 热门推荐理由
        rcmdReason: v.rcmd_reason || ''
      }))
    }
  } catch (error) {
    console.error('获取热门视频失败:', error)
    throw error
  }
}

/**
 * 获取用户关注的UP主最新投稿（需要登录）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Promise<object>}
 */
export async function getFollowingVideos(page = 1, pageSize = 20) {
  if (!isLoggedIn()) {
    throw new Error('请先登录B站账号')
  }
  
  try {
    const params = new URLSearchParams({
      pn: page,
      ps: pageSize,
      type: 0  // 0-全部 1-视频 2-番剧 21-合集
    })
    
    const data = await fetchApi(`/x/polymer/web-dynamic/v1/feed/all?${params}`)
    
    if (data.code !== 0) {
      throw new Error(data.message || '获取动态失败')
    }
    
    const items = data.data?.items || []
    
    // 只筛选视频类型的动态
    const videoItems = items.filter(item => 
      item.type === 'DYNAMIC_TYPE_AV' && item.modules?.module_dynamic?.major?.archive
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
          cover: archive.cover?.startsWith('//') ? `https:${archive.cover}` : archive.cover,
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

/**
 * 解析时长文本为秒数
 */
function parseDuration(text) {
  if (!text) return 0
  const parts = text.split(':').map(Number)
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

/**
 * 解析播放量文本
 */
function parseCount(text) {
  if (typeof text === 'number') return text
  if (!text) return 0
  if (text.includes('万')) {
    return Math.round(parseFloat(text) * 10000)
  }
  return parseInt(text) || 0
}

export default {
  extractBilibiliId,
  getVideoInfo,
  getPlayUrl,
  getBestAudioUrl,
  getAudioUrls,
  getUploaderVideos,
  getVideoSeries,
  searchVideos,
  getFavoriteList,
  getFavoriteContent,
  getHistory,
  getUploaderInfo,
  getUploaderStat,
  getRecommendVideos,
  getPopularVideos,
  getFollowingVideos,
  QUALITY_MAP,
  AUDIO_QUALITY_MAP
}
