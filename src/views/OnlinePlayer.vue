<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSourceStore } from '../stores/sourceStore'
import { useOnlineAudioStore } from '../stores/onlineAudioStore'
import { 
  searchVideos, 
  getVideoInfo, 
  getVideoSeries, 
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
  Volume2, VolumeX, Heart, Clock,
  List, X, RotateCcw, RotateCw, Trash2, User,
  SlidersHorizontal
} from 'lucide-vue-next'

defineOptions({ name: 'OnlinePlayer' })

const sourceStore = useSourceStore()
const audioStore = useOnlineAudioStore()

// ===== 搜索相关状态 =====
const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref([])
const searchError = ref('')

// UI 状态
const showPlaylist = ref(false)
const showLoginModal = ref(false)
const activeTab = ref('search')      // search | history | favorites

// 搜索筛选状态
const showSearchFilter = ref(false)
const searchFilter = ref({
  type: 'all',      // all | audiobook | music | podcast | asmr
  duration: 'all',  // all | short | medium | long
  order: 'default'  // default | click | pubdate | dm
})

// 筛选选项
const filterOptions = {
  type: [
    { value: 'all', label: '全部类型', icon: '📚' },
    { value: 'audiobook', label: '有声书', icon: '📖' },
    { value: 'music', label: '音乐', icon: '🎵' },
    { value: 'podcast', label: '播客', icon: '🎤' },
    { value: 'asmr', label: 'ASMR', icon: '🌙' }
  ],
  duration: [
    { value: 'all', label: '不限' },
    { value: 'short', label: '10分钟以内' },
    { value: 'medium', label: '10-60分钟' },
    { value: 'long', label: '60分钟以上' }
  ],
  order: [
    { value: 'default', label: '综合排序' },
    { value: 'click', label: '最多播放' },
    { value: 'pubdate', label: '最新发布' },
    { value: 'dm', label: '最多弹幕' }
  ]
}

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

// ===== 从 store 获取的计算属性 =====
const currentVideo = computed(() => audioStore.currentVideo)
const currentPlaylist = computed(() => audioStore.currentPlaylist)
const currentIndex = computed(() => audioStore.currentIndex)
const currentTrack = computed(() => audioStore.currentTrack)
const isPlaying = computed(() => audioStore.isPlaying)
const isLoading = computed(() => audioStore.isLoading)
const currentTime = computed(() => audioStore.currentTime)
const duration = computed(() => audioStore.duration)
const volume = computed(() => audioStore.volume)
const playbackRate = computed(() => audioStore.playbackRate)
const formattedCurrentTime = computed(() => audioStore.formattedCurrentTime)
const formattedDuration = computed(() => audioStore.formattedDuration)

const progress = computed(() => audioStore.progress)

const displayProgress = computed(() => {
  return isDragging.value ? dragProgress.value : progress.value
})

// ===== 方法 =====

// 格式化时间（用于显示搜索结果）
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

// 构建筛选后的搜索关键词
function buildSearchKeyword() {
  let keyword = searchQuery.value.trim()
  
  // 根据类型添加关键词
  const typeKeywords = {
    audiobook: '有声小说 有声书',
    music: '音乐 歌曲',
    podcast: '播客 脱口秀',
    asmr: 'ASMR 助眠'
  }
  
  if (searchFilter.value.type !== 'all' && typeKeywords[searchFilter.value.type]) {
    keyword = `${keyword} ${typeKeywords[searchFilter.value.type]}`
  }
  
  return keyword
}

// 获取排序参数
function getOrderParam() {
  const orderMap = {
    default: '',
    click: 'click',
    pubdate: 'pubdate',
    dm: 'dm'
  }
  return orderMap[searchFilter.value.order] || ''
}

// 获取时长参数
function getDurationParam() {
  const durationMap = {
    all: 0,
    short: 1,    // 0-10分钟
    medium: 2,   // 10-30分钟
    long: 4      // 60分钟以上
  }
  return durationMap[searchFilter.value.duration] || 0
}

// 搜索
async function handleSearch() {
  if (!searchQuery.value.trim()) return
  
  isSearching.value = true
  searchError.value = ''
  searchResults.value = []
  
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
      sourceStore.addSearchHistory(searchQuery.value)
      return
    }
    
    // B站搜索
    const keyword = buildSearchKeyword()
    const searchOptions = {
      order: getOrderParam(),
      duration: getDurationParam()
    }
    const result = await searchVideos(keyword, searchOptions)
    searchResults.value = result.results
    sourceStore.addSearchHistory(searchQuery.value)
  } catch (error) {
    searchError.value = error.message || '搜索失败，请稍后重试'
    console.error('搜索失败:', error)
  } finally {
    isSearching.value = false
  }
}

// 应用筛选后重新搜索
function applyFilter() {
  showSearchFilter.value = false
  if (searchQuery.value.trim()) {
    handleSearch()
  }
}

// 重置筛选
function resetFilter() {
  searchFilter.value = {
    type: 'all',
    duration: 'all',
    order: 'default'
  }
}

// 播放B站视频
async function handlePlayItem(item) {
  await playVideo(item)
}

// 播放B站视频（使用全局 store）
async function playVideo(video) {
  audioStore.isLoading = true
  searchError.value = ''
  
  try {
    // 获取视频详细信息和分P列表
    const videoInfo = await getVideoInfo(video.bvid)
    const series = await getVideoSeries(video.bvid)
    
    // 设置到全局 store，触发 GlobalAudioPlayer 加载
    audioStore.setPlaylist(videoInfo, series.items, 0)
    
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
    audioStore.isLoading = false
  }
}

// 加载并播放指定索引（通过 store）
function loadAndPlay(index) {
  if (index < 0 || index >= currentPlaylist.value.length) return
  audioStore.currentIndex = index
}

// 播放控制（使用 store）
function togglePlay() {
  audioStore.togglePlay()
}

function previousTrack() {
  audioStore.previousTrack()
}

function nextTrack() {
  audioStore.nextTrack()
}

function rewind() {
  audioStore.seek(-15)
}

function forward() {
  audioStore.seek(15)
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
  if (isDragging.value) {
    const newTime = (dragProgress.value / 100) * duration.value
    audioStore.seekTo(newTime)
    isDragging.value = false
  }
}

function updateDragProgress(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
  dragProgress.value = percent
}

// 触摸事件处理（移动端进度条拖动）
function onProgressTouchStart(e) {
  isDragging.value = true
  updateDragProgressFromTouch(e)
}

function onProgressTouchMove(e) {
  if (isDragging.value) {
    updateDragProgressFromTouch(e)
  }
}

function onProgressTouchEnd() {
  if (isDragging.value) {
    const newTime = (dragProgress.value / 100) * duration.value
    audioStore.seekTo(newTime)
    isDragging.value = false
  }
}

function updateDragProgressFromTouch(e) {
  const touch = e.touches[0]
  const rect = e.currentTarget.getBoundingClientRect()
  const x = touch.clientX - rect.left
  const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
  dragProgress.value = percent
}

// 音量
function onVolumeChange(e) {
  audioStore.setVolume(parseFloat(e.target.value))
}

function toggleMute() {
  if (volume.value > 0) {
    audioStore.setVolume(0)
  } else {
    audioStore.setVolume(1)
  }
}

// 播放速度（使用 store）
function cyclePlaybackRate() {
  audioStore.cyclePlaybackRate()
}

const isCurrentFavorite = computed(() => {
  if (!currentVideo.value) return false
  const id = currentVideo.value.bvid
  return sourceStore.isFavorite(id)
})

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
  playVideo(item)
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
    <!-- 头部 -->
    <header class="p-4 flex items-center justify-between">
      <h1 class="text-xl font-bold text-farm-900 flex items-center gap-2">
        <span class="text-2xl">📺</span>
        B站听书
      </h1>
      <!-- B站登录按钮 -->
      <button 
        @click="showLoginModal = true"
        class="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors"
        :class="isLoggedIn ? 'bg-pink-100 text-pink-700' : 'bg-farm-100 text-farm-600 hover:bg-farm-200'"
      >
        <img 
          v-if="isLoggedIn && userInfo?.avatar" 
          :src="userInfo.avatar" 
          referrerpolicy="no-referrer"
          class="w-5 h-5 rounded-full"
        />
        <User v-else :size="18" />
        <span class="text-sm">{{ isLoggedIn ? (userInfo?.userName || '已登录') : '登录B站' }}</span>
      </button>
    </header>

    <main class="px-4 max-w-md mx-auto">
      <!-- B站登录提示条 -->
      <div 
        v-if="!isLoggedIn" 
        class="mb-3 px-3 py-2 rounded-lg text-sm bg-pink-50 text-pink-700 flex items-center justify-between"
      >
        <span>登录B站可搜索更多内容、解锁更高音质</span>
        <button 
          @click="showLoginModal = true"
          class="px-3 py-1 rounded-lg text-xs font-medium bg-pink-500 text-white hover:bg-pink-600"
        >
          登录
        </button>
      </div>

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

      <!-- 筛选按钮和快捷标签 -->
      <div class="flex items-center gap-2 mb-4">
        <button 
          @click="showSearchFilter = !showSearchFilter"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="showSearchFilter || searchFilter.type !== 'all' || searchFilter.order !== 'default' || searchFilter.duration !== 'all' 
            ? 'bg-nature-500 text-white' 
            : 'bg-farm-100 text-farm-600 hover:bg-farm-200'"
        >
          <SlidersHorizontal :size="16" />
          筛选
        </button>
        <!-- 快捷类型标签 -->
        <div class="flex-1 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button 
            v-for="opt in filterOptions.type" 
            :key="opt.value"
            @click="searchFilter.type = opt.value; searchQuery.trim() && handleSearch()"
            class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
            :class="searchFilter.type === opt.value ? 'bg-nature-100 text-nature-700 border border-nature-300' : 'bg-farm-50 text-farm-600 hover:bg-farm-100'"
          >
            {{ opt.icon }} {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 筛选面板 -->
      <div 
        v-if="showSearchFilter" 
        class="mb-4 p-4 bg-white rounded-xl border border-farm-200 shadow-sm"
      >
        <!-- 排序方式 -->
        <div class="mb-4">
          <label class="block text-xs font-medium text-farm-600 mb-2">排序方式</label>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="opt in filterOptions.order" 
              :key="opt.value"
              @click="searchFilter.order = opt.value"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              :class="searchFilter.order === opt.value ? 'bg-nature-500 text-white' : 'bg-farm-100 text-farm-600 hover:bg-farm-200'"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- 时长筛选 -->
        <div class="mb-4">
          <label class="block text-xs font-medium text-farm-600 mb-2">视频时长</label>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="opt in filterOptions.duration" 
              :key="opt.value"
              @click="searchFilter.duration = opt.value"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              :class="searchFilter.duration === opt.value ? 'bg-nature-500 text-white' : 'bg-farm-100 text-farm-600 hover:bg-farm-200'"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- 按钮 -->
        <div class="flex gap-2">
          <button 
            @click="resetFilter"
            class="flex-1 py-2 rounded-lg text-sm font-medium bg-farm-100 text-farm-600 hover:bg-farm-200"
          >
            重置
          </button>
          <button 
            @click="applyFilter"
            class="flex-1 py-2 rounded-lg text-sm font-medium bg-nature-500 text-white hover:bg-nature-600"
          >
            应用筛选
          </button>
        </div>
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
      <div v-if="searchError" class="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
        <p class="text-red-600 text-sm mb-2">{{ searchError }}</p>
        <p class="text-xs text-red-400">
          提示：如果搜索失败，可以尝试直接粘贴B站视频链接（如 BV1xxx 或完整URL）
        </p>
      </div>

      <!-- 搜索结果 -->
      <div v-if="activeTab === 'search'" class="space-y-3">
        <!-- 推荐搜索（空状态时显示） -->
        <div v-if="!searchResults.length && !searchQuery && !sourceStore.searchHistory.length" class="mb-4">
          <div class="text-center py-6">
            <span class="text-5xl">📺</span>
            <p class="text-farm-500 mb-4 mt-4">搜索B站有声小说、音乐、播客</p>
            <p class="text-xs text-farm-400 mb-4">支持直接粘贴B站视频链接</p>
          </div>
          <div class="text-sm text-farm-500 mb-2">🔥 热门搜索</div>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="keyword in ['有声小说', '单田芳人', '罗翔说书', '白噪音', 'ASMR', '睡前故事']" 
              :key="keyword"
              @click="searchFromHistory(keyword)"
              class="px-3 py-1.5 bg-pink-50 text-pink-600 rounded-full text-sm hover:bg-pink-100 transition-colors"
            >
              {{ keyword }}
            </button>
          </div>
        </div>

        <!-- 搜索历史 -->
        <div v-if="!searchResults.length && sourceStore.searchHistory.length" class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-farm-500">搜索历史</span>
            <button 
              @click="sourceStore.clearSearchHistory()" 
              class="text-xs text-farm-400 hover:text-farm-600">
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
          v-for="item in searchResults" 
          :key="item.bvid"
          @click="handlePlayItem(item)"
          class="flex gap-3 p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <div class="relative flex-shrink-0">
            <img 
              :src="item.cover" 
              :alt="item.title"
              referrerpolicy="no-referrer"
              class="w-24 h-16 object-cover rounded-lg"
            />
            <!-- B站标识 -->
            <span class="absolute bottom-1 left-1 px-1.5 py-0.5 text-xs rounded text-white bg-pink-500">
              B站
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-farm-800 line-clamp-2 text-sm">{{ item.title }}</h3>
            <p class="text-xs text-farm-400 mt-1">
              {{ item.author }}
              <span v-if="item.duration"> · {{ item.duration }}</span>
            </p>
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
            referrerpolicy="no-referrer"
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
            referrerpolicy="no-referrer"
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
      class="fixed bottom-0 left-0 right-0 bg-white border-t border-farm-100 shadow-lg z-40"
    >
      <!-- 进度条 - 加高方便触控 -->
      <div 
        class="h-2 bg-farm-100 cursor-pointer relative group"
        @mousedown="onProgressMouseDown"
        @mousemove="onProgressMouseMove"
        @mouseup="onProgressMouseUp"
        @mouseleave="onProgressMouseUp"
        @touchstart="onProgressTouchStart"
        @touchmove="onProgressTouchMove"
        @touchend="onProgressTouchEnd"
      >
        <div 
          class="h-full bg-nature-500 transition-all relative"
          :style="{ width: displayProgress + '%' }"
        >
          <!-- 进度条拖动手柄 -->
          <div class="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-nature-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </div>
      </div>

      <div class="px-4 pt-3 pb-4">
        <!-- 当前播放信息 + 辅助按钮 -->
        <div class="flex items-center gap-3 mb-4">
          <img 
            v-if="currentVideo?.cover"
            :src="currentVideo.cover"
            referrerpolicy="no-referrer"
            class="w-14 h-14 rounded-xl object-cover shadow-sm"
          />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-farm-800 truncate">{{ currentTrack?.title }}</p>
            <p class="text-sm text-farm-400 mt-0.5">
              {{ formattedCurrentTime }} / {{ formattedDuration }}
              <span v-if="currentPlaylist.length > 1" class="ml-2 text-nature-600">
                {{ currentIndex + 1 }}/{{ currentPlaylist.length }}
              </span>
            </p>
          </div>
          <!-- 辅助按钮组 -->
          <div class="flex items-center gap-1">
            <button @click="cyclePlaybackRate" class="w-10 h-10 rounded-full bg-farm-50 text-farm-700 text-sm font-bold flex items-center justify-center active:bg-farm-100">
              {{ playbackRate }}x
            </button>
            <button @click="toggleFavorite" class="w-10 h-10 rounded-full bg-farm-50 flex items-center justify-center active:bg-farm-100">
              <Heart 
                :size="20" 
                :class="isCurrentFavorite ? 'text-red-500 fill-red-500' : 'text-farm-400'"
              />
            </button>
            <button @click="showPlaylist = true" class="w-10 h-10 rounded-full bg-farm-50 text-farm-600 flex items-center justify-center active:bg-farm-100">
              <List :size="20" />
            </button>
          </div>
        </div>

        <!-- 主控制按钮 - 大按钮更易操作 -->
        <div class="flex items-center justify-center gap-3">
          <!-- 快退15秒 -->
          <button 
            @click="rewind" 
            class="w-14 h-14 rounded-full bg-farm-50 text-farm-600 flex flex-col items-center justify-center active:bg-farm-100 active:scale-95 transition-transform"
          >
            <RotateCcw :size="22" />
            <span class="text-[10px] font-medium -mt-0.5">15秒</span>
          </button>
          
          <!-- 上一曲 -->
          <button 
            @click="previousTrack" 
            class="w-12 h-12 rounded-full bg-farm-100 text-farm-700 flex items-center justify-center active:bg-farm-200 active:scale-95 transition-transform"
          >
            <SkipBack :size="24" fill="currentColor" />
          </button>
          
          <!-- 播放/暂停 - 最大最明显 -->
          <button 
            @click="togglePlay"
            :disabled="isLoading"
            class="w-16 h-16 rounded-full bg-nature-500 text-white flex items-center justify-center shadow-lg active:bg-nature-600 active:scale-95 transition-transform disabled:opacity-70"
          >
            <div v-if="isLoading" class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <Pause v-else-if="isPlaying" :size="30" fill="currentColor" />
            <Play v-else :size="30" fill="currentColor" class="ml-1" />
          </button>
          
          <!-- 下一曲 -->
          <button 
            @click="nextTrack" 
            class="w-12 h-12 rounded-full bg-farm-100 text-farm-700 flex items-center justify-center active:bg-farm-200 active:scale-95 transition-transform"
          >
            <SkipForward :size="24" fill="currentColor" />
          </button>
          
          <!-- 快进15秒 -->
          <button 
            @click="forward" 
            class="w-14 h-14 rounded-full bg-farm-50 text-farm-600 flex flex-col items-center justify-center active:bg-farm-100 active:scale-95 transition-transform"
          >
            <RotateCw :size="22" />
            <span class="text-[10px] font-medium -mt-0.5">15秒</span>
          </button>
        </div>

        <!-- 音量控制 - 放底部，可选显示 -->
        <div class="flex items-center justify-center gap-3 mt-4">
          <button @click="toggleMute" class="w-8 h-8 flex items-center justify-center text-farm-500">
            <VolumeX v-if="volume === 0" :size="20" />
            <Volume2 v-else :size="20" />
          </button>
          <input 
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="volume"
            @input="onVolumeChange"
            class="flex-1 max-w-[200px] h-2 bg-farm-200 rounded-full appearance-none cursor-pointer accent-nature-500"
          />
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

    <!-- B站登录弹窗 -->
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
