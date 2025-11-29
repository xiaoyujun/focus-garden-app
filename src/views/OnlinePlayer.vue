<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSourceStore } from '../stores/sourceStore'
import { 
  searchVideos, 
  getVideoInfo, 
  getVideoSeries, 
  getBestAudioUrl,
  extractBilibiliId 
} from '../services/bilibiliService'
import { 
  getAuthInfo, 
  isLoggedIn as checkIsLoggedIn,
  loadAuthFromStorage 
} from '../services/bilibiliAuth'
import BilibiliLogin from '../components/BilibiliLogin.vue'
import { 
  Search, Play, Pause, SkipBack, SkipForward, 
  Volume2, VolumeX, Heart, HeartOff, Clock,
  List, ChevronLeft, ChevronRight, Gauge, X,
  RotateCcw, RotateCw, Settings, Plus, Link,
  Radio, BookOpen, RefreshCw, Trash2, Globe, User, LogIn
} from 'lucide-vue-next'

const sourceStore = useSourceStore()

// ===== 状态 =====
const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref([])
const searchError = ref('')

const currentVideo = ref(null)       // 当前播放的视频信息
const currentPlaylist = ref([])      // 当前播放列表
const currentIndex = ref(-1)         // 当前播放索引
const isPlaying = ref(false)
const isLoading = ref(false)

const audioRef = ref(null)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const playbackRate = ref(1)

// UI 状态
const showPlaylist = ref(false)
const showSourceManager = ref(false)
const showLoginModal = ref(false)
const activeTab = ref('search')      // search | history | favorites

// 登录状态
const isLoggedIn = ref(false)
const userInfo = ref(null)

// 进度条拖动
const isDragging = ref(false)
const dragProgress = ref(0)

// 刷新登录状态
function refreshLoginStatus() {
  loadAuthFromStorage()
  isLoggedIn.value = checkIsLoggedIn()
  if (isLoggedIn.value) {
    userInfo.value = getAuthInfo()
  } else {
    userInfo.value = null
  }
}

// 登录成功回调
function onLoginSuccess() {
  refreshLoginStatus()
  searchError.value = ''
}

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

// 搜索
async function handleSearch() {
  if (!searchQuery.value.trim()) return
  
  isSearching.value = true
  searchError.value = ''
  
  try {
    // 先检查是否是B站链接
    const videoId = extractBilibiliId(searchQuery.value)
    
    if (videoId.bvid) {
      // 直接解析视频
      const videoInfo = await getVideoInfo(videoId.bvid)
      searchResults.value = [{
        bvid: videoInfo.bvid,
        aid: videoInfo.aid,
        title: videoInfo.title,
        cover: videoInfo.cover,
        duration: formatTime(videoInfo.duration),
        author: videoInfo.owner.name,
        mid: videoInfo.owner.mid,
        play: videoInfo.stat.view,
        description: videoInfo.desc
      }]
    } else {
      // 搜索视频
      const result = await searchVideos(searchQuery.value)
      searchResults.value = result.results
    }
    
    sourceStore.addSearchHistory(searchQuery.value)
  } catch (error) {
    searchError.value = error.message || '搜索失败，请稍后重试'
    console.error('搜索失败:', error)
  } finally {
    isSearching.value = false
  }
}

// 播放视频
async function playVideo(video) {
  isLoading.value = true
  
  try {
    // 获取视频详细信息和分P列表
    const videoInfo = await getVideoInfo(video.bvid)
    const series = await getVideoSeries(video.bvid)
    
    currentVideo.value = videoInfo
    currentPlaylist.value = series.items
    currentIndex.value = 0
    
    // 开始播放第一个
    await loadAndPlay(0)
    
    // 添加到播放历史
    sourceStore.addPlayHistory({
      id: video.bvid,
      type: 'bilibili',
      title: videoInfo.title,
      cover: videoInfo.cover,
      author: videoInfo.owner.name
    })
  } catch (error) {
    console.error('播放失败:', error)
    searchError.value = error.message || '播放失败'
  } finally {
    isLoading.value = false
  }
}

// 加载并播放指定索引
async function loadAndPlay(index) {
  if (index < 0 || index >= currentPlaylist.value.length) return
  
  isLoading.value = true
  currentIndex.value = index
  
  try {
    const track = currentPlaylist.value[index]
    const audioUrl = await getBestAudioUrl(track.bvid, track.cid)
    
    if (audioRef.value) {
      audioRef.value.src = audioUrl
      audioRef.value.volume = volume.value
      audioRef.value.playbackRate = playbackRate.value
      await audioRef.value.play()
      isPlaying.value = true
    }
  } catch (error) {
    console.error('加载音频失败:', error)
    searchError.value = '获取音频地址失败，可能需要登录或视频不可用'
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
  if (!currentVideo.value) return
  
  const id = currentVideo.value.bvid
  if (sourceStore.isFavorite(id)) {
    sourceStore.removeFavorite(id)
  } else {
    sourceStore.addFavorite({
      id,
      type: 'bilibili',
      title: currentVideo.value.title,
      cover: currentVideo.value.cover,
      author: currentVideo.value.owner.name
    })
  }
}

// 音频事件
function onTimeUpdate() {
  if (audioRef.value && !isDragging.value) {
    currentTime.value = audioRef.value.currentTime
  }
}

function onDurationChange() {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
  }
}

function onEnded() {
  // 自动下一曲
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
  playVideo({ bvid: item.id, ...item })
  activeTab.value = 'search'
}

// 从播放历史播放
function playFromHistory(item) {
  playVideo({ bvid: item.id, ...item })
  activeTab.value = 'search'
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
  // 初始化登录状态
  refreshLoginStatus()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboard)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-farm-50 to-nature-50/30 pb-32">
    <!-- 隐藏的音频元素 -->
    <audio 
      ref="audioRef"
      @timeupdate="onTimeUpdate"
      @durationchange="onDurationChange"
      @ended="onEnded"
      preload="auto"
      crossorigin="anonymous"
    />

    <!-- 头部 -->
    <header class="p-4 flex items-center justify-between">
      <h1 class="text-xl font-bold text-farm-900 flex items-center gap-2">
        <Globe :size="24" class="text-nature-500" />
        在线听书
      </h1>
      <div class="flex items-center gap-2">
        <!-- 登录按钮 -->
        <button 
          @click="showLoginModal = true"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors"
          :class="isLoggedIn ? 'bg-nature-100 text-nature-700' : 'bg-farm-100 text-farm-600 hover:bg-farm-200'"
        >
          <img 
            v-if="isLoggedIn && userInfo?.avatar" 
            :src="userInfo.avatar" 
            class="w-5 h-5 rounded-full"
          />
          <User v-else :size="18" />
          <span class="text-sm">{{ isLoggedIn ? (userInfo?.userName || '已登录') : '登录' }}</span>
        </button>
        <button 
          @click="showSourceManager = true"
          class="p-2 rounded-lg bg-farm-100 text-farm-600 hover:bg-farm-200"
        >
          <Settings :size="20" />
        </button>
      </div>
    </header>

    <main class="px-4 max-w-md mx-auto">
      <!-- 搜索框 -->
      <div class="relative mb-4">
        <input 
          v-model="searchQuery"
          @keyup.enter="handleSearch"
          type="text"
          placeholder="搜索有声书、输入B站链接..."
          class="w-full px-4 py-3 pl-12 bg-white rounded-xl border border-farm-200 focus:border-nature-400 focus:ring-2 focus:ring-nature-100 outline-none transition-all"
        />
        <Search :size="20" class="absolute left-4 top-1/2 -translate-y-1/2 text-farm-400" />
        <button 
          v-if="searchQuery"
          @click="searchQuery = ''; searchResults = []"
          class="absolute right-12 top-1/2 -translate-y-1/2 text-farm-400 hover:text-farm-600"
        >
          <X :size="18" />
        </button>
        <button 
          @click="handleSearch"
          :disabled="isSearching"
          class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-nature-500 text-white rounded-lg text-sm font-medium hover:bg-nature-600 disabled:opacity-50"
        >
          {{ isSearching ? '...' : '搜索' }}
        </button>
      </div>

      <!-- 标签切换 -->
      <div class="flex gap-2 mb-4">
        <button 
          @click="activeTab = 'search'"
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="activeTab === 'search' ? 'bg-nature-500 text-white' : 'bg-farm-100 text-farm-600'"
        >
          <Search :size="16" class="inline mr-1" />
          搜索
        </button>
        <button 
          @click="activeTab = 'history'"
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="activeTab === 'history' ? 'bg-nature-500 text-white' : 'bg-farm-100 text-farm-600'"
        >
          <Clock :size="16" class="inline mr-1" />
          历史
        </button>
        <button 
          @click="activeTab = 'favorites'"
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="activeTab === 'favorites' ? 'bg-nature-500 text-white' : 'bg-farm-100 text-farm-600'"
        >
          <Heart :size="16" class="inline mr-1" />
          收藏
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="searchError" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
        {{ searchError }}
      </div>

      <!-- 搜索结果 -->
      <div v-if="activeTab === 'search'" class="space-y-3">
        <!-- 搜索历史 -->
        <div v-if="!searchResults.length && sourceStore.searchHistory.length" class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-farm-500">搜索历史</span>
            <button @click="sourceStore.clearSearchHistory()" class="text-xs text-farm-400 hover:text-farm-600">
              清空
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="keyword in sourceStore.searchHistory.slice(0, 10)" 
              :key="keyword"
              @click="searchFromHistory(keyword)"
              class="px-3 py-1 bg-farm-100 text-farm-600 rounded-full text-sm hover:bg-farm-200"
            >
              {{ keyword }}
            </button>
          </div>
        </div>

        <!-- 搜索结果列表 -->
        <div 
          v-for="video in searchResults" 
          :key="video.bvid"
          @click="playVideo(video)"
          class="flex gap-3 p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <img 
            :src="video.cover" 
            :alt="video.title"
            class="w-24 h-16 object-cover rounded-lg flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-farm-800 line-clamp-2 text-sm">{{ video.title }}</h3>
            <p class="text-xs text-farm-400 mt-1">{{ video.author }} · {{ video.duration }}</p>
          </div>
        </div>

        <div v-if="isSearching" class="text-center py-8 text-farm-400">
          <div class="w-8 h-8 border-3 border-farm-200 border-t-nature-500 rounded-full animate-spin mx-auto mb-2"></div>
          搜索中...
        </div>

        <div v-if="!isSearching && !searchResults.length && searchQuery" class="text-center py-8 text-farm-400">
          未找到相关内容
        </div>
      </div>

      <!-- 播放历史 -->
      <div v-if="activeTab === 'history'" class="space-y-3">
        <div v-if="!sourceStore.playHistory.length" class="text-center py-8 text-farm-400">
          暂无播放历史
        </div>
        <div 
          v-for="item in sourceStore.playHistory" 
          :key="item.id"
          @click="playFromHistory(item)"
          class="flex gap-3 p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <img 
            v-if="item.cover"
            :src="item.cover" 
            :alt="item.title"
            class="w-16 h-12 object-cover rounded-lg flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-farm-800 line-clamp-1 text-sm">{{ item.title }}</h3>
            <p class="text-xs text-farm-400 mt-1">{{ item.author }}</p>
          </div>
        </div>
      </div>

      <!-- 收藏 -->
      <div v-if="activeTab === 'favorites'" class="space-y-3">
        <div v-if="!sourceStore.favorites.length" class="text-center py-8 text-farm-400">
          暂无收藏
        </div>
        <div 
          v-for="item in sourceStore.favorites" 
          :key="item.id"
          class="flex gap-3 p-3 bg-white rounded-xl shadow-sm"
        >
          <img 
            v-if="item.cover"
            :src="item.cover" 
            :alt="item.title"
            @click="playFromFavorite(item)"
            class="w-16 h-12 object-cover rounded-lg flex-shrink-0 cursor-pointer"
          />
          <div class="flex-1 min-w-0" @click="playFromFavorite(item)">
            <h3 class="font-medium text-farm-800 line-clamp-1 text-sm cursor-pointer">{{ item.title }}</h3>
            <p class="text-xs text-farm-400 mt-1">{{ item.author }}</p>
          </div>
          <button 
            @click="sourceStore.removeFavorite(item.id)"
            class="text-farm-400 hover:text-red-500"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </main>

    <!-- 底部播放器（有内容时显示） -->
    <div 
      v-if="currentTrack"
      class="fixed bottom-0 left-0 right-0 bg-white border-t border-farm-100 shadow-lg"
    >
      <!-- 进度条 -->
      <div 
        class="h-1 bg-farm-100 cursor-pointer"
        @mousedown="onProgressMouseDown"
        @mousemove="onProgressMouseMove"
        @mouseup="onProgressMouseUp"
        @mouseleave="onProgressMouseUp"
      >
        <div 
          class="h-full bg-nature-500 transition-all"
          :style="{ width: displayProgress + '%' }"
        ></div>
      </div>

      <div class="px-4 py-3">
        <!-- 当前播放信息 -->
        <div class="flex items-center gap-3 mb-3">
          <img 
            v-if="currentVideo?.cover"
            :src="currentVideo.cover"
            class="w-12 h-12 rounded-lg object-cover"
          />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-farm-800 truncate text-sm">{{ currentTrack?.title }}</p>
            <p class="text-xs text-farm-400">
              {{ formattedCurrentTime }} / {{ formattedDuration }}
              <span v-if="currentPlaylist.length > 1" class="ml-2">
                {{ currentIndex + 1 }}/{{ currentPlaylist.length }}
              </span>
            </p>
          </div>
          <button @click="toggleFavorite" class="p-2">
            <Heart 
              :size="20" 
              :class="sourceStore.isFavorite(currentVideo?.bvid) ? 'text-red-500 fill-red-500' : 'text-farm-400'"
            />
          </button>
          <button @click="showPlaylist = true" class="p-2 text-farm-600">
            <List :size="20" />
          </button>
        </div>

        <!-- 控制按钮 -->
        <div class="flex items-center justify-center gap-4">
          <button @click="rewind" class="p-2 text-farm-600 relative">
            <RotateCcw :size="20" />
            <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px]">15</span>
          </button>
          <button @click="previousTrack" class="p-2 text-farm-600">
            <SkipBack :size="22" fill="currentColor" />
          </button>
          <button 
            @click="togglePlay"
            :disabled="isLoading"
            class="w-12 h-12 rounded-full bg-nature-500 text-white flex items-center justify-center shadow-lg"
          >
            <div v-if="isLoading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <Pause v-else-if="isPlaying" :size="24" fill="currentColor" />
            <Play v-else :size="24" fill="currentColor" class="ml-0.5" />
          </button>
          <button @click="nextTrack" class="p-2 text-farm-600">
            <SkipForward :size="22" fill="currentColor" />
          </button>
          <button @click="forward" class="p-2 text-farm-600 relative">
            <RotateCw :size="20" />
            <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px]">15</span>
          </button>
        </div>

        <!-- 附加控制 -->
        <div class="flex items-center justify-between mt-3 px-2">
          <button @click="toggleMute" class="text-farm-500">
            <VolumeX v-if="volume === 0" :size="18" />
            <Volume2 v-else :size="18" />
          </button>
          <input 
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="volume"
            @input="onVolumeChange"
            class="w-20 h-1 bg-farm-200 rounded-full appearance-none cursor-pointer accent-nature-500"
          />
          <button @click="cyclePlaybackRate" class="text-farm-600 text-sm font-mono font-bold">
            {{ playbackRate }}x
          </button>
        </div>
      </div>
    </div>

    <!-- 播放列表弹窗 - 全屏显示，从上往下排列 -->
    <div 
      v-if="showPlaylist" 
      class="fixed inset-0 bg-white z-50 flex flex-col"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between p-4 border-b border-farm-100 bg-white sticky top-0">
        <h3 class="font-bold text-farm-800">播放列表 ({{ currentPlaylist.length }})</h3>
        <button @click="showPlaylist = false" class="p-2 rounded-full bg-farm-100 text-farm-500">
          <X :size="18" />
        </button>
      </div>
      
      <!-- 列表内容 - 可滚动 -->
      <div class="flex-1 overflow-y-auto pb-4">
        <div 
          v-for="(track, index) in currentPlaylist" 
          :key="track.cid"
          @click="loadAndPlay(index); showPlaylist = false"
          class="flex items-center gap-3 px-4 py-3 hover:bg-farm-50 active:bg-farm-100 cursor-pointer border-b border-farm-50"
          :class="{ 'bg-nature-50': index === currentIndex }"
        >
          <div class="w-10 h-10 rounded-lg bg-farm-100 flex items-center justify-center text-farm-400 flex-shrink-0">
            <span v-if="index === currentIndex && isPlaying" class="flex gap-0.5">
              <span class="w-1 h-4 bg-nature-500 rounded-full animate-pulse"></span>
              <span class="w-1 h-4 bg-nature-500 rounded-full animate-pulse delay-100"></span>
              <span class="w-1 h-4 bg-nature-500 rounded-full animate-pulse delay-200"></span>
            </span>
            <span v-else class="text-sm font-mono font-medium">{{ index + 1 }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p 
              class="text-base truncate"
              :class="index === currentIndex ? 'text-nature-600 font-medium' : 'text-farm-700'"
            >
              {{ track.title }}
            </p>
            <p v-if="track.duration" class="text-xs text-farm-400 mt-0.5">
              {{ formatTime(track.duration) }}
            </p>
          </div>
          <!-- 当前播放指示 -->
          <div v-if="index === currentIndex" class="text-nature-500">
            <Play :size="18" fill="currentColor" />
          </div>
        </div>
      </div>
    </div>

    <!-- 源管理弹窗 -->
    <div 
      v-if="showSourceManager" 
      class="fixed inset-0 bg-farm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      @click.self="showSourceManager = false"
    >
      <div class="bg-white w-full max-w-md rounded-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between p-4 border-b border-farm-100">
          <h3 class="font-bold text-farm-800">书源管理</h3>
          <button @click="showSourceManager = false" class="p-2 rounded-full bg-farm-100 text-farm-500">
            <X :size="18" />
          </button>
        </div>
        
        <div class="overflow-y-auto flex-1 p-4">
          <h4 class="text-sm font-medium text-farm-600 mb-3">已启用的源</h4>
          <div class="space-y-2 mb-6">
            <div 
              v-for="source in sourceStore.enabledSources" 
              :key="source.id"
              class="flex items-center gap-3 p-3 bg-farm-50 rounded-xl"
            >
              <span class="text-2xl">{{ source.icon || '📚' }}</span>
              <div class="flex-1">
                <p class="font-medium text-farm-800 text-sm">{{ source.name }}</p>
                <p class="text-xs text-farm-400">{{ source.description }}</p>
              </div>
              <button 
                @click="sourceStore.toggleSource(source.id)"
                class="text-nature-500"
              >
                ✓
              </button>
            </div>
          </div>

          <h4 class="text-sm font-medium text-farm-600 mb-3">推荐订阅</h4>
          <div class="space-y-2">
            <div 
              v-for="sub in sourceStore.PRESET_SUBSCRIPTIONS" 
              :key="sub.url"
              class="flex items-center gap-3 p-3 bg-farm-50 rounded-xl"
            >
              <Link :size="20" class="text-farm-400" />
              <div class="flex-1">
                <p class="font-medium text-farm-800 text-sm">{{ sub.name }}</p>
                <p class="text-xs text-farm-400">{{ sub.description }}</p>
              </div>
              <button 
                @click="sourceStore.addSubscription(sub.url, sub.name)"
                class="px-3 py-1 bg-nature-500 text-white text-xs rounded-lg"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 登录弹窗 -->
    <BilibiliLogin 
      v-if="showLoginModal"
      @close="showLoginModal = false"
      @login-success="onLoginSuccess"
    />
  </div>
</template>

<style scoped>
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #36a778;
  border-radius: 50%;
  cursor: pointer;
}

.delay-100 {
  animation-delay: 100ms;
}
.delay-200 {
  animation-delay: 200ms;
}
</style>
