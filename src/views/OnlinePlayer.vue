<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import { useSourceStore } from '../stores/sourceStore'
import { useOnlineAudioStore } from '../stores/onlineAudioStore'
import { 
  searchVideos, getVideoInfo, extractBilibiliId,
  getFavoriteList, getFavoriteContent, getHistory,
  getRecommendVideos, getPopularVideos, getBestAudioUrl,
  getZoneHotVideos, AUDIO_FRIENDLY_ZONES
} from '../services/bilibiliService'
import { 
  getAuthInfo, isLoggedIn as checkIsLoggedIn, loadAuthFromStorage 
} from '../services/bilibiliAuth'
import { Capacitor } from '@capacitor/core'

// Components
import BilibiliLogin from '../components/BilibiliLogin.vue'
import UploaderSpace from '../components/UploaderSpace.vue'
import BilibiliHeader from './bilibili/components/BilibiliHeader.vue'
import SearchBar from './bilibili/components/SearchBar.vue'
import FilterPanel from './bilibili/components/FilterPanel.vue'
import NavigationTabs from './bilibili/components/NavigationTabs.vue'
import CategoryTabs from './bilibili/components/CategoryTabs.vue'
import VideoCard from './bilibili/components/VideoCard.vue'
import PlayerBar from './bilibili/components/PlayerBar.vue'
import PlaylistDrawer from './bilibili/components/PlaylistDrawer.vue'
import ParsedVideoPanel from './bilibili/components/ParsedVideoPanel.vue'
import UserPanel from './bilibili/components/UserPanel.vue'

import { Loader2, Search, Trash2 } from 'lucide-vue-next'

defineOptions({ name: 'OnlinePlayer' })

const sourceStore = useSourceStore()
const audioStore = useOnlineAudioStore()
const isNativePlatform = Capacitor.isNativePlatform()
const AUDIO_CACHE_DIR = 'FocusGarden/BilibiliAudio'

// ===== State =====
// UI
const showLoginModal = ref(false)
const showPlaylist = ref(false)
const showUploaderSpace = ref(false)
const showSearchFilter = ref(false)
const showVideoMenu = ref(null) // bvid
const activeTab = ref('recommend')
const recommendMode = ref('recommend') // recommend | popular | zone
const selectedZone = ref('audiobook')

// Data
const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref([])
const searchError = ref('')
const searchFilter = ref({ type: 'all', duration: 'all', order: 'default' })

const recommendList = ref([])
const popularList = ref([])
const zoneHotList = ref([])
const recommendFreshIdx = ref(1)
const popularPage = ref(1)
const isRecommendLoading = ref(false)
const isPopularLoading = ref(false)
const zoneHotLoading = ref(false)
const hasMorePopular = ref(true)
const recommendError = ref('')

// User Data
const isLoggedIn = ref(false)
const userInfo = ref(null)
const selectedUploader = ref({ mid: 0, name: '' })
const biliFavList = ref([])
const biliFavContent = ref([])
const biliHistoryList = ref([])
const selectedFavId = ref(null)
const biliHistoryCursor = ref({ max: 0, viewAt: 0 })
const isFavLoading = ref(false)
const favError = ref('')
const isHistoryLoading = ref(false)
const hasMoreHistory = ref(true)
const historyError = ref('')

// Download / Parsed
const isDownloading = ref(null)
const parsedVideo = ref(null)
const batchDownloadState = reactive({ running: false, total: 0, finished: 0, failed: 0 })
const batchDownloadMessage = ref('')
const batchDownloadError = ref('')

// Cache
const cacheClearing = ref(false)
const cacheMessage = ref('')
const cacheError = ref('')

// Configs
const parseModeOptions = [
  { value: 'official', label: '官方解析', desc: '默认登录后调用官方音频源，音质高' },
  { value: 'official-hosted', label: '官方源托管', desc: '通过后端代理托管官方源，兼容跨域/Referer' },
  { value: 'compat', label: '兼容解析', desc: '优先使用分段直链，官方异常时可尝试' }
]

const filterOptions = {
  type: [
    { value: 'all', label: '全部类型', icon: '📚' },
    { value: 'audiobook', label: '有声书', icon: '📖', desc: '有声小说、广播剧、朗读' },
    { value: 'knowledge', label: '知识', icon: '🎓', desc: '科普、历史、财经' },
    { value: 'music', label: '音乐', icon: '🎵', desc: '歌曲、翻唱、纯音乐' },
    { value: 'podcast', label: '播客', icon: '🎤', desc: '访谈、杂谈、电台' },
    { value: 'asmr', label: 'ASMR', icon: '🌙', desc: '助眠、白噪音、放松' }
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

// ===== Computeds =====
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
const displayProgress = computed(() => audioStore.progress) // Simple binding for now, can add drag logic in PlayerBar
const isVideoMode = computed(() => audioStore.videoMode)
const videoPlayerUrl = computed(() => {
  const track = currentTrack.value
  if (!track?.bvid || !track?.cid) return ''
  const params = new URLSearchParams({
    bvid: track.bvid,
    cid: track.cid,
    page: String(track.page || 1),
    high_quality: '1',
    autoplay: '1'
  })
  return `https://player.bilibili.com/player.html?${params.toString()}`
})

// ===== Methods =====

// Login & Auth
function refreshLoginStatus() {
  loadAuthFromStorage()
  isLoggedIn.value = checkIsLoggedIn()
  if (isLoggedIn.value) {
    userInfo.value = getAuthInfo()
  } else {
    userInfo.value = null
  }
}

function onLoginSuccess() {
  refreshLoginStatus()
  searchError.value = ''
  recommendError.value = ''
  if (isLoggedIn.value && activeTab.value === 'recommend') {
    loadRecommendVideos(true)
  }
}

function handleLogout() {
  // In a real app you might clear auth here
  // For now just refresh status (assuming auth cleared elsewhere or user just wants to switch)
  refreshLoginStatus()
}

// Search
function getZoneParam() {
  const type = searchFilter.value.type
  if (type !== 'all' && AUDIO_FRIENDLY_ZONES[type]) return type
  return ''
}

function buildSearchKeyword() {
  let keyword = searchQuery.value.trim()
  const zone = getZoneParam()
  if (zone) {
    const enhanceKeywords = AUDIO_FRIENDLY_ZONES[zone]?.keywords || []
    if (enhanceKeywords.length > 0 && !enhanceKeywords.some(k => keyword.includes(k))) {
      keyword = `${keyword} ${enhanceKeywords[0]}`
    }
  }
  return keyword
}

async function handleSearch() {
  if (!searchQuery.value.trim()) return
  
  isSearching.value = true
  searchError.value = ''
  searchResults.value = []
  parsedVideo.value = null
  activeTab.value = 'search' // Auto switch to search tab
  
  try {
    const videoId = extractBilibiliId(searchQuery.value)
    
    if (videoId.bvid) {
      const videoInfo = await getVideoInfo(videoId.bvid)
      const pages = videoInfo.pages || []
      
      if (pages.length > 1) {
        parsedVideo.value = {
          bvid: videoInfo.bvid,
          aid: videoInfo.aid,
          title: videoInfo.title,
          cover: videoInfo.cover,
          duration: videoInfo.duration,
          author: videoInfo.owner.name,
          mid: videoInfo.owner.mid,
          play: videoInfo.stat.view,
          description: videoInfo.desc,
          pages: pages.map(p => ({
            page: p.page,
            cid: p.cid,
            title: p.part || `P${p.page}`,
            duration: p.duration,
            bvid: videoInfo.bvid
          })),
          pageCount: pages.length
        }
      } else {
        searchResults.value = [{
          bvid: videoInfo.bvid,
          aid: videoInfo.aid,
          title: videoInfo.title,
          cover: videoInfo.cover,
          duration: videoInfo.duration,
          author: videoInfo.owner.name,
          mid: videoInfo.owner.mid,
          play: videoInfo.stat.view,
          description: videoInfo.desc
        }]
      }
      sourceStore.addSearchHistory(searchQuery.value)
      return
    }
    
    // Regular Search
    const orderMap = { default: '', click: 'click', pubdate: 'pubdate', dm: 'dm' }
    const durationMap = { all: 0, short: 1, medium: 2, long: 4 }
    
    const result = await searchVideos(buildSearchKeyword(), {
      order: orderMap[searchFilter.value.order],
      duration: durationMap[searchFilter.value.duration],
      zone: getZoneParam()
    })
    
    searchResults.value = result.results
    sourceStore.addSearchHistory(searchQuery.value)
  } catch (error) {
    searchError.value = error.message || '搜索失败'
  } finally {
    isSearching.value = false
  }
}

function searchFromHistory(keyword) {
  searchQuery.value = keyword
  handleSearch()
}

// Player Logic
async function playVideo(video) {
  audioStore.isLoading = true
  searchError.value = ''
  
  try {
    const videoInfo = await getVideoInfo(video.bvid)
    const playlistItems = (videoInfo.pages || []).map(p => ({
      page: p.page,
      cid: p.cid,
      title: p.part || videoInfo.title,
      duration: p.duration,
      bvid: videoInfo.bvid
    }))
    
    audioStore.setPlaylist(videoInfo, playlistItems, 0)
    
    sourceStore.addPlayHistory({
      id: video.bvid,
      type: 'bilibili',
      title: videoInfo.title,
      cover: videoInfo.cover,
      author: videoInfo.owner.name
    })
  } catch (error) {
    searchError.value = error.message || '播放失败'
    audioStore.isLoading = false
  }
}

async function playParsedVideo(startIndex = 0) {
  if (!parsedVideo.value) return
  audioStore.isLoading = true
  try {
    const video = parsedVideo.value
    const videoObj = {
      title: video.title,
      cover: video.cover,
      bvid: video.bvid,
      aid: video.aid,
      owner: { name: video.author, mid: video.mid },
      stat: { view: video.play }
    }
    audioStore.setPlaylist(videoObj, video.pages, startIndex)
    sourceStore.addPlayHistory({
      id: video.bvid,
      type: 'bilibili',
      title: video.title,
      cover: video.cover,
      author: video.author
    })
  } catch (e) {
    searchError.value = e.message
    audioStore.isLoading = false
  }
}

function openUploaderSpace(mid, name) {
  if (!mid) return
  selectedUploader.value = { mid, name }
  showUploaderSpace.value = true
}

function handleUploaderPlayVideo(video) {
  showUploaderSpace.value = false
  playVideo(video)
}

// Recommendation Logic
async function loadRecommendVideos(refresh = false) {
  if (!isLoggedIn.value) return
  if (isRecommendLoading.value) return
  
  isRecommendLoading.value = true
  recommendError.value = ''
  try {
    if (refresh) {
      recommendFreshIdx.value = 1
      recommendList.value = []
    }
    const result = await getRecommendVideos(recommendFreshIdx.value, 12)
    recommendList.value = refresh ? result.list : [...recommendList.value, ...result.list]
    recommendFreshIdx.value = result.freshIdx
  } catch (e) {
    recommendError.value = e.message
  } finally {
    isRecommendLoading.value = false
  }
}

async function loadPopularVideos(loadMore = false) {
  if (!isLoggedIn.value) return
  if (isPopularLoading.value) return
  
  isPopularLoading.value = true
  recommendError.value = ''
  try {
    if (!loadMore) {
      popularPage.value = 1
      popularList.value = []
    }
    const result = await getPopularVideos(popularPage.value, 20)
    popularList.value = loadMore ? [...popularList.value, ...result.list] : result.list
    popularPage.value++
    hasMorePopular.value = result.hasMore
  } catch (e) {
    recommendError.value = e.message
  } finally {
    isPopularLoading.value = false
  }
}

async function loadZoneHotVideos(zone = null, refresh = false) {
  const targetZone = zone || selectedZone.value
  if (zoneHotLoading.value) return
  
  zoneHotLoading.value = true
  recommendError.value = ''
  try {
    if (refresh || zone !== selectedZone.value) {
      selectedZone.value = targetZone
      zoneHotList.value = []
    }
    const result = await getZoneHotVideos(targetZone, 1)
    zoneHotList.value = result.list
  } catch (e) {
    recommendError.value = e.message
  } finally {
    zoneHotLoading.value = false
  }
}

// User Panel Data
async function loadBiliFavList() {
  if (!isLoggedIn.value) {
    favError.value = '请先登录B站账号'
    return
  }
  isFavLoading.value = true
  favError.value = ''
  try {
    const result = await getFavoriteList()
    biliFavList.value = result.list.map(f => ({ ...f, selected: false }))
    
    if (result.list.length > 0 && !selectedFavId.value) {
      await loadBiliFavContent(result.list[0].id)
    }
  } catch (e) {
    favError.value = e.message
  } finally {
    isFavLoading.value = false
  }
}

async function loadBiliFavContent(mediaId) {
  selectedFavId.value = mediaId
  // Update selected state
  biliFavList.value.forEach(f => f.selected = f.id === mediaId)
  
  isFavLoading.value = true
  try {
    const result = await getFavoriteContent(mediaId)
    biliFavContent.value = result.list
  } catch (e) {
    favError.value = e.message
  } finally {
    isFavLoading.value = false
  }
}

async function loadBiliHistory(loadMore = false) {
  if (!isLoggedIn.value) {
    historyError.value = '请先登录'
    return
  }
  if (isHistoryLoading.value) return
  
  isHistoryLoading.value = true
  historyError.value = ''
  try {
    const cursor = loadMore ? biliHistoryCursor.value : { max: 0, viewAt: 0 }
    const result = await getHistory(cursor.max, cursor.viewAt, 20)
    
    biliHistoryList.value = loadMore ? [...biliHistoryList.value, ...result.list] : result.list
    biliHistoryCursor.value = result.cursor
    hasMoreHistory.value = result.hasMore
  } catch (e) {
    historyError.value = e.message
  } finally {
    isHistoryLoading.value = false
  }
}

// Download Logic
function sanitizeFileName(name = '') {
  return (name || 'audio').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function buildAudioFolder(subFolder = '') {
  const safe = sanitizeFileName(subFolder)
  return safe ? `${AUDIO_CACHE_DIR}/${safe}` : AUDIO_CACHE_DIR
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result.split(',')[1] || '' : '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function downloadAudioNative(audioUrl, fileName, subFolder = '') {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { CapacitorHttp } = await import('@capacitor/core')
  const targetDir = buildAudioFolder(subFolder)
  
  try {
    await Filesystem.mkdir({ path: targetDir, directory: Directory.Documents, recursive: true })
  } catch (e) {} // Exists
  
  const response = await CapacitorHttp.get({
    url: audioUrl,
    responseType: 'blob',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Origin': 'https://www.bilibili.com'
    }
  })
  
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
  
  let data = response.data
  if (data instanceof Blob) data = await blobToBase64(data)
  else if (typeof data === 'object') data = await blobToBase64(new Blob([response.data]))
  
  await Filesystem.writeFile({
    path: `${targetDir}/${fileName}`,
    data,
    directory: Directory.Documents
  })
}

async function downloadAudioWeb(audioUrl, fileName) {
  const proxyUrl = `/api/bili-proxy?url=${encodeURIComponent(audioUrl)}`
  const response = await fetch(proxyUrl)
  if (!response.ok) throw new Error('Download failed')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function downloadAudioFile(audioUrl, fileName, subFolder = '') {
  const safeName = sanitizeFileName(fileName || 'audio.m4a') || 'audio.m4a'
  return isNativePlatform ? downloadAudioNative(audioUrl, safeName, subFolder) : downloadAudioWeb(audioUrl, safeName)
}

async function downloadVideo(item) {
  if (isDownloading.value === item.bvid) return
  isDownloading.value = item.bvid
  showVideoMenu.value = null
  
  try {
    let { cid, title, bvid } = item
    title = title || bvid
    if (!cid) {
      const info = await getVideoInfo(bvid)
      cid = info.cid
      title = info.title || title
    }
    
    const audioUrl = await getBestAudioUrl(bvid, cid)
    await downloadAudioFile(audioUrl, `${sanitizeFileName(title)}.m4a`)
    alert('下载完成')
  } catch (e) {
    alert(`下载失败: ${e.message}`)
  } finally {
    isDownloading.value = null
  }
}

async function downloadParsedAudio() {
  if (!parsedVideo.value || batchDownloadState.running) return
  
  batchDownloadState.running = true
  batchDownloadState.finished = 0
  batchDownloadState.failed = 0
  batchDownloadState.total = parsedVideo.value.pages.length
  
  const folder = sanitizeFileName(parsedVideo.value.title)
  
  for (const page of parsedVideo.value.pages) {
    try {
      const url = await getBestAudioUrl(parsedVideo.value.bvid, page.cid)
      const name = `${folder}-P${page.page}-${sanitizeFileName(page.title)}.m4a`
      await downloadAudioFile(url, name, folder)
      batchDownloadState.finished++
    } catch (e) {
      batchDownloadState.failed++
    }
  }
  batchDownloadState.running = false
  batchDownloadMessage.value = batchDownloadState.failed === 0 ? '全部下载完成' : '部分下载失败'
}

async function clearAudioCache() {
  if (cacheClearing.value) return
  if (!confirm('确定清空音频缓存吗？')) return
  
  cacheClearing.value = true
  try {
    audioStore.clearCache()
    if (isNativePlatform) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      try {
        await Filesystem.rmdir({ path: AUDIO_CACHE_DIR, directory: Directory.Documents, recursive: true })
      } catch (e) {}
    }
    cacheMessage.value = '缓存已清空'
  } catch (e) {
    cacheError.value = e.message
  } finally {
    cacheClearing.value = false
  }
}

function toggleVideoMode() {
  const next = !audioStore.videoMode
  if (next) {
    // 先暂停音频，避免和视频双路播放
    audioStore.pause()
  }
  audioStore.setVideoMode(next)
}

function openVideoInBrowser() {
  if (!currentTrack.value?.bvid) return
  const page = currentTrack.value.page ? `?p=${currentTrack.value.page}` : ''
  window.open(`https://www.bilibili.com/video/${currentTrack.value.bvid}${page}`, '_blank')
}

// Watchers
watch(activeTab, (newTab) => {
  if (newTab === 'recommend' && isLoggedIn.value && !recommendList.value.length) {
    loadRecommendVideos()
  } else if (newTab === 'biliFav' && isLoggedIn.value && !biliFavList.value.length) {
    loadBiliFavList()
  } else if (newTab === 'biliHistory' && isLoggedIn.value && !biliHistoryList.value.length) {
    loadBiliHistory()
  }
})

// Lifecycle
onMounted(() => {
  refreshLoginStatus()
  if (isLoggedIn.value) loadRecommendVideos()
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 pb-36">
    <!-- Header -->
    <BilibiliHeader 
      :is-logged-in="isLoggedIn"
      :user-info="userInfo"
      @login="showLoginModal = true"
    />

    <main class="max-w-md mx-auto relative z-10">
      <!-- Search Bar -->
      <SearchBar 
        v-model="searchQuery"
        :is-searching="isSearching"
        :show-filter="showSearchFilter"
        :has-active-filters="searchFilter.type !== 'all' || searchFilter.order !== 'default'"
        @search="handleSearch"
        @toggle-filter="showSearchFilter = !showSearchFilter"
        @clear="searchResults = []; parsedVideo = null"
      />
      
      <!-- Filter Panel -->
      <FilterPanel 
        v-if="showSearchFilter"
        v-model:filters="searchFilter"
        :options="filterOptions"
        @apply="handleSearch(); showSearchFilter = false"
        @reset="searchFilter = { type: 'all', duration: 'all', order: 'default' }"
        @close="showSearchFilter = false"
      />

      <!-- Video Mode Toggle -->
      <div class="px-4 mt-3">
        <div class="flex items-center justify-between p-3 bg-white rounded-2xl shadow-sm border border-pink-50">
          <div class="min-w-0">
            <p class="text-sm font-bold text-gray-800">视频模式</p>
            <p class="text-xs text-gray-500 mt-0.5">开启后使用官方播放器观看画面，默认仅播放音频</p>
          </div>
          <button 
            @click="toggleVideoMode"
            class="px-3 py-1.5 rounded-xl text-sm font-semibold transition-all border"
            :class="isVideoMode 
              ? 'bg-emerald-500 text-white border-emerald-500 shadow-emerald-100 shadow-sm' 
              : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'"
          >
            {{ isVideoMode ? '已开启' : '仅音频' }}
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <NavigationTabs 
        v-model:active-tab="activeTab"
        :is-logged-in="isLoggedIn"
      />

      <!-- ============ TAB: RECOMMEND ============ -->
      <div v-if="activeTab === 'recommend'" class="space-y-4 animate-in fade-in duration-300">
        <!-- Not Logged In -->
        <div v-if="!isLoggedIn" class="px-4 text-center py-12">
          <div class="bg-white rounded-2xl p-8 shadow-sm border border-pink-50">
            <div class="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-4">
               <span class="text-2xl">📺</span>
            </div>
            <h3 class="font-bold text-gray-800 mb-2">登录 Bilibili</h3>
            <p class="text-gray-500 text-sm mb-6">登录后获取个性化推荐，畅听海量有声内容</p>
            <button 
              @click="showLoginModal = true" 
              class="px-8 py-3 bg-pink-500 text-white rounded-xl font-bold shadow-lg shadow-pink-200 hover:bg-pink-600 active:scale-95 transition-all"
            >
              立即登录
            </button>
          </div>
        </div>
        
        <!-- Logged In Content -->
        <template v-else>
          <CategoryTabs 
            v-model:mode="recommendMode"
            :is-loading="isRecommendLoading || isPopularLoading || zoneHotLoading"
            @refresh="recommendMode === 'recommend' ? loadRecommendVideos(true) : recommendMode === 'popular' ? loadPopularVideos() : loadZoneHotVideos(null, true)"
          />

          <!-- Sub-Category Selector for Zones -->
          <div v-if="recommendMode === 'zone'" class="px-4 mb-2">
            <div class="flex flex-wrap gap-2 p-3 bg-violet-50/50 rounded-xl border border-violet-100">
              <button 
                v-for="opt in filterOptions.type.filter(t => t.value !== 'all')" 
                :key="opt.value"
                @click="loadZoneHotVideos(opt.value)"
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                :class="selectedZone === opt.value ? 'bg-violet-500 text-white border-violet-500 shadow-sm' : 'bg-white text-gray-600 border-transparent hover:bg-violet-100'"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Content Grids -->
          <div class="px-4 pb-4">
            <div v-if="recommendError" class="text-center py-8 text-red-500 text-sm">{{ recommendError }}</div>
            
            <!-- Loading State -->
            <div v-else-if="(recommendMode === 'recommend' && isRecommendLoading && !recommendList.length) || 
                            (recommendMode === 'popular' && isPopularLoading && !popularList.length) ||
                            (recommendMode === 'zone' && zoneHotLoading && !zoneHotList.length)" 
                 class="py-12 text-center text-pink-400"
            >
              <Loader2 :size="32" class="animate-spin mx-auto mb-2" />
              <p class="text-xs">加载精彩内容...</p>
            </div>

            <!-- Grids -->
            <div v-else class="grid grid-cols-2 gap-3">
              <VideoCard 
                v-for="item in (recommendMode === 'recommend' ? recommendList : recommendMode === 'popular' ? popularList : zoneHotList)"
                :key="item.bvid"
                :video="{ ...item, zoneLabel: recommendMode === 'zone' ? filterOptions.type.find(t => t.value === selectedZone)?.label : null }"
                :is-downloading="isDownloading === item.bvid"
                :show-menu="showVideoMenu === item.bvid"
                @play="playVideo"
                @open-uploader="openUploaderSpace(item.mid, item.author)"
                @toggle-menu="showVideoMenu = showVideoMenu === item.bvid ? null : item.bvid"
                @open-browser="url => window.open(`https://www.bilibili.com/video/${url.bvid}`, '_blank')"
                @download="downloadVideo"
              />
            </div>
            
            <!-- Load More Buttons -->
            <div class="mt-6 text-center" v-if="!recommendError">
              <button 
                v-if="recommendMode === 'recommend' && recommendList.length"
                @click="loadRecommendVideos()"
                :disabled="isRecommendLoading"
                class="px-6 py-2.5 bg-pink-50 text-pink-600 rounded-xl text-sm font-bold hover:bg-pink-100 disabled:opacity-50 transition-colors"
              >
                {{ isRecommendLoading ? '加载中...' : '换一批' }}
              </button>
              
              <button 
                v-else-if="recommendMode === 'popular' && popularList.length && hasMorePopular"
                @click="loadPopularVideos(true)"
                :disabled="isPopularLoading"
                class="px-6 py-2.5 bg-pink-50 text-pink-600 rounded-xl text-sm font-bold hover:bg-pink-100 disabled:opacity-50 transition-colors"
              >
                 {{ isPopularLoading ? '加载中...' : '加载更多' }}
              </button>

              <button 
                 v-else-if="recommendMode === 'zone' && zoneHotList.length"
                 @click="loadZoneHotVideos(null, true)"
                 :disabled="zoneHotLoading"
                 class="px-6 py-2.5 bg-violet-50 text-violet-600 rounded-xl text-sm font-bold hover:bg-violet-100 disabled:opacity-50 transition-colors"
              >
                {{ zoneHotLoading ? '加载中...' : '换一批' }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- ============ TAB: SEARCH ============ -->
      <div v-else-if="activeTab === 'search'" class="px-4 space-y-4 animate-in fade-in duration-300">
        <!-- Parsed Video (Multi-page) -->
        <ParsedVideoPanel 
          v-if="parsedVideo"
          :parsed-video="parsedVideo"
          :batch-download-state="batchDownloadState"
          :batch-download-message="batchDownloadMessage"
          :batch-download-error="batchDownloadError"
          @play="playParsedVideo"
          @open-uploader="openUploaderSpace"
          @download-all="downloadParsedAudio"
        />

        <!-- Search Results -->
        <div v-if="searchResults.length" class="space-y-3">
          <div 
            v-for="item in searchResults" 
            :key="item.bvid"
            class="flex gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-50 cursor-pointer hover:border-pink-200 transition-all"
            @click="playVideo(item)"
          >
             <div class="relative w-32 h-20 flex-shrink-0 bg-gray-100 rounded-xl overflow-hidden">
               <img :src="item.cover" referrerpolicy="no-referrer" class="w-full h-full object-cover" />
               <span class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded">{{ item.duration }}</span>
             </div>
             <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
               <h3 class="text-sm font-bold text-gray-800 line-clamp-2">{{ item.title }}</h3>
               <div class="flex items-center justify-between">
                 <span class="text-xs text-gray-500 flex items-center gap-1">
                   <span class="text-[10px]">UP</span> {{ item.author }}
                 </span>
               </div>
             </div>
          </div>
        </div>

        <!-- Empty State / History -->
        <div v-else-if="!parsedVideo && !isSearching" class="py-8">
          <div v-if="sourceStore.searchHistory.length" class="mb-8">
            <div class="flex items-center justify-between mb-3 px-1">
              <span class="text-xs font-bold text-gray-400">搜索历史</span>
              <button @click="sourceStore.clearSearchHistory()" class="text-xs text-gray-300 hover:text-red-400"><Trash2 :size="14" /></button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button 
                v-for="tag in sourceStore.searchHistory.slice(0, 10)" 
                :key="tag"
                @click="searchFromHistory(tag)"
                class="px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs text-gray-600 hover:border-pink-300 hover:text-pink-600 transition-colors"
              >
                {{ tag }}
              </button>
            </div>
          </div>
          
          <div class="text-center text-gray-400">
            <Search :size="32" class="mx-auto mb-3 opacity-20" />
            <p class="text-xs">搜索有声书、音乐、播客...</p>
          </div>
        </div>
        
        <!-- Loading -->
        <div v-if="isSearching" class="text-center py-12">
           <Loader2 :size="32" class="animate-spin mx-auto text-pink-500" />
        </div>
      </div>

      <!-- ============ TAB: USER / HISTORY / FAVS ============ -->
      <UserPanel 
        v-else
        :active-tab="activeTab"
        :is-logged-in="isLoggedIn"
        :user-info="userInfo"
        :history-list="sourceStore.playHistory"
        :fav-list="sourceStore.favorites"
        :bili-fav-list="biliFavList"
        :bili-fav-content="biliFavContent"
        :bili-history-list="biliHistoryList"
        :selected-fav-id="selectedFavId"
        :is-fav-loading="isFavLoading"
        :fav-error="favError"
        :is-history-loading="isHistoryLoading"
        :history-error="historyError"
        :has-more-history="hasMoreHistory"
        @login="showLoginModal = true"
        @logout="handleLogout"
        @play="playVideo"
        @open-uploader="openUploaderSpace($event.mid, $event.name)"
        @switch-tab="activeTab = $event"
        @load-fav-content="loadBiliFavContent"
        @load-more-history="loadBiliHistory(true)"
        @remove-favorite="sourceStore.removeFavorite"
      />

      <!-- Cache Clear Button (Global) -->
      <div v-if="activeTab !== 'search' && activeTab !== 'recommend'" class="px-4 mt-8">
         <button
          @click="clearAudioCache"
          :disabled="cacheClearing"
          class="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-red-50 shadow-sm hover:bg-red-50 transition-colors"
        >
          <span class="text-sm font-medium text-red-600 flex items-center gap-2">
            <Trash2 :size="16" />
            清空缓存
          </span>
          <span class="text-xs text-red-300">{{ isNativePlatform ? '释放本地空间' : '重置应用数据' }}</span>
        </button>
        <p v-if="cacheMessage" class="text-center text-xs text-emerald-500 mt-2">{{ cacheMessage }}</p>
      </div>

    </main>

    <!-- Video Overlay -->
    <Transition name="fade">
      <div 
        v-if="isVideoMode && currentTrack && videoPlayerUrl"
        class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-6"
        @click.self="toggleVideoMode"
      >
        <div class="w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <div class="flex items-center justify-between px-4 py-3 bg-black/60 text-white">
            <div class="min-w-0">
              <p class="text-sm font-semibold truncate">{{ currentTrack.title }}</p>
              <p class="text-[11px] text-white/70 truncate">
                {{ currentVideo?.owner?.name || 'B站视频' }}
                <span v-if="currentTrack.page" class="ml-1">P{{ currentTrack.page }}</span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button 
                @click.stop="openVideoInBrowser"
                class="px-3 py-1 rounded-lg bg-white/10 border border-white/20 text-xs hover:bg-white/20 transition-colors"
              >
                浏览器打开
              </button>
              <button 
                @click.stop="toggleVideoMode"
                class="px-3 py-1 rounded-lg bg-white text-black text-xs font-semibold"
              >
                关闭
              </button>
            </div>
          </div>
          <div class="relative pt-[56.25%] bg-black">
            <iframe 
              class="absolute inset-0 w-full h-full"
              :src="videoPlayerUrl"
              allowfullscreen
              allow="autoplay; fullscreen; encrypted-media"
              referrerpolicy="no-referrer"
            ></iframe>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Global Player Bar -->
    <PlayerBar 
      :current-track="currentTrack"
      :current-playlist="currentPlaylist"
      :current-index="currentIndex"
      :is-playing="isPlaying"
      :is-loading="isLoading"
      :current-time="formattedCurrentTime"
      :duration="formattedDuration"
      :display-progress="displayProgress"
      :parse-mode="audioStore.parseMode"
      :parse-mode-options="parseModeOptions"
      :video-mode="isVideoMode"
      @toggle-play="audioStore.togglePlay()"
      @next="audioStore.nextTrack()"
      @show-playlist="showPlaylist = true"
      @change-parse-mode="audioStore.setParseMode($event); audioStore.reloadCurrentTrack()"
      @toggle-video-mode="toggleVideoMode"
    />

    <!-- Playlist Drawer -->
    <PlaylistDrawer 
      :show="showPlaylist"
      :playlist="currentPlaylist"
      :current-index="currentIndex"
      :is-playing="isPlaying"
      :playback-rate="playbackRate"
      :volume="volume"
      @close="showPlaylist = false"
      @play-index="audioStore.currentIndex = $event"
      @change-rate="audioStore.cyclePlaybackRate()"
      @rewind="audioStore.seek(-15)"
      @prev="audioStore.previousTrack()"
      @toggle-play="audioStore.togglePlay()"
      @next="audioStore.nextTrack()"
      @forward="audioStore.seek(15)"
      @toggle-mute="volume > 0 ? audioStore.setVolume(0) : audioStore.setVolume(1)"
      @update-volume="audioStore.setVolume($event)"
    />

    <!-- Modals -->
    <BilibiliLogin 
      v-if="showLoginModal"
      @close="showLoginModal = false"
      @login-success="onLoginSuccess"
    />

    <UploaderSpace
      v-if="showUploaderSpace"
      :mid="selectedUploader.mid"
      :initial-name="selectedUploader.name"
      @close="showUploaderSpace = false"
      @play="handleUploaderPlayVideo"
    />
    
    <!-- Video Menu Overlay -->
    <div v-if="showVideoMenu" class="fixed inset-0 z-20 bg-transparent" @click="showVideoMenu = null"></div>
  </div>
</template>

<style>
/* Global transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
