<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { useSourceStore } from '../stores/sourceStore'
import { 
  searchVideos, getVideoInfo, extractBilibiliId,
  getFavoriteList, getFavoriteContent, getHistory,
  getRecommendVideos, getPopularVideos, getPlayUrl, QUALITY_MAP,
  getFollowingVideos, getReplies, getSubReplies
} from '../services/bilibiliService'
import { 
  getAuthInfo, isLoggedIn as checkIsLoggedIn, loadAuthFromStorage 
} from '../services/bilibiliAuth'
import { Capacitor } from '@capacitor/core'

// Components
import BilibiliLogin from '../components/BilibiliLogin.vue'
import UploaderSpace from '../components/UploaderSpace.vue'
import BilibiliMiniPlayer from '../components/BilibiliMiniPlayer.vue'
import BilibiliHeader from './bilibili/components/BilibiliHeader.vue'
import SearchBar from './bilibili/components/SearchBar.vue'
import FilterPanel from './bilibili/components/FilterPanel.vue'
import NavigationTabs from './bilibili/components/NavigationTabs.vue'
import CategoryTabs from './bilibili/components/CategoryTabs.vue'
import VideoCard from './bilibili/components/VideoCard.vue'
import ParsedVideoPanel from './bilibili/components/ParsedVideoPanel.vue'
import UserPanel from './bilibili/components/UserPanel.vue'

import { Loader2, Search as SearchIcon, Trash2, Copy, ExternalLink, MessageSquare, PlayCircle } from 'lucide-vue-next'

defineOptions({ name: 'OnlinePlayer' })

const sourceStore = useSourceStore()
const isNativePlatform = Capacitor.isNativePlatform()

// ===== State =====
// UI
const showLoginModal = ref(false)
const showUploaderSpace = ref(false)
const showSearchFilter = ref(false)
const activeTab = ref('search')
const recommendMode = ref('recommend') // recommend | popular

// Data
const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref([])
const searchError = ref('')
const searchFilter = ref({ type: 'all', duration: 'all', order: 'default' })

const recommendList = ref([])
const popularList = ref([])
const recommendFreshIdx = ref(1)
const popularPage = ref(1)
const isRecommendLoading = ref(false)
const isPopularLoading = ref(false)
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

// Video Parse
const parsedVideo = ref(null)
const currentPageIndex = ref(-1)
const playInfo = ref(null)
const playInfoLoading = ref(false)
const playInfoError = ref('')
const selectedQuality = ref(80)
const showVideoPlayer = ref(false)

// Comments
const commentList = ref([])
const commentMode = ref('hot')
const commentPage = ref(1)
const commentHasMore = ref(true)
const commentLoading = ref(false)
const commentError = ref('')
const subReplyMap = reactive({})

// Follow
const followingList = ref([])
const followingLoading = ref(false)
const followingError = ref('')
const followingPage = ref(1)
const followingHasMore = ref(true)

// Video Favorite
const isVideoFavorited = computed(() => {
  if (!parsedVideo.value?.bvid) return false
  return sourceStore.favorites.some(f => f.id === parsedVideo.value.bvid)
})

function toggleVideoFavorite() {
  if (!parsedVideo.value) return
  if (isVideoFavorited.value) {
    sourceStore.removeFavorite(parsedVideo.value.bvid)
  } else {
    sourceStore.addFavorite({
      id: parsedVideo.value.bvid,
      type: 'bilibili',
      title: parsedVideo.value.title,
      cover: parsedVideo.value.cover,
      author: parsedVideo.value.author
    })
  }
}

// Configs
const filterOptions = {
  type: [
    { value: 'all', label: '全部类型', icon: '🎬', desc: '综合视频' },
    { value: 'animation', label: '动画', icon: '🎞️', desc: '动画·番剧' },
    { value: 'music', label: '音乐', icon: '🎵', desc: '翻唱·演奏' },
    { value: 'knowledge', label: '知识', icon: '📚', desc: '科普·人文' }
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

const typeTidMap = {
  animation: '1',
  music: '3',
  knowledge: '36'
}

// ===== Computeds =====
const currentPage = computed(() => {
  if (!parsedVideo.value || currentPageIndex.value < 0) return null
  return parsedVideo.value.pages?.[currentPageIndex.value] || null
})

// iframe URL 已弃用，改用自定义播放器
// const videoPlayerUrl = computed(() => { ... })

const qualityOptions = computed(() => {
  const accept = playInfo.value?.acceptQuality || []
  if (!accept.length) {
    return [
      { value: selectedQuality.value, label: QUALITY_MAP[selectedQuality.value] || '默认' }
    ]
  }
  return accept.map(q => ({
    value: Number(q),
    label: QUALITY_MAP[q] || `${q}P`
  }))
})

const activeAid = computed(() => parsedVideo.value?.aid || null)

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
  refreshLoginStatus()
}

// Search
function resolveTid() {
  const type = searchFilter.value.type
  if (type && type !== 'all') {
    return typeTidMap[type] || ''
  }
  return ''
}

function buildSearchKeyword() {
  return searchQuery.value.trim()
}

async function handleSearch() {
  if (!searchQuery.value.trim()) return

  isSearching.value = true
  searchError.value = ''
  searchResults.value = []
  parsedVideo.value = null
  currentPageIndex.value = -1
  playInfo.value = null
  activeTab.value = 'search'

  try {
    const videoId = extractBilibiliId(searchQuery.value)
    
    if (videoId.bvid) {
      const videoInfo = await getVideoInfo(videoId.bvid)
      const pages = videoInfo.pages || []
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
      currentPageIndex.value = Math.max((videoId.page || 1) - 1, 0)
      await loadPlayInfo()
      // 自动打开播放器
      showVideoPlayer.value = true
      sourceStore.addSearchHistory(searchQuery.value)
      return
    }
    
    const orderMap = { default: '', click: 'click', pubdate: 'pubdate', dm: 'dm' }
    const durationMap = { all: 0, short: 1, medium: 2, long: 4 }
    
    const result = await searchVideos(buildSearchKeyword(), {
      order: orderMap[searchFilter.value.order],
      duration: durationMap[searchFilter.value.duration],
      tids: resolveTid()
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

// Video Play & Parse
async function playVideo(video) {
  searchError.value = ''
  try {
    const videoInfo = await getVideoInfo(video.bvid)
    const pages = videoInfo.pages || []
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
        title: p.part || videoInfo.title,
        duration: p.duration,
        bvid: videoInfo.bvid
      })),
      pageCount: pages.length
    }
    currentPageIndex.value = 0
    activeTab.value = 'search'
    await loadPlayInfo()
    // 自动打开播放器
    showVideoPlayer.value = true
    sourceStore.addPlayHistory({
      id: video.bvid,
      type: 'bilibili',
      title: videoInfo.title,
      cover: videoInfo.cover,
      author: videoInfo.owner.name
    })
  } catch (error) {
    searchError.value = error.message || '播放失败'
  }
}

async function playParsedVideo(startIndex = 0) {
  if (!parsedVideo.value) return
  currentPageIndex.value = startIndex
  await loadPlayInfo()
  // 自动打开播放器
  showVideoPlayer.value = true
}

async function loadPlayInfo(indexOverride = null, qualityOverride = null) {
  if (!parsedVideo.value) return
  const idx = indexOverride !== null ? indexOverride : currentPageIndex.value
  const page = parsedVideo.value.pages?.[idx]
  if (!page) return
  playInfoLoading.value = true
  playInfoError.value = ''
  try {
    const q = qualityOverride || selectedQuality.value || 80
    const info = await getPlayUrl(parsedVideo.value.bvid, page.cid, q)
    playInfo.value = info
    selectedQuality.value = info.quality || q
    await loadComments(true)
  } catch (e) {
    playInfo.value = null
    playInfoError.value = e.message || '获取播放地址失败'
  } finally {
    playInfoLoading.value = false
  }
}

function handleQualityChange(q) {
  if (!q || q === selectedQuality.value) return
  loadPlayInfo(currentPageIndex.value, q)
}

function openVideoInBrowser() {
  if (!parsedVideo.value) return
  const page = currentPage.value?.page ? `?p=${currentPage.value.page}` : ''
  window.open(`https://www.bilibili.com/video/${parsedVideo.value.bvid}${page}`, '_blank')
}

// 播放器事件处理
function onVideoEnded() {
  // 自动播放下一 P
  if (parsedVideo.value && currentPageIndex.value < (parsedVideo.value.pages?.length || 1) - 1) {
    currentPageIndex.value++
    loadPlayInfo()
  }
}

function onVideoError(errorMsg) {
  console.error('播放错误:', errorMsg)
  playInfoError.value = errorMsg
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

// User Panel Data
async function loadBiliFavList() {
  if (!isLoggedIn.value) {
    favError.value = '请先登录 B站账号'
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
  biliFavList.value.forEach(f => { f.selected = f.id === mediaId })
  
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

// Follow
async function loadFollowing(loadMore = false) {
  if (!isLoggedIn.value) {
    followingError.value = '请先登录'
    return
  }
  if (followingLoading.value) return
  followingLoading.value = true
  followingError.value = ''
  try {
    const targetPage = loadMore ? followingPage.value : 1
    const res = await getFollowingVideos(targetPage, 20)
    followingList.value = loadMore ? [...followingList.value, ...res.list] : res.list
    followingHasMore.value = res.hasMore
    followingPage.value = targetPage + 1
  } catch (e) {
    followingError.value = e.message || '获取关注动态失败'
  } finally {
    followingLoading.value = false
  }
}

// Comments
function formatCommentTime(ts) {
  const date = new Date(ts)
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

async function loadComments(reset = false) {
  if (!activeAid.value) {
    commentError.value = '请先解析视频'
    return
  }
  if (commentLoading.value) return
  if (reset) {
    commentList.value = []
    commentPage.value = 1
    commentHasMore.value = true
    Object.keys(subReplyMap).forEach(key => delete subReplyMap[key])
  }
  commentLoading.value = true
  commentError.value = ''
  try {
    const res = await getReplies({
      oid: activeAid.value,
      page: commentPage.value,
      pageSize: 10,
      mode: commentMode.value
    })
    commentList.value = reset ? res.list : [...commentList.value, ...res.list]
    commentHasMore.value = res.hasMore
    if (res.hasMore) {
      commentPage.value = res.next || commentPage.value + 1
    }
  } catch (e) {
    commentError.value = e.message || '加载评论失败'
  } finally {
    commentLoading.value = false
  }
}

async function loadSubRepliesFor(rootId, reset = false) {
  if (!activeAid.value || !rootId) return
  if (!subReplyMap[rootId]) {
    subReplyMap[rootId] = { list: [], page: 1, hasMore: true, loading: false, error: '' }
  }
  const state = subReplyMap[rootId]
  if (state.loading) return
  if (reset) {
    state.list = []
    state.page = 1
    state.hasMore = true
  }
  state.loading = true
  state.error = ''
  try {
    const res = await getSubReplies({
      oid: activeAid.value,
      root: rootId,
      page: state.page,
      pageSize: 10
    })
    state.list = reset ? res.list : [...state.list, ...res.list]
    state.hasMore = res.hasMore
    if (res.hasMore) {
      state.page += 1
    }
  } catch (e) {
    state.error = e.message || '加载回复失败'
  } finally {
    state.loading = false
  }
}

// Utils
function copyLink(url) {
  if (!url) return
  navigator.clipboard?.writeText(url).catch(() => {
    const input = document.createElement('textarea')
    input.value = url
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  })
}

async function openExternal(url) {
  if (!url) return
  try {
    if (isNativePlatform) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
    } else {
      window.open(url, '_blank')
    }
  } catch (e) {
    console.error('外部打开失败:', e)
  }
}

function openUploaderSpace(mid, name) {
  if (!mid) return
  selectedUploader.value = { mid, name }
  showUploaderSpace.value = true
}

// Lifecycle
onMounted(() => {
  refreshLoginStatus()
  if (isLoggedIn.value) {
    loadRecommendVideos()
  }
})

watch(activeTab, value => {
  if (value === 'recommend' && isLoggedIn.value && !recommendList.value.length) {
    loadRecommendVideos()
  }
  if (value === 'follow' && isLoggedIn.value && !followingList.value.length) {
    loadFollowing()
  }
  if (value === 'biliFav' && isLoggedIn.value && !biliFavList.value.length) {
    loadBiliFavList()
  }
  if (value === 'biliHistory' && isLoggedIn.value && !biliHistoryList.value.length) {
    loadBiliHistory()
  }
})
</script>
<template>
  <div class="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 pb-20">
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
            <p class="text-gray-500 text-sm mb-6">登录后获取个性化推荐</p>
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
            :is-loading="isRecommendLoading || isPopularLoading"
            @refresh="recommendMode === 'recommend' ? loadRecommendVideos(true) : loadPopularVideos()"
          />

          <div class="px-4 pb-4">
            <div v-if="recommendError" class="text-center py-8 text-red-500 text-sm">{{ recommendError }}</div>
            
            <div v-else-if="(recommendMode === 'recommend' && isRecommendLoading && !recommendList.length) || 
                            (recommendMode === 'popular' && isPopularLoading && !popularList.length)" 
                 class="py-12 text-center text-pink-400"
            >
              <Loader2 :size="32" class="animate-spin mx-auto mb-2" />
              <p class="text-xs">加载精彩内容...</p>
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <VideoCard 
                v-for="item in (recommendMode === 'recommend' ? recommendList : popularList)"
                :key="item.bvid"
                :video="item"
                @play="playVideo"
                @open-uploader="openUploaderSpace(item.mid, item.author)"
                @open-browser="url => window.open(`https://www.bilibili.com/video/${url.bvid}`, '_blank')"
              />
            </div>
            
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
            </div>
          </div>
        </template>
      </div>

      <!-- ============ TAB: SEARCH ============ -->
      <div v-else-if="activeTab === 'search'" class="px-4 space-y-4 animate-in fade-in duration-300">
        <!-- Parsed Video -->
        <ParsedVideoPanel 
          v-if="parsedVideo"
          :video="parsedVideo"
          :current-index="currentPageIndex"
          @play="playParsedVideo"
          @open-uploader="openUploaderSpace"
        />

        <!-- 快捷操作栏 -->
        <div v-if="playInfo && !playInfoLoading" class="bg-white rounded-2xl shadow-sm border border-gray-50 p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <!-- 播放按钮 -->
              <button 
                @click="showVideoPlayer = true"
                class="flex items-center gap-2 px-4 py-2.5 bg-pink-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-pink-200 hover:bg-pink-600 active:scale-95 transition-all"
              >
                <PlayCircle :size="18" />
                播放视频
              </button>
              <!-- 画质选择 -->
              <select 
                :value="selectedQuality"
                @change="handleQualityChange(Number($event.target.value))"
                class="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-pink-300"
              >
                <option v-for="opt in qualityOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <button 
              @click="openVideoInBrowser"
              class="p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="浏览器打开"
            >
              <ExternalLink :size="18" />
            </button>
          </div>
        </div>
        
        <!-- 加载中 -->
        <div v-else-if="playInfoLoading" class="bg-white rounded-2xl shadow-sm border border-gray-50 p-6 text-center">
          <Loader2 :size="24" class="animate-spin mx-auto text-pink-500 mb-2" />
          <p class="text-sm text-gray-500">解析播放地址...</p>
        </div>

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

        <!-- 评论区 -->
        <div v-if="activeAid" class="bg-white rounded-2xl shadow-sm border border-gray-50 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-bold text-gray-800">评论区</p>
              <p class="text-xs text-gray-400">热度/时间排序切换，仅浏览</p>
            </div>
            <div class="flex items-center gap-2">
              <button 
                @click="commentMode = 'hot'; loadComments(true)"
                class="px-3 py-1.5 rounded-lg text-[11px] border"
                :class="commentMode === 'hot' ? 'bg-pink-500 text-white border-pink-500' : 'bg-gray-50 text-gray-500 border-gray-100'"
              >
                按热度
              </button>
              <button 
                @click="commentMode = 'time'; loadComments(true)"
                class="px-3 py-1.5 rounded-lg text-[11px] border"
                :class="commentMode === 'time' ? 'bg-pink-500 text-white border-pink-500' : 'bg-gray-50 text-gray-500 border-gray-100'"
              >
                按时间
              </button>
            </div>
          </div>
          <div v-if="commentLoading" class="text-xs text-pink-500 flex items-center gap-2">
            <Loader2 :size="16" class="animate-spin" /> 评论加载中...
          </div>
          <div v-else-if="commentError" class="text-xs text-red-500">{{ commentError }}</div>
          <div v-else-if="commentList.length" class="space-y-3">
            <div 
              v-for="reply in commentList" 
              :key="reply.id"
              class="p-3 rounded-xl bg-gray-50 border border-gray-100"
            >
              <div class="flex items-center gap-2">
                <img 
                  v-if="reply.face" 
                  :src="reply.face" 
                  referrerpolicy="no-referrer" 
                  class="w-8 h-8 rounded-full object-cover"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-800 truncate">{{ reply.uname }}</p>
                  <p class="text-[11px] text-gray-400">{{ formatCommentTime(reply.ctime) }}</p>
                </div>
                <span class="text-[11px] text-gray-400">{{ reply.like }} 赞</span>
              </div>
              <p class="text-sm text-gray-700 mt-2 whitespace-pre-wrap break-all">{{ reply.message }}</p>
              <div class="mt-2">
                <button 
                  @click="loadSubRepliesFor(reply.id, !subReplyMap[reply.id]?.list?.length)"
                  class="text-[11px] text-pink-600 px-2 py-1 rounded-lg bg-white border border-pink-100 hover:bg-pink-50"
                >
                  {{ subReplyMap[reply.id]?.list?.length ? '展开更多回复' : `查看回复 (${reply.replyCount})` }}
                </button>
              </div>
              <div v-if="subReplyMap[reply.id]?.list?.length" class="mt-2 space-y-2">
                <div 
                  v-for="child in subReplyMap[reply.id].list" 
                  :key="child.id"
                  class="p-2 rounded-lg bg-white border border-gray-100"
                >
                  <div class="flex items-center justify-between text-[11px] text-gray-600">
                    <span class="font-semibold">{{ child.uname }}</span>
                    <span class="text-gray-400">{{ formatCommentTime(child.ctime) }}</span>
                  </div>
                  <p class="text-[13px] text-gray-700 mt-1 whitespace-pre-wrap break-all">{{ child.message }}</p>
                </div>
                <div v-if="subReplyMap[reply.id].hasMore" class="text-center">
                  <button 
                    @click="loadSubRepliesFor(reply.id)"
                    :disabled="subReplyMap[reply.id].loading"
                    class="px-3 py-1 text-[11px] text-pink-600 bg-pink-50 rounded-lg border border-pink-100 hover:bg-pink-100 disabled:opacity-50"
                  >
                    {{ subReplyMap[reply.id].loading ? '加载中...' : '查看更多' }}
                  </button>
                </div>
                <p v-if="subReplyMap[reply.id].error" class="text-[11px] text-red-500">{{ subReplyMap[reply.id].error }}</p>
              </div>
            </div>
            <div v-if="commentHasMore" class="text-center">
              <button 
                @click="loadComments()"
                class="px-4 py-2 rounded-lg bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100 text-xs"
              >
                加载更多评论
              </button>
            </div>
          </div>
          <div v-else class="text-[11px] text-gray-400 flex items-center justify-between">
            <span>暂无评论或未登录</span>
            <button 
              @click="loadComments(true)" 
              class="px-3 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100 text-[11px]"
            >
              手动加载
            </button>
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
            <SearchIcon :size="32" class="mx-auto mb-3 opacity-20" />
            <p class="text-xs">输入 BV 号或关键词，解析视频信息</p>
          </div>
        </div>
        
        <!-- Loading -->
        <div v-if="isSearching" class="text-center py-12">
           <Loader2 :size="32" class="animate-spin mx-auto text-pink-500" />
        </div>
      </div>

      <!-- ============ TAB: FOLLOW ============ -->
      <div v-else-if="activeTab === 'follow'" class="px-4 space-y-4 animate-in fade-in duration-300">
        <div v-if="!isLoggedIn" class="text-center py-12">
          <div class="bg-white rounded-2xl p-8 shadow-sm border border-pink-50">
            <MessageSquare :size="28" class="mx-auto mb-3 text-pink-400" />
            <p class="text-gray-500 text-sm mb-4">登录后查看已关注 UP 的最新投稿</p>
            <button 
              @click="showLoginModal = true" 
              class="px-6 py-2.5 bg-pink-500 text-white rounded-xl font-bold shadow-md hover:bg-pink-600 transition-colors"
            >
              立即登录
            </button>
          </div>
        </div>
        <template v-else>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-gray-800">关注更新</h3>
            <button 
              @click="loadFollowing(true)" 
              :disabled="followingLoading"
              class="text-xs text-pink-600 px-3 py-1 rounded-lg bg-pink-50 border border-pink-100 hover:bg-pink-100 disabled:opacity-50"
            >
              {{ followingLoading ? '刷新中...' : '加载更多' }}
            </button>
          </div>
          <div v-if="followingError" class="text-red-500 text-sm">{{ followingError }}</div>
          <div v-else-if="followingLoading && !followingList.length" class="text-center py-10">
            <Loader2 :size="28" class="animate-spin mx-auto text-pink-500" />
            <p class="text-xs text-gray-400 mt-2">加载关注更新...</p>
          </div>
          <div v-else class="grid grid-cols-2 gap-3">
            <VideoCard 
              v-for="item in followingList"
              :key="item.bvid"
              :video="item"
              @play="playVideo"
              @open-uploader="openUploaderSpace(item.mid, item.author)"
              @open-browser="url => window.open(`https://www.bilibili.com/video/${url.bvid}`, '_blank')"
            />
          </div>
          <div v-if="followingHasMore && followingList.length" class="text-center pb-6">
            <button 
              @click="loadFollowing(true)" 
              :disabled="followingLoading"
              class="px-6 py-2 bg-pink-50 text-pink-600 rounded-xl text-sm font-bold hover:bg-pink-100 disabled:opacity-50 transition-colors"
            >
              {{ followingLoading ? '加载中...' : '加载更多' }}
            </button>
          </div>
          <div v-else-if="!followingHasMore && followingList.length" class="text-center text-xs text-gray-400 pb-6">
            没有更多了~
          </div>
        </template>
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
    </main>

    <!-- Mini 视频播放器 -->
    <BilibiliMiniPlayer
      :visible="showVideoPlayer"
      :play-info="playInfo"
      :video-info="parsedVideo"
      :current-page="currentPage"
      :quality-options="qualityOptions"
      :current-quality="selectedQuality"
      :is-favorited="isVideoFavorited"
      @close="showVideoPlayer = false"
      @quality-change="handleQualityChange"
      @ended="onVideoEnded"
      @error="onVideoError"
      @toggle-favorite="toggleVideoFavorite"
      @open-browser="openVideoInBrowser"
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
      @play="playVideo"
    />
  </div>
</template>
<style>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
