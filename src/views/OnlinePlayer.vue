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
  searchAudio,
  searchXimalaya,
  getXimalayaAlbumTracks,
  getXimalayaPlayUrl
} from '../services/audioSourceService'
import { 
  getAuthInfo, 
  isLoggedIn as checkIsLoggedIn,
  loadAuthFromStorage 
} from '../services/bilibiliAuth'
import { 
  isLoggedIn as checkXimalayaLoggedIn,
  isVip as checkXimalayaVip,
  getAuthInfo as getXimalayaAuthInfo,
  loadAuthFromStorage as loadXimalayaAuth,
  getVipPlayUrl as getXimalayaVipPlayUrl
} from '../services/ximalayaAuth'
import { 
  searchWithSource as searchThirdParty,
  getBookChapters,
  getChapterAudioUrl
} from '../services/thirdPartySourceService'
import BilibiliLogin from '../components/BilibiliLogin.vue'
import XimalayaLogin from '../components/XimalayaLogin.vue'
import { 
  Search, Play, Pause, SkipBack, SkipForward, 
  Volume2, VolumeX, Heart, HeartOff, Clock,
  List, ChevronLeft, ChevronRight, Gauge, X,
  RotateCcw, RotateCw, Settings, Plus, Link,
  Radio, BookOpen, RefreshCw, Trash2, Globe, User, LogIn,
  Filter, SlidersHorizontal
} from 'lucide-vue-next'

defineOptions({ name: 'OnlinePlayer' })

const sourceStore = useSourceStore()

// ===== 状态 =====
const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref([])
const searchError = ref('')
const currentSearchSource = ref('bilibili')  // 当前搜索的源类型
const currentSourceObject = ref(null)        // 当前选中的源对象（用于第三方源）

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
const progressMap = ref({})
const PROGRESS_STORAGE_KEY = 'audio-progress-map'
const PROGRESS_SAVE_INTERVAL = 5000
let lastProgressSave = 0
let pendingSeek = null

// UI 状态
const showPlaylist = ref(false)
const showSourceManager = ref(false)
const showLoginModal = ref(false)
const showXimalayaLoginModal = ref(false)
const activeTab = ref('search')      // search | history | favorites

// 喜马拉雅登录状态
const isXimalayaLoggedIn = ref(false)
const isXimalayaVip = ref(false)
const ximalayaUserInfo = ref(null)

// 书源管理状态
const sourceManagerTab = ref('sources')  // sources | subscriptions | add
const customSourceUrl = ref('')
const customSourceName = ref('')
const isAddingSource = ref(false)
const addSourceError = ref('')
const addSourceSuccess = ref('')

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

// 刷新喜马拉雅登录状态
function refreshXimalayaLoginStatus() {
  loadXimalayaAuth()
  isXimalayaLoggedIn.value = checkXimalayaLoggedIn()
  isXimalayaVip.value = checkXimalayaVip()
  if (isXimalayaLoggedIn.value) {
    ximalayaUserInfo.value = getXimalayaAuthInfo()
  } else {
    ximalayaUserInfo.value = null
  }
}

// 喜马拉雅登录成功回调
function onXimalayaLoginSuccess() {
  refreshXimalayaLoginStatus()
  searchError.value = ''
}

// ===== 书源管理方法 =====

// 手动添加书源URL
async function handleAddSource() {
  if (!customSourceUrl.value.trim()) {
    addSourceError.value = '请输入书源URL'
    return
  }
  
  isAddingSource.value = true
  addSourceError.value = ''
  addSourceSuccess.value = ''
  
  try {
    await sourceStore.addSubscription(customSourceUrl.value, customSourceName.value || '自定义书源')
    addSourceSuccess.value = '添加成功！'
    customSourceUrl.value = ''
    customSourceName.value = ''
    setTimeout(() => {
      addSourceSuccess.value = ''
    }, 2000)
  } catch (e) {
    addSourceError.value = e.message || '添加失败，请检查URL是否有效'
  } finally {
    isAddingSource.value = false
  }
}

// 刷新所有订阅
async function handleRefreshAllSubscriptions() {
  try {
    await sourceStore.refreshAllSubscriptions()
  } catch (e) {
    console.error('刷新订阅失败:', e)
  }
}

// 禁用的源列表
const disabledSources = computed(() => 
  sourceStore.sources.filter(s => !s.enabled)
)

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
  if (track.sourceType === 'ximalaya') {
    return `ximalaya:${track.trackId || track.id}`
  }
  if (track.sourceType === 'qingting') {
    return `qingting:${track.id || track.channelId || track.title || 'unknown'}`
  }
  if (track.sourceType === 'thirdparty') {
    // 使用 sourceId + chapterUrl 作为唯一标识
    const sourceId = track.sourceId || 'unknown'
    const chapterId = track.cid || track.chapterUrl || track.title || 'unknown'
    return `thirdparty:${sourceId}:${chapterId}`
  }
  const bvid = track.bvid || currentVideo.value?.bvid || track.id || 'unknown'
  const cid = track.cid || track.page || '0'
  return `bilibili:${bvid}:${cid}`
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
      sourceType: track.sourceType || 'bilibili'
    }
  }
  lastProgressSave = now
  saveProgressToStorage()
}

function clearTrackProgress(track) {
  const key = getTrackKey(track)
  if (key && progressMap.value[key]) {
    const next = { ...progressMap.value }
    delete next[key]
    progressMap.value = next
    saveProgressToStorage()
  }
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
    // 先检查是否是B站链接（只在B站源时检查）
    if (currentSearchSource.value === 'bilibili') {
      const videoId = extractBilibiliId(searchQuery.value)
      
      if (videoId.bvid) {
        // 直接解析视频
        const videoInfo = await getVideoInfo(videoId.bvid)
        searchResults.value = [{
          sourceType: 'bilibili',
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
    }
    
    // 根据当前源进行搜索
    const keyword = buildSearchKeyword()
    let result
    
    switch (currentSearchSource.value) {
      case 'bilibili':
        const searchOptions = {
          order: getOrderParam(),
          duration: getDurationParam()
        }
        result = await searchVideos(keyword, searchOptions)
        searchResults.value = result.results.map(item => ({
          ...item,
          sourceType: 'bilibili'
        }))
        break
        
      case 'ximalaya':
        result = await searchXimalaya(keyword)
        searchResults.value = result.results
        break
        
      case 'qingting':
        result = await searchAudio(keyword, 'qingting')
        searchResults.value = result.results
        break
        
      case 'thirdparty':
        // 第三方书源搜索
        if (!currentSourceObject.value) {
          throw new Error('请先选择一个书源')
        }
        result = await searchThirdParty(currentSourceObject.value, keyword)
        searchResults.value = result.results
        break
        
      default:
        throw new Error('未知的搜索源')
    }
    
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

// 处理播放项点击（根据不同源类型）
async function handlePlayItem(item) {
  switch (item.sourceType) {
    case 'bilibili':
      await playVideo(item)
      break
    case 'ximalaya':
      await playXimalayaAlbum(item)
      break
    case 'qingting':
      searchError.value = '蜻蜓FM播放功能开发中...'
      break
    case 'thirdparty':
      await playThirdPartyBook(item)
      break
    default:
      searchError.value = '不支持的源类型'
  }
}

// 切换搜索源
function switchSource(source) {
  currentSourceObject.value = source
  currentSearchSource.value = source.type
  searchResults.value = []
}

// 播放第三方书源的书籍
async function playThirdPartyBook(book) {
  isLoading.value = true
  searchError.value = ''
  
  try {
    // 找到对应的书源配置
    const source = sourceStore.sources.find(s => s.id === book.sourceId) || currentSourceObject.value
    
    if (!source) {
      throw new Error('找不到对应的书源配置')
    }
    
    // 获取章节列表
    const chaptersData = await getBookChapters(source, book)
    
    if (!chaptersData.chapters.length) {
      throw new Error('该书籍暂无可播放章节')
    }
    
    currentVideo.value = {
      title: book.title,
      cover: book.cover,
      owner: { name: book.author || book.artist || source.name },
      sourceType: 'thirdparty',
      sourceId: book.sourceId,
      bookUrl: book.bookUrl
    }
    
    // 转换为播放列表格式
    currentPlaylist.value = chaptersData.chapters.map(chapter => ({
      title: chapter.title,
      cid: chapter.id,
      sourceType: 'thirdparty',
      chapterUrl: chapter.chapterUrl,
      sourceId: book.sourceId
    }))
    
    currentIndex.value = 0
    
    // 播放第一个
    await loadAndPlayThirdParty(0)
    
    // 添加到播放历史
    sourceStore.addPlayHistory({
      id: book.id,
      type: 'thirdparty',
      title: book.title,
      cover: book.cover,
      author: book.author || book.artist,
      sourceId: book.sourceId,
      bookUrl: book.bookUrl
    })
  } catch (error) {
    console.error('第三方书源播放失败:', error)
    searchError.value = error.message || '播放失败'
  } finally {
    isLoading.value = false
  }
}

// 加载并播放第三方书源的音频
async function loadAndPlayThirdParty(index) {
  if (index < 0 || index >= currentPlaylist.value.length) return
  
  isLoading.value = true
  currentIndex.value = index
  
  try {
    const track = currentPlaylist.value[index]
    
    // 找到对应的书源配置
    const source = sourceStore.sources.find(s => s.id === track.sourceId) || currentSourceObject.value
    
    if (!source) {
      throw new Error('找不到对应的书源配置')
    }
    
    // 获取音频地址
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

// 播放喜马拉雅专辑
async function playXimalayaAlbum(album) {
  isLoading.value = true
  searchError.value = ''
  
  try {
    // 获取专辑章节列表
    const tracksData = await getXimalayaAlbumTracks(album.albumId)
    
    if (!tracksData.tracks.length) {
      throw new Error('该专辑暂无可播放章节')
    }
    
    currentVideo.value = {
      title: album.title,
      cover: album.cover,
      owner: { name: album.author },
      sourceType: 'ximalaya',
      albumId: album.albumId
    }
    
    // 转换为播放列表格式
    currentPlaylist.value = tracksData.tracks.map(track => ({
      title: track.title,
      cid: track.id,
      duration: track.duration,
      sourceType: 'ximalaya',
      trackId: track.id
    }))
    
    currentIndex.value = 0
    
    // 播放第一个
    await loadAndPlayXimalaya(0)
    
    // 添加到播放历史
    sourceStore.addPlayHistory({
      id: album.id,
      type: 'ximalaya',
      albumId: album.albumId,
      title: album.title,
      cover: album.cover,
      author: album.author
    })
  } catch (error) {
    console.error('喜马拉雅播放失败:', error)
    searchError.value = error.message || '播放失败'
  } finally {
    isLoading.value = false
  }
}

// 加载并播放喜马拉雅音频
async function loadAndPlayXimalaya(index) {
  if (index < 0 || index >= currentPlaylist.value.length) return
  
  isLoading.value = true
  currentIndex.value = index
  
  try {
    const track = currentPlaylist.value[index]
    let audioUrl
    
    // 如果已登录喜马拉雅，使用VIP接口获取更好的音质
    if (isXimalayaLoggedIn.value) {
      try {
        audioUrl = await getXimalayaVipPlayUrl(track.trackId)
      } catch (e) {
        console.warn('VIP接口失败，尝试普通接口:', e)
        audioUrl = await getXimalayaPlayUrl(track.trackId)
      }
    } else {
      audioUrl = await getXimalayaPlayUrl(track.trackId)
    }
    
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
    const tip = isXimalayaLoggedIn.value ? '' : '，可尝试登录喜马拉雅VIP'
    searchError.value = (error.message || '播放失败') + tip
  } finally {
    isLoading.value = false
  }
}

// 播放B站视频
async function playVideo(video) {
  isLoading.value = true
  
  try {
    // 获取视频详细信息和分P列表
    const videoInfo = await getVideoInfo(video.bvid)
    const series = await getVideoSeries(video.bvid)
    
    currentVideo.value = videoInfo
    currentPlaylist.value = series.items.map(item => ({
      ...item,
      sourceType: 'bilibili'
    }))
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

// 加载并播放指定索引（根据源类型自动选择）
async function loadAndPlay(index) {
  if (index < 0 || index >= currentPlaylist.value.length) return

  persistProgress(true)
  const track = currentPlaylist.value[index]
  
  // 根据源类型调用不同的播放函数
  if (track.sourceType === 'ximalaya') {
    await loadAndPlayXimalaya(index)
  } else if (track.sourceType === 'thirdparty') {
    await loadAndPlayThirdParty(index)
  } else {
    // 默认B站播放
    await loadAndPlayBilibili(index)
  }
}

// 加载并播放B站音频
async function loadAndPlayBilibili(index) {
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
      restoreProgressForTrack(track)
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
  clearTrackProgress(currentTrack.value)
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
  loadProgressFromStorage()
  // 初始化登录状态
  refreshLoginStatus()
  refreshXimalayaLoginStatus()
})

onUnmounted(() => {
  persistProgress(true)
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
      playsinline
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
            referrerpolicy="no-referrer"
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
      <!-- 源选择器 -->
      <div class="flex gap-2 mb-3 overflow-x-auto pb-1">
        <button 
          v-for="source in sourceStore.enabledSources" 
          :key="source.id"
          @click="switchSource(source)"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
          :class="(currentSourceObject?.id === source.id) || (currentSearchSource === source.type && source.type !== 'thirdparty')
            ? 'bg-nature-500 text-white shadow-md' 
            : 'bg-white text-farm-600 border border-farm-200 hover:border-nature-300'"
        >
          <span>{{ source.icon }}</span>
          {{ source.name }}
        </button>
      </div>

      <!-- 第三方书源提示 -->
      <div 
        v-if="currentSearchSource === 'thirdparty' && currentSourceObject" 
        class="mb-3 px-3 py-2 rounded-lg text-sm bg-purple-50 text-purple-700 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <span>📚</span>
          <span>当前源: {{ currentSourceObject.name }}</span>
        </div>
        <span class="text-xs text-purple-400">{{ currentSourceObject.group || '第三方书源' }}</span>
      </div>

      <!-- 登录提示条 -->
      <div 
        v-if="currentSearchSource === 'ximalaya'" 
        class="mb-3 px-3 py-2 rounded-lg text-sm flex items-center justify-between"
        :class="isXimalayaLoggedIn ? 'bg-orange-50 text-orange-700' : 'bg-farm-100 text-farm-600'"
      >
        <div class="flex items-center gap-2">
          <span v-if="isXimalayaLoggedIn && isXimalayaVip" class="flex items-center gap-1">
            <span class="text-yellow-500">👑</span>
            {{ ximalayaUserInfo?.userName }} (VIP)
          </span>
          <span v-else-if="isXimalayaLoggedIn">
            {{ ximalayaUserInfo?.userName }}
          </span>
          <span v-else>登录喜马拉雅可享受VIP音质</span>
        </div>
        <button 
          @click="showXimalayaLoginModal = true"
          class="px-3 py-1 rounded-lg text-xs font-medium"
          :class="isXimalayaLoggedIn ? 'bg-orange-100 hover:bg-orange-200' : 'bg-orange-500 text-white hover:bg-orange-600'"
        >
          {{ isXimalayaLoggedIn ? '管理' : '登录' }}
        </button>
      </div>
      
      <!-- B站登录提示条 -->
      <div 
        v-if="currentSearchSource === 'bilibili'" 
        class="mb-3 px-3 py-2 rounded-lg text-sm flex items-center justify-between"
        :class="isLoggedIn ? 'bg-pink-50 text-pink-700' : 'bg-farm-100 text-farm-600'"
      >
        <div class="flex items-center gap-2">
          <span v-if="isLoggedIn">
            <img v-if="userInfo?.avatar" :src="userInfo.avatar" referrerpolicy="no-referrer" class="w-5 h-5 rounded-full inline mr-1" />
            {{ userInfo?.userName }}
          </span>
          <span v-else>登录B站可搜索更多内容</span>
        </div>
        <button 
          @click="showLoginModal = true"
          class="px-3 py-1 rounded-lg text-xs font-medium"
          :class="isLoggedIn ? 'bg-pink-100 hover:bg-pink-200' : 'bg-pink-500 text-white hover:bg-pink-600'"
        >
          {{ isLoggedIn ? '管理' : '登录' }}
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="relative mb-4">
        <input 
          v-model="searchQuery"
          @keyup.enter="handleSearch"
          type="text"
          :placeholder="currentSearchSource === 'bilibili' ? '搜索有声书、输入B站链接...' : '搜索有声书、播客...'"
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
            <Globe :size="48" class="mx-auto text-farm-300 mb-4" />
            <p class="text-farm-500 mb-4">搜索B站有声小说、音乐、播客</p>
            <p class="text-xs text-farm-400 mb-4">支持直接粘贴B站视频链接</p>
          </div>
          <div class="text-sm text-farm-500 mb-2">🔥 热门搜索</div>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="keyword in ['有声小说', '单田芳人', '罗翔说书', '白噪音', 'ASMR', '睡前故事']" 
              :key="keyword"
              @click="searchFromHistory(keyword)"
              class="px-3 py-1.5 bg-nature-50 text-nature-600 rounded-full text-sm hover:bg-nature-100 transition-colors"
            >
              {{ keyword }}
            </button>
          </div>
        </div>

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
          v-for="item in searchResults" 
          :key="item.bvid || item.id"
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
            <!-- 源标识 -->
            <span 
              class="absolute bottom-1 left-1 px-1.5 py-0.5 text-xs rounded text-white"
              :class="{
                'bg-pink-500': item.sourceType === 'bilibili',
                'bg-orange-500': item.sourceType === 'ximalaya',
                'bg-green-500': item.sourceType === 'qingting',
                'bg-purple-500': item.sourceType === 'thirdparty'
              }"
            >
              {{ item.sourceType === 'bilibili' ? 'B站' : item.sourceType === 'ximalaya' ? '喜马' : item.sourceType === 'qingting' ? '蜻蜓' : (item.sourceName || '书源') }}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-farm-800 line-clamp-2 text-sm">{{ item.title }}</h3>
            <p class="text-xs text-farm-400 mt-1">
              {{ item.author }}
              <span v-if="item.duration"> · {{ item.duration }}</span>
              <span v-if="item.trackCount"> · {{ item.trackCount }}集</span>
            </p>
            <p v-if="item.category" class="text-xs text-nature-500 mt-0.5">{{ item.category }}</p>
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
            referrerpolicy="no-referrer"
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
      <div class="bg-white w-full max-w-md rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <!-- 头部 -->
        <div class="flex items-center justify-between p-4 border-b border-farm-100">
          <h3 class="font-bold text-farm-800">书源管理</h3>
          <button @click="showSourceManager = false" class="p-2 rounded-full bg-farm-100 text-farm-500">
            <X :size="18" />
          </button>
        </div>
        
        <!-- 标签页导航 -->
        <div class="flex border-b border-farm-100">
          <button 
            @click="sourceManagerTab = 'sources'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="sourceManagerTab === 'sources' ? 'text-nature-600 border-b-2 border-nature-500' : 'text-farm-500'"
          >
            书源列表
          </button>
          <button 
            @click="sourceManagerTab = 'subscriptions'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="sourceManagerTab === 'subscriptions' ? 'text-nature-600 border-b-2 border-nature-500' : 'text-farm-500'"
          >
            订阅管理
          </button>
          <button 
            @click="sourceManagerTab = 'add'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="sourceManagerTab === 'add' ? 'text-nature-600 border-b-2 border-nature-500' : 'text-farm-500'"
          >
            添加书源
          </button>
        </div>
        
        <div class="overflow-y-auto flex-1 p-4">
          <!-- 书源列表标签页 -->
          <template v-if="sourceManagerTab === 'sources'">
            <h4 class="text-sm font-medium text-farm-600 mb-3">已启用的源</h4>
            <div class="space-y-2 mb-6">
              <div 
                v-for="source in sourceStore.enabledSources" 
                :key="source.id"
                class="flex items-center gap-3 p-3 bg-nature-50 rounded-xl border border-nature-100"
              >
                <span class="text-2xl">{{ source.icon || '📚' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-farm-800 text-sm truncate">{{ source.name }}</p>
                  <p class="text-xs text-farm-400 truncate">{{ source.description }}</p>
                </div>
                <button 
                  @click="sourceStore.toggleSource(source.id)"
                  class="p-2 rounded-lg bg-nature-100 text-nature-600 hover:bg-nature-200"
                  title="禁用"
                >
                  ✓
                </button>
              </div>
              <p v-if="!sourceStore.enabledSources.length" class="text-sm text-farm-400 text-center py-4">暂无启用的书源</p>
            </div>

            <h4 class="text-sm font-medium text-farm-600 mb-3">已禁用的源</h4>
            <div class="space-y-2">
              <div 
                v-for="source in disabledSources" 
                :key="source.id"
                class="flex items-center gap-3 p-3 bg-farm-50 rounded-xl opacity-60"
              >
                <span class="text-2xl grayscale">{{ source.icon || '📚' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-farm-600 text-sm truncate">{{ source.name }}</p>
                  <p class="text-xs text-farm-400 truncate">{{ source.description }}</p>
                </div>
                <button 
                  @click="sourceStore.toggleSource(source.id)"
                  class="p-2 rounded-lg bg-farm-200 text-farm-500 hover:bg-nature-100 hover:text-nature-600"
                  title="启用"
                >
                  <Plus :size="16" />
                </button>
              </div>
              <p v-if="!disabledSources.length" class="text-sm text-farm-400 text-center py-4">暂无禁用的书源</p>
            </div>
          </template>

          <!-- 订阅管理标签页 -->
          <template v-if="sourceManagerTab === 'subscriptions'">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-sm font-medium text-farm-600">已订阅 ({{ sourceStore.subscriptions.length }})</h4>
              <button 
                @click="handleRefreshAllSubscriptions"
                class="flex items-center gap-1 px-3 py-1.5 bg-nature-500 text-white text-xs rounded-lg"
              >
                <RefreshCw :size="14" />
                刷新全部
              </button>
            </div>
            
            <div class="space-y-2 mb-6">
              <div 
                v-for="sub in sourceStore.subscriptions" 
                :key="sub.id"
                class="flex items-center gap-3 p-3 bg-farm-50 rounded-xl"
              >
                <Globe :size="20" class="text-farm-400 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-farm-800 text-sm truncate">{{ sub.name }}</p>
                  <p class="text-xs text-farm-400 truncate">{{ sub.url }}</p>
                  <p v-if="sub.lastUpdated" class="text-xs text-farm-300 mt-1">
                    更新: {{ new Date(sub.lastUpdated).toLocaleString() }}
                  </p>
                </div>
                <button 
                  @click="sourceStore.removeSubscription(sub.id)"
                  class="p-2 rounded-lg text-red-400 hover:bg-red-50"
                  title="删除订阅"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <p v-if="!sourceStore.subscriptions.length" class="text-sm text-farm-400 text-center py-4">暂无订阅</p>
            </div>

            <h4 class="text-sm font-medium text-farm-600 mb-3">推荐订阅</h4>
            <div class="space-y-2">
              <div 
                v-for="sub in sourceStore.PRESET_SUBSCRIPTIONS" 
                :key="sub.url"
                class="flex items-center gap-3 p-3 bg-farm-50 rounded-xl"
              >
                <span class="text-xl">{{ sub.icon || '📚' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-farm-800 text-sm truncate">{{ sub.name }}</p>
                  <p class="text-xs text-farm-400 truncate">{{ sub.description }}</p>
                </div>
                <button 
                  @click="sourceStore.addSubscription(sub.url, sub.name)"
                  class="px-3 py-1.5 bg-nature-500 text-white text-xs rounded-lg whitespace-nowrap"
                >
                  添加
                </button>
              </div>
            </div>
          </template>

          <!-- 添加书源标签页 -->
          <template v-if="sourceManagerTab === 'add'">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-farm-700 mb-2">书源名称（可选）</label>
                <input 
                  v-model="customSourceName"
                  type="text"
                  placeholder="自定义书源"
                  class="w-full px-4 py-3 rounded-xl border border-farm-200 focus:border-nature-400 focus:ring-2 focus:ring-nature-100 outline-none text-sm"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-farm-700 mb-2">书源URL</label>
                <input 
                  v-model="customSourceUrl"
                  type="url"
                  placeholder="https://example.com/sources.json"
                  class="w-full px-4 py-3 rounded-xl border border-farm-200 focus:border-nature-400 focus:ring-2 focus:ring-nature-100 outline-none text-sm"
                />
              </div>
              
              <!-- 错误/成功提示 -->
              <p v-if="addSourceError" class="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{{ addSourceError }}</p>
              <p v-if="addSourceSuccess" class="text-sm text-nature-600 bg-nature-50 px-3 py-2 rounded-lg">{{ addSourceSuccess }}</p>
              
              <button 
                @click="handleAddSource"
                :disabled="isAddingSource"
                class="w-full py-3 bg-nature-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus :size="18" />
                {{ isAddingSource ? '添加中...' : '添加书源' }}
              </button>
              
              <div class="mt-6 p-4 bg-farm-50 rounded-xl">
                <h5 class="text-sm font-medium text-farm-700 mb-2">💡 书源获取方式</h5>
                <ul class="text-xs text-farm-500 space-y-1">
                  <li>• 在上方"订阅管理"中添加推荐订阅</li>
                  <li>• 从网上搜索"我的听书书源"获取更多源</li>
                  <li>• 书源URL通常为 .json 格式文件</li>
                  <li>• 部分源可能需要科学上网才能访问</li>
                </ul>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- B站登录弹窗 -->
    <BilibiliLogin 
      v-if="showLoginModal"
      @close="showLoginModal = false"
      @login-success="onLoginSuccess"
    />

    <!-- 喜马拉雅登录弹窗 -->
    <XimalayaLogin 
      v-if="showXimalayaLoginModal"
      @close="showXimalayaLoginModal = false"
      @login-success="onXimalayaLoginSuccess"
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
