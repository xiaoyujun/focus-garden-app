import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { httpGet } from '../services/httpService'

const BOOK_SOURCE_STORAGE_KEY = 'book-source-data-v3'  // 升级版本，支持订阅关联
const LEGACY_STORAGE_KEY_V2 = 'book-source-data-v2'
const LEGACY_STORAGE_KEY = 'audio-sources-data'
const isNative = Capacitor.isNativePlatform()

// 预设订阅源 - 支持 Legado 和"我的听书"JSON格式
// 书源格式规范见 doc/书源格式规范.md
const PRESET_SUBSCRIPTIONS = [
  {
    name: 'Legado 全量书源',
    url: 'https://legado.aoaostar.com/sources/b778fe6b.json',
    description: '阅读3.0 社区书源（含65+有声书源，3900+全量）',
    icon: '📚',
    isDefault: true  // 默认推荐
  },
  {
    name: '有声书源合集',
    url: 'https://www.lifves.com/api/v2/booksource/list/group/有声',
    description: '来自开源阅读社区的有声书源（约30个）',
    icon: '🎧'
  }
]

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
 * 将导入的书源转换为统一格式
 * 支持"我的听书"格式和 Legado (阅读3.0) 格式
 * @param {Object} source - 原始书源数据
 * @param {string} subscriptionId - 关联的订阅ID（可选）
 */
function normalizeSource(source, subscriptionId = null) {
  if (!source) return null

  // 已经是统一格式，保留原有 subscriptionId 或使用新的
  if (source.type === 'thirdparty' && source.searchUrl) {
    return { 
      ...source, 
      enabled: source.enabled !== false, 
      subscriptionId: subscriptionId || source.subscriptionId || null,
      _raw: source 
    }
  }

  // Legado 格式的规则可能是 JSON 字符串，需要解析
  const ruleSearch = safeParseJson(source.ruleSearch)
  const ruleToc = safeParseJson(source.ruleToc)
  const ruleContent = safeParseJson(source.ruleContent)
  const ruleBookInfo = safeParseJson(source.ruleBookInfo)

  const name = source.sourceName || source.bookSourceName || source.name || source.title
  if (!name) return null

  const baseUrl = source.sourceUrl || source.bookSourceUrl || source.url || source.baseUrl || ''
  const searchUrl = source.searchUrl ||
    source.ruleSearchUrl ||
    ruleSearch.searchUrl ||
    ''
  const searchList = source.searchList ||
    source.ruleSearchList ||
    ruleSearch.bookList ||
    ruleSearch.list ||
    ''

  return {
    id: source.sourceUrl || source.bookSourceUrl || source.id || `source-${Date.now()}`,
    name,
    type: 'thirdparty',
    sourceUrl: baseUrl,
    enabled: source.enabled !== false && source.enabledExplore !== false,
    subscriptionId,  // 关联到订阅
    icon: source.icon || '📚',
    description: source.sourceComment || source.bookSourceComment || source.sourceGroup || source.bookSourceGroup || '第三方书源',
    group: source.sourceGroup || source.bookSourceGroup || '未分组',
    searchUrl,
    searchList,
    searchName: source.searchName || source.ruleSearchName || ruleSearch.name || '',
    searchCover: source.searchCover || source.ruleSearchCover || ruleSearch.coverUrl || ruleBookInfo.coverUrl || '',
    searchAuthor: source.searchAuthor || source.ruleSearchAuthor || ruleSearch.author || ruleBookInfo.author || '',
    searchArtist: source.searchArtist || source.ruleSearchArtist || ruleSearch.artist || '',
    searchIntro: source.searchIntro || source.ruleSearchIntro || ruleSearch.intro || ruleBookInfo.intro || '',
    searchKind: source.searchKind || source.ruleSearchKind || ruleSearch.kind || '',
    searchNoteUrl: source.searchNoteUrl || source.ruleSearchNoteUrl || ruleSearch.bookUrl || ruleSearch.noteUrl || '',
    chapterList: source.chapterList || source.ruleChapterList || ruleToc.chapterList || '',
    chapterName: source.chapterName || source.ruleChapterName || ruleToc.chapterName || '',
    chapterUrl: source.chapterUrl || source.ruleChapterUrl || ruleToc.chapterUrl || '',
    audioUrlRule: source.audioUrlRule || source.ruleContentUrl || source.contentUrl || ruleContent.content || '',
    _raw: source
  }
}

/**
 * 拉取订阅书源
 */
async function fetchSubscriptionData(url) {
  const targetUrl = url?.trim()
  if (!targetUrl) throw new Error('订阅地址不能为空')

  if (isNative) {
    return httpGet(targetUrl)
  }

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`
  console.log('[书源] 正在拉取:', targetUrl)
  
  const response = await fetch(proxyUrl, {
    headers: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' }
  })

  if (!response.ok) {
    throw new Error(`拉取书源失败（HTTP ${response.status}）`)
  }

  const text = await response.text()
  console.log('[书源] 响应长度:', text.length, '前50字符:', text.substring(0, 50))
  
  // 尝试解析 JSON
  try {
    // 有些服务器可能返回带BOM的JSON
    const cleanText = text.replace(/^\uFEFF/, '').trim()
    return JSON.parse(cleanText)
  } catch (e) {
    console.error('[书源] JSON解析失败:', e.message, '内容:', text.substring(0, 200))
    // 检查是否是HTML错误页
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('订阅地址返回了HTML页面，可能被重定向或阻止访问')
    }
    throw new Error('订阅返回内容不是有效 JSON')
  }
}

export const useBookSourceStore = defineStore('bookSource', () => {
  // ===== 状态 =====
  const sources = ref([])
  const subscriptions = ref([])
  const currentSourceId = ref(null)
  const searchHistory = ref([])
  const favorites = ref([])
  const playHistory = ref([])

  // ===== 计算属性 =====
  const enabledSources = computed(() => sources.value.filter(s => s.enabled !== false))
  const currentSource = computed(() => enabledSources.value.find(s => s.id === currentSourceId.value) || enabledSources.value[0] || null)
  
  // 按订阅分组的书源
  const sourcesBySubscription = computed(() => {
    const grouped = {}
    // 先添加已知订阅的分组
    for (const sub of subscriptions.value) {
      grouped[sub.id] = {
        subscription: sub,
        sources: sources.value.filter(s => s.subscriptionId === sub.id)
      }
    }
    // 未关联订阅的书源归入 null 组
    const unlinked = sources.value.filter(s => !s.subscriptionId)
    if (unlinked.length) {
      grouped['_unlinked'] = {
        subscription: { id: '_unlinked', name: '未关联订阅', icon: '📦' },
        sources: unlinked
      }
    }
    return grouped
  })
  
  // 获取某个订阅下的书源
  function getSourcesForSubscription(subscriptionId) {
    return sources.value.filter(s => s.subscriptionId === subscriptionId)
  }
  
  // 获取书源所属的订阅
  function getSubscriptionForSource(sourceId) {
    const source = sources.value.find(s => s.id === sourceId)
    if (!source?.subscriptionId) return null
    return subscriptions.value.find(sub => sub.id === source.subscriptionId)
  }

  // ===== 本地存储 =====
  function resetState() {
    sources.value = []
    subscriptions.value = []
    currentSourceId.value = null
    searchHistory.value = []
    favorites.value = []
    playHistory.value = []
  }

  function loadFromStorage() {
    const saved = localStorage.getItem(BOOK_SOURCE_STORAGE_KEY)
    const legacyV2 = localStorage.getItem(LEGACY_STORAGE_KEY_V2)
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)

    try {
      if (saved) {
        // v3 格式，直接加载
        const parsed = JSON.parse(saved)
        sources.value = parsed.sources || []
        subscriptions.value = parsed.subscriptions || []
        currentSourceId.value = parsed.currentSourceId || null
        searchHistory.value = parsed.searchHistory || []
        favorites.value = parsed.favorites || []
        playHistory.value = parsed.playHistory || []
      } else if (legacyV2) {
        // 从 v2 迁移，书源可能没有 subscriptionId
        const parsed = JSON.parse(legacyV2)
        sources.value = (parsed.sources || []).map(s => ({ ...s, subscriptionId: s.subscriptionId || null }))
        subscriptions.value = parsed.subscriptions || []
        currentSourceId.value = parsed.currentSourceId || null
        searchHistory.value = parsed.searchHistory || []
        favorites.value = parsed.favorites || []
        playHistory.value = parsed.playHistory || []
        console.log('已从 v2 格式迁移书源数据')
      } else if (legacy) {
        // 从旧格式迁移
        const parsed = JSON.parse(legacy)
        const userSources = parsed.sources || []
        sources.value = userSources.filter(s => s.type === 'thirdparty').map(s => normalizeSource(s, null)).filter(Boolean)
        subscriptions.value = parsed.subscriptions || []
        searchHistory.value = (parsed.searchHistory || []).filter(Boolean)
        favorites.value = (parsed.favorites || []).filter(f => f.type === 'booksource')
        playHistory.value = (parsed.playHistory || []).filter(h => h.type === 'booksource')
        console.log('已从旧格式迁移书源数据')
      }
    } catch (e) {
      console.error('加载书源数据失败:', e)
      resetState()
    }

    if (!currentSourceId.value && enabledSources.value.length) {
      currentSourceId.value = enabledSources.value[0].id
    }
    
    // 首次启动时自动导入默认订阅源
    const isFirstLaunch = !saved && !legacyV2 && !legacy
    if (isFirstLaunch) {
      autoImportDefaultSubscription()
    }
  }
  
  /**
   * 自动导入默认预设订阅源（首次启动时调用）
   */
  async function autoImportDefaultSubscription() {
    const defaultSub = PRESET_SUBSCRIPTIONS.find(s => s.isDefault)
    if (!defaultSub) return
    
    console.log('[书源] 首次启动，自动导入默认订阅源:', defaultSub.name)
    try {
      const result = await addSubscription(defaultSub.url, defaultSub.name)
      console.log('[书源] 默认订阅导入成功，书源数:', result.imported)
    } catch (e) {
      console.warn('[书源] 默认订阅导入失败:', e.message)
    }
  }

  function saveToStorage() {
    try {
      const data = {
        sources: sources.value,
        subscriptions: subscriptions.value,
        currentSourceId: currentSourceId.value,
        searchHistory: searchHistory.value,
        favorites: favorites.value,
        playHistory: playHistory.value
      }
      localStorage.setItem(BOOK_SOURCE_STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('保存书源数据失败:', e)
    }
  }

  watch([sources, subscriptions, currentSourceId, searchHistory, favorites, playHistory], saveToStorage, { deep: true })

  // ===== 书源管理 =====
  function ensureCurrentIsEnabled() {
    if (currentSourceId.value && !enabledSources.value.find(s => s.id === currentSourceId.value)) {
      currentSourceId.value = enabledSources.value[0]?.id || null
    }
  }

  function setCurrentSource(id) {
    if (sources.value.find(s => s.id === id)) {
      currentSourceId.value = id
    }
  }

  function addSource(rawSource) {
    const normalized = normalizeSource(rawSource)
    if (!normalized) {
      throw new Error('书源格式不合法')
    }
    if (sources.value.find(s => s.id === normalized.id)) {
      throw new Error('书源已存在')
    }
    sources.value.push({ ...normalized, enabled: normalized.enabled !== false })
    if (!currentSourceId.value) {
      currentSourceId.value = normalized.id
    }
    return normalized
  }

  function updateSource(id, updates) {
    const index = sources.value.findIndex(s => s.id === id)
    if (index !== -1) {
      sources.value[index] = { ...sources.value[index], ...updates }
      ensureCurrentIsEnabled()
    }
  }

  function removeSource(id) {
    sources.value = sources.value.filter(s => s.id !== id)
    ensureCurrentIsEnabled()
  }

  function toggleSource(id) {
    const source = sources.value.find(s => s.id === id)
    if (source) {
      source.enabled = !source.enabled
      ensureCurrentIsEnabled()
    }
  }

  /**
   * 从 URL 导入书源
   * @param {string} url - 订阅地址
   * @param {string} subscriptionId - 关联的订阅ID
   * @param {boolean} syncDelete - 是否同步删除远程已不存在的书源
   * @param {boolean} audioOnly - 是否只导入有声书源 (bookSourceType === 1)
   */
  async function importFromUrl(url, subscriptionId = null, syncDelete = false, audioOnly = true) {
    const data = await fetchSubscriptionData(url)
    let list = Array.isArray(data) ? data : [data]
    
    // 默认只导入有声书源 (Legado 格式中 bookSourceType: 1 表示有声)
    if (audioOnly) {
      const audioSources = list.filter(s => s.bookSourceType === 1)
      // 如果存在 bookSourceType 字段且过滤后有结果，使用过滤后的列表
      // 否则保留全部（可能是"我的听书"格式，没有 bookSourceType 字段）
      if (list.some(s => s.bookSourceType !== undefined) && audioSources.length > 0) {
        console.log(`[书源] 过滤有声书源: ${audioSources.length}/${list.length}`)
        list = audioSources
      }
    }
    
    let imported = 0
    let updated = 0
    let deleted = 0

    // 收集本次导入的所有书源ID
    const importedIds = new Set()

    for (const raw of list) {
      try {
        const normalized = normalizeSource(raw, subscriptionId)
        if (!normalized) continue
        importedIds.add(normalized.id)
        
        const existing = sources.value.find(s => s.id === normalized.id)
        if (existing) {
          // 更新已有书源，同时更新 subscriptionId
          updateSource(existing.id, { ...normalized, subscriptionId })
          updated++
        } else {
          sources.value.push({ ...normalized, enabled: normalized.enabled !== false })
          imported++
        }
      } catch (e) {
        console.warn('跳过异常书源', e)
      }
    }

    // 同步删除：删除该订阅下远程已不存在的书源
    if (syncDelete && subscriptionId) {
      const toDelete = sources.value.filter(
        s => s.subscriptionId === subscriptionId && !importedIds.has(s.id)
      )
      for (const source of toDelete) {
        removeSource(source.id)
        deleted++
      }
    }

    if (!imported && !updated && list.length) {
      throw new Error('未找到有效的书源')
    }

    return { success: true, imported, updated, deleted, total: importedIds.size }
  }

  function importFromJson(jsonStr) {
    const data = JSON.parse(jsonStr)
    const list = Array.isArray(data) ? data : [data]
    let imported = 0
    for (const raw of list) {
      const normalized = normalizeSource(raw)
      if (!normalized) continue
      if (!sources.value.find(s => s.id === normalized.id || s.name === normalized.name)) {
        addSource(normalized)
        imported++
      }
    }
    return { success: true, imported }
  }

  function exportSources(sourceIds = null) {
    const toExport = sourceIds
      ? sources.value.filter(s => sourceIds.includes(s.id))
      : sources.value
    return JSON.stringify(toExport, null, 2)
  }

  async function addSubscription(url, name = '') {
    try {
      new URL(url)
    } catch {
      throw new Error('无效的 URL')
    }

    const targetUrl = url.trim()
    const existing = subscriptions.value.find(s => s.url === targetUrl)

    // 已有订阅时直接刷新
    if (existing) {
      const result = await importFromUrl(targetUrl, existing.id, true)
      existing.lastUpdated = new Date().toISOString()
      existing.sourceCount = result.total
      existing.enabled = true
      if (name) existing.name = name
      ensureCurrentIsEnabled()
      return { subscription: existing, imported: result.imported, refreshed: true }
    }

    // 新建订阅
    const subscription = {
      id: `sub-${Date.now()}`,
      url: targetUrl,
      name: name || `订阅源${subscriptions.value.length + 1}`,
      addedAt: new Date().toISOString(),
      lastUpdated: null,
      enabled: true,
      sourceCount: 0  // 该订阅下的书源数量
    }

    // 先添加订阅记录，这样导入时可以关联
    subscriptions.value.push(subscription)

    try {
      const result = await importFromUrl(targetUrl, subscription.id, false)
      subscription.sourceCount = result.total
      subscription.lastUpdated = new Date().toISOString()
      ensureCurrentIsEnabled()
      return { subscription, imported: result.imported }
    } catch (e) {
      // 导入失败时移除订阅记录
      subscriptions.value = subscriptions.value.filter(s => s.id !== subscription.id)
      throw e
    }
  }

  /**
   * 刷新订阅（同步远程数据，包括删除远程已移除的书源）
   */
  async function refreshSubscription(id) {
    const sub = subscriptions.value.find(s => s.id === id)
    if (!sub) return { success: false, error: '订阅不存在' }
    
    const result = await importFromUrl(sub.url, sub.id, true)
    sub.lastUpdated = new Date().toISOString()
    sub.sourceCount = result.total
    ensureCurrentIsEnabled()
    return { success: true, ...result }
  }

  async function refreshAllSubscriptions() {
    const results = []
    for (const sub of subscriptions.value.filter(s => s.enabled !== false)) {
      try {
        const result = await refreshSubscription(sub.id)
        results.push({ id: sub.id, name: sub.name, ...result })
      } catch (e) {
        results.push({ id: sub.id, name: sub.name, success: false, error: e.message })
      }
    }
    return results
  }

  /**
   * 删除订阅（同时删除该订阅下的所有书源）
   * @param {string} id - 订阅ID
   * @param {boolean} keepSources - 是否保留已导入的书源（默认删除）
   */
  function removeSubscription(id, keepSources = false) {
    const sub = subscriptions.value.find(s => s.id === id)
    if (!sub) return

    // 默认删除该订阅下的所有书源
    if (!keepSources) {
      sources.value = sources.value.filter(s => s.subscriptionId !== id)
    } else {
      // 保留书源但清除关联
      sources.value.forEach(s => {
        if (s.subscriptionId === id) {
          s.subscriptionId = null
        }
      })
    }

    subscriptions.value = subscriptions.value.filter(s => s.id !== id)
    ensureCurrentIsEnabled()
  }

  // ===== 搜索历史 =====
  function addSearchHistory(keyword) {
    const value = keyword.trim()
    if (!value) return
    searchHistory.value = searchHistory.value.filter(k => k !== value)
    searchHistory.value.unshift(value)
    if (searchHistory.value.length > 30) {
      searchHistory.value = searchHistory.value.slice(0, 30)
    }
  }

  function clearSearchHistory() {
    searchHistory.value = []
  }

  // ===== 收藏 =====
  function addFavorite(item) {
    if (favorites.value.find(f => f.id === item.id)) return
    favorites.value.unshift({ ...item, type: 'booksource', addedAt: new Date().toISOString() })
  }

  function removeFavorite(id) {
    favorites.value = favorites.value.filter(f => f.id !== id)
  }

  function isFavorite(id) {
    return favorites.value.some(f => f.id === id)
  }

  // ===== 播放历史 =====
  function addPlayHistory(item) {
    playHistory.value = playHistory.value.filter(h => h.id !== item.id)
    playHistory.value.unshift({ ...item, type: 'booksource', playedAt: new Date().toISOString() })
    if (playHistory.value.length > 100) {
      playHistory.value = playHistory.value.slice(0, 100)
    }
  }

  function clearPlayHistory() {
    playHistory.value = []
  }

  // ===== 初始化 =====
  loadFromStorage()

  return {
    // 状态
    sources,
    subscriptions,
    currentSourceId,
    searchHistory,
    favorites,
    playHistory,

    // 计算属性
    enabledSources,
    currentSource,
    sourcesBySubscription,

    // 常量
    PRESET_SUBSCRIPTIONS,
    normalizeSource,

    // 状态管理
    resetState,
    setCurrentSource,

    // 书源管理
    addSource,
    updateSource,
    removeSource,
    toggleSource,
    importFromUrl,
    importFromJson,
    exportSources,

    // 订阅管理
    addSubscription,
    refreshSubscription,
    refreshAllSubscriptions,
    removeSubscription,
    getSourcesForSubscription,
    getSubscriptionForSource,

    // 搜索历史
    addSearchHistory,
    clearSearchHistory,

    // 收藏
    addFavorite,
    removeFavorite,
    isFavorite,

    // 播放历史
    addPlayHistory,
    clearPlayHistory
  }
})
