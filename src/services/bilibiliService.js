/**
 * B站视频解析服务
 * 用于解析B站视频/音频地址，支持听书、音乐等场景
 */

import { Capacitor } from '@capacitor/core'
import { getAuthCookies, isLoggedIn } from './bilibiliAuth'

// 判断是否是原生平台
const isNative = Capacitor.isNativePlatform()

/**
 * 发起API请求
 * Web端使用Vite代理，原生端直接请求
 * 自动携带登录Cookie
 */
async function fetchApi(path, isSearch = false) {
  let url
  
  if (isNative) {
    // 原生端直接请求B站API
    url = `https://api.bilibili.com${path}`
  } else {
    // Web端使用Vite代理
    const prefix = isSearch ? '/api/bili-search' : '/api/bili'
    url = `${prefix}${path}`
  }
  
  // 构建请求选项
  const options = {
    headers: {}
  }
  
  // 如果已登录，添加Cookie
  const cookies = getAuthCookies()
  if (cookies) {
    options.headers['Cookie'] = cookies
  }
  
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
      const response = await fetch(api)
      const data = await response.json()
      
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
 * 获取视频播放地址（使用html5模式绕过防盗链）
 * @param {string} bvid - BV号
 * @param {number} cid - 视频cid
 * @param {number} quality - 画质，默认80(1080P)
 * @returns {Promise<object>} - 播放地址信息
 */
export async function getPlayUrl(bvid, cid, quality = 80) {
  try {
    // 使用 html5 平台模式，无需 referer 验证
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
  } catch (error) {
    console.error('获取B站播放地址失败:', error)
    throw error
  }
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
 * @param {string} bvid - BV号
 * @param {number} cid - 视频cid
 * @returns {Promise<string>} - 音频URL
 */
export async function getBestAudioUrl(bvid, cid) {
  // 首先尝试官方API
  try {
    const playInfo = await getPlayUrl(bvid, cid)
    
    if (playInfo.audios && playInfo.audios.length > 0) {
      // 返回最高质量的音频
      const bestAudio = playInfo.audios.reduce((best, current) => 
        current.bandwidth > best.bandwidth ? current : best
      )
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
 * @param {number} page - 页码
 * @returns {Promise<object>}
 */
export async function searchVideos(keyword, page = 1) {
  try {
    const params = new URLSearchParams({
      keyword,
      search_type: 'video',
      page,
      order: 'totalrank'
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

export default {
  extractBilibiliId,
  getVideoInfo,
  getPlayUrl,
  getBestAudioUrl,
  getUploaderVideos,
  getVideoSeries,
  searchVideos,
  QUALITY_MAP,
  AUDIO_QUALITY_MAP
}
