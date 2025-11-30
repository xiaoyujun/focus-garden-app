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
 * @param {string} url - 请求URL
 * @param {Object} options - 请求配置
 * @param {string} options.responseType - 'text' | 'json'
 * @param {string} options.method - 'GET' | 'POST'
 * @param {string} options.body - POST 请求体
 * @param {Object} options.headers - 请求头
 */
async function fetchUrl(url, options = {}) {
  const { 
    responseType = 'text', 
    method = 'GET',
    body = null,
    headers = {} 
  } = options
  
  if (isNative) {
    // 原生端直接请求
    if (responseType === 'json') {
      return await httpGet(url, { headers, method, body })
    } else {
      return await httpGetHtml(url, { headers, method, body })
    }
  } else {
    // Web端通过代理 - 构建代理URL
    // 对于 POST 请求，将 method 和 body 信息也传递给代理
    let proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
    if (method === 'POST') {
      proxyUrl += `&method=POST`
    }
    
    const fetchOptions = { 
      method: method === 'POST' ? 'POST' : 'GET',
      headers: { ...headers }
    }
    
    if (method === 'POST' && body) {
      fetchOptions.body = body
      fetchOptions.headers['Content-Type'] = fetchOptions.headers['Content-Type'] || 'application/json'
    }
    
    const response = await fetch(proxyUrl, fetchOptions)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return responseType === 'json' ? response.json() : response.text()
  }
}

/**
 * 将 Legado 选择器语法转换为标准 CSS 选择器
 * Legado 格式: class.name, id.name, tag.name, tag.name.index
 * 标准 CSS: .name, #name, name
 */
function convertLegadoSelector(selector) {
  if (!selector) return ''
  
  // 移除开头的 + 号（Legado用于表示下一个兄弟）
  selector = selector.replace(/^\+/, '')
  
  // 处理 $ 开头的选择器（Legado用于当前元素）
  if (selector.startsWith('$')) {
    selector = selector.substring(1)
  }
  
  // 分割链式选择器 class.name@tag.a@href
  const chainParts = selector.split('@')
  let cssSelector = chainParts[0]
  const attrPart = chainParts.slice(1).join('@')
  
  // 转换 class.xxx -> .xxx
  cssSelector = cssSelector.replace(/\bclass\.([a-zA-Z0-9_-]+)/g, '.$1')
  // 转换 id.xxx -> #xxx
  cssSelector = cssSelector.replace(/\bid\.([a-zA-Z0-9_-]+)/g, '#$1')
  // 转换 tag.xxx -> xxx (去掉 tag. 前缀)
  cssSelector = cssSelector.replace(/\btag\.([a-zA-Z0-9]+)/g, '$1')
  // 处理索引 .name.0 -> .name:nth-child(1) (简化处理：忽略索引)
  cssSelector = cssSelector.replace(/\.(\d+)(?=\s|$|@)/g, '')
  
  return attrPart ? `${cssSelector}@${attrPart}` : cssSelector
}

/**
 * 解析规则字符串
 * 支持的格式:
 * - CSS选择器: div.item 或 @css:div.item
 * - Legado格式: class.item, tag.a, id.name
 * - JSONPath: $.data.list 或 @json:$.data.list 或 @JSon:
 * - 正则表达式: @regex:pattern
 * - 属性获取: @attr:href
 * - 文本获取: @text
 * - 组合规则: div.item@text 或 div.item@attr:href
 */
function parseRule(rule) {
  if (!rule) return { type: 'none', value: '' }
  
  rule = rule.trim()
  
  // @js: JavaScript 规则 - 暂不支持，返回空
  if (rule.startsWith('@js:') || rule.includes('<js>')) {
    console.warn('暂不支持 @js: 规则:', rule.substring(0, 50))
    return { type: 'none', value: '' }
  }
  
  // @operate: DOM操作规则 - 暂不支持
  if (rule.startsWith('@operate:') || rule.startsWith('$$.')) {
    console.warn('暂不支持 @operate: 规则:', rule.substring(0, 50))
    return { type: 'none', value: '' }
  }
  
  // JSONPath (支持 @JSon: 和 @json:)
  if (rule.startsWith('$.') || rule.startsWith('@json:') || rule.startsWith('@JSon:')) {
    return { 
      type: 'jsonpath', 
      value: rule.replace(/@[jJ][sS][oO][nN]:/, '').replace(/^\$\.?/, '$.')
    }
  }
  
  // 正则表达式
  if (rule.startsWith('@regex:') || rule.startsWith('/:') || rule.match(/^\/.*\/[gimsuvy]*$/)) {
    const pattern = rule.replace('@regex:', '').replace(/^\/|\/[gimsuvy]*$/g, '')
    return { type: 'regex', value: pattern }
  }
  
  // CSS选择器 (默认) - 先转换 Legado 格式
  let cssRule = rule.replace('@css:', '')
  cssRule = convertLegadoSelector(cssRule)
  
  // 检查是否有属性或文本获取后缀
  const parts = cssRule.split('@')
  let selector = parts[0].trim()
  const suffix = parts[1]?.trim()
  
  // 处理空选择器（只有属性）
  if (!selector && suffix) {
    return { type: 'attr', value: suffix, attribute: suffix }
  }
  
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
    } else {
      // Legado 格式可能直接写属性名
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
 * 支持多种书源格式：
 * - {{key}}, {{page}} - 双大括号格式
 * - {key}, {page} - 单大括号格式  
 * - searchUrl@searchword={{key}} 中的 @ 需要转换为 ?
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
  
  // 处理书源格式中的 @ 作为查询参数分隔符
  // 例如: search.php@searchword=xxx 或 programlisthome@page=1
  // 应转换为 search.php?searchword=xxx 或 programlisthome?page=1
  // 规则：@ 后面紧跟 参数名=值 的格式，则转换为 ?（只转换第一个 @）
  if (url.includes('@') && !url.includes('?')) {
    url = url.replace(/@([a-zA-Z_][a-zA-Z0-9_]*=)/, '?$1')
  }
  
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
 * 从 URL 模板中提取配置选项
 * Legado 书源格式在 URL 后附带 JSON 配置，如：
 * - 简单格式: /search?key={{key}},{"charset": "gbk"}
 * - POST格式: /api/search,{'method': 'POST', 'body': '{"key":"{{key}}"}'}
 */
function parseUrlTemplate(template) {
  if (!template) return { url: '', options: {} }
  
  // 找到第一个逗号后面跟着 { 的位置（配置开始）
  // 需要处理嵌套的大括号
  let configStart = -1
  for (let i = 0; i < template.length - 1; i++) {
    if (template[i] === ',' && template[i + 1].trim() === '{') {
      configStart = i
      break
    }
    // 处理逗号后有空格的情况
    if (template[i] === ',') {
      const rest = template.substring(i + 1).trimStart()
      if (rest.startsWith('{') || rest.startsWith("'") || rest.startsWith('"')) {
        configStart = i
        break
      }
    }
  }
  
  if (configStart === -1) {
    return { url: template, options: {} }
  }
  
  const url = template.substring(0, configStart)
  let configStr = template.substring(configStart + 1).trim()
  
  try {
    // Legado 使用单引号，需要转换为双引号
    // 但要保留字符串内部的单引号
    configStr = convertToValidJson(configStr)
    const options = JSON.parse(configStr)
    return { url, options }
  } catch (e) {
    console.warn('URL配置解析失败:', e.message, configStr?.substring(0, 100))
    return { url: template, options: {} }
  }
}

/**
 * 将 Legado 的类 JSON 格式转换为标准 JSON
 * Legado 使用单引号和一些非标准写法
 */
function convertToValidJson(str) {
  if (!str) return '{}'
  
  let result = str.trim()
  
  // 如果已经是有效的 JSON，直接返回
  try {
    JSON.parse(result)
    return result
  } catch {
    // 继续处理
  }
  
  // 将外层单引号包裹的键值对转换为双引号
  // 'key': 'value' => "key": "value"
  // 但要避免修改内层已经是双引号的字符串
  
  // 简单策略：将单引号替换为双引号，但保护内部的转义
  // 这对大多数 Legado 源格式有效
  result = result
    .replace(/:\s*'([^']*?)'/g, ': "$1"')  // 'value' => "value"
    .replace(/'([^']+?)':/g, '"$1":')       // 'key': => "key":
  
  // 处理换行和多余空格
  result = result.replace(/\n\s*/g, ' ')
  
  return result
}

/**
 * 安全解析 JSON 字符串
 */
function safeParseJson(str) {
  if (!str) return {}
  if (typeof str === 'object') return str
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
}

/**
 * 使用第三方书源搜索
 * @param {Object} source - 书源配置
 * @param {string} keyword - 搜索关键词
 * @param {number} page - 页码
 */
export async function searchWithSource(source, keyword, page = 1) {
  if (!source) {
    throw new Error('书源配置无效')
  }
  
  // 尝试多种方式获取搜索URL
  const rawConfig = source._raw || {}
  // 统一解析 ruleSearch，避免重复声明引发的初始化错误
  const parsedRuleSearch = safeParseJson(rawConfig.ruleSearch)
  const ruleSearch = typeof rawConfig.ruleSearch === 'object' 
    ? rawConfig.ruleSearch || {} 
    : parsedRuleSearch
  
  let searchUrlTemplate = source.searchUrl || 
                          source.ruleSearchUrl ||
                          rawConfig.searchUrl ||
                          rawConfig.ruleSearchUrl ||
                          ruleSearch.searchUrl ||
                          ''
  
  if (!searchUrlTemplate) {
    throw new Error('书源配置无效或不支持搜索（缺少searchUrl）')
  }
  
  try {
    // 提取 URL 和配置选项（如 charset）
    const { url: cleanUrlTemplate, options: urlOptions } = parseUrlTemplate(searchUrlTemplate)
    
    // 构建搜索URL
    const searchUrl = resolveUrlTemplate(cleanUrlTemplate, {
      key: keyword,
      page: page,
      pageSize: 20
    })
    
    const baseUrl = source.sourceUrl || source.bookSourceUrl || rawConfig.sourceUrl || rawConfig.bookSourceUrl || ''
    const fullUrl = resolveUrl(baseUrl, searchUrl)
    
    // 判断返回类型 - POST 请求或 JSONPath 规则通常意味着 JSON 响应
    const isJsonResponse = cleanUrlTemplate.includes('.json') || 
                           urlOptions.method === 'POST' ||
                           source.ruleSearchList?.startsWith('$.') ||
                           source.searchList?.startsWith('$.') ||
                           ruleSearch?.bookList?.startsWith('$.') ||
                           ruleSearch?.list?.startsWith('$.')
    
    // 处理 POST 请求体中的模板变量
    let requestBody = urlOptions.body || null
    if (requestBody) {
      requestBody = requestBody
        .replace(/\{\{key\}\}/g, keyword)
        .replace(/\{\{page\}\}/g, String(page))
        .replace(/\{\{pageSize\}\}/g, '20')
    }
    
    let responseData
    try {
      responseData = await fetchUrl(fullUrl, { 
        responseType: isJsonResponse ? 'json' : 'text',
        method: urlOptions.method || 'GET',
        body: requestBody,
        headers: urlOptions.headers || {},
        charset: urlOptions.charset  // 传递 charset 配置
      })
    } catch (fetchError) {
      console.error('[书源] 搜索请求失败:', fullUrl, fetchError)
      throw new Error(fetchError.message || '搜索请求失败')
    }
    
    // 解析搜索结果列表
    const listRule = source.ruleSearchList || source.searchList || ruleSearch?.bookList || ruleSearch?.list || ''
    let items = []
    
    if (isJsonResponse) {
      items = extractFromJson(responseData, listRule) || []
    } else {
      // 对于HTML，需要先获取列表元素
      items = extractListFromHtml(responseData, listRule, source, fullUrl)
    }
    
    if (!Array.isArray(items)) {
      items = items ? [items] : []
    }
    
    // bookUrl 提取规则 - 优先使用 ruleSearch.bookUrl
    const bookUrlRule = source.searchNoteUrl || 
                        source.ruleSearchNoteUrl || 
                        ruleSearch?.bookUrl || 
                        ruleSearch?.noteUrl || 
                        ''
    
    console.log('[书源] bookUrl提取规则:', bookUrlRule)
    
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
        result.title = extractField(item, responseData, source.ruleSearchName || source.searchName || ruleSearch.name) || item.name || item.title || ''
        result.cover = extractField(item, responseData, source.ruleSearchCover || source.searchCover || ruleSearch.coverUrl) || item.cover || item.coverUrl || ''
        result.author = extractField(item, responseData, source.ruleSearchAuthor || source.searchAuthor || ruleSearch.author) || item.author || ''
        result.artist = extractField(item, responseData, source.ruleSearchArtist || source.searchArtist || ruleSearch.artist) || item.artist || ''
        result.description = extractField(item, responseData, source.ruleSearchIntro || source.searchIntro || ruleSearch.intro) || item.intro || item.description || ''
        result.bookUrl = extractField(item, responseData, bookUrlRule) || item.bookUrl || item.noteUrl || ''
        result.category = extractField(item, responseData, source.ruleSearchKind || source.searchKind || ruleSearch.kind) || item.kind || item.category || ''
        
        // 调试输出
        if (index === 0) {
          console.log('[书源] 第一个搜索结果:', { title: result.title, bookUrl: result.bookUrl, item })
        }
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
    
    // 解析 Legado 格式的 ruleToc（可能是 JSON 字符串）
    const raw = source._raw || {}
    const ruleToc = safeParseJson(raw.ruleToc)
    
    // 尝试多种方式获取章节列表规则
    const chapterListRule = source.ruleChapterList || 
                            source.chapterList || 
                            ruleToc.chapterList || 
                            raw.ruleChapterList ||
                            ''
    
    console.log('[书源] 章节列表规则:', chapterListRule, '书籍URL:', bookUrl)
    
    if (!chapterListRule) {
      throw new Error('书源配置缺少章节列表规则（chapterList/ruleToc）')
    }
    
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    const parsed = parseRule(chapterListRule)
    let chapters = []
    
    if (parsed.type === 'css') {
      const elements = doc.querySelectorAll(parsed.value)
      console.log('[书源] 找到章节元素数量:', elements.length)
      
      chapters = Array.from(elements).map((el, index) => {
        // 尝试多种方式获取章节名和URL规则
        const nameRule = source.ruleChapterName || source.chapterName || ruleToc.chapterName || '@text'
        const urlRule = source.ruleChapterUrl || source.chapterUrl || ruleToc.chapterUrl || '@attr:href'
        
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
    
    const filteredChapters = chapters.filter(c => c.title && c.chapterUrl)
    console.log('[书源] 过滤后章节数量:', filteredChapters.length, '/', chapters.length)
    
    return {
      total: filteredChapters.length,
      chapters: filteredChapters
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
