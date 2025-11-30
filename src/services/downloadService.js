/**
 * 下载服务 - 用于从特定源解析和下载音频资源
 * 支持多种源的解析规则配置
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { httpGet, httpGetHtml } from './httpService'

const isNative = Capacitor.isNativePlatform()

// 预设的解析源配置
export const PRESET_SOURCES = [
  {
    id: 'xmly',
    name: '喜马拉雅',
    icon: '🎧',
    description: '喜马拉雅有声内容',
    urlPattern: /ximalaya\.com/,
    enabled: true
  },
  {
    id: 'qingting',
    name: '蜻蜓FM',
    icon: '🦟',
    description: '蜻蜓FM有声内容',
    urlPattern: /qingting\.fm/,
    enabled: true
  },
  {
    id: 'lrts',
    name: '懒人听书',
    icon: '📚',
    description: '懒人听书有声小说',
    urlPattern: /lrts\.me|ting55\.com/,
    enabled: true
  }
]

/**
 * 解析 URL 获取音频信息
 * @param {string} url - 要解析的页面 URL
 * @returns {Promise<Object>} 解析结果
 */
export async function parseUrl(url) {
  if (!url) {
    throw new Error('URL 不能为空')
  }

  // 检测源类型
  const source = PRESET_SOURCES.find(s => s.urlPattern.test(url))
  
  if (!source) {
    throw new Error('不支持的链接，目前支持：喜马拉雅、蜻蜓FM、懒人听书')
  }

  // 根据源类型调用不同的解析器
  switch (source.id) {
    case 'xmly':
      return await parseXimalaya(url)
    case 'qingting':
      return await parseQingting(url)
    case 'lrts':
      return await parseLrts(url)
    default:
      throw new Error(`暂不支持解析 ${source.name}`)
  }
}

/**
 * 解析喜马拉雅链接
 */
async function parseXimalaya(url) {
  try {
    // 提取专辑 ID
    const albumMatch = url.match(/\/album\/(\d+)/)
    const trackMatch = url.match(/\/sound\/(\d+)/)
    
    if (albumMatch) {
      const albumId = albumMatch[1]
      // 获取专辑信息
      const apiUrl = `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=1&pageSize=100`
      const data = await fetchJson(apiUrl)
      
      if (data?.data?.tracks) {
        return {
          type: 'album',
          source: 'xmly',
          title: data.data.albumTitle || '未知专辑',
          items: data.data.tracks.map(track => ({
            id: track.trackId,
            title: track.title,
            duration: track.duration,
            url: track.playUrl32 || track.playUrl64 || track.playUrlAac,
            cover: track.coverPath
          }))
        }
      }
    }
    
    if (trackMatch) {
      const trackId = trackMatch[1]
      const apiUrl = `https://www.ximalaya.com/revision/play/v1/audio?id=${trackId}&ptype=1`
      const data = await fetchJson(apiUrl)
      
      if (data?.data?.src) {
        return {
          type: 'track',
          source: 'xmly',
          title: data.data.title || '未知音频',
          items: [{
            id: trackId,
            title: data.data.title,
            url: data.data.src,
            duration: data.data.duration
          }]
        }
      }
    }
    
    throw new Error('无法解析喜马拉雅链接，请确保链接正确')
  } catch (e) {
    console.error('[解析] 喜马拉雅解析失败:', e)
    throw new Error(`解析失败: ${e.message}`)
  }
}

/**
 * 解析蜻蜓FM链接
 */
async function parseQingting(url) {
  try {
    const channelMatch = url.match(/channels\/(\d+)/)
    
    if (channelMatch) {
      const channelId = channelMatch[1]
      const apiUrl = `https://i.qingting.fm/capi/v3/channel/${channelId}/programs?page=1&pagesize=100`
      const data = await fetchJson(apiUrl)
      
      if (data?.data?.programs) {
        return {
          type: 'album',
          source: 'qingting',
          title: data.data.name || '未知频道',
          items: data.data.programs.map(prog => ({
            id: prog.id,
            title: prog.name,
            duration: prog.duration,
            url: `https://audio.qingting.fm/audiostream/${prog.mediainfo?.bitrates_url?.['64k'] || prog.id}`,
            cover: prog.cover
          }))
        }
      }
    }
    
    throw new Error('无法解析蜻蜓FM链接')
  } catch (e) {
    console.error('[解析] 蜻蜓FM解析失败:', e)
    throw new Error(`解析失败: ${e.message}`)
  }
}

/**
 * 解析懒人听书链接
 */
async function parseLrts(url) {
  try {
    // 懒人听书需要解析 HTML 页面
    const html = await fetchHtml(url)
    
    // 从页面提取音频信息
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/)
    const audioMatch = html.match(/data-src="([^"]+\.mp3[^"]*)"/g) || 
                       html.match(/source[^>]+src="([^"]+\.mp3[^"]*)"/g)
    
    if (audioMatch && audioMatch.length > 0) {
      const items = audioMatch.map((match, index) => {
        const urlMatch = match.match(/["']([^"']+\.mp3[^"']*)["']/)
        return {
          id: `lrts-${index}`,
          title: `第${index + 1}集`,
          url: urlMatch ? urlMatch[1] : ''
        }
      }).filter(item => item.url)
      
      return {
        type: 'album',
        source: 'lrts',
        title: titleMatch ? titleMatch[1].trim() : '懒人听书',
        items
      }
    }
    
    throw new Error('无法从页面提取音频信息')
  } catch (e) {
    console.error('[解析] 懒人听书解析失败:', e)
    throw new Error(`解析失败: ${e.message}`)
  }
}

/**
 * 获取 JSON 数据
 */
async function fetchJson(url) {
  if (isNative) {
    return await httpGet(url)
  }
  
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
  const response = await fetch(proxyUrl, {
    headers: { Accept: 'application/json' }
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  
  return await response.json()
}

/**
 * 获取 HTML 内容
 */
async function fetchHtml(url) {
  if (isNative) {
    // 移动端使用 httpGetHtml 获取文本
    return await httpGetHtml(url)
  }
  
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
  const response = await fetch(proxyUrl)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  
  return await response.text()
}

/**
 * 下载单个文件
 * @param {Object} item - 要下载的项目 { url, title, ... }
 * @param {string} albumTitle - 所属专辑名称
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<Object>} 下载结果
 */
export async function downloadItem(item, albumTitle, onProgress = () => {}) {
  if (!item?.url) {
    throw new Error('下载地址无效')
  }

  const fileName = sanitizeFileName(`${item.title || 'audio'}.mp3`)
  const folderName = sanitizeFileName(albumTitle || '下载')

  if (isNative) {
    return await downloadItemNative(item.url, folderName, fileName, onProgress)
  } else {
    return await downloadItemWeb(item.url, fileName, onProgress)
  }
}

/**
 * 移动端下载实现 - 使用 CapacitorHttp 绕过 CORS
 */
async function downloadItemNative(url, folderName, fileName, onProgress) {
  try {
    // 创建下载目录
    const downloadDir = `FocusGarden/Downloads/${folderName}`
    
    try {
      await Filesystem.mkdir({
        path: downloadDir,
        directory: Directory.Documents,
        recursive: true
      })
    } catch (e) {
      // 目录可能已存在
    }

    const filePath = `${downloadDir}/${fileName}`

    // 使用 CapacitorHttp 下载（绕过 CORS）
    const response = await CapacitorHttp.get({
      url,
      responseType: 'blob',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      }
    })

    if (response.status !== 200) {
      throw new Error(`下载失败: HTTP ${response.status}`)
    }

    // CapacitorHttp 返回的 blob 数据已经是 base64 格式
    let base64Data = response.data
    
    // 如果不是 base64，尝试转换
    if (typeof base64Data === 'object') {
      // 如果是 ArrayBuffer 或 Blob 对象
      base64Data = await blobToBase64(new Blob([response.data]))
    } else if (typeof base64Data === 'string' && base64Data.includes(',')) {
      // 如果是 data URL 格式
      base64Data = base64Data.split(',')[1]
    }

    await Filesystem.writeFile({
      path: filePath,
      data: base64Data,
      directory: Directory.Documents
    })

    const fileInfo = await Filesystem.stat({
      path: filePath,
      directory: Directory.Documents
    })

    return {
      success: true,
      path: fileInfo.uri,
      fileName,
      size: fileInfo.size || 0
    }
  } catch (e) {
    console.error('[下载] 移动端下载失败:', e)
    throw new Error(`下载失败: ${e.message}`)
  }
}

/**
 * Blob 转 Base64
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Web 端下载实现
 */
async function downloadItemWeb(url, fileName, onProgress) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`)
    }

    const blob = await response.blob()
    
    // 创建下载链接
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)

    return {
      success: true,
      fileName,
      size: blob.size
    }
  } catch (e) {
    console.error('[下载] Web端下载失败:', e)
    throw new Error(`下载失败: ${e.message}`)
  }
}

/**
 * 批量下载
 * @param {Array} items - 要下载的项目列表
 * @param {string} albumTitle - 专辑名称
 * @param {Function} onProgress - 进度回调 (index, total, item)
 * @returns {Promise<Object>} 下载结果统计
 */
export async function downloadBatch(items, albumTitle, onProgress = () => {}) {
  const results = {
    total: items.length,
    success: 0,
    failed: 0,
    errors: []
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    onProgress(i, items.length, item)

    try {
      await downloadItem(item, albumTitle)
      results.success++
    } catch (e) {
      results.failed++
      results.errors.push({ item, error: e.message })
    }

    // 添加延迟避免请求过快
    if (i < items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}

/**
 * 清理文件名中的非法字符
 */
function sanitizeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100)
}
