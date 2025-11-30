/**
 * 多听书源搜索服务
 * 支持 B站、喜马拉雅等平台
 */

import { Capacitor } from '@capacitor/core'
import { httpGet } from './httpService'

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

export default {
  searchXimalaya,
  getXimalayaAlbumTracks,
  getXimalayaPlayUrl
}
