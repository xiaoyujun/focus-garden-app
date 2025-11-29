import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'
import { FilePicker } from '@capawesome/capacitor-file-picker'

const AUDIO_STORAGE_KEY = 'audiobook-player-data'
const AUDIO_NATIVE_CACHE_LIMIT = 500 // 避免本地缓存过大
const LAST_PLAYED_KEY = 'audiobook-last-played' // 记录最后播放的文件名

// 检测运行平台
const isNative = Capacitor.isNativePlatform()

export const useAudioStore = defineStore('audio', () => {
  // ===== 状态 =====
  const playlist = ref([])           // 播放列表
  const currentIndex = ref(-1)       // 当前播放索引
  const isPlaying = ref(false)       // 是否正在播放
  const currentTime = ref(0)         // 当前播放时间（秒）
  const duration = ref(0)            // 当前音频总时长
  const volume = ref(1)              // 音量 (0-1)
  const playbackRate = ref(1)        // 播放速度
  const playMode = ref('sequence')   // 播放模式: sequence顺序, single单曲循环, shuffle随机
  const directoryName = ref('')      // 当前目录名称
  const directoryHandle = ref(null)  // 目录句柄（Web 端）
  const directoryPath = ref('')      // 目录路径（移动端）
  const nativePlaylistCache = ref([]) // 移动端缓存的文件列表（仅保存必要信息）
  
  // 播放进度记忆（每个文件的播放位置）
  const progressMemory = ref({})     // { fileName: { time: 秒, updatedAt: ISO } }
  const errorMessage = ref('')       // 最近的错误提示
  const errorVisible = ref(false)    // 是否展示错误弹窗

  // ===== 计算属性 =====
  const currentTrack = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < playlist.value.length) {
      return playlist.value[currentIndex.value]
    }
    return null
  })

  const hasPlaylist = computed(() => playlist.value.length > 0)
  
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
  const hasSavedDirectory = ref(false)  // 是否有已保存的目录
  const isRestoring = ref(false)        // 是否正在恢复

  function loadFromStorage() {
    try {
      const data = localStorage.getItem(AUDIO_STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        volume.value = parsed.volume ?? 1
        playbackRate.value = parsed.playbackRate ?? 1
        playMode.value = parsed.playMode ?? 'sequence'
        progressMemory.value = parsed.progressMemory ?? {}
        directoryName.value = parsed.directoryName ?? ''
        currentIndex.value = parsed.lastIndex ?? -1
        nativePlaylistCache.value = parsed.nativePlaylistCache ?? []
        
        // 检查是否有保存的目录
        if (parsed.directoryName || nativePlaylistCache.value.length > 0) {
          hasSavedDirectory.value = true
        }
      }
    } catch (e) {
      console.error('加载音频设置失败:', e)
    }
  }

  function saveToStorage() {
    try {
      const data = {
        volume: volume.value,
      playbackRate: playbackRate.value,
      playMode: playMode.value,
      progressMemory: progressMemory.value,
      directoryName: directoryName.value,
      lastIndex: currentIndex.value,
      nativePlaylistCache: nativePlaylistCache.value
    }
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('保存音频设置失败:', e)
    }
  }

  // 监听变化自动保存
  watch([volume, playbackRate, playMode, progressMemory, directoryName, currentIndex, nativePlaylistCache], saveToStorage, { deep: true })

  // ===== IndexedDB 存储目录句柄（Web 端） =====
  const DB_NAME = 'audiobook-db'
  const STORE_NAME = 'directory-handle'

  async function saveDirectoryHandle(handle) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = (e) => {
        const db = e.target.result
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.put(handle, 'handle')
        tx.oncomplete = () => {
          hasSavedDirectory.value = true
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
  }

  async function getSavedDirectoryHandle() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = (e) => {
        const db = e.target.result
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const getRequest = store.get('handle')
        getRequest.onsuccess = () => resolve(getRequest.result)
        getRequest.onerror = () => reject(getRequest.error)
      }
    })
  }

  async function clearSavedDirectory() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = (e) => {
        const db = e.target.result
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.delete('handle')
        tx.oncomplete = () => {
          hasSavedDirectory.value = false
          resolve()
        }
      }
    })
  }

  // 恢复上次的目录（Web 端）
  async function restoreLastDirectory() {
    if (isRestoring.value) return { success: false }
    if (isNative) {
      return await restoreLastDirectoryNative()
    }
    
    isRestoring.value = true
    try {
      const handle = await getSavedDirectoryHandle()
      if (!handle) {
        return { success: false, error: '没有保存的目录' }
      }

      // 请求权限
      const permission = await handle.requestPermission({ mode: 'read' })
      if (permission !== 'granted') {
        return { success: false, error: '权限被拒绝，请重新选择目录' }
      }

      directoryHandle.value = handle
      directoryName.value = handle.name

      // 读取音频文件
      const audioFiles = []
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const name = entry.name.toLowerCase()
          if (supportedFormats.some(ext => name.endsWith(ext))) {
            audioFiles.push({
              name: entry.name,
              handle: entry,
              url: null,
              isNative: false
            })
          }
        }
      }

      audioFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
      playlist.value = audioFiles

      // 恢复上次播放的文件索引
      if (audioFiles.length > 0 && currentIndex.value < 0) {
        restoreLastPlayed(audioFiles)
      }

      return { success: true, count: audioFiles.length }
    } catch (e) {
      console.error('恢复目录失败:', e)
      notifyError(`恢复目录失败：${e.message || e}`)
      return { success: false, error: e.message }
    } finally {
      isRestoring.value = false
    }
  }

  // 恢复上次的目录（移动端）
  async function restoreLastDirectoryNative() {
    isRestoring.value = true
    try {
      if (!nativePlaylistCache.value.length) {
        notifyError('没有可恢复的音频记录，请重新选择目录')
        return { success: false, error: 'no-native-cache' }
      }

      const audioFiles = nativePlaylistCache.value
        .slice(0, AUDIO_NATIVE_CACHE_LIMIT)
        .map(file => {
          if (!file?.name || !file?.path) return null
          return {
            name: file.name,
            path: file.path,
            url: Capacitor.convertFileSrc(file.path),
            isNative: true
          }
        })
        .filter(Boolean)

      if (!audioFiles.length) {
        notifyError('缓存的音频已失效，请重新选择目录')
        return { success: false, error: 'empty-native-list' }
      }

      // 尝试验证文件可读性，不阻塞整体恢复
      const verifiedFiles = []
      for (const item of audioFiles) {
        try {
          await Filesystem.stat({ path: item.path })
          verifiedFiles.push(item)
        } catch (err) {
          console.warn('文件不可用，已跳过:', item.name, err)
        }
      }

      const finalList = verifiedFiles.length ? verifiedFiles : audioFiles
      finalList.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
      playlist.value = finalList
      hasSavedDirectory.value = true

      if (finalList.length && !directoryName.value) {
        const parts = finalList[0].path.split('/')
        directoryName.value = parts[parts.length - 2] || '已保存的音频'
      }
      if (finalList.length) {
        directoryPath.value = finalList[0].path.split('/').slice(0, -1).join('/') || directoryPath.value
      }

      restoreLastPlayed(finalList)

      return { success: true, count: finalList.length }
    } catch (e) {
      console.error('移动端恢复目录失败:', e)
      notifyError(`恢复上次播放失败：${e.message || e}`)
      return { success: false, error: e.message }
    } finally {
      isRestoring.value = false
    }
  }

  // ===== 目录和文件操作 =====
  
  // 支持的音频格式
  const supportedFormats = ['.mp3', '.m4a', '.m4b', '.aac', '.ogg', '.wav', '.flac', '.wma', '.opus']

  // 选择目录 - 根据平台自动选择方式
  async function selectDirectory() {
    if (isNative) {
      return await selectDirectoryNative()
    } else {
      return await selectDirectoryWeb()
    }
  }

  // Web 端选择目录（File System Access API）
  async function selectDirectoryWeb() {
    try {
      const handle = await window.showDirectoryPicker({
        mode: 'read'
      })
      
      directoryHandle.value = handle
      directoryName.value = handle.name
      
      const audioFiles = []
      
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const name = entry.name.toLowerCase()
          if (supportedFormats.some(ext => name.endsWith(ext))) {
            audioFiles.push({
              name: entry.name,
              handle: entry,
              url: null,
              isNative: false
            })
          }
        }
      }
      
      audioFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
      playlist.value = audioFiles
      restoreLastPlayed(audioFiles)
      
      // 保存目录句柄供下次使用
      await saveDirectoryHandle(handle)
      
      return { success: true, count: audioFiles.length }
    } catch (e) {
      if (e.name === 'AbortError') {
        return { success: false, error: '用户取消选择' }
      }
      console.error('选择目录失败:', e)
      return { success: false, error: e.message }
    }
  }

  // 移动端选择目录（Capacitor FilePicker）
  async function selectDirectoryNative() {
    try {
      // 选择多个音频文件（因为 Android 不支持直接选择目录）
      const result = await FilePicker.pickFiles({
        multiple: true,
        readData: false,
        types: ['audio/*']
      })
      
      if (!result.files || result.files.length === 0) {
        return { success: false, error: '未选择文件' }
      }

      const audioFiles = result.files
        .filter(file => {
          const name = file.name.toLowerCase()
          return supportedFormats.some(ext => name.endsWith(ext))
        })
        .map(file => ({
          name: file.name,
          path: file.path,
          url: Capacitor.convertFileSrc(file.path),
          isNative: true
        }))

      audioFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
      
      // 从第一个文件路径提取目录名
      if (audioFiles.length > 0) {
        const firstPath = audioFiles[0].path
        const parts = firstPath.split('/')
        directoryName.value = parts[parts.length - 2] || '已选择的音频'
        directoryPath.value = parts.slice(0, -1).join('/') || ''
      }
      
      playlist.value = audioFiles
      nativePlaylistCache.value = audioFiles
        .slice(0, AUDIO_NATIVE_CACHE_LIMIT)
        .map(file => ({ name: file.name, path: file.path }))
      hasSavedDirectory.value = true
      restoreLastPlayed(audioFiles)
      
      return { success: true, count: audioFiles.length }
    } catch (e) {
      console.error('选择文件失败:', e)
      notifyError(`选择音频失败：${e.message || e}`)
      return { success: false, error: e.message }
    }
  }

  // ===== 播放控制 =====
  
  function setCurrentIndex(index) {
    if (index >= 0 && index < playlist.value.length) {
      currentIndex.value = index
      currentTime.value = 0
    }
  }

  function playNext() {
    if (playlist.value.length === 0) return
    
    if (playMode.value === 'shuffle') {
      // 随机播放
      let newIndex = Math.floor(Math.random() * playlist.value.length)
      if (newIndex === currentIndex.value && playlist.value.length > 1) {
        newIndex = (newIndex + 1) % playlist.value.length
      }
      currentIndex.value = newIndex
    } else {
      // 顺序播放
      if (currentIndex.value < playlist.value.length - 1) {
        currentIndex.value++
      } else {
        currentIndex.value = 0 // 循环到开头
      }
    }
    currentTime.value = 0
  }

  function playPrevious() {
    if (playlist.value.length === 0) return
    
    if (playMode.value === 'shuffle') {
      let newIndex = Math.floor(Math.random() * playlist.value.length)
      if (newIndex === currentIndex.value && playlist.value.length > 1) {
        newIndex = (newIndex + 1) % playlist.value.length
      }
      currentIndex.value = newIndex
    } else {
      if (currentIndex.value > 0) {
        currentIndex.value--
      } else {
        currentIndex.value = playlist.value.length - 1
      }
    }
    currentTime.value = 0
  }

  function togglePlayMode() {
    const modes = ['sequence', 'single', 'shuffle']
    const currentModeIndex = modes.indexOf(playMode.value)
    playMode.value = modes[(currentModeIndex + 1) % modes.length]
  }

  // ===== 进度记忆相关 =====
  
  // 恢复上次播放位置
  function restoreLastPlayed(audioFiles) {
    if (audioFiles.length === 0) return
    
    // 优先找最后播放的文件
    const lastPlayedName = localStorage.getItem(LAST_PLAYED_KEY)
    if (lastPlayedName) {
      const idx = audioFiles.findIndex(f => f.name === lastPlayedName)
      if (idx >= 0) {
        currentIndex.value = idx
        return
      }
    }
    // 否则找有播放记录的文件（按更新时间排序）
    let lastPlayedIndex = 0
    let latestTime = 0
    for (let i = 0; i < audioFiles.length; i++) {
      const memory = progressMemory.value[audioFiles[i].name]
      if (memory && memory.updatedAt) {
        const t = new Date(memory.updatedAt).getTime()
        if (t > latestTime) {
          latestTime = t
          lastPlayedIndex = i
        }
      }
    }
    currentIndex.value = lastPlayedIndex
  }

  // 保存最后播放的文件名
  function saveLastPlayed() {
    const track = currentTrack.value
    if (track) {
      localStorage.setItem(LAST_PLAYED_KEY, track.name)
    }
  }

  // 记忆播放进度
  function saveProgress() {
    const track = currentTrack.value
    if (track && currentTime.value > 0) {
      progressMemory.value[track.name] = {
        time: currentTime.value,
        updatedAt: new Date().toISOString()
      }
      saveLastPlayed()
    }
  }

  // 获取保存的进度
  function getSavedProgress(fileName) {
    const memory = progressMemory.value[fileName]
    return memory ? memory.time : 0
  }

  // 获取当前曲目的URL
  async function getCurrentTrackUrl() {
    const track = currentTrack.value
    if (!track) return null
    
    // 移动端已经有URL
    if (track.isNative && track.url) {
      return track.url
    }
    
    // Web端需要从handle获取
    if (track.handle) {
      try {
        const file = await track.handle.getFile()
        // 释放旧URL
        if (track.url) {
          URL.revokeObjectURL(track.url)
        }
        track.url = URL.createObjectURL(file)
        return track.url
      } catch (e) {
        console.error('获取文件失败:', e)
        return null
      }
    }
    
    return track.url || null
  }

  // 清除播放列表
  function clearPlaylist() {
    // 释放所有 blob URLs
    playlist.value.forEach(track => {
      if (track.url) {
        URL.revokeObjectURL(track.url)
      }
    })
    playlist.value = []
    currentIndex.value = -1
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    directoryHandle.value = null
    directoryName.value = ''
    directoryPath.value = ''
    nativePlaylistCache.value = []
    hasSavedDirectory.value = false
  }

  // 快进/快退
  function seek(seconds) {
    const newTime = currentTime.value + seconds
    currentTime.value = Math.max(0, Math.min(newTime, duration.value))
  }

  // 跳转到指定时间
  function seekTo(time) {
    currentTime.value = Math.max(0, Math.min(time, duration.value))
  }

  // 设置音量
  function setVolume(v) {
    volume.value = Math.max(0, Math.min(1, v))
  }

  // 设置播放速度
  function setPlaybackRate(rate) {
    playbackRate.value = rate
  }

  // 播放速度选项
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

  // 循环切换播放速度
  function cyclePlaybackRate() {
    const currentRateIndex = playbackRates.indexOf(playbackRate.value)
    if (currentRateIndex === -1) {
      playbackRate.value = 1
    } else {
      playbackRate.value = playbackRates[(currentRateIndex + 1) % playbackRates.length]
    }
  }

  // 错误提示控制
  function notifyError(message) {
    errorMessage.value = message || '发生未知错误'
    errorVisible.value = true
  }

  function clearError() {
    errorMessage.value = ''
    errorVisible.value = false
  }

  // 初始化
  loadFromStorage()

  return {
    // 状态
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackRate,
    playMode,
    directoryName,
    directoryPath,
    progressMemory,
    hasSavedDirectory,
    isRestoring,
    nativePlaylistCache,
    errorMessage,
    errorVisible,
    
    // 计算属性
    currentTrack,
    hasPlaylist,
    progress,
    formattedCurrentTime,
    formattedDuration,
    
    // 常量
    playbackRates,
    supportedFormats,
    
    // 方法
    selectDirectory,
    restoreLastDirectory,
    clearSavedDirectory,
    getCurrentTrackUrl,
    setCurrentIndex,
    playNext,
    playPrevious,
    togglePlayMode,
    saveProgress,
    getSavedProgress,
    clearPlaylist,
    seek,
    seekTo,
    setVolume,
    setPlaybackRate,
    cyclePlaybackRate,
    formatTime,
    notifyError,
    clearError
  }
})
