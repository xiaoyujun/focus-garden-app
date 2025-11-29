/**
 * 第三方书源解析服务
 * 支持"我的听书"格式的书源解析
 * 
 * 书源格式说明：
 * - sourceUrl: 源基础地址
 * - sourceName: 源名称
 * - searchUrl: 搜索URL模板，支持 {{key}} {{page}} 占位符
 * - searchList: 搜索结果列表选择器
 * - searchName/searchCover/searchAuthor: 搜索结果字段选择器
 * - bookUrl: 书籍详情URL
 * - chapterList: 章节列表选择器
 * - chapterName/chapterUrl: 章节字段选择器
 * - audioUrlRule: 音频地址解析规则
 */

import { Capacitor } from '@capacitor/core'
import { httpGet, httpGetHtml } from './httpService'

const isNative = Capacitor.isNativePlatform()

/**
 * 通用请求方法
 */
async function fetchUrl(url, options = {}) {
  const { responseType = 'text', headers = {} } = options
  
  if (isNative) {
    // 原生端直接请求
    if (responseType === 'json') {
      return await httpGet(url, { headers })
    } else {
      return await httpGetHtml(url, { headers })
    }
  } else {
    // Web端通过代理 - 构建代理URL
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
    const response = await fetch(proxyUrl, { headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return responseType === 'json' ? response.json() : response.text()
  }
}

/**
 * 解析规则字符串
 * 支持的格式:
 * - CSS选择器: div.item 或 @css:div.item
 * - JSONPath: $.data.list 或 @json:$.data.list
 * - 正则表达式: @regex:pattern
 * - 属性获取: @attr:href
 * - 文本获取: @text
 * - 组合规则: div.item@text 或 div.item@attr:href
 */
function parseRule(rule) {
  if (!rule) return { type: 'none', value: '' }
  
  rule = rule.trim()
  
  // JSONPath
  if (rule.startsWith('$.') || rule.startsWith('@json:')) {
    return { 
      type: 'jsonpath', 
      value: rule.replace('@json:', '') 
    }
  }
  
  // 正则表达式
  if (rule.startsWith('@regex:') || rule.startsWith('/:') || rule.match(/^\/.*\/[gimsuvy]*$/)) {
    const pattern = rule.replace('@regex:', '').replace(/^\/|\/[gimsuvy]*$/g, '')
    return { type: 'regex', value: pattern }
  }
  
  // CSS选择器 (默认)
  const cssRule = rule.replace('@css:', '')
  
  // 检查是否有属性或文本获取后缀
  const parts = cssRule.split('@')
  const selector = parts[0].trim()
  const suffix = parts[1]?.trim()
  
  let attribute = null
  if (suffix) {
    if (suffix === 'text') {
      attribute = 'text'
    } else if (suffix.startsWith('attr:')) {
      attribute = suffix.replace('attr:', '')
    } else if (suffix === 'html') {
      attribute = 'html'
    } else if (suffix === 'src' || suffix === 'href') {
      attribute = suffix
    }
  }
  
  return { 
    type: 'css', 
    value: selector,
    attribute
  }
}

/**
 * 从HTML文档中提取数据
 */
function extractFromHtml(html, rule, baseUrl = '') {
  if (!rule || !html) return null
  
  const parsed = parseRule(rule)
  
  // 创建临时DOM来解析HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  if (parsed.type === 'css') {
    const elements = doc.querySelectorAll(parsed.value)
    if (elements.length === 0) return null
    
    const results = Array.from(elements).map(el => {
      if (parsed.attribute === 'text') {
        return el.textContent?.trim()
      } else if (parsed.attribute === 'html') {
        return el.innerHTML
      } else if (parsed.attribute) {
        let attrValue = el.getAttribute(parsed.attribute)
        // 处理相对URL
        if ((parsed.attribute === 'href' || parsed.attribute === 'src') && attrValue && baseUrl) {
          attrValue = resolveUrl(baseUrl, attrValue)
        }
        return attrValue
      }
      return el.textContent?.trim()
    })
    
    return results.length === 1 ? results[0] : results
  }
  
  if (parsed.type === 'regex') {
    const regex = new RegExp(parsed.value, 'g')
    const matches = html.match(regex)
    return matches ? (matches.length === 1 ? matches[0] : matches) : null
  }
  
  return null
}

/**
 * 从JSON数据中提取
 */
function extractFromJson(data, rule) {
  if (!rule || !data) return null
  
  const parsed = parseRule(rule)
  
  if (parsed.type === 'jsonpath') {
    return getByPath(data, parsed.value)
  }
  
  return null
}

/**
 * 根据路径获取对象属性
 * 支持 $.data.list[0].name 格式
 */
function getByPath(obj, path) {
  if (!path || !obj) return null
  
  // 移除开头的 $. 
  path = path.replace(/^\$\.?/, '')
  
  const parts = path.split(/[\.\[\]]/).filter(Boolean)
  let current = obj
  
  for (const part of parts) {
    if (current === null || current === undefined) return null
    current = current[part]
  }
  
  return current
}

/**
 * 解析URL中的占位符
 */
function resolveUrlTemplate(template, params = {}) {
  if (!template) return ''
  
  let url = template
  
  // 替换 {{key}} 格式
  url = url.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return encodeURIComponent(params[key] || '')
  })
  
  // 替换 {key} 格式
  url = url.replace(/\{(\w+)\}/g, (match, key) => {
    return encodeURIComponent(params[key] || '')
  })
  
  // 替换 @key 格式（某些书源使用）
  url = url.replace(/@(\w+)/g, (match, key) => {
    if (params[key] !== undefined) {
      return encodeURIComponent(params[key])
    }
    return match
  })
  
  return url
}

/**
 * 解析相对URL为绝对URL
 */
function resolveUrl(base, relative) {
  if (!relative) return ''
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    return relative
  }
  if (relative.startsWith('//')) {
    return 'https:' + relative
  }
  
  try {
    return new URL(relative, base).href
  } catch {
    return relative
  }
}

/**
 * 使用第三方书源搜索
 * @param {Object} source - 书源配置
 * @param {string} keyword - 搜索关键词
 * @param {number} page - 页码
 */
export async function searchWithSource(source, keyword, page = 1) {
  if (!source || !source.searchUrl) {
    throw new Error('书源配置无效或不支持搜索')
  }
  
  try {
    // 构建搜索URL
    const searchUrl = resolveUrlTemplate(source.searchUrl, {
      key: keyword,
      page: page,
      pageSize: 20
    })
    
    const fullUrl = resolveUrl(source.sourceUrl || source.bookSourceUrl, searchUrl)
    
    // 判断返回类型
    const isJsonResponse = source.searchUrl.includes('.json') || 
                           source.ruleSearchList?.startsWith('$.') ||
                           source.searchList?.startsWith('$.')
    
    const html = await fetchUrl(fullUrl, { 
      responseType: isJsonResponse ? 'json' : 'text' 
    })
    
    // 解析搜索结果列表
    const listRule = source.ruleSearchList || source.searchList
    let items = []
    
    if (isJsonResponse) {
      items = extractFromJson(html, listRule) || []
    } else {
      // 对于HTML，需要先获取列表元素
      items = extractListFromHtml(html, listRule, source, fullUrl)
    }
    
    if (!Array.isArray(items)) {
      items = items ? [items] : []
    }
    
    // 解析每个搜索结果
    const results = items.map((item, index) => {
      const result = {
        id: `${source.id || source.bookSourceUrl}-${index}-${Date.now()}`,
        sourceId: source.id || source.bookSourceUrl,
        sourceType: 'thirdparty',
        sourceName: source.sourceName || source.bookSourceName || '第三方源'
      }
      
      // 提取各字段
      if (typeof item === 'object') {
        result.title = extractField(item, html, source.ruleSearchName || source.searchName) || item.name || item.title || ''
        result.cover = extractField(item, html, source.ruleSearchCover || source.searchCover) || item.cover || item.coverUrl || ''
        result.author = extractField(item, html, source.ruleSearchAuthor || source.searchAuthor) || item.author || ''
        result.artist = extractField(item, html, source.ruleSearchArtist || source.searchArtist) || item.artist || ''
        result.description = extractField(item, html, source.ruleSearchIntro || source.searchIntro) || item.intro || item.description || ''
        result.bookUrl = extractField(item, html, source.ruleSearchNoteUrl || source.searchNoteUrl || source.bookUrl) || item.bookUrl || item.noteUrl || ''
        result.category = extractField(item, html, source.ruleSearchKind || source.searchKind) || item.kind || item.category || ''
      } else if (typeof item === 'string') {
        // item 是一个URL或简单字符串
        result.title = item
        result.bookUrl = item
      }
      
      // 处理封面URL
      if (result.cover) {
        result.cover = resolveUrl(source.sourceUrl || source.bookSourceUrl, result.cover)
      }
      
      // 处理书籍URL
      if (result.bookUrl && !result.bookUrl.startsWith('http')) {
        result.bookUrl = resolveUrl(source.sourceUrl || source.bookSourceUrl, result.bookUrl)
      }
      
      return result
    }).filter(r => r.title) // 过滤掉没有标题的结果
    
    return {
      total: results.length,
      page,
      results
    }
  } catch (error) {
    console.error('第三方书源搜索失败:', error)
    throw error
  }
}

/**
 * 从HTML中提取列表
 */
function extractListFromHtml(html, listRule, source, baseUrl) {
  if (!listRule || !html) return []
  
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  const parsed = parseRule(listRule)
  
  if (parsed.type === 'css') {
    const elements = doc.querySelectorAll(parsed.value)
    return Array.from(elements).map(el => ({
      _element: el,
      _html: el.outerHTML,
      _baseUrl: baseUrl
    }))
  }
  
  return []
}

/**
 * 提取字段值
 */
function extractField(item, fullHtml, rule) {
  if (!rule) return null
  
  // 如果item有_element，从元素中提取
  if (item._element) {
    const parsed = parseRule(rule)
    if (parsed.type === 'css') {
      const el = parsed.value ? item._element.querySelector(parsed.value) : item._element
      if (!el) return null
      
      if (parsed.attribute === 'text') {
        return el.textContent?.trim()
      } else if (parsed.attribute === 'html') {
        return el.innerHTML
      } else if (parsed.attribute) {
        let value = el.getAttribute(parsed.attribute)
        if ((parsed.attribute === 'href' || parsed.attribute === 'src') && value && item._baseUrl) {
          value = resolveUrl(item._baseUrl, value)
        }
        return value
      }
      return el.textContent?.trim()
    }
  }
  
  // 如果是JSONPath，从item对象中提取
  if (rule.startsWith('$.') || rule.startsWith('@json:')) {
    return extractFromJson(item, rule)
  }
  
  // 直接返回item的属性
  const fieldName = rule.replace(/[.@#]/g, '')
  return item[fieldName]
}

/**
 * 获取书籍详情（章节列表）
 * @param {Object} source - 书源配置
 * @param {Object} book - 书籍信息（包含bookUrl）
 */
export async function getBookChapters(source, book) {
  if (!source || !book.bookUrl) {
    throw new Error('书源配置或书籍URL无效')
  }
  
  try {
    const bookUrl = book.bookUrl
    
    // 获取书籍详情页
    const html = await fetchUrl(bookUrl, { responseType: 'text' })
    
    // 解析章节列表
    const chapterListRule = source.ruleChapterList || source.chapterList
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    const parsed = parseRule(chapterListRule)
    let chapters = []
    
    if (parsed.type === 'css') {
      const elements = doc.querySelectorAll(parsed.value)
      chapters = Array.from(elements).map((el, index) => {
        const nameRule = source.ruleChapterName || source.chapterName || '@text'
        const urlRule = source.ruleChapterUrl || source.chapterUrl || '@attr:href'
        
        let name = ''
        let url = ''
        
        // 解析章节名
        const nameParsed = parseRule(nameRule)
        if (nameParsed.type === 'css' && nameParsed.value) {
          const nameEl = el.querySelector(nameParsed.value)
          name = nameEl?.textContent?.trim() || el.textContent?.trim()
        } else {
          name = el.textContent?.trim()
        }
        
        // 解析章节URL
        const urlParsed = parseRule(urlRule)
        if (urlParsed.attribute) {
          url = el.getAttribute(urlParsed.attribute) || ''
        } else if (urlParsed.value) {
          const urlEl = el.querySelector(urlParsed.value)
          url = urlEl?.getAttribute('href') || urlEl?.textContent?.trim() || ''
        }
        
        // 处理相对URL
        if (url && !url.startsWith('http')) {
          url = resolveUrl(bookUrl, url)
        }
        
        return {
          id: `chapter-${index}`,
          index,
          title: name,
          chapterUrl: url
        }
      })
    }
    
    return {
      total: chapters.length,
      chapters: chapters.filter(c => c.title && c.chapterUrl)
    }
  } catch (error) {
    console.error('获取章节列表失败:', error)
    throw error
  }
}

/**
 * 获取章节音频地址
 * @param {Object} source - 书源配置
 * @param {Object} chapter - 章节信息
 */
export async function getChapterAudioUrl(source, chapter) {
  if (!source || !chapter.chapterUrl) {
    throw new Error('书源配置或章节URL无效')
  }
  
  try {
    const chapterUrl = chapter.chapterUrl
    
    // 获取章节页面
    const html = await fetchUrl(chapterUrl, { responseType: 'text' })
    
    // 解析音频地址
    const audioRule = source.ruleContentUrl || source.audioUrlRule || source.contentUrl
    
    if (!audioRule) {
      // 尝试直接从页面中找音频标签
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      
      // 尝试常见的音频元素
      const audioEl = doc.querySelector('audio source, audio[src], source[type*="audio"]')
      if (audioEl) {
        const src = audioEl.getAttribute('src')
        if (src) {
          return resolveUrl(chapterUrl, src)
        }
      }
      
      // 尝试从script中提取
      const scripts = doc.querySelectorAll('script')
      for (const script of scripts) {
        const content = script.textContent || ''
        // 常见的音频URL模式
        const patterns = [
          /["']?(https?:\/\/[^"'\s]+\.(?:mp3|m4a|aac|wav|ogg)[^"'\s]*)/gi,
          /src\s*[:=]\s*["']?(https?:\/\/[^"'\s]+)/gi,
          /url\s*[:=]\s*["']?(https?:\/\/[^"'\s]+)/gi
        ]
        
        for (const pattern of patterns) {
          const match = content.match(pattern)
          if (match) {
            const url = match[0].replace(/^["'\s]+|["'\s]+$/g, '').replace(/^(src|url)\s*[:=]\s*/i, '')
            if (url.includes('.mp3') || url.includes('.m4a') || url.includes('audio')) {
              return url
            }
          }
        }
      }
      
      throw new Error('未找到音频地址规则，请检查书源配置')
    }
    
    // 使用规则解析
    let audioUrl = extractFromHtml(html, audioRule, chapterUrl)
    
    if (!audioUrl) {
      throw new Error('无法解析音频地址')
    }
    
    // 处理相对URL
    if (!audioUrl.startsWith('http')) {
      audioUrl = resolveUrl(chapterUrl, audioUrl)
    }
    
    return audioUrl
  } catch (error) {
    console.error('获取音频地址失败:', error)
    throw error
  }
}

/**
 * 验证书源是否有效
 * @param {Object} source - 书源配置
 */
export async function validateSource(source) {
  try {
    // 尝试访问书源地址
    const baseUrl = source.sourceUrl || source.bookSourceUrl
    if (!baseUrl) {
      return { valid: false, error: '缺少源地址' }
    }
    
    await fetchUrl(baseUrl, { responseType: 'text' })
    
    // 检查必要字段
    const hasSearch = source.searchUrl || source.ruleSearchUrl
    const hasChapter = source.chapterList || source.ruleChapterList
    
    return {
      valid: true,
      hasSearch: !!hasSearch,
      hasChapter: !!hasChapter,
      name: source.sourceName || source.bookSourceName || '未知源'
    }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

export default {
  searchWithSource,
  getBookChapters,
  getChapterAudioUrl,
  validateSource
}
