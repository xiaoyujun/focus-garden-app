import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  // 当前播放列表
  const playlist = ref([])
  // 当前播放索引
  const currentIndex = ref(0)
  // 播放状态
  const isPlaying = ref(false)
  // 当前播放进度（秒）
  const currentTime = ref(0)
  // 当前音频总时长
  const duration = ref(0)

  // 当前播放的音频
  const currentTrack = computed(() => {
    if (playlist.value.length === 0) return null
    return playlist.value[currentIndex.value] || null
  })

  // 进度百分比
  const progressPercent = computed(() => {
    if (duration.value === 0) return 0
    return (currentTime.value / duration.value) * 100
  })

  // 格式化时间
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const currentTimeFormatted = computed(() => formatTime(currentTime.value))
  const durationFormatted = computed(() => formatTime(duration.value))

  // 设置播放列表
  function setPlaylist(files) {
    playlist.value = files.map((file, index) => ({
      id: index,
      name: file.name,
      file: file,
      url: URL.createObjectURL(file)
    }))
    currentIndex.value = 0
  }

  // 播放指定索引
  function playAt(index) {
    if (index >= 0 && index < playlist.value.length) {
      currentIndex.value = index
      isPlaying.value = true
    }
  }

  // 下一首
  function next() {
    if (currentIndex.value < playlist.value.length - 1) {
      currentIndex.value++
      isPlaying.value = true
    }
  }

  // 上一首
  function prev() {
    if (currentIndex.value > 0) {
      currentIndex.value--
      isPlaying.value = true
    }
  }

  // 切换播放/暂停
  function togglePlay() {
    isPlaying.value = !isPlaying.value
  }

  // 清空播放列表
  function clearPlaylist() {
    // 释放 URL
    playlist.value.forEach(track => {
      if (track.url) URL.revokeObjectURL(track.url)
    })
    playlist.value = []
    currentIndex.value = 0
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
  }

  return {
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    currentTrack,
    progressPercent,
    currentTimeFormatted,
    durationFormatted,
    setPlaylist,
    playAt,
    next,
    prev,
    togglePlay,
    clearPlaylist
  }
})
