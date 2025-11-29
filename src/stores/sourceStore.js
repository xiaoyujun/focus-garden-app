/**
 * 书源/听书源管理 Store
 * 参考"我的听书"项目的书源格式设计
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const SOURCE_STORAGE_KEY = 'audio-sources-data'

/**
 * 书源格式说明：
 * {
 *   id: string,           // 唯一标识
 *   name: string,         // 源名称
 *   type: string,         // 类型: 'bilibili' | 'web' | 'rss' | 'custom'
 *   baseUrl: string,      // 基础URL
 *   enabled: boolean,     // 是否启用
 *   config: {             // 源配置
 *     // 针对不同类型有不同配置
 *   },
 *   // 解析规则（用于web类型）
 *   rules: {
 *     search: {},         // 搜索规则
 *     detail: {},         // 详情页规则
 *     chapters: {},       // 章节列表规则
 *     audio: {}           // 音频地址规则
 *   }
 * }
 */

// 内置源模板
const BUILTIN_SOURCES = [
  {
    id: 'bilibili',
    name: 'B站',
    type: 'bilibili',
    baseUrl: 'https://www.bilibili.com',
    enabled: true,
    icon: '📺',
    description: '搜索B站有声书、音乐、播客等内容'
  },
  {
    id: 'ximalaya',
    name: '喜马拉雅',
    type: 'ximalaya',
    baseUrl: 'https://www.ximalaya.com',
    enabled: true,
    icon: '🏔️',
    description: '海量有声书、相声评书、儿童故事'
  },
  {
    id: 'qingting',
    name: '蜻蜓FM',
    type: 'qingting',
    baseUrl: 'https://www.qingting.fm',
    enabled: true,
    icon: '🦋',
    description: '电台、有声书、播客内容'
  }
]

// 预设的外部书源订阅地址
const PRESET_SUBSCRIPTIONS = [
  {
    name: '我的听书官方源',
    url: 'https://eprendre2.coding.net/p/tingshu/d/tingshu/git/raw/master/TingShuSources/external_sources.json',
    description: '我的听书App官方书源（推荐）',
    icon: '📚'
  },
  {
    name: '听书镜像源',
    url: 'https://wdts.top/api/sources/external_sources.json',
    description: '官方源镜像，国内访问更快',
    icon: '🔄'
  },
  {
    name: '听书ASMR源',
    url: 'https://kylo94.coding.net/p/tingshuyuan/d/UpdateJar/git/raw/master/kyloasmr.json',
    description: 'ASMR相关有声内容',
    icon: '🎧'
  },
  {
    name: '懒人听书源',
    url: 'https://gitee.com/elevenChen2019/tingshu_sources/raw/master/sources.json',
    description: '懒人听书聚合源',
    icon: '😴'
  },
  {
    name: '视频影视源',
    url: 'https://wdts.top/api/sources/videosource.json',
    description: '影视视频源订阅',
    icon: '🎬'
  },
  {
    name: 'Legado RSS源',
    url: 'https://raw.githubusercontent.com/gedoor/legado/master/app/src/main/assets/defaultData/rssSources.json',
    description: 'Legado阅读App RSS订阅源',
    icon: '📖'
  }
]

export const useSourceStore = defineStore('source', () => {
  // ===== 状态 =====
  const sources = ref([...BUILTIN_SOURCES])  // 所有书源
  const subscriptions = ref([])              // 订阅的源列表
  const currentSourceId = ref(null)          // 当前选中的源
  const searchHistory = ref([])              // 搜索历史
  const favorites = ref([])                  // 收藏的内容
  const playHistory = ref([])                // 播放历史
  
  // ===== 计算属性 =====
  const enabledSources = computed(() => 
    sources.value.filter(s => s.enabled)
  )
  
  const currentSource = computed(() =>
    sources.value.find(s => s.id === currentSourceId.value) || sources.value[0]
  )
  
  const bilibiliSources = computed(() =>
    sources.value.filter(s => s.type === 'bilibili')
  )
  
  const webSources = computed(() =>
    sources.value.filter(s => s.type === 'web')
  )

  // 第三方书源（导入的书源）
  const thirdPartySources = computed(() =>
    sources.value.filter(s => s.type === 'thirdparty')
  )

  // 是否为内置源
  function isBuiltinSource(id) {
    return BUILTIN_SOURCES.some(s => s.id === id)
  }

  // ===== 本地存储 =====
  function loadFromStorage() {
    try {
      const data = localStorage.getItem(SOURCE_STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        
        // 合并内置源和用户源
        const userSources = parsed.sources || []
        const builtinIds = BUILTIN_SOURCES.map(s => s.id)
        
        // 保留用户对内置源的设置
        sources.value = [
          ...BUILTIN_SOURCES.map(builtin => {
            const userVersion = userSources.find(s => s.id === builtin.id)
            return userVersion ? { ...builtin, ...userVersion } : builtin
          }),
          ...userSources.filter(s => !builtinIds.includes(s.id))
        ]
        
        subscriptions.value = parsed.subscriptions || []
        currentSourceId.value = parsed.currentSourceId || sources.value[0]?.id
        searchHistory.value = parsed.searchHistory || []
        favorites.value = parsed.favorites || []
        playHistory.value = parsed.playHistory || []
      }
    } catch (e) {
      console.error('加载书源设置失败:', e)
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
      localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('保存书源设置失败:', e)
    }
  }

  // 自动保存
  watch([sources, subscriptions, currentSourceId, searchHistory, favorites, playHistory], 
    saveToStorage, { deep: true })

  // ===== 书源管理方法 =====
  
  /**
   * 添加书源
   */
  function addSource(source) {
    if (!source.id) {
      source.id = `source-${Date.now()}`
    }
    if (sources.value.find(s => s.id === source.id)) {
      throw new Error('书源已存在')
    }
    sources.value.push({
      enabled: true,
      ...source
    })
  }

  /**
   * 更新书源
   */
  function updateSource(id, updates) {
    const index = sources.value.findIndex(s => s.id === id)
    if (index !== -1) {
      sources.value[index] = { ...sources.value[index], ...updates }
    }
  }

  /**
   * 删除书源
   */
  function removeSource(id) {
    const builtinIds = BUILTIN_SOURCES.map(s => s.id)
    if (builtinIds.includes(id)) {
      // 内置源只能禁用，不能删除
      updateSource(id, { enabled: false })
      return
    }
    sources.value = sources.value.filter(s => s.id !== id)
  }

  /**
   * 切换书源启用状态
   */
  function toggleSource(id) {
    const source = sources.value.find(s => s.id === id)
    if (source) {
      source.enabled = !source.enabled
    }
  }

  /**
   * 设置当前源
   */
  function setCurrentSource(id) {
    if (sources.value.find(s => s.id === id)) {
      currentSourceId.value = id
    }
  }

  /**
   * 从URL导入书源
   */
  async function importFromUrl(url) {
    try {
      const response = await fetch(url)
      const data = await response.json()
      
      let imported = 0
      const sourcesToImport = Array.isArray(data) ? data : [data]
      
      for (const source of sourcesToImport) {
        try {
          // 转换为统一格式
          const normalizedSource = normalizeSource(source)
          
          // 验证书源格式
          if (!normalizedSource.name) continue
          
          // 生成唯一ID
          normalizedSource.id = normalizedSource.id || `imported-${Date.now()}-${imported}`
          
          // 检查是否已存在
          const existing = sources.value.find(s => 
            s.id === normalizedSource.id || 
            s.name === normalizedSource.name ||
            (s.sourceUrl && s.sourceUrl === normalizedSource.sourceUrl)
          )
          
          if (existing) {
            // 更新已存在的源
            updateSource(existing.id, normalizedSource)
          } else {
            addSource(normalizedSource)
          }
          imported++
        } catch (e) {
          console.error('导入书源失败:', source.sourceName || source.bookSourceName || source.name, e)
        }
      }
      
      return { success: true, imported }
    } catch (error) {
      console.error('从URL导入书源失败:', error)
      throw error
    }
  }

  /**
   * 标准化书源格式
   * 支持"我的听书"格式和其他常见格式的转换
   */
  function normalizeSource(source) {
    // 如果已经是标准格式
    if (source.type && source.name) {
      return { ...source, enabled: source.enabled !== false }
    }
    
    // "我的听书"格式转换
    if (source.sourceName || source.bookSourceName) {
      return {
        id: source.sourceUrl || source.bookSourceUrl || `source-${Date.now()}`,
        name: source.sourceName || source.bookSourceName,
        type: 'thirdparty',
        sourceUrl: source.sourceUrl || source.bookSourceUrl,
        enabled: source.enabled !== false,
        icon: '📚',
        description: source.sourceComment || source.sourceGroup || '第三方书源',
        group: source.sourceGroup || source.bookSourceGroup || '未分类',
        // 保留原始配置用于搜索和解析
        searchUrl: source.searchUrl || source.ruleSearchUrl,
        searchList: source.searchList || source.ruleSearchList,
        searchName: source.searchName || source.ruleSearchName,
        searchCover: source.searchCover || source.ruleSearchCover,
        searchAuthor: source.searchAuthor || source.ruleSearchAuthor,
        searchArtist: source.searchArtist || source.ruleSearchArtist,
        searchIntro: source.searchIntro || source.ruleSearchIntro,
        searchKind: source.searchKind || source.ruleSearchKind,
        searchNoteUrl: source.searchNoteUrl || source.ruleSearchNoteUrl,
        chapterList: source.chapterList || source.ruleChapterList,
        chapterName: source.chapterName || source.ruleChapterName,
        chapterUrl: source.chapterUrl || source.ruleChapterUrl,
        audioUrlRule: source.audioUrlRule || source.ruleContentUrl || source.contentUrl,
        // 保留完整原始数据
        _raw: source
      }
    }
    
    // 其他格式，尝试识别
    return {
      id: source.id || source.url || `source-${Date.now()}`,
      name: source.name || source.title || '未知书源',
      type: 'thirdparty',
      sourceUrl: source.url || source.baseUrl || '',
      enabled: source.enabled !== false,
      icon: '📚',
      description: source.description || source.desc || '第三方书源',
      _raw: source
    }
  }

  /**
   * 从JSON字符串导入书源
   */
  function importFromJson(jsonStr) {
    try {
      const data = JSON.parse(jsonStr)
      const sourcesToImport = Array.isArray(data) ? data : [data]
      
      let imported = 0
      for (const source of sourcesToImport) {
        // 转换为统一格式
        const normalizedSource = normalizeSource(source)
        
        if (!normalizedSource.name) continue
        normalizedSource.id = normalizedSource.id || `imported-${Date.now()}-${imported}`
        
        const existing = sources.value.find(s => 
          s.id === normalizedSource.id || 
          s.name === normalizedSource.name
        )
        if (!existing) {
          addSource(normalizedSource)
          imported++
        }
      }
      
      return { success: true, imported }
    } catch (error) {
      console.error('从JSON导入书源失败:', error)
      throw error
    }
  }

  /**
   * 导出书源
   */
  function exportSources(sourceIds = null) {
    const toExport = sourceIds 
      ? sources.value.filter(s => sourceIds.includes(s.id))
      : sources.value.filter(s => !BUILTIN_SOURCES.map(b => b.id).includes(s.id))
    
    return JSON.stringify(toExport, null, 2)
  }

  // ===== 订阅管理 =====
  
  /**
   * 添加订阅
   */
  async function addSubscription(url, name = '') {
    // 验证URL格式
    try {
      new URL(url)
    } catch {
      throw new Error('无效的URL格式')
    }
    
    // 检查是否已存在
    if (subscriptions.value.find(s => s.url === url)) {
      throw new Error('订阅已存在')
    }
    
    const subscription = {
      id: `sub-${Date.now()}`,
      url,
      name: name || `订阅源 ${subscriptions.value.length + 1}`,
      addedAt: new Date().toISOString(),
      lastUpdated: null,
      enabled: true
    }
    
    // 尝试获取订阅内容
    try {
      await importFromUrl(url)
      subscription.lastUpdated = new Date().toISOString()
    } catch (e) {
      console.warn('首次获取订阅失败:', e)
    }
    
    subscriptions.value.push(subscription)
    return subscription
  }

  /**
   * 刷新订阅
   */
  async function refreshSubscription(id) {
    const subscription = subscriptions.value.find(s => s.id === id)
    if (!subscription) return
    
    try {
      await importFromUrl(subscription.url)
      subscription.lastUpdated = new Date().toISOString()
    } catch (error) {
      throw error
    }
  }

  /**
   * 刷新所有订阅
   */
  async function refreshAllSubscriptions() {
    const results = []
    for (const sub of subscriptions.value.filter(s => s.enabled)) {
      try {
        await refreshSubscription(sub.id)
        results.push({ id: sub.id, success: true })
      } catch (e) {
        results.push({ id: sub.id, success: false, error: e.message })
      }
    }
    return results
  }

  /**
   * 删除订阅
   */
  function removeSubscription(id) {
    subscriptions.value = subscriptions.value.filter(s => s.id !== id)
  }

  // ===== 搜索历史 =====
  
  function addSearchHistory(keyword) {
    if (!keyword.trim()) return
    
    // 移除重复
    searchHistory.value = searchHistory.value.filter(k => k !== keyword)
    // 添加到开头
    searchHistory.value.unshift(keyword)
    // 限制数量
    if (searchHistory.value.length > 20) {
      searchHistory.value = searchHistory.value.slice(0, 20)
    }
  }

  function clearSearchHistory() {
    searchHistory.value = []
  }

  // ===== 收藏管理 =====
  
  function addFavorite(item) {
    if (favorites.value.find(f => f.id === item.id)) return
    favorites.value.unshift({
      ...item,
      addedAt: new Date().toISOString()
    })
  }

  function removeFavorite(id) {
    favorites.value = favorites.value.filter(f => f.id !== id)
  }

  function isFavorite(id) {
    return favorites.value.some(f => f.id === id)
  }

  // ===== 播放历史 =====
  
  function addPlayHistory(item) {
    // 移除重复
    playHistory.value = playHistory.value.filter(h => h.id !== item.id)
    // 添加到开头
    playHistory.value.unshift({
      ...item,
      playedAt: new Date().toISOString()
    })
    // 限制数量
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
    bilibiliSources,
    webSources,
    thirdPartySources,
    
    // 工具方法
    isBuiltinSource,
    normalizeSource,
    
    // 常量
    PRESET_SUBSCRIPTIONS,
    
    // 书源管理
    addSource,
    updateSource,
    removeSource,
    toggleSource,
    setCurrentSource,
    importFromUrl,
    importFromJson,
    exportSources,
    
    // 订阅管理
    addSubscription,
    refreshSubscription,
    refreshAllSubscriptions,
    removeSubscription,
    
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
