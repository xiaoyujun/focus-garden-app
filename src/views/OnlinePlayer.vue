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
  <div class="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 pb-36">
    <!-- 头部 -->
    <header class="pt-6 pb-2 px-6 flex items-center justify-between relative z-10">
      <h1 class="text-2xl font-bold text-pink-900 flex items-center gap-2.5 tracking-tight">
        <div class="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center shadow-lg shadow-pink-200 text-white">
          <span class="text-xl">📺</span>
        </div>
        <span>B站听书</span>
      </h1>
      <!-- B站登录按钮 -->
      <button 
        @click="showLoginModal = true"
        class="flex items-center gap-2 px-3 py-2 rounded-xl transition-all shadow-sm border"
        :class="isLoggedIn ? 'bg-white border-pink-100 text-pink-600 hover:bg-pink-50' : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'"
      >
        <img 
          v-if="isLoggedIn && userInfo?.avatar" 
          :src="userInfo.avatar" 
          referrerpolicy="no-referrer"
          class="w-6 h-6 rounded-full ring-2 ring-pink-100"
        />
        <User v-else :size="18" />
        <span class="text-xs font-medium">{{ isLoggedIn ? (userInfo?.userName || '已登录') : '登录B站' }}</span>
      </button>
    </header>

    <main class="px-4 max-w-md mx-auto relative z-10">
      <!-- B站登录提示条 -->
      <div 
        v-if="!isLoggedIn" 
        class="mb-6 px-4 py-3 rounded-2xl text-xs font-medium bg-white/80 border border-pink-100 text-pink-600 flex items-center justify-between shadow-sm backdrop-blur-sm"
      >
        <span class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></span>
          登录B站可搜索更多内容、解锁更高音质
        </span>
        <button 
          @click="showLoginModal = true"
          class="px-3 py-1.5 rounded-lg text-xs font-bold bg-pink-500 text-white hover:bg-pink-600 hover:shadow-lg hover:shadow-pink-200 transition-all"
        >
          登录
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="relative mb-4 group">
        <div class="absolute inset-0 bg-pink-200/30 rounded-2xl blur-xl transition-opacity opacity-0 group-hover:opacity-100"></div>
        <div class="relative bg-white rounded-2xl shadow-lg shadow-pink-100/50 overflow-hidden flex items-center transition-transform focus-within:scale-[1.02]">
          <div class="pl-4 text-pink-300">
            <Search :size="20" />
          </div>
          <input 
            v-model="searchQuery"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="搜索有声书、输入B站链接..."
            class="w-full px-3 py-4 bg-transparent outline-none text-pink-900 placeholder:text-pink-300/70"
          />
          <button 
            v-if="searchQuery"
            @click="searchQuery = ''; searchResults = []"
            class="p-2 text-pink-300 hover:text-pink-500 transition-colors"
          >
            <X :size="18" />
          </button>
          <button 
            @click="handleSearch"
            :disabled="isSearching"
            class="m-1.5 px-4 py-2 bg-pink-500 text-white rounded-xl text-sm font-bold hover:bg-pink-600 disabled:opacity-50 transition-colors shadow-md shadow-pink-200"
          >
            {{ isSearching ? '...' : '搜索' }}
          </button>
        </div>
      </div>

      <!-- 筛选按钮和快捷标签 -->
      <div class="flex items-center gap-2 mb-6">
        <button 
          @click="showSearchFilter = !showSearchFilter"
          class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm border"
          :class="showSearchFilter || searchFilter.type !== 'all' || searchFilter.order !== 'default' || searchFilter.duration !== 'all' 
            ? 'bg-pink-500 text-white border-pink-500 shadow-pink-200' 
            : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'"
        >
          <SlidersHorizontal :size="14" />
          筛选
        </button>
        <!-- 快捷类型标签 -->
        <div class="flex-1 flex gap-2 overflow-x-auto pb-1 scrollbar-hide px-1">
          <button 
            v-for="opt in filterOptions.type" 
            :key="opt.value"
            @click="searchFilter.type = opt.value; searchQuery.trim() && handleSearch()"
            class="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap border"
            :class="searchFilter.type === opt.value ? 'bg-pink-50 text-pink-600 border-pink-200 shadow-sm' : 'bg-white text-gray-500 border-transparent hover:bg-gray-50'"
          >
            <span class="mr-1">{{ opt.icon }}</span>
            {{ opt.label }}
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
      <div class="flex p-1 bg-white/50 backdrop-blur-sm rounded-2xl mb-6 border border-white/50">
        <button 
          v-for="tab in [
            { id: 'search', icon: Search, label: '搜索' },
            { id: 'history', icon: Clock, label: '历史' },
            { id: 'favorites', icon: Heart, label: '收藏' }
          ]"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5"
          :class="activeTab === tab.id ? 'bg-white text-pink-600 shadow-sm shadow-pink-100' : 'text-gray-400 hover:text-gray-600'"
        >
          <component :is="tab.icon" :size="16" />
          {{ tab.label }}
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="searchError" class="mb-4 p-4 bg-red-50 border border-red-100 rounded-2xl shadow-sm">
        <p class="text-red-600 text-sm mb-2 font-medium flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
          {{ searchError }}
        </p>
        <p class="text-xs text-red-400 ml-3.5">
          提示：如果搜索失败，可以尝试直接粘贴B站视频链接（如 BV1xxx 或完整URL）
        </p>
      </div>

      <!-- 搜索结果 -->
      <div v-if="activeTab === 'search'" class="space-y-3">
        <!-- 推荐搜索（空状态时显示） -->
        <div v-if="!searchResults.length && !searchQuery && !sourceStore.searchHistory.length" class="mb-4">
          <div class="text-center py-8">
            <div class="w-20 h-20 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-4xl">📺</span>
            </div>
            <p class="text-gray-500 mb-2 font-medium">搜索B站有声小说、音乐、播客</p>
            <p class="text-xs text-gray-400 mb-6">支持直接粘贴B站视频链接</p>
            
            <div class="text-xs text-gray-400 mb-3 flex items-center justify-center gap-2 before:content-[''] before:h-[1px] before:w-8 before:bg-gray-200 after:content-[''] after:h-[1px] after:w-8 after:bg-gray-200">热门搜索</div>
            <div class="flex flex-wrap justify-center gap-2">
              <button 
                v-for="keyword in ['有声小说', '单田芳', '罗翔说书', '白噪音', 'ASMR', '睡前故事']" 
                :key="keyword"
                @click="searchFromHistory(keyword)"
                class="px-3 py-1.5 bg-white border border-gray-100 text-gray-600 rounded-full text-xs hover:border-pink-200 hover:text-pink-600 hover:bg-pink-50 transition-colors shadow-sm"
              >
                {{ keyword }}
              </button>
            </div>
          </div>
        </div>

        <!-- 搜索历史 -->
        <div v-if="!searchResults.length && sourceStore.searchHistory.length" class="mb-4">
          <div class="flex items-center justify-between mb-3 px-1">
            <span class="text-xs font-medium text-gray-500">搜索历史</span>
            <button 
              @click="sourceStore.clearSearchHistory()" 
              class="text-xs text-gray-400 hover:text-gray-600 p-1">
              清空
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="keyword in sourceStore.searchHistory.slice(0, 10)" 
              :key="keyword"
              @click="searchFromHistory(keyword)"
              class="px-3 py-1.5 bg-white text-gray-600 rounded-full text-xs hover:bg-gray-50 border border-gray-100 shadow-sm transition-colors"
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
          class="flex gap-4 p-3 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-50 active:scale-[0.99]"
        >
          <div class="relative flex-shrink-0">
            <img 
              :src="item.cover" 
              :alt="item.title"
              referrerpolicy="no-referrer"
              class="w-28 h-20 object-cover rounded-xl shadow-sm"
            />
            <!-- B站标识 -->
            <span class="absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] rounded-md text-white bg-pink-500/90 backdrop-blur-[2px] shadow-sm font-bold">
              Bilibili
            </span>
            <span v-if="item.duration" class="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] rounded-md text-white bg-black/60 backdrop-blur-[2px]">
              {{ item.duration }}
            </span>
          </div>
          <div class="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
            <h3 class="font-bold text-gray-800 line-clamp-2 text-sm leading-snug">{{ item.title }}</h3>
            <div class="flex items-center justify-between mt-1">
              <p class="text-xs text-gray-500 flex items-center gap-1">
                <User :size="12" />
                <span class="truncate max-w-[80px]">{{ item.author }}</span>
              </p>
              <p v-if="item.play" class="text-xs text-gray-400 flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded">
                <span class="text-[10px]">▶</span> {{ item.play }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="isSearching" class="text-center py-12">
          <div class="w-8 h-8 border-4 border-pink-100 border-t-pink-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p class="text-pink-400 text-xs font-medium">正在搜索 Bilibili...</p>
        </div>

        <div v-if="!isSearching && !searchResults.length && searchQuery" class="text-center py-16 text-gray-400">
          <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search :size="24" class="text-gray-300" />
          </div>
          <p class="text-sm">未找到相关内容</p>
        </div>
      </div>

      <!-- 播放历史 -->
      <div v-if="activeTab === 'history'" class="space-y-3">
        <div v-if="!sourceStore.playHistory.length" class="text-center py-16 text-gray-400">
          <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock :size="24" class="text-gray-300" />
          </div>
          <p class="text-sm">暂无播放历史</p>
        </div>
        <div 
          v-for="item in sourceStore.playHistory" 
          :key="item.id"
          @click="playFromHistory(item)"
          class="flex gap-4 p-3 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-50 active:scale-[0.99]"
        >
          <div class="relative flex-shrink-0">
            <img 
              v-if="item.cover"
              :src="item.cover" 
              :alt="item.title"
              referrerpolicy="no-referrer"
              class="w-20 h-14 object-cover rounded-xl shadow-sm"
            />
          </div>
          <div class="flex-1 min-w-0 py-0.5">
            <h3 class="font-bold text-gray-800 line-clamp-1 text-sm">{{ item.title }}</h3>
            <p class="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <User :size="12" />
              {{ item.author }}
            </p>
            <p class="text-[10px] text-gray-400 mt-1.5">
              上次播放: {{ new Date().toLocaleDateString() }}
            </p>
          </div>
        </div>
      </div>

      <!-- 收藏 -->
      <div v-if="activeTab === 'favorites'" class="space-y-3">
        <div v-if="!sourceStore.favorites.length" class="text-center py-16 text-gray-400">
          <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Heart :size="24" class="text-gray-300" />
          </div>
          <p class="text-sm">暂无收藏内容</p>
        </div>
        <div 
          v-for="item in sourceStore.favorites" 
          :key="item.id"
          class="flex gap-4 p-3 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-50"
        >
          <div class="relative flex-shrink-0" @click="playFromFavorite(item)">
            <img 
              v-if="item.cover"
              :src="item.cover" 
              :alt="item.title"
              referrerpolicy="no-referrer"
              class="w-20 h-14 object-cover rounded-xl shadow-sm cursor-pointer"
            />
          </div>
          <div class="flex-1 min-w-0 py-0.5 cursor-pointer" @click="playFromFavorite(item)">
            <h3 class="font-bold text-gray-800 line-clamp-1 text-sm">{{ item.title }}</h3>
            <p class="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <User :size="12" />
              {{ item.author }}
            </p>
          </div>
          <button 
            @click="sourceStore.removeFavorite(item.id)"
            class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors self-center"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </main>

    <!-- 底部播放器（有内容时显示） -->
    <div 
      v-if="currentTrack"
      class="fixed bottom-24 left-4 right-4 z-40"
    >
      <div class="bg-white/90 backdrop-blur-xl rounded-[2rem] p-4 shadow-2xl shadow-pink-900/10 border border-white/50">
        <!-- 进度条 -->
        <div 
          class="absolute -top-1 left-6 right-6 h-2 cursor-pointer group"
          @mousedown="onProgressMouseDown"
          @mousemove="onProgressMouseMove"
          @mouseup="onProgressMouseUp"
          @mouseleave="onProgressMouseUp"
          @touchstart="onProgressTouchStart"
          @touchmove="onProgressTouchMove"
          @touchend="onProgressTouchEnd"
        >
          <div class="h-full bg-pink-100 rounded-full overflow-hidden">
            <div 
              class="h-full bg-gradient-to-r from-pink-400 to-pink-600 transition-all group-hover:from-pink-500 group-hover:to-pink-700"
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
            <img 
              v-if="currentVideo?.cover"
              :src="currentVideo.cover"
              referrerpolicy="no-referrer"
              class="w-full h-full object-cover transition-transform group-hover:scale-110"
            />
            <!-- 播放动画覆盖层 -->
            <div v-if="isPlaying" class="absolute inset-0 bg-black/20 flex items-center justify-center gap-1">
              <div class="w-1 h-3 bg-white rounded-full animate-music-bar-1"></div>
              <div class="w-1 h-5 bg-white rounded-full animate-music-bar-2"></div>
              <div class="w-1 h-2 bg-white rounded-full animate-music-bar-3"></div>
            </div>
          </div>

          <!-- 信息 -->
          <div class="flex-1 min-w-0" @click="showPlaylist = true">
            <p class="font-bold text-gray-900 truncate text-sm mb-0.5">{{ currentTrack?.title }}</p>
            <div class="flex items-center gap-2 text-xs text-gray-400">
              <span class="font-mono">{{ formattedCurrentTime }} / {{ formattedDuration }}</span>
              <span v-if="currentPlaylist.length > 1" class="px-1.5 py-0.5 rounded bg-pink-50 text-pink-500 font-medium text-[10px]">
                {{ currentIndex + 1 }}/{{ currentPlaylist.length }}
              </span>
            </div>
          </div>

          <!-- 控制按钮 -->
          <div class="flex items-center gap-2">
            <button 
              @click="togglePlay"
              :disabled="isLoading"
              class="w-12 h-12 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-lg shadow-pink-200 hover:scale-105 active:scale-95 transition-all"
            >
              <div v-if="isLoading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <Pause v-else-if="isPlaying" :size="24" fill="currentColor" />
              <Play v-else :size="24" fill="currentColor" class="ml-1" />
            </button>
            
            <button @click="nextTrack" class="w-10 h-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center hover:bg-pink-100 transition-colors">
              <SkipForward :size="20" fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 播放列表弹窗 - 半屏抽屉 -->
    <div 
      v-if="showPlaylist" 
      class="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-50 flex items-end"
      @click.self="showPlaylist = false"
    >
      <div class="bg-white/95 backdrop-blur-xl w-full max-h-[70vh] rounded-t-[2rem] flex flex-col animate-slide-up shadow-2xl border-t border-white/50">
        <!-- 头部 -->
        <div class="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-10">
          <h3 class="font-bold text-lg text-gray-800 flex items-center gap-2">
            <List :size="20" class="text-pink-500" />
            播放列表 <span class="text-sm font-normal text-gray-400">({{ currentPlaylist.length }})</span>
          </h3>
          <div class="flex items-center gap-2">
            <!-- 播放模式 -->
            <button @click="cyclePlaybackRate" class="px-3 py-1.5 bg-pink-50 text-pink-600 rounded-lg text-xs font-bold">
              {{ playbackRate }}x
            </button>
            <button @click="showPlaylist = false" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors">
              <X :size="20" />
            </button>
          </div>
        </div>
        
        <!-- 列表内容 -->
        <div class="flex-1 overflow-y-auto p-2">
          <div 
            v-for="(track, index) in currentPlaylist" 
            :key="track.cid"
            @click="loadAndPlay(index)"
            class="flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer transition-all group mb-1"
            :class="index === currentIndex ? 'bg-gradient-to-r from-pink-50 to-transparent' : 'hover:bg-gray-50'"
          >
            <div 
              class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
              :class="index === currentIndex ? 'bg-pink-100 text-pink-600' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-500'"
            >
              <span v-if="index === currentIndex && isPlaying" class="flex gap-0.5 items-end h-4">
                <span class="w-1 bg-pink-500 rounded-full animate-music-bar-1"></span>
                <span class="w-1 bg-pink-500 rounded-full animate-music-bar-2"></span>
                <span class="w-1 bg-pink-500 rounded-full animate-music-bar-3"></span>
              </span>
              <span v-else class="text-sm font-mono font-medium">{{ index + 1 }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p 
                class="text-base truncate font-medium transition-colors"
                :class="index === currentIndex ? 'text-pink-700' : 'text-gray-700'"
              >
                {{ track.title }}
              </p>
            </div>
            <div v-if="index === currentIndex" class="text-pink-500">
              <Play :size="18" fill="currentColor" />
            </div>
          </div>
        </div>

        <!-- 底部控制区 -->
        <div class="p-6 border-t border-gray-100 bg-white/50 backdrop-blur-md pb-8">
          <div class="flex items-center justify-center gap-6 mb-6">
            <button @click="rewind" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
              <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <RotateCcw :size="20" />
              </div>
              <span class="text-[10px]">快退</span>
            </button>
            <button @click="previousTrack" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
              <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <SkipBack :size="24" fill="currentColor" />
              </div>
              <span class="text-[10px]">上一曲</span>
            </button>
            <button @click="togglePlay" class="flex flex-col items-center gap-1 text-pink-600 transition-colors">
              <div class="w-16 h-16 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-lg shadow-pink-200 hover:scale-105 transition-transform">
                <Pause v-if="isPlaying" :size="32" fill="currentColor" />
                <Play v-else :size="32" fill="currentColor" class="ml-1" />
              </div>
            </button>
            <button @click="nextTrack" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
              <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <SkipForward :size="24" fill="currentColor" />
              </div>
              <span class="text-[10px]">下一曲</span>
            </button>
            <button @click="forward" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
              <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <RotateCw :size="20" />
              </div>
              <span class="text-[10px]">快进</span>
            </button>
          </div>
          
          <!-- 音量 -->
          <div class="flex items-center gap-3 px-4">
            <button @click="toggleMute" class="text-gray-400 hover:text-pink-500">
              <VolumeX v-if="volume === 0" :size="20" />
              <Volume2 v-else :size="20" />
            </button>
            <div class="flex-1 h-8 flex items-center">
              <input 
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="volume"
                @input="onVolumeChange"
                class="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-pink-500"
              />
            </div>
            <span class="text-xs font-mono text-gray-400 w-8 text-right">{{ Math.round(volume * 100) }}%</span>
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
/* 自定义滑块样式 */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #fff;
  border: 2px solid #ec4899;
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
  border: 2px solid #ec4899;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.1s;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.animate-slide-up { animation: slideUp 0.3s ease-out; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

.animate-music-bar-1 { animation: music-bar 0.5s ease-in-out infinite alternate; }
.animate-music-bar-2 { animation: music-bar 0.5s ease-in-out infinite alternate 0.1s; }
.animate-music-bar-3 { animation: music-bar 0.5s ease-in-out infinite alternate 0.2s; }
@keyframes music-bar { 
  from { height: 40%; } 
  to { height: 100%; } 
}
</style>
