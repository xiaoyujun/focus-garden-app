/**
 * 多听书源搜索服务
 * 支持 B站、喜马拉雅等多个音频平台
 */

import { Capacitor } from '@capacitor/core'
import { httpGet } from './httpService'
import { searchVideos as searchBilibili } from './bilibiliService'

const isNative = Capacitor.isNativePlatform()

/**
 * 通用搜索请求
 */
async function fetchSearch(url, options = {}) {
  if (isNative) {
    return await httpGet(url, options)
  } else {
    // Web端通过代理
    const response = await fetch(url, {
      headers: options.headers || {}
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
}

/**
 * 喜马拉雅搜索
 */
export async function searchXimalaya(keyword, page = 1) {
  try {
    const url = isNative
      ? `https://www.ximalaya.com/revision/search/main?kw=${encodeURIComponent(keyword)}&page=${page}&spellchecker=true&condition=relation&rows=20&core=album&device=iPhone`
      : `/api/ximalaya/revision/search/main?kw=${encodeURIComponent(keyword)}&page=${page}&spellchecker=true&condition=relation&rows=20&core=album&device=iPhone`
    
    const data = await fetchSearch(url)
    
    if (data.ret !== 200) {
      throw new Error(data.msg || '搜索失败')
    }
    
    const albums = data.data?.result?.response?.docs || []
    
    return {
      total: data.data?.result?.response?.numFound || 0,
      page,
      results: albums.map(item => ({
        id: `ximalaya-${item.albumId}`,
        sourceType: 'ximalaya',
        albumId: item.albumId,
        title: (item.title || '').replace(/<[^>]+>/g, ''),
        cover: item.coverPath?.startsWith('//') ? `https:${item.coverPath}` : item.coverPath,
        author: item.nickname,
        playCount: item.playCount,
        trackCount: item.tracksCount,
        category: item.categoryTitle,
        description: item.intro
      }))
    }
  } catch (error) {
    console.error('喜马拉雅搜索失败:', error)
    throw error
  }
}

/**
 * 获取喜马拉雅专辑详情（章节列表）
 */
export async function getXimalayaAlbumTracks(albumId, page = 1) {
  try {
    const url = isNative
      ? `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${page}&pageSize=30&sort=0`
      : `/api/ximalaya/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${page}&pageSize=30&sort=0`
    
    const data = await fetchSearch(url)
    
    if (data.ret !== 200) {
      throw new Error(data.msg || '获取章节失败')
    }
    
    const tracks = data.data?.tracks || []
    
    return {
      total: data.data?.trackTotalCount || 0,
      page,
      hasMore: data.data?.hasMore || false,
      tracks: tracks.map((track, index) => ({
        id: track.trackId,
        title: track.title,
        duration: track.duration,
        index: track.index || index + 1,
        playCount: track.playCount,
        createTime: track.createDateFormat,
        // 音频地址需要单独获取
        audioUrl: null
      }))
    }
  } catch (error) {
    console.error('获取喜马拉雅章节失败:', error)
    throw error
  }
}

/**
 * 获取喜马拉雅音频播放地址
 */
export async function getXimalayaPlayUrl(trackId) {
  try {
    // 使用移动端API获取播放地址（无VIP限制的内容）
    const url = isNative
      ? `https://mobile.ximalaya.com/v1/track/baseInfo?trackId=${trackId}`
      : `/api/ximalaya-mobile/v1/track/baseInfo?trackId=${trackId}`
    
    const data = await fetchSearch(url)
    
    // 尝试获取免费音频地址
    const playUrl = data.playUrl64 || data.playUrl32 || data.playPathAacv224 || data.playPathAacv164
    
    if (!playUrl) {
      throw new Error('该音频可能需要VIP或付费')
    }
    
    return playUrl
  } catch (error) {
    console.error('获取喜马拉雅播放地址失败:', error)
    throw error
  }
}

/**
 * 蜻蜓FM搜索
 */
export async function searchQingting(keyword, page = 1) {
  try {
    const url = isNative
      ? `https://search.qingting.fm/v3/search?k=${encodeURIComponent(keyword)}&page=${page}&pagesize=20&type=0`
      : `/api/qingting/v3/search?k=${encodeURIComponent(keyword)}&page=${page}&pagesize=20&type=0`
    
    const data = await fetchSearch(url)
    
    if (data.errorno !== 0) {
      throw new Error(data.errormsg || '搜索失败')
    }
    
    const items = data.data?.data || []
    
    return {
      total: data.data?.total || 0,
      page,
      results: items.filter(item => item.type === 'channel_ondemand').map(item => ({
        id: `qingting-${item.id}`,
        sourceType: 'qingting',
        channelId: item.id,
        title: item.title,
        cover: item.cover,
        author: item.podcaster?.name || item.author,
        playCount: item.playcount,
        category: item.category_name,
        description: item.description
      }))
    }
  } catch (error) {
    console.error('蜻蜓FM搜索失败:', error)
    throw error
  }
}

/**
 * 统一搜索接口
 * @param {string} keyword - 搜索关键词
 * @param {string} sourceType - 源类型: bilibili | ximalaya | qingting | all
 * @param {object} options - 搜索选项
 */
export async function searchAudio(keyword, sourceType = 'bilibili', options = {}) {
  switch (sourceType) {
    case 'bilibili':
      return await searchBilibili(keyword, options)
    
    case 'ximalaya':
      return await searchXimalaya(keyword, options.page || 1)
    
    case 'qingting':
      return await searchQingting(keyword, options.page || 1)
    
    case 'all':
      // 聚合搜索（并行请求多个源）
      const results = await Promise.allSettled([
        searchBilibili(keyword, options),
        searchXimalaya(keyword, options.page || 1),
        searchQingting(keyword, options.page || 1)
      ])
      
      return {
        bilibili: results[0].status === 'fulfilled' ? results[0].value : null,
        ximalaya: results[1].status === 'fulfilled' ? results[1].value : null,
        qingting: results[2].status === 'fulfilled' ? results[2].value : null
      }
    
    default:
      throw new Error(`不支持的源类型: ${sourceType}`)
  }
}

export default {
  searchAudio,
  searchXimalaya,
  searchQingting,
  getXimalayaAlbumTracks,
  getXimalayaPlayUrl
}
