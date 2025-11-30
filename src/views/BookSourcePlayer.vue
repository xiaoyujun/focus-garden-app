<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBookSourceStore } from '../stores/bookSourceStore'
import { 
  searchWithSource as searchThirdParty,
  getBookChapters,
  getChapterAudioUrl
} from '../services/thirdPartySourceService'
import { 
  Search, Play, Pause, SkipBack, SkipForward, 
  Volume2, VolumeX, Heart, Clock,
  List, X, RotateCcw, RotateCw, Settings, Plus,
  RefreshCw, Trash2, Globe, BookOpen
} from 'lucide-vue-next'

defineOptions({ name: 'BookSourcePlayer' })

const bookSourceStore = useBookSourceStore()

// ===== 状态 =====
const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref([])
const searchError = ref('')
// 搜索状态
const searchingProgress = ref('')      // 搜索进度文本
const searchedSourceCount = ref(0)     // 已搜索书源数
const totalSourceCount = ref(0)        // 总书源数
const failedSources = ref([])          // 搜索失败的书源

const currentBook = ref(null)          // 当前播放的书籍信息
const currentPlaylist = ref([])        // 当前播放列表（章节）
const currentIndex = ref(-1)           // 当前播放索引
const isPlaying = ref(false)
const isLoading = ref(false)

const audioRef = ref(null)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const playbackRate = ref(1)
const progressMap = ref({})
const PROGRESS_STORAGE_KEY = 'booksource-progress-map'
const PROGRESS_SAVE_INTERVAL = 5000
let lastProgressSave = 0
let pendingSeek = null

// UI 状态
const showPlaylist = ref(false)
const showSourceManager = ref(false)
const showBookDetail = ref(false)  // 书籍详情弹窗
const activeTab = ref('search')  // search | history | favorites

// 当前查看的书籍详情
const selectedBook = ref(null)
const bookChapters = ref([])
const isLoadingChapters = ref(false)
const chaptersError = ref('')

// 书源管理状态
const sourceManagerTab = ref('subscriptions')
const customSourceUrl = ref('')
const customSourceName = ref('')
const isAddingSource = ref(false)
const addSourceError = ref('')
const addSourceSuccess = ref('')

// 进度条拖动
const isDragging = ref(false)
const dragProgress = ref(0)

// ===== 计算属性 =====
const progress = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

const displayProgress = computed(() => {
  return isDragging.value ? dragProgress.value : progress.value
})

const currentTrack = computed(() => {
  if (currentIndex.value >= 0 && currentIndex.value < currentPlaylist.value.length) {
    return currentPlaylist.value[currentIndex.value]
  }
  return null
})

const formattedCurrentTime = computed(() => formatTime(currentTime.value))
const formattedDuration = computed(() => formatTime(duration.value))

// ===== 方法 =====

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// 播放进度存取
function loadProgressFromStorage() {
  try {
    const data = localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (data) {
      progressMap.value = JSON.parse(data)
    }
  } catch (e) {
    console.error('加载播放进度失败:', e)
  }
}

function saveProgressToStorage() {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressMap.value))
  } catch (e) {
    console.error('保存播放进度失败:', e)
  }
}

function getTrackKey(track) {
  if (!track) return ''
  const sourceId = track.sourceId || 'unknown'
  const chapterId = track.cid || track.chapterUrl || track.title || 'unknown'
  return `booksource:${sourceId}:${chapterId}`
}

function restoreProgressForTrack(track) {
  if (!audioRef.value) return
  const key = getTrackKey(track)
  const saved = key ? progressMap.value[key] : null
  if (!saved || !saved.position) return
  const target = Math.min(saved.position, audioRef.value.duration || saved.duration || saved.position)
  pendingSeek = target
  if (audioRef.value.readyState >= 1) {
    audioRef.value.currentTime = target
    pendingSeek = null
  }
}

function persistProgress(force = false) {
  const track = currentTrack.value
  if (!track || !audioRef.value) return
  const now = Date.now()
  if (!force && now - lastProgressSave < PROGRESS_SAVE_INTERVAL) return
  const key = getTrackKey(track)
  if (!key) return
  progressMap.value = {
    ...progressMap.value,
    [key]: {
      position: Math.floor(audioRef.value.currentTime || 0),
      duration: Math.floor(audioRef.value.duration || duration.value || 0),
      updatedAt: new Date().toISOString(),
      title: track.title,
      bookTitle: currentBook.value?.title
    }
  }
  lastProgressSave = now
  saveProgressToStorage()
}

// 搜索 - 并行搜索所有启用的书源，实时展示结果
async function handleSearch() {
  if (!searchQuery.value.trim()) return
  
  const enabledSources = bookSourceStore.enabledSources
  if (enabledSources.length === 0) {
    searchError.value = '请先添加并启用书源'
    return
  }
  
  isSearching.value = true
  searchError.value = ''
  searchResults.value = []
  searchedSourceCount.value = 0
  totalSourceCount.value = enabledSources.length
  failedSources.value = []
  searchingProgress.value = `搜索中 0/${enabledSources.length}`
  
  const keyword = searchQuery.value.trim()
  bookSourceStore.addSearchHistory(keyword)
  
  // 用于去重的 Set
  const seenKeys = new Set()
  
  // 并行搜索所有书源，每个完成后立即展示结果
  const searchPromises = enabledSources.map(async (source) => {
    try {
      const result = await searchThirdParty(source, keyword)
      // 为每个结果添加来源信息
      const sourceResults = result.results.map(item => ({
        ...item,
        sourceId: source.id,
        sourceName: source.name || source.sourceName || '未知书源',
        sourceIcon: source.icon || '📖'
      }))
      
      // 实时添加结果（去重）
      const newResults = sourceResults.filter(item => {
        const key = `${item.title}-${item.bookUrl}`
        if (seenKeys.has(key)) return false
        seenKeys.add(key)
        return true
      })
      
      if (newResults.length > 0) {
        searchResults.value = [...searchResults.value, ...newResults]
      }
    } catch (error) {
      console.warn(`书源 ${source.name} 搜索失败:`, error.message)
      failedSources.value.push({
        name: source.name || '未知书源',
        error: error.message
      })
    } finally {
      searchedSourceCount.value++
      searchingProgress.value = `搜索中 ${searchedSourceCount.value}/${totalSourceCount.value}`
    }
  })
  
  try {
    await Promise.all(searchPromises)
    
    // 显示失败信息
    if (failedSources.value.length > 0 && searchResults.value.length === 0) {
      searchError.value = `所有书源搜索失败，请检查网络或书源配置`
    } else if (failedSources.value.length > 0) {
      // 有结果但部分失败，只在控制台提示
      console.warn(`${failedSources.value.length} 个书源搜索失败`)
    }
  } catch (error) {
    searchError.value = '搜索出错，请稍后重试'
    console.error('搜索失败:', error)
  } finally {
    isSearching.value = false
    searchingProgress.value = ''
  }
}

// 查看书籍详情
async function viewBookDetail(book) {
  selectedBook.value = book
  showBookDetail.value = true
  bookChapters.value = []
  chaptersError.value = ''
  isLoadingChapters.value = true
  
  try {
    const source = bookSourceStore.sources.find(s => s.id === book.sourceId)
    
    if (!source) {
      throw new Error('找不到对应的书源配置')
    }
    
    const chaptersData = await getBookChapters(source, book)
    bookChapters.value = chaptersData.chapters
    
    if (!chaptersData.chapters.length) {
      chaptersError.value = '该书籍暂无可播放章节'
    }
  } catch (error) {
    console.error('获取章节失败:', error)
    chaptersError.value = error.message || '获取章节失败'
  } finally {
    isLoadingChapters.value = false
  }
}

// 从指定章节开始播放
async function playFromChapter(book, chapterIndex) {
  isLoading.value = true
  searchError.value = ''
  showBookDetail.value = false
  
  try {
    const source = bookSourceStore.sources.find(s => s.id === book.sourceId)
    
    if (!source) {
      throw new Error('找不到对应的书源配置')
    }
    
    currentBook.value = {
      title: book.title,
      cover: book.cover,
      author: book.author || book.artist,
      sourceId: book.sourceId,
      bookUrl: book.bookUrl
    }
    
    currentPlaylist.value = bookChapters.value.map(chapter => ({
      title: chapter.title,
      cid: chapter.id,
      chapterUrl: chapter.chapterUrl,
      sourceId: book.sourceId
    }))
    
    currentIndex.value = chapterIndex
    await loadAndPlay(chapterIndex)
    
    // 添加到播放历史
    bookSourceStore.addPlayHistory({
      id: book.id,
      type: 'booksource',
      title: book.title,
      cover: book.cover,
      author: book.author || book.artist,
      sourceId: book.sourceId,
      bookUrl: book.bookUrl
    })
  } catch (error) {
    console.error('播放失败:', error)
    searchError.value = error.message || '播放失败'
  } finally {
    isLoading.value = false
  }
}

// 加入书架
function addToBookshelf(book) {
  const id = `bookshelf-${book.sourceId}-${book.bookUrl || book.id}`
  if (!bookSourceStore.isFavorite(id)) {
    bookSourceStore.addFavorite({
      id,
      type: 'booksource',
      title: book.title,
      cover: book.cover,
      author: book.author || book.artist,
      sourceId: book.sourceId,
      bookUrl: book.bookUrl,
      addedAt: new Date().toISOString()
    })
  }
}

// 从书架移除
function removeFromBookshelf(book) {
  const id = `bookshelf-${book.sourceId}-${book.bookUrl || book.id}`
  bookSourceStore.removeFavorite(id)
}

// 检查是否在书架
function isInBookshelf(book) {
  const id = `bookshelf-${book.sourceId}-${book.bookUrl || book.id}`
  return bookSourceStore.isFavorite(id)
}

// 加载并播放
async function loadAndPlay(index) {
  if (index < 0 || index >= currentPlaylist.value.length) return
  
  persistProgress(true)
  isLoading.value = true
  currentIndex.value = index
  
  try {
    const track = currentPlaylist.value[index]
    const source = bookSourceStore.sources.find(s => s.id === track.sourceId)
    
    if (!source) {
      throw new Error('找不到对应的书源配置')
    }
    
    const audioUrl = await getChapterAudioUrl(source, track)
    
    if (audioRef.value) {
      audioRef.value.src = audioUrl
      audioRef.value.volume = volume.value
      audioRef.value.playbackRate = playbackRate.value
      restoreProgressForTrack(track)
      await audioRef.value.play()
      isPlaying.value = true
    }
  } catch (error) {
    console.error('播放失败:', error)
    searchError.value = error.message || '获取音频地址失败'
  } finally {
    isLoading.value = false
  }
}

// 播放控制
function togglePlay() {
  if (!audioRef.value) return
  
  if (isPlaying.value) {
    audioRef.value.pause()
    isPlaying.value = false
  } else {
    audioRef.value.play()
    isPlaying.value = true
  }
}

function previousTrack() {
  if (currentIndex.value > 0) {
    loadAndPlay(currentIndex.value - 1)
  }
}

function nextTrack() {
  if (currentIndex.value < currentPlaylist.value.length - 1) {
    loadAndPlay(currentIndex.value + 1)
  }
}

function rewind() {
  if (audioRef.value) {
    audioRef.value.currentTime = Math.max(0, audioRef.value.currentTime - 15)
  }
}

function forward() {
  if (audioRef.value) {
    audioRef.value.currentTime = Math.min(duration.value, audioRef.value.currentTime + 15)
  }
}

// 进度条
function onProgressMouseDown(e) {
  isDragging.value = true
  updateDragProgress(e)
}

function onProgressMouseMove(e) {
  if (isDragging.value) {
    updateDragProgress(e)
  }
}

function onProgressMouseUp() {
  if (isDragging.value && audioRef.value) {
    const newTime = (dragProgress.value / 100) * duration.value
    audioRef.value.currentTime = newTime
    isDragging.value = false
  }
}

function updateDragProgress(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
  dragProgress.value = percent
}

// 音量
function onVolumeChange(e) {
  volume.value = parseFloat(e.target.value)
  if (audioRef.value) {
    audioRef.value.volume = volume.value
  }
}

function toggleMute() {
  if (volume.value > 0) {
    volume.value = 0
  } else {
    volume.value = 1
  }
  if (audioRef.value) {
    audioRef.value.volume = volume.value
  }
}

// 播放速度
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
function cyclePlaybackRate() {
  const idx = playbackRates.indexOf(playbackRate.value)
  playbackRate.value = playbackRates[(idx + 1) % playbackRates.length]
  if (audioRef.value) {
    audioRef.value.playbackRate = playbackRate.value
  }
}

// 收藏
function toggleFavorite() {
  if (!currentBook.value) return
  
  const id = `booksource-${currentBook.value.sourceId}-${currentBook.value.bookUrl}`
  if (bookSourceStore.isFavorite(id)) {
    bookSourceStore.removeFavorite(id)
  } else {
    bookSourceStore.addFavorite({
      id,
      type: 'booksource',
      title: currentBook.value.title,
      cover: currentBook.value.cover,
      author: currentBook.value.author,
      sourceId: currentBook.value.sourceId,
      bookUrl: currentBook.value.bookUrl
    })
  }
}

// 音频事件
function onTimeUpdate() {
  if (audioRef.value && !isDragging.value) {
    currentTime.value = audioRef.value.currentTime
    persistProgress()
  }
}

function onDurationChange() {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
    if (pendingSeek !== null) {
      const target = Math.min(pendingSeek, audioRef.value.duration || pendingSeek)
      audioRef.value.currentTime = target
      pendingSeek = null
    }
  }
}

function onEnded() {
  // 自动下一章
  if (currentIndex.value < currentPlaylist.value.length - 1) {
    nextTrack()
  } else {
    isPlaying.value = false
  }
}

// 从历史搜索
function searchFromHistory(keyword) {
  searchQuery.value = keyword
  handleSearch()
  activeTab.value = 'search'
}

// 从收藏播放
function playFromFavorite(item) {
  if (item.type === 'booksource') {
    playBook(item)
  }
  activeTab.value = 'search'
}

// 从播放历史播放
function playFromHistory(item) {
  if (item.type === 'booksource') {
    playBook(item)
  }
  activeTab.value = 'search'
}

// 书源管理
async function handleAddSource() {
  if (!customSourceUrl.value.trim()) {
    addSourceError.value = '请输入书源URL'
    return
  }
  
  isAddingSource.value = true
  addSourceError.value = ''
  addSourceSuccess.value = ''
  
  try {
    const { imported, refreshed } = await bookSourceStore.addSubscription(customSourceUrl.value, customSourceName.value || '自定义书源')
    addSourceSuccess.value = refreshed
      ? `订阅已存在，已重新同步，导入 ${imported} 个书源`
      : `添加成功，导入 ${imported} 个书源`
    customSourceUrl.value = ''
    customSourceName.value = ''
    setTimeout(() => addSourceSuccess.value = '', 2000)
  } catch (e) {
    addSourceError.value = e.message || '添加失败'
  } finally {
    isAddingSource.value = false
  }
}

// 添加推荐订阅
async function addPresetSubscription(sub) {
  isAddingSource.value = true
  addSourceError.value = ''
  addSourceSuccess.value = ''
  
  try {
    const { imported, refreshed } = await bookSourceStore.addSubscription(sub.url, sub.name)
    addSourceSuccess.value = refreshed
      ? `订阅已存在，已重新同步「${sub.name}」，导入 ${imported} 个书源`
      : `已添加「${sub.name}」，导入 ${imported} 个书源`
    setTimeout(() => addSourceSuccess.value = '', 2000)
  } catch (e) {
    addSourceError.value = e.message || '添加失败'
  } finally {
    isAddingSource.value = false
  }
}

async function handleRefreshAllSubscriptions() {
  try {
    await bookSourceStore.refreshAllSubscriptions()
  } catch (e) {
    console.error('刷新订阅失败:', e)
  }
}

// 删除订阅（同时删除关联的书源）
function handleRemoveSubscription(sub) {
  const sourceCount = bookSourceStore.getSourcesForSubscription(sub.id).length
  const msg = sourceCount > 0 
    ? `确定删除订阅「${sub.name}」吗？\n\n该订阅下的 ${sourceCount} 个书源也将被删除。`
    : `确定删除订阅「${sub.name}」吗？`
  
  if (confirm(msg)) {
    bookSourceStore.removeSubscription(sub.id)
    addSourceSuccess.value = `已删除订阅「${sub.name}」`
    setTimeout(() => addSourceSuccess.value = '', 2000)
  }
}

// 键盘快捷键
function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT') return
  
  switch (e.code) {
    case 'Space':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowLeft':
      rewind()
      break
    case 'ArrowRight':
      forward()
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboard)
  loadProgressFromStorage()
})

onUnmounted(() => {
  persistProgress(true)
  window.removeEventListener('keydown', handleKeyboard)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 pb-36">
    <!-- 隐藏的音频元素 -->
    <audio 
      ref="audioRef"
      @timeupdate="onTimeUpdate"
      @durationchange="onDurationChange"
      @ended="onEnded"
      preload="auto"
      playsinline
      crossorigin="anonymous"
    />

    <!-- 头部 -->
    <header class="pt-6 pb-2 px-6 flex items-center justify-between relative z-10">
      <h1 class="text-2xl font-bold text-purple-900 flex items-center gap-2.5 tracking-tight">
        <div class="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-200 text-white">
          <BookOpen :size="22" />
        </div>
        <span>书源听书</span>
      </h1>
      <button 
        @click="showSourceManager = true"
        class="w-10 h-10 rounded-xl bg-white text-purple-600 hover:bg-purple-50 hover:scale-105 transition-all flex items-center justify-center shadow-sm border border-purple-100"
      >
        <Settings :size="20" />
      </button>
    </header>

    <main class="px-4 max-w-md mx-auto relative z-10">
      <!-- 书源选择 -->
      <div v-if="bookSourceStore.enabledSources.length === 0" class="mb-6 p-8 bg-white rounded-[2rem] text-center shadow-xl shadow-purple-900/5 border border-purple-50">
        <div class="w-20 h-20 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-6">
          <BookOpen :size="36" class="text-purple-300" />
        </div>
        <h3 class="text-lg font-bold text-purple-900 mb-2">开始您的听书之旅</h3>
        <p class="text-purple-400 mb-8 text-sm">添加书源以搜索并收听海量有声书</p>
        <button 
          @click="showSourceManager = true"
          class="px-8 py-3 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 hover:shadow-lg hover:shadow-purple-200 transition-all"
        >
          添加书源
        </button>
      </div>

      <template v-else>
        <!-- 已启用书源提示 -->
        <div 
          class="mb-4 px-4 py-2.5 rounded-2xl text-xs font-medium bg-white/60 text-purple-700 flex items-center justify-between border border-white/50 backdrop-blur-sm shadow-sm cursor-pointer hover:bg-white/80 transition-colors"
          @click="showSourceManager = true"
        >
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <span>已启用 {{ bookSourceStore.enabledSources.length }} 个书源</span>
          </div>
          <span class="text-purple-400 flex items-center gap-1">
            管理 <ChevronRight :size="12" />
          </span>
        </div>

        <!-- 搜索框 -->
        <div class="relative mb-6 group">
          <div class="absolute inset-0 bg-purple-200/30 rounded-2xl blur-xl transition-opacity opacity-0 group-hover:opacity-100"></div>
          <div class="relative bg-white rounded-2xl shadow-lg shadow-purple-100/50 overflow-hidden flex items-center transition-transform focus-within:scale-[1.02]">
            <div class="pl-4 text-purple-300">
              <Search :size="20" />
            </div>
            <input 
              v-model="searchQuery"
              @keyup.enter="handleSearch"
              type="text"
              placeholder="搜索有声书..."
              class="w-full px-3 py-4 bg-transparent outline-none text-purple-900 placeholder:text-purple-300"
            />
            <button 
              v-if="searchQuery"
              @click="searchQuery = ''; searchResults = []"
              class="p-2 text-purple-300 hover:text-purple-500 transition-colors"
            >
              <X :size="18" />
            </button>
            <button 
              @click="handleSearch"
              :disabled="isSearching"
              class="m-1.5 px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-bold hover:bg-purple-600 disabled:opacity-50 transition-colors shadow-md shadow-purple-200"
            >
              {{ isSearching ? '...' : '搜索' }}
            </button>
          </div>
        </div>

        <!-- 搜索进度条 -->
        <div v-if="isSearching && totalSourceCount > 0" class="mb-4 px-2">
          <div class="flex items-center justify-between text-xs font-medium text-purple-500 mb-1.5">
            <span>{{ searchingProgress }}</span>
            <span v-if="failedSources.length > 0" class="text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
              {{ failedSources.length }} 个失败
            </span>
          </div>
          <div class="h-2 bg-purple-100 rounded-full overflow-hidden">
            <div 
              class="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-300 ease-out rounded-full relative"
              :style="{ width: (searchedSourceCount / totalSourceCount * 100) + '%' }"
            >
              <div class="absolute inset-0 bg-white/30 animate-shimmer"></div>
            </div>
          </div>
        </div>

        <!-- 标签切换 -->
        <div class="flex p-1 bg-purple-100/50 rounded-2xl mb-6">
          <button 
            v-for="tab in [
              { id: 'search', icon: Search, label: '搜索' },
              { id: 'history', icon: Clock, label: '历史' },
              { id: 'bookshelf', icon: BookOpen, label: '书架' }
            ]"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5"
            :class="activeTab === tab.id ? 'bg-white text-purple-600 shadow-sm shadow-purple-100' : 'text-purple-400 hover:text-purple-500'"
          >
            <component :is="tab.icon" :size="16" />
            {{ tab.label }}
          </button>
        </div>

        <!-- 错误提示 -->
        <div v-if="searchError" class="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p class="text-red-600 text-sm">{{ searchError }}</p>
        </div>

        <!-- 搜索结果 -->
        <div v-if="activeTab === 'search'" class="space-y-3">
          <!-- 空状态 -->
          <div v-if="!searchResults.length && !searchQuery" class="text-center py-8">
            <BookOpen :size="48" class="mx-auto text-purple-200 mb-4" />
            <p class="text-purple-400">搜索你想听的有声书</p>
          </div>

          <!-- 搜索历史 -->
          <div v-if="!searchResults.length && bookSourceStore.searchHistory.length" class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-purple-500">搜索历史</span>
              <button @click="bookSourceStore.clearSearchHistory()" class="text-xs text-purple-400 hover:text-purple-600">
                清空
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button 
                v-for="keyword in bookSourceStore.searchHistory.slice(0, 10)" 
                :key="keyword"
                @click="searchFromHistory(keyword)"
                class="px-3 py-1 bg-purple-100 text-purple-600 rounded-full text-sm hover:bg-purple-200"
              >
                {{ keyword }}
              </button>
            </div>
          </div>

          <!-- 搜索结果统计 -->
          <div v-if="searchResults.length > 0" class="text-xs text-purple-500 mb-2">
            找到 {{ searchResults.length }} 个结果
          </div>

          <!-- 搜索结果列表 -->
          <div 
            v-for="item in searchResults" 
            :key="item.id"
            @click="viewBookDetail(item)"
            class="flex gap-4 p-4 bg-white rounded-2xl shadow-sm hover:shadow-lg shadow-purple-100/50 hover:-translate-y-0.5 transition-all cursor-pointer border border-purple-50 group"
          >
            <div class="relative flex-shrink-0">
              <div class="w-20 h-28 rounded-xl overflow-hidden shadow-md bg-purple-100">
                <img 
                  v-if="item.cover"
                  :src="item.cover" 
                  :alt="item.title"
                  referrerpolicy="no-referrer"
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <BookOpen :size="24" class="text-purple-300" />
                </div>
              </div>
              <!-- 来源标识 -->
              <div class="absolute -bottom-2 -right-2 px-2 py-1 bg-purple-600 text-white text-[10px] font-bold rounded-lg shadow-md max-w-[90px] truncate border-2 border-white">
                {{ item.sourceIcon || '📖' }} {{ item.sourceName || '未知' }}
              </div>
            </div>
            <div class="flex-1 min-w-0 py-1">
              <h3 class="font-bold text-purple-900 line-clamp-2 text-base mb-1 group-hover:text-purple-600 transition-colors">{{ item.title }}</h3>
              <div class="flex items-center gap-2 text-xs text-purple-400 mb-2">
                <span class="flex items-center gap-1"><User :size="12" /> {{ item.author || item.artist }}</span>
                <span v-if="item.category" class="px-1.5 py-0.5 bg-purple-50 rounded text-purple-500">{{ item.category }}</span>
              </div>
              <p v-if="item.description" class="text-xs text-purple-400/80 line-clamp-2 leading-relaxed">{{ item.description }}</p>
            </div>
          </div>

          <div v-if="isSearching" class="text-center py-8 text-purple-400">
            <div class="w-8 h-8 border-3 border-purple-200 border-t-purple-500 rounded-full animate-spin mx-auto mb-2"></div>
            <p>{{ searchingProgress || '搜索中...' }}</p>
            <p v-if="searchedSourceCount > 0" class="text-xs mt-1">
              已搜索 {{ searchedSourceCount }}/{{ totalSourceCount }} 个书源
            </p>
          </div>

          <div v-if="!isSearching && !searchResults.length && searchQuery" class="text-center py-8 text-purple-400">
            未找到相关内容
          </div>
        </div>

        <!-- 播放历史 -->
        <div v-if="activeTab === 'history'" class="space-y-3">
          <div v-if="!bookSourceStore.playHistory.filter(h => h.type === 'booksource').length" class="text-center py-12">
            <Clock :size="48" class="mx-auto text-purple-200 mb-4" />
            <p class="text-purple-400">暂无播放历史</p>
          </div>
          <div 
            v-for="item in bookSourceStore.playHistory.filter(h => h.type === 'booksource')" 
            :key="item.id"
            @click="viewBookDetail(item)"
            class="flex gap-3 p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          >
            <div class="w-16 h-22 rounded-lg overflow-hidden flex-shrink-0 bg-purple-100">
              <img v-if="item.cover" :src="item.cover" :alt="item.title" referrerpolicy="no-referrer" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <BookOpen :size="20" class="text-purple-300" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-purple-800 line-clamp-1 text-sm">{{ item.title }}</h3>
              <p class="text-xs text-purple-400 mt-1">{{ item.author }}</p>
            </div>
          </div>
        </div>

        <!-- 书架 -->
        <div v-if="activeTab === 'bookshelf'" class="space-y-3">
          <div v-if="!bookSourceStore.favorites.filter(f => f.type === 'booksource').length" class="text-center py-12">
            <BookOpen :size="48" class="mx-auto text-purple-200 mb-4" />
            <p class="text-purple-400 mb-2">书架空空如也</p>
            <p class="text-purple-300 text-sm">搜索并添加你喜欢的书吧</p>
          </div>
          <div 
            v-for="item in bookSourceStore.favorites.filter(f => f.type === 'booksource')" 
            :key="item.id"
            @click="viewBookDetail(item)"
            class="flex gap-3 p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          >
            <div class="w-16 h-22 rounded-lg overflow-hidden flex-shrink-0 bg-purple-100">
              <img v-if="item.cover" :src="item.cover" :alt="item.title" referrerpolicy="no-referrer" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <BookOpen :size="20" class="text-purple-300" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-purple-800 line-clamp-1 text-sm">{{ item.title }}</h3>
              <p class="text-xs text-purple-400 mt-1">{{ item.author }}</p>
            </div>
            <button 
              @click.stop="bookSourceStore.removeFavorite(item.id)"
              class="text-purple-300 hover:text-red-500 p-2"
            >
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
      </template>
    </main>

    <!-- 底部播放器 -->
    <div 
      v-if="currentTrack"
      class="fixed bottom-24 left-4 right-4 z-40"
    >
      <div class="bg-white/90 backdrop-blur-xl rounded-[2rem] p-4 shadow-2xl shadow-purple-900/10 border border-white/50">
        <!-- 进度条 -->
        <div 
          class="absolute -top-1 left-6 right-6 h-2 cursor-pointer group"
          @mousedown="onProgressMouseDown"
          @mousemove="onProgressMouseMove"
          @mouseup="onProgressMouseUp"
          @mouseleave="onProgressMouseUp"
        >
          <div class="h-full bg-purple-100 rounded-full overflow-hidden">
            <div 
              class="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all group-hover:from-purple-500 group-hover:to-purple-700"
              :style="{ width: displayProgress + '%' }"
            ></div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <!-- 封面 -->
          <div 
            @click="showPlaylist = true"
            class="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 shadow-md cursor-pointer relative group"
          >
            <img v-if="currentBook?.cover" :src="currentBook.cover" referrerpolicy="no-referrer" class="w-full h-full object-cover transition-transform group-hover:scale-110" />
            <div v-else class="w-full h-full bg-purple-100 flex items-center justify-center">
              <BookOpen :size="24" class="text-purple-300" />
            </div>
            <!-- 播放动画覆盖层 -->
            <div v-if="isPlaying" class="absolute inset-0 bg-black/20 flex items-center justify-center gap-1">
              <div class="w-1 h-3 bg-white rounded-full animate-music-bar-1"></div>
              <div class="w-1 h-5 bg-white rounded-full animate-music-bar-2"></div>
              <div class="w-1 h-2 bg-white rounded-full animate-music-bar-3"></div>
            </div>
          </div>

          <!-- 信息 -->
          <div class="flex-1 min-w-0" @click="showPlaylist = true">
            <p class="font-bold text-purple-900 truncate text-sm mb-0.5">{{ currentTrack?.title }}</p>
            <div class="flex items-center gap-2 text-xs text-purple-400">
              <span class="font-mono">{{ formattedCurrentTime }} / {{ formattedDuration }}</span>
            </div>
          </div>

          <!-- 控制按钮 -->
          <div class="flex items-center gap-2">
            <button 
              @click="togglePlay"
              :disabled="isLoading"
              class="w-12 h-12 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-200 hover:scale-105 active:scale-95 transition-all"
            >
              <div v-if="isLoading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <Pause v-else-if="isPlaying" :size="24" fill="currentColor" />
              <Play v-else :size="24" fill="currentColor" class="ml-1" />
            </button>
            
            <button @click="nextTrack" class="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center hover:bg-purple-100 transition-colors">
              <SkipForward :size="20" fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 播放列表弹窗 -->
    <div 
      v-if="showPlaylist" 
      class="fixed inset-0 bg-purple-900/20 backdrop-blur-sm z-50 flex items-end"
      @click.self="showPlaylist = false"
    >
      <div class="bg-white/95 backdrop-blur-xl w-full max-h-[70vh] rounded-t-[2rem] flex flex-col animate-slide-up shadow-2xl shadow-purple-900/20 border-t border-white/50">
        <div class="flex items-center justify-between p-6 border-b border-purple-50 sticky top-0 bg-white/95 backdrop-blur-md z-10">
          <h3 class="font-bold text-lg text-purple-800 flex items-center gap-2">
            <List :size="20" class="text-purple-500" />
            章节列表 <span class="text-sm font-normal text-purple-400">({{ currentPlaylist.length }})</span>
          </h3>
          <button @click="showPlaylist = false" class="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-400 hover:bg-purple-100 hover:text-purple-600 transition-colors">
            <X :size="20" />
          </button>
        </div>
        
        <div class="flex-1 overflow-y-auto p-2">
          <div 
            v-for="(track, index) in currentPlaylist" 
            :key="track.cid || index"
            @click="loadAndPlay(index); showPlaylist = false"
            class="flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer transition-all group mb-1"
            :class="index === currentIndex ? 'bg-gradient-to-r from-purple-50 to-transparent' : 'hover:bg-purple-50'"
          >
            <div 
              class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
              :class="index === currentIndex ? 'bg-purple-100 text-purple-600' : 'bg-purple-50 text-purple-400 group-hover:bg-purple-100 group-hover:text-purple-500'"
            >
              <span v-if="index === currentIndex && isPlaying" class="flex gap-0.5 items-end h-4">
                <span class="w-1 bg-purple-500 rounded-full animate-music-bar-1"></span>
                <span class="w-1 bg-purple-500 rounded-full animate-music-bar-2"></span>
                <span class="w-1 bg-purple-500 rounded-full animate-music-bar-3"></span>
              </span>
              <span v-else class="text-sm font-mono font-medium">{{ index + 1 }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p 
                class="text-base truncate font-medium transition-colors"
                :class="index === currentIndex ? 'text-purple-700' : 'text-purple-700'"
              >
                {{ track.title }}
              </p>
            </div>
            <div v-if="index === currentIndex" class="text-purple-500">
              <Play :size="18" fill="currentColor" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 书籍详情弹窗 -->
    <div 
      v-if="showBookDetail && selectedBook" 
      class="fixed inset-0 bg-white z-50 flex flex-col animate-fade-in"
    >
      <!-- 头部背景 -->
      <div class="absolute top-0 left-0 right-0 h-64 overflow-hidden z-0">
        <img 
          v-if="selectedBook.cover"
          :src="selectedBook.cover" 
          referrerpolicy="no-referrer"
          class="w-full h-full object-cover blur-xl opacity-50 transform scale-110"
        />
        <div class="absolute inset-0 bg-gradient-to-b from-purple-900/30 to-white"></div>
      </div>

      <!-- 头部内容 -->
      <div class="relative z-10 flex flex-col h-full">
        <div class="p-4 flex items-center justify-between">
          <button @click="showBookDetail = false" class="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-colors shadow-sm">
            <ChevronLeft :size="24" />
          </button>
          <button 
            @click="isInBookshelf(selectedBook) ? removeFromBookshelf(selectedBook) : addToBookshelf(selectedBook)"
            class="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-colors shadow-sm"
            :class="isInBookshelf(selectedBook) ? 'text-red-500' : 'text-white'"
          >
            <Heart :size="22" :fill="isInBookshelf(selectedBook) ? 'currentColor' : 'none'" />
          </button>
        </div>

        <div class="px-6 pt-2 pb-6 flex gap-6 items-end">
          <div class="w-32 h-44 rounded-2xl overflow-hidden flex-shrink-0 shadow-2xl shadow-purple-900/20 border-2 border-white transform translate-y-2">
            <img 
              v-if="selectedBook.cover" 
              :src="selectedBook.cover" 
              :alt="selectedBook.title"
              referrerpolicy="no-referrer"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full bg-purple-100 flex items-center justify-center">
              <BookOpen :size="32" class="text-purple-300" />
            </div>
          </div>
          <div class="flex-1 min-w-0 pb-2">
            <h2 class="text-2xl font-bold text-gray-900 line-clamp-2 mb-2 drop-shadow-sm leading-tight">{{ selectedBook.title }}</h2>
            <p class="text-purple-600 font-medium flex items-center gap-1 mb-1">
              <User :size="16" />
              {{ selectedBook.author || selectedBook.artist || '未知作者' }}
            </p>
            <p v-if="selectedBook.category" class="text-sm text-gray-500 bg-purple-50 px-2 py-0.5 rounded-lg inline-block">
              {{ selectedBook.category }}
            </p>
          </div>
        </div>

        <div class="flex-1 bg-white rounded-t-[2rem] -mt-4 shadow-inner overflow-hidden flex flex-col border-t border-purple-50">
          <div class="p-6 pb-2">
             <div class="flex gap-3 mb-6">
              <button 
                @click="playFromChapter(selectedBook, 0)"
                :disabled="isLoadingChapters || !bookChapters.length"
                class="flex-1 py-3.5 bg-purple-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-purple-600 shadow-lg shadow-purple-200 transition-all active:scale-95"
              >
                <Play :size="20" fill="currentColor" />
                开始播放
              </button>
              <button 
                @click="isInBookshelf(selectedBook) ? removeFromBookshelf(selectedBook) : addToBookshelf(selectedBook)"
                class="px-5 py-3.5 rounded-xl font-medium flex items-center gap-2 border-2 transition-all active:scale-95"
                :class="isInBookshelf(selectedBook) ? 'border-red-100 bg-red-50 text-red-600' : 'border-purple-100 bg-purple-50 text-purple-600'"
              >
                <Heart :size="20" :fill="isInBookshelf(selectedBook) ? 'currentColor' : 'none'" />
              </button>
            </div>
            
            <h3 class="font-bold text-gray-900 mb-2 flex items-center gap-2">
              <span>简介</span>
            </h3>
            <p class="text-gray-500 text-sm leading-relaxed mb-6 line-clamp-4">{{ selectedBook.description || '暂无简介' }}</p>
            
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-gray-900">章节列表</h3>
              <span v-if="bookChapters.length" class="text-purple-500 text-sm font-medium bg-purple-50 px-2 py-0.5 rounded-lg">{{ bookChapters.length }} 章</span>
            </div>
          </div>

          <!-- 章节列表 -->
          <div class="flex-1 overflow-y-auto px-4 pb-4">
            <!-- 加载中 -->
            <div v-if="isLoadingChapters" class="text-center py-12">
              <div class="w-10 h-10 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin mx-auto mb-3"></div>
              <p class="text-purple-400">加载章节中...</p>
            </div>
            
            <!-- 错误提示 -->
            <div v-else-if="chaptersError" class="text-center py-12">
              <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-400">
                <AlertCircle :size="32" />
              </div>
              <p class="text-red-600 mb-4 font-medium">{{ chaptersError }}</p>
              <button 
                @click="viewBookDetail(selectedBook)"
                class="px-6 py-2 bg-purple-100 text-purple-600 rounded-xl font-bold hover:bg-purple-200"
              >
                重试
              </button>
            </div>
            
            <!-- 章节列表 -->
            <div v-else class="space-y-1">
              <div 
                v-for="(chapter, index) in bookChapters" 
                :key="chapter.id || index"
                @click="playFromChapter(selectedBook, index)"
                class="flex items-center gap-4 p-3.5 rounded-2xl hover:bg-purple-50 active:bg-purple-100 cursor-pointer transition-colors group"
              >
                <div class="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 flex-shrink-0 group-hover:bg-purple-100 group-hover:text-purple-500 transition-colors">
                  <span class="text-sm font-mono font-medium">{{ index + 1 }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-700 truncate font-medium group-hover:text-purple-700 transition-colors">{{ chapter.title }}</p>
                </div>
                <Play :size="16" class="text-gray-300 group-hover:text-purple-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 书源管理弹窗 -->
    <div 
      v-if="showSourceManager" 
      class="fixed inset-0 bg-purple-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click.self="showSourceManager = false"
    >
      <div class="bg-white w-full max-w-md rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between p-4 border-b border-purple-100">
          <h3 class="font-bold text-purple-800">书源管理</h3>
          <button @click="showSourceManager = false" class="p-2 rounded-full bg-purple-100 text-purple-500">
            <X :size="18" />
          </button>
        </div>
        
        <div class="flex border-b border-purple-100">
          <button 
            @click="sourceManagerTab = 'subscriptions'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="sourceManagerTab === 'subscriptions' ? 'text-purple-600 border-b-2 border-purple-500' : 'text-purple-400'"
          >
            订阅管理
          </button>
          <button 
            @click="sourceManagerTab = 'sources'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="sourceManagerTab === 'sources' ? 'text-purple-600 border-b-2 border-purple-500' : 'text-purple-400'"
          >
            书源列表
          </button>
          <button 
            @click="sourceManagerTab = 'add'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="sourceManagerTab === 'add' ? 'text-purple-600 border-b-2 border-purple-500' : 'text-purple-400'"
          >
            添加书源
          </button>
        </div>
        
        <div class="overflow-y-auto flex-1 p-4">
          <!-- 全局提示 -->
          <div v-if="addSourceError || addSourceSuccess" class="mb-3 space-y-2">
            <p v-if="addSourceError" class="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{{ addSourceError }}</p>
            <p v-if="addSourceSuccess" class="text-sm text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">{{ addSourceSuccess }}</p>
          </div>

          <!-- 订阅管理 -->
          <template v-if="sourceManagerTab === 'subscriptions'">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-sm font-medium text-purple-600">推荐订阅</h4>
            </div>
            
            <div class="space-y-2 mb-6">
              <div 
                v-for="sub in bookSourceStore.PRESET_SUBSCRIPTIONS" 
                :key="sub.url"
                class="flex items-center gap-3 p-3 bg-purple-50 rounded-xl"
              >
                <span class="text-xl">{{ sub.icon || '📚' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-purple-800 text-sm truncate">{{ sub.name }}</p>
                  <p class="text-xs text-purple-400 truncate">{{ sub.description }}</p>
                </div>
                <button 
                  @click="addPresetSubscription(sub)"
                  :disabled="isAddingSource"
                  class="px-3 py-1.5 bg-purple-500 text-white text-xs rounded-lg whitespace-nowrap disabled:opacity-50"
                >
                  添加
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between mb-4">
              <h4 class="text-sm font-medium text-purple-600">已订阅 ({{ bookSourceStore.subscriptions.length }})</h4>
              <button 
                @click="handleRefreshAllSubscriptions"
                class="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white text-xs rounded-lg"
              >
                <RefreshCw :size="14" />
                刷新
              </button>
            </div>
            
            <div class="space-y-2">
              <div 
                v-for="sub in bookSourceStore.subscriptions" 
                :key="sub.id"
                class="flex items-center gap-3 p-3 bg-purple-50 rounded-xl"
              >
                <Globe :size="20" class="text-purple-400 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-medium text-purple-800 text-sm truncate">{{ sub.name }}</p>
                    <span class="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-xs rounded">
                      {{ bookSourceStore.getSourcesForSubscription(sub.id).length }} 个书源
                    </span>
                  </div>
                  <p class="text-xs text-purple-400 truncate">{{ sub.url }}</p>
                  <p v-if="sub.lastUpdated" class="text-xs text-purple-300 mt-1">
                    更新: {{ new Date(sub.lastUpdated).toLocaleString() }}
                  </p>
                </div>
                <button 
                  @click="handleRemoveSubscription(sub)"
                  class="p-2 rounded-lg text-red-400 hover:bg-red-50"
                  title="删除订阅及其书源"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <p v-if="!bookSourceStore.subscriptions.length" class="text-sm text-purple-400 text-center py-4">暂无订阅</p>
            </div>
          </template>

          <!-- 书源列表 -->
          <template v-if="sourceManagerTab === 'sources'">
            <h4 class="text-sm font-medium text-purple-600 mb-3">
              全部书源 ({{ bookSourceStore.sources.length }}) · 
              <span class="text-purple-400">已启用 {{ bookSourceStore.enabledSources.length }}</span>
            </h4>
            <div class="space-y-2">
              <div 
                v-for="source in bookSourceStore.sources" 
                :key="source.id"
                class="flex items-center gap-3 p-3 rounded-xl transition-all"
                :class="source.enabled ? 'bg-purple-50' : 'bg-gray-50 opacity-60'"
              >
                <span class="text-2xl">{{ source.icon || '📚' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm truncate" :class="source.enabled ? 'text-purple-800' : 'text-gray-500'">{{ source.name }}</p>
                  <p class="text-xs truncate" :class="source.enabled ? 'text-purple-400' : 'text-gray-400'">
                    {{ source.group || '未分类' }}
                    <span v-if="source.searchUrl" class="ml-1">· 支持搜索</span>
                    <span v-else class="ml-1 text-orange-400">· 无搜索</span>
                  </p>
                </div>
                <button 
                  @click="bookSourceStore.toggleSource(source.id)"
                  class="p-2 rounded-lg transition-colors"
                  :class="source.enabled ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-400'"
                  :title="source.enabled ? '点击禁用' : '点击启用'"
                >
                  {{ source.enabled ? '✓' : '○' }}
                </button>
                <button 
                  @click="bookSourceStore.removeSource(source.id)"
                  class="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-500"
                  title="删除书源"
                >
                  ✕
                </button>
              </div>
              <p v-if="!bookSourceStore.sources.length" class="text-sm text-purple-400 text-center py-4">暂无书源，请先添加订阅</p>
            </div>
          </template>

          <!-- 添加书源 -->
          <template v-if="sourceManagerTab === 'add'">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-purple-700 mb-2">书源名称（可选）</label>
                <input 
                  v-model="customSourceName"
                  type="text"
                  placeholder="自定义书源"
                  class="w-full px-4 py-3 rounded-xl border border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-purple-700 mb-2">书源URL</label>
                <input 
                  v-model="customSourceUrl"
                  type="url"
                  placeholder="https://example.com/sources.json"
                  class="w-full px-4 py-3 rounded-xl border border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
                />
              </div>

              <button 
                @click="handleAddSource"
                :disabled="isAddingSource"
                class="w-full py-3 bg-purple-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus :size="18" />
                {{ isAddingSource ? '添加中...' : '添加书源' }}
              </button>
              
              <div class="mt-6 p-4 bg-purple-50 rounded-xl">
                <h5 class="text-sm font-medium text-purple-700 mb-2">💡 使用说明</h5>
                <ul class="text-xs text-purple-500 space-y-1">
                  <li>• 先在"订阅管理"中添加推荐订阅</li>
                  <li>• 书源来自"我的听书"开源项目</li>
                  <li>• 部分书源可能需要科学上网</li>
                </ul>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自定义滑块样式 */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #fff;
  border: 2px solid #8b5cf6;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.1s;
}

input[type="range"]:active::-webkit-slider-thumb {
  transform: scale(1.2);
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #fff;
  border: 2px solid #8b5cf6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.1s;
}

.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }

.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.animate-slide-up { animation: slideUp 0.3s ease-out; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

.animate-shimmer { animation: shimmer 2s infinite linear; }
@keyframes shimmer { 
  0% { transform: translateX(-100%); } 
  100% { transform: translateX(100%); } 
}

.animate-music-bar-1 { animation: music-bar 0.5s ease-in-out infinite alternate; }
.animate-music-bar-2 { animation: music-bar 0.5s ease-in-out infinite alternate 0.1s; }
.animate-music-bar-3 { animation: music-bar 0.5s ease-in-out infinite alternate 0.2s; }
@keyframes music-bar { 
  from { height: 40%; } 
  to { height: 100%; } 
}
</style>
