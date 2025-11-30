/**
 * 应用更新检测服务
 * 通过 GitHub Releases API 检测最新版本
 */

// GitHub 仓库信息
const GITHUB_OWNER = 'xiaoyujun'
const GITHUB_REPO = 'focus-garden-app'

// 当前应用版本（与 package.json 保持一致）
export const APP_VERSION = '1.0.0'

/**
 * 获取 GitHub 最新发布版本信息
 * @returns {Promise<{version: string, downloadUrl: string, releaseUrl: string, publishedAt: string, description: string} | null>}
 */
export async function checkForUpdate() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        // 没有发布版本
        return null
      }
      throw new Error(`GitHub API 请求失败: ${response.status}`)
    }

    const release = await response.json()
    
    // 提取版本号（移除 v 前缀）
    const version = release.tag_name.replace(/^v/, '')
    
    // 查找 APK 下载链接
    let downloadUrl = null
    if (release.assets && release.assets.length > 0) {
      const apkAsset = release.assets.find(asset => 
        asset.name.endsWith('.apk')
      )
      if (apkAsset) {
        downloadUrl = apkAsset.browser_download_url
      }
    }

    return {
      version,
      tagName: release.tag_name,
      downloadUrl,
      releaseUrl: release.html_url,
      publishedAt: release.published_at,
      description: release.body || ''
    }
  } catch (error) {
    console.error('检测更新失败:', error)
    throw error
  }
}

/**
 * 比较版本号
 * @param {string} current - 当前版本
 * @param {string} latest - 最新版本
 * @returns {boolean} - 如果有新版本返回 true
 */
export function hasNewVersion(current, latest) {
  const currentParts = current.split('.').map(Number)
  const latestParts = latest.split('.').map(Number)

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const c = currentParts[i] || 0
    const l = latestParts[i] || 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

/**
 * 格式化发布日期
 * @param {string} dateString - ISO 日期字符串
 * @returns {string}
 */
export function formatReleaseDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
