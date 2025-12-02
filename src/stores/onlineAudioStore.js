/**
 * B站在线音频全局播放状态管理
 * 实现跨页面播放、后台播放
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { Capacitor } from '@capacitor/core'

const STORAGE_KEY = 'bilibili-player-state'
const PROGRESS_STORAGE_KEY = 'bilibili-audio-progress'
const PROGRESS_SAVE_INTERVAL = 5000
const isNative = Capacitor.isNativePlatform()
let preferencesPromise = null
const DEFAULT_PARSE_MODE = 'official'

export const useOnlineAudioStore = defineStore('onlineAudio', () => {
  // ===== 核心状态 =====
  const audioElement = ref(null)        // 全局 audio 元素引用
  const currentVideo = ref(null)        // 当前视频信息
  const currentPlaylist = ref([])       // 当前播放列表
  const currentIndex = ref(-1)          // 当前播放索引
  const isPlaying = ref(false)          // 是否正在播放
  const isLoading = ref(false)          // 是否正在加载
  const currentTime = ref(0)            // 当前播放时间
  const duration = ref(0)               // 总时长
  const volume = ref(1)                 // 音量
  const playbackRate = ref(1)           // 播放速度
  const error = ref('')                 // 错误信息
  const parseMode = ref(DEFAULT_PARSE_MODE) // 解析模式：official | official-hosted | compat
  const videoMode = ref(false)          // 视频模式：开启后使用官方播放器展示画面
  
  // 进度记忆
  const progressMap = ref({})
  let lastProgressSave = 0

  // ===== 计算属性 =====
  const currentTrack = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < currentPlaylist.value.length) {
      return currentPlaylist.value[currentIndex.value]
    }
    return null
  })

  const hasTrack = computed(() => currentTrack.value !== null)

  const progress = computed(() => {
    if (duration.value === 0) return 0
    return (currentTime.value / duration.value) * 100
  })

  // 格式化时间
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

  const formattedCurrentTime = computed(() => formatTime(currentTime.value))
  const formattedDuration = computed(() => formatTime(duration.value))

  // ===== 本地存储 =====
  async function getPreferences() {
    if (!isNative) return null
    if (!preferencesPromise) {
      preferencesPromise = import('@capacitor/preferences').then(m => m.Preferences)
    }
    return preferencesPromise
  }

  async function loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        volume.value = parsed.volume ?? 1
        playbackRate.value = parsed.playbackRate ?? 1
        parseMode.value = parsed.parseMode || DEFAULT_PARSE_MODE
        videoMode.value = parsed.videoMode || false
        // 恢复播放状态（但不自动播放）
        if (parsed.currentVideo) {
          currentVideo.value = parsed.currentVideo
          currentPlaylist.value = parsed.currentPlaylist || []
          currentIndex.value = parsed.currentIndex ?? -1
        }
      }
      
      const progressData = localStorage.getItem(PROGRESS_STORAGE_KEY)
      if (progressData) {
        progressMap.value = JSON.parse(progressData)
      }
    } catch (e) {
      console.error('加载B站播放状态失败:', e)
    }

    // 原生端补充从 Preferences 读取，避免 WebView 重建后进度丢失
    if (isNative) {
      try {
        const prefs = await getPreferences()
        if (prefs) {
          const [stateRes, progressRes] = await Promise.all([
            prefs.get({ key: STORAGE_KEY }),
            prefs.get({ key: PROGRESS_STORAGE_KEY })
          ])
          if (stateRes?.value) {
            const parsed = JSON.parse(stateRes.value)
            volume.value = parsed.volume ?? volume.value
            playbackRate.value = parsed.playbackRate ?? playbackRate.value
            parseMode.value = parsed.parseMode || parseMode.value
            videoMode.value = parsed.videoMode || videoMode.value
            if (parsed.currentVideo) {
              currentVideo.value = parsed.currentVideo
              currentPlaylist.value = parsed.currentPlaylist || []
              currentIndex.value = parsed.currentIndex ?? currentIndex.value
            }
          }
          if (progressRes?.value) {
            progressMap.value = JSON.parse(progressRes.value)
          }
        }
      } catch (e) {
        console.warn('原生端读取播放状态失败:', e)
      }
    }
  }

  function persistToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error(`保存 ${key} 到本地存储失败:`, e)
    }
    if (isNative) {
      getPreferences()
        .then(prefs => prefs?.set({ key, value: JSON.stringify(value) }))
        .catch(e => console.warn(`保存 ${key} 到原生存储失败:`, e))
    }
  }

  function saveToStorage() {
    const data = {
      volume: volume.value,
      playbackRate: playbackRate.value,
      parseMode: parseMode.value,
      videoMode: videoMode.value,
      currentVideo: currentVideo.value,
      currentPlaylist: currentPlaylist.value,
      currentIndex: currentIndex.value
    }
    persistToStorage(STORAGE_KEY, data)
  }

  function saveProgressToStorage() {
    persistToStorage(PROGRESS_STORAGE_KEY, progressMap.value)
  }

  // 监听变化自动保存
  watch([volume, playbackRate, parseMode, videoMode, currentVideo, currentPlaylist, currentIndex], saveToStorage, { deep: true })

  // ===== 进度记忆 =====
  /**
   * 生成 track 的唯一标识 key
   * 必须同时使用 bvid 和 cid 确保不同视频的进度完全隔离
   */
  function getTrackKey(track) {
    if (!track) return ''
    // 优先使用 track 自身的 bvid，不要使用 currentVideo 作为回退
    // 避免切换视频时因 currentVideo 已更新导致 key 错误
    const bvid = track.bvid
    const cid = track.cid
    // 必须同时有 bvid 和 cid 才能生成有效 key
    if (!bvid || !cid) {
      console.warn('getTrackKey: 缺少 bvid 或 cid', { bvid, cid, track })
      return ''
    }
    return `bilibili:${bvid}:${cid}`
  }

  function saveProgress(force = false) {
    const track = currentTrack.value
    if (!track || !audioElement.value) return
    
    const now = Date.now()
    if (!force && now - lastProgressSave < PROGRESS_SAVE_INTERVAL) return
    
    const key = getTrackKey(track)
    if (!key) return
    
    progressMap.value[key] = {
      position: Math.floor(audioElement.value.currentTime || 0),
      duration: Math.floor(audioElement.value.duration || duration.value || 0),
      updatedAt: new Date().toISOString(),
      title: track.title
    }
    lastProgressSave = now
    saveProgressToStorage()
  }

  function getSavedProgress(track) {
    const key = getTrackKey(track)
    // 如果无法生成有效 key，返回 0 而不是查找空字符串
    if (!key) return 0
    return progressMap.value[key]?.position || 0
  }

  function clearTrackProgress(track) {
    const key = getTrackKey(track)
    if (key && progressMap.value[key]) {
      delete progressMap.value[key]
      saveProgressToStorage()
    }
  }

  // ===== 播放控制 =====
  
  // 设置 audio 元素引用
  function setAudioElement(el) {
    audioElement.value = el
    if (el) {
      el.volume = volume.value
      el.playbackRate = playbackRate.value
    }
  }

  // 设置视频和播放列表
  function setPlaylist(video, playlist, index = 0) {
    // 先重置 index 为 -1，确保后续设置 index 时 watch 能被触发
    // （解决从 0 变到 0 时 watch 不触发的问题）
    currentIndex.value = -1
    currentVideo.value = video
    currentPlaylist.value = playlist
    // 使用 nextTick 或 setTimeout 确保状态更新后再设置 index
    setTimeout(() => {
      currentIndex.value = index
    }, 0)
  }

  // 播放/暂停
  function togglePlay() {
    if (videoMode.value) return
    if (!audioElement.value) return
    
    if (isPlaying.value) {
      audioElement.value.pause()
      isPlaying.value = false
    } else {
      audioElement.value.play().then(() => {
        isPlaying.value = true
      }).catch(e => {
        console.error('播放失败:', e)
      })
    }
  }

  function play() {
    if (videoMode.value) return
    if (!audioElement.value) return
    audioElement.value.play().then(() => {
      isPlaying.value = true
    }).catch(e => {
      if (e.name !== 'AbortError') {
        console.error('播放失败:', e)
      }
    })
  }

  function pause() {
    if (videoMode.value) return
    if (!audioElement.value) return
    audioElement.value.pause()
    isPlaying.value = false
  }

  // 上一曲/下一曲
  function previousTrack() {
    if (currentIndex.value > 0) {
      currentIndex.value--
    }
  }

  function nextTrack() {
    if (currentIndex.value < currentPlaylist.value.length - 1) {
      currentIndex.value++
    }
  }

  // 快进/快退
  function seek(seconds) {
    if (!audioElement.value) return
    audioElement.value.currentTime = Math.max(0, Math.min(
      audioElement.value.currentTime + seconds,
      duration.value
    ))
  }

  function seekTo(time) {
    if (!audioElement.value) return
    audioElement.value.currentTime = Math.max(0, Math.min(time, duration.value))
  }

  // 设置音量
  function setVolume(v) {
    volume.value = Math.max(0, Math.min(1, v))
    if (audioElement.value) {
      audioElement.value.volume = volume.value
    }
  }

  // 设置播放速度
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
  
  function setPlaybackRate(rate) {
    playbackRate.value = rate
    if (audioElement.value) {
      audioElement.value.playbackRate = rate
    }
  }

  function cyclePlaybackRate() {
    const idx = playbackRates.indexOf(playbackRate.value)
    const newRate = playbackRates[(idx + 1) % playbackRates.length]
    setPlaybackRate(newRate)
  }

  // 设置解析模式
  function setParseMode(mode) {
    parseMode.value = mode || DEFAULT_PARSE_MODE
  }
  function setVideoMode(enabled) {
    videoMode.value = !!enabled
  }

  // 强制重新加载当前曲目（用于解析模式切换等场景）
  function reloadCurrentTrack() {
    const idx = currentIndex.value
    if (idx < 0 || !currentPlaylist.value.length) return
    const listCopy = [...currentPlaylist.value]
    currentIndex.value = -1
    setTimeout(() => {
      currentPlaylist.value = listCopy
      currentIndex.value = Math.min(idx, currentPlaylist.value.length - 1)
    }, 0)
  }

  // 更新 Media Session（系统媒体控制）
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return
    
    const track = currentTrack.value
    if (!track) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || '未知标题',
      artist: currentVideo.value?.owner?.name || 'B站',
      album: currentVideo.value?.title || '',
      artwork: currentVideo.value?.cover ? [
        { src: currentVideo.value.cover, sizes: '512x512', type: 'image/jpeg' }
      ] : []
    })

    navigator.mediaSession.setActionHandler('play', () => play())
    navigator.mediaSession.setActionHandler('pause', () => pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => previousTrack())
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
    navigator.mediaSession.setActionHandler('seekbackward', () => seek(-15))
    navigator.mediaSession.setActionHandler('seekforward', () => seek(15))
  }

  // 清除播放
  function clearPlayback(shouldSave = true) {
    if (shouldSave) {
      saveProgress(true)
    }
    if (audioElement.value) {
      audioElement.value.pause()
      audioElement.value.removeAttribute('src')
      audioElement.value.load()
    }
    currentVideo.value = null
    currentPlaylist.value = []
    currentIndex.value = -1
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
    error.value = ''
  }

  function clearCache() {
    try {
      clearPlayback(false)
      progressMap.value = {}
      lastProgressSave = 0
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PROGRESS_STORAGE_KEY)
    } catch (e) {
      console.error('清空音频缓存失败:', e)
    }
  }

  // 应用生命周期监听，后台时强制落盘
  function setupLifecycleListeners() {
    // 浏览器/小程序端在关闭或切后台前强制持久化，避免大退后进度丢失
    if (typeof window !== 'undefined') {
      const handleUnload = () => {
        saveProgress(true)
        saveToStorage()
      }
      window.addEventListener('pagehide', handleUnload)
      window.addEventListener('beforeunload', handleUnload)
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          saveProgress(true)
          saveToStorage()
        }
      })
    }

    if (isNative) {
      import('@capacitor/app')
        .then(({ App }) => {
          App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) {
              saveProgress(true)
              saveToStorage()
            }
          })
        })
        .catch(e => console.warn('注册原生生命周期监听失败:', e))
    }
  }

  // 初始化
  setupLifecycleListeners()
  loadFromStorage()

  return {
    // 状态
    audioElement,
    currentVideo,
    currentPlaylist,
    currentIndex,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    playbackRate,
    error,
    progressMap,
    parseMode,
    videoMode,
    
    // 计算属性
    currentTrack,
    hasTrack,
    progress,
    formattedCurrentTime,
    formattedDuration,
    
    // 常量
    playbackRates,
    
    // 方法
    setAudioElement,
    setPlaylist,
    togglePlay,
    play,
    pause,
    previousTrack,
    nextTrack,
    seek,
    seekTo,
    setVolume,
    setPlaybackRate,
    cyclePlaybackRate,
    setParseMode,
    setVideoMode,
    saveProgress,
    getSavedProgress,
    clearTrackProgress,
    updateMediaSession,
    reloadCurrentTrack,
    clearPlayback,
    clearCache,
    formatTime
  }
})
