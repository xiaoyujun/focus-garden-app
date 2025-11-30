import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const SOURCE_STORAGE_KEY = 'platform-source-data'

const PLATFORM_SOURCES = [
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
    icon: '📻',
    description: '海量有声书、相声评书、儿童故事'
  }
]

export const useSourceStore = defineStore('source', () => {
  // ===== 状态 =====
  const sources = ref([...PLATFORM_SOURCES])
  const currentSourceId = ref(PLATFORM_SOURCES[0].id)
  const searchHistory = ref([])
  const favorites = ref([])
  const playHistory = ref([])

  // ===== 计算属性 =====
  const enabledSources = computed(() => sources.value.filter(s => s.enabled !== false))
  const currentSource = computed(() => enabledSources.value.find(s => s.id === currentSourceId.value) || enabledSources.value[0])
  const platformSources = computed(() => enabledSources.value)

  // ===== 本地存储 =====
  function loadFromStorage() {
    try {
      const data = localStorage.getItem(SOURCE_STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        const userSources = parsed.sources || []
        const builtinIds = PLATFORM_SOURCES.map(s => s.id)

        sources.value = [
          ...PLATFORM_SOURCES.map(builtin => {
            const userVersion = userSources.find(s => s.id === builtin.id)
            return userVersion ? { ...builtin, ...userVersion } : builtin
          }),
          ...userSources.filter(s => !builtinIds.includes(s.id))
        ]

        currentSourceId.value = parsed.currentSourceId || sources.value[0]?.id || PLATFORM_SOURCES[0].id
        searchHistory.value = parsed.searchHistory || []
        favorites.value = parsed.favorites || []
        playHistory.value = parsed.playHistory || []
      }
    } catch (e) {
      console.error('加载平台源失败:', e)
    }
  }

  function saveToStorage() {
    try {
      const data = {
        sources: sources.value,
        currentSourceId: currentSourceId.value,
        searchHistory: searchHistory.value,
        favorites: favorites.value,
        playHistory: playHistory.value
      }
      localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('保存平台源失败:', e)
    }
  }

  watch([sources, currentSourceId, searchHistory, favorites, playHistory], saveToStorage, { deep: true })

  // ===== 源管理 =====
  function toggleSource(id) {
    const source = sources.value.find(s => s.id === id)
    if (source) {
      source.enabled = !source.enabled
      if (!source.enabled && currentSourceId.value === id) {
        currentSourceId.value = enabledSources.value[0]?.id || null
      }
    }
  }

  function setCurrentSource(id) {
    if (sources.value.find(s => s.id === id)) {
      currentSourceId.value = id
    }
  }

  // ===== 搜索历史 =====
  function addSearchHistory(keyword) {
    const value = keyword.trim()
    if (!value) return
    searchHistory.value = searchHistory.value.filter(k => k !== value)
    searchHistory.value.unshift(value)
    if (searchHistory.value.length > 20) {
      searchHistory.value = searchHistory.value.slice(0, 20)
    }
  }

  function clearSearchHistory() {
    searchHistory.value = []
  }

  // ===== 收藏 =====
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
    playHistory.value = playHistory.value.filter(h => h.id !== item.id)
    playHistory.value.unshift({
      ...item,
      playedAt: new Date().toISOString()
    })
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
    sources,
    currentSourceId,
    searchHistory,
    favorites,
    playHistory,

    enabledSources,
    currentSource,
    platformSources,

    toggleSource,
    setCurrentSource,

    addSearchHistory,
    clearSearchHistory,

    addFavorite,
    removeFavorite,
    isFavorite,

    addPlayHistory,
    clearPlayHistory
  }
})
