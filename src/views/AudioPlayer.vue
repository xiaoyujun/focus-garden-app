<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'AudioPlayer' })
import { useAudioStore } from '../stores/audioStore'
import { 
  FolderOpen, Play, Pause, SkipBack, SkipForward, 
  Volume2, VolumeX, Repeat, Repeat1, Shuffle, 
  List, ChevronLeft, ChevronRight, Gauge, Clock,
  RotateCcw, RotateCw, X, Music2, Headphones, Download
} from 'lucide-vue-next'

const router = useRouter()
import AudioErrorDialog from '../components/AudioErrorDialog.vue'

const store = useAudioStore()

// 音频元素引用
const audioRef = ref(null)
const showPlaylist = ref(false)
const isLoading = ref(false)
const isAutoRestoring = ref(false) // 自动恢复中

// 进度条拖动
const isDragging = ref(false)
const dragProgress = ref(0)

// 计算当前显示的进度
const displayProgress = computed(() => {
  return isDragging.value ? dragProgress.value : store.progress
})

// 播放模式图标和文字
const playModeConfig = computed(() => {
  const modes = {
    sequence: { icon: Repeat, text: '顺序播放', class: 'text-farm-400' },
    single: { icon: Repeat1, text: '单曲循环', class: 'text-nature-500' },
    shuffle: { icon: Shuffle, text: '随机播放', class: 'text-amber-500' }
  }
  return modes[store.playMode] || modes.sequence
})

// 加载并播放当前曲目
async function loadCurrentTrack() {
  if (!store.currentTrack || !audioRef.value) return
  
  isLoading.value = true
  
  try {
    const url = await store.getCurrentTrackUrl()
    if (url) {
      audioRef.value.src = url
      audioRef.value.volume = store.volume
      audioRef.value.playbackRate = store.playbackRate
      
      // 恢复播放进度
      const savedTime = store.getSavedProgress(store.currentTrack.name)
      if (savedTime > 0) {
        audioRef.value.currentTime = savedTime
      }
      
      // 如果之前在播放，继续播放
      if (store.isPlaying) {
        await audioRef.value.play()
      }
    }
  } catch (e) {
    console.error('加载音频失败:', e)
    store.notifyError(`加载音频失败：${e.message || e}`)
  } finally {
    isLoading.value = false
  }
}

// 播放/暂停
async function togglePlay() {
  // 如果没有播放列表但有保存的目录，先恢复
  if (!store.hasPlaylist && store.hasSavedDirectory) {
    await handleRestoreAndPlay()
    return
  }
  
  if (!audioRef.value || !store.currentTrack) return
  
  // 如果音频没有加载，先加载
  if (!audioRef.value.src) {
    await loadCurrentTrack()
  }
  
  if (store.isPlaying) {
    audioRef.value.pause()
    store.isPlaying = false
    store.saveProgress()
  } else {
    try {
      await audioRef.value.play()
      store.isPlaying = true
    } catch (e) {
      console.error('播放失败:', e)
      // 尝试重新加载
      await loadCurrentTrack()
      try {
        await audioRef.value.play()
        store.isPlaying = true
      } catch (err) {
        store.notifyError(`播放失败：${err.message || err}`)
      }
    }
  }
}

// 恢复并播放
async function handleRestoreAndPlay() {
  isLoading.value = true
  const result = await store.restoreLastDirectory()
  if (result.success && store.playlist.length > 0) {
    await loadCurrentTrack()
    try {
      await audioRef.value?.play()
      store.isPlaying = true
    } catch (e) {
      console.error('自动播放失败:', e)
    }
  } else if (!result.success && result.error) {
    store.notifyError(result.error === 'no-native-cache' 
      ? '未找到可恢复的音频，请重新选择目录' 
      : result.error)
  }
  isLoading.value = false
}

// 切换到指定曲目
async function playTrack(index) {
  store.saveProgress()
  store.setCurrentIndex(index)
  store.isPlaying = true
  await loadCurrentTrack()
  showPlaylist.value = false
}

// 上一曲
async function previousTrack() {
  store.saveProgress()
  store.playPrevious()
  await loadCurrentTrack()
}

// 下一曲
async function nextTrack() {
  store.saveProgress()
  store.playNext()
  await loadCurrentTrack()
}

// 快退15秒
function rewind() {
  if (audioRef.value) {
    audioRef.value.currentTime = Math.max(0, audioRef.value.currentTime - 15)
  }
}

// 快进15秒
function forward() {
  if (audioRef.value) {
    audioRef.value.currentTime = Math.min(store.duration, audioRef.value.currentTime + 15)
  }
}

// 进度条拖动
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
    const newTime = (dragProgress.value / 100) * store.duration
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

// 触摸支持
function onProgressTouchStart(e) {
  isDragging.value = true
  updateTouchProgress(e)
}

function onProgressTouchMove(e) {
  if (isDragging.value) {
    updateTouchProgress(e)
  }
}

function onProgressTouchEnd() {
  if (isDragging.value && audioRef.value) {
    const newTime = (dragProgress.value / 100) * store.duration
    audioRef.value.currentTime = newTime
    isDragging.value = false
  }
}

function updateTouchProgress(e) {
  const touch = e.touches[0]
  const rect = e.currentTarget.getBoundingClientRect()
  const x = touch.clientX - rect.left
  const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
  dragProgress.value = percent
}

// 音量控制
function onVolumeChange(e) {
  const value = parseFloat(e.target.value)
  store.setVolume(value)
  if (audioRef.value) {
    audioRef.value.volume = value
  }
}

// 静音切换
function toggleMute() {
  if (store.volume > 0) {
    store._lastVolume = store.volume
    store.setVolume(0)
  } else {
    store.setVolume(store._lastVolume || 1)
  }
  if (audioRef.value) {
    audioRef.value.volume = store.volume
  }
}

// 播放速度
function changePlaybackRate() {
  store.cyclePlaybackRate()
  if (audioRef.value) {
    audioRef.value.playbackRate = store.playbackRate
  }
}

// 选择目录
async function handleSelectDirectory() {
  const result = await store.selectDirectory()
  if (result.success && store.playlist.length > 0) {
    await loadCurrentTrack()
  } else if (!result.success && result.error) {
    store.notifyError(`选择音频失败：${result.error}`)
  }
}

// 恢复上次的目录（并自动播放）
async function handleRestoreDirectory() {
  await handleRestoreAndPlay()
}

// 监听当前曲目变化
watch(() => store.currentIndex, async (newVal, oldVal) => {
  if (newVal !== oldVal && newVal >= 0) {
    await loadCurrentTrack()
  }
})

// 音频事件处理
function onTimeUpdate() {
  if (audioRef.value && !isDragging.value) {
    store.currentTime = audioRef.value.currentTime
  }
}

function onDurationChange() {
  if (audioRef.value) {
    store.duration = audioRef.value.duration
  }
}

function onEnded() {
  store.saveProgress()
  
  if (store.playMode === 'single') {
    // 单曲循环
    audioRef.value.currentTime = 0
    audioRef.value.play()
  } else {
    // 下一曲
    nextTrack()
  }
}

function onError(e) {
  console.error('音频播放错误:', e)
  store.isPlaying = false
  store.notifyError('音频播放失败，请检查文件是否已被移动或权限被收回')
}

// 定时保存进度
let saveInterval = null

onMounted(async () => {
  // 每30秒自动保存进度
  saveInterval = setInterval(() => {
    if (store.isPlaying && store.currentTrack) {
      store.saveProgress()
    }
  }, 30000)
  
  // 全局键盘快捷键
  window.addEventListener('keydown', handleKeyboard)
  
  // 自动恢复上次的播放列表（不自动播放）
  if (!store.hasPlaylist && store.hasSavedDirectory) {
    isAutoRestoring.value = true
    const result = await store.restoreLastDirectory()
    if (result.success && store.playlist.length > 0) {
      await loadCurrentTrack()
    }
    isAutoRestoring.value = false
  }
})

onUnmounted(() => {
  if (saveInterval) {
    clearInterval(saveInterval)
  }
  store.saveProgress()
  window.removeEventListener('keydown', handleKeyboard)
})

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
    case 'ArrowUp':
      store.setVolume(store.volume + 0.1)
      if (audioRef.value) audioRef.value.volume = store.volume
      break
    case 'ArrowDown':
      store.setVolume(store.volume - 0.1)
      if (audioRef.value) audioRef.value.volume = store.volume
      break
  }
}

// 获取文件名（不含扩展名）
function getDisplayName(filename) {
  return filename.replace(/\.[^/.]+$/, '')
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-farm-50 via-white to-nature-50 pb-24">
    <!-- 隐藏的音频元素 -->
    <audio 
      ref="audioRef"
      @timeupdate="onTimeUpdate"
      @durationchange="onDurationChange"
      @ended="onEnded"
      @error="onError"
      preload="auto"
    />

    <!-- 头部 -->
    <header class="pt-6 pb-2 px-6 relative z-10">
      <div class="flex items-center justify-between">
        <div class="w-10"></div>
        <div class="text-center">
          <h1 class="text-2xl font-bold text-farm-900 flex items-center justify-center gap-2 tracking-tight">
            <Headphones :size="24" class="text-nature-500" />
            <span>有声小说</span>
          </h1>
          <p class="text-sm text-farm-400/80 mt-1 font-medium">享受惬意的听书时光</p>
        </div>
        <button
          @click="router.push('/download')"
          class="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center hover:bg-purple-100 transition-colors"
          title="下载资源"
        >
          <Download :size="20" />
        </button>
      </div>
    </header>

    <main class="px-6 max-w-md mx-auto relative z-10">
      <!-- 未选择目录时的空状态 -->
      <div v-if="!store.hasPlaylist" class="text-center py-16">
        <div class="w-24 h-24 bg-farm-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Music2 :size="48" class="text-farm-300" />
        </div>
        
        <!-- 有保存的目录时显示恢复按钮 -->
        <div v-if="store.hasSavedDirectory && store.directoryName" class="mb-6">
          <p class="text-farm-500 mb-4">上次播放: <span class="font-medium text-farm-700">{{ store.directoryName }}</span></p>
          <button
            @click="handleRestoreDirectory"
            :disabled="store.isRestoring"
            class="inline-flex items-center gap-2 bg-nature-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-nature-600 transition-colors shadow-lg shadow-nature-200 disabled:opacity-50"
          >
            <Play v-if="!store.isRestoring" :size="20" />
            <div v-else class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {{ store.isRestoring ? '加载中...' : '继续上次播放' }}
          </button>
          <p class="text-xs text-farm-400 mt-3">或</p>
        </div>

        <p v-if="!store.hasSavedDirectory" class="text-farm-500 mb-6">选择一个包含音频文件的目录</p>
        <button
          @click="handleSelectDirectory"
          class="inline-flex items-center gap-2 bg-farm-200 text-farm-700 px-6 py-3 rounded-xl font-medium hover:bg-farm-300 transition-colors"
          :class="{ 'bg-nature-500 text-white hover:bg-nature-600 shadow-lg shadow-nature-200': !store.hasSavedDirectory }"
        >
          <FolderOpen :size="20" />
          {{ store.hasSavedDirectory ? '选择新目录' : '选择目录' }}
        </button>
        <p class="text-xs text-farm-400 mt-4">
          支持格式: {{ store.supportedFormats.join(', ') }}
        </p>

        <!-- 下载资源入口 -->
        <div class="mt-8 pt-8 border-t border-farm-100">
          <p class="text-farm-500 mb-3">或从网络下载资源</p>
          <button
            @click="router.push('/download')"
            class="inline-flex items-center gap-2 bg-purple-100 text-purple-600 px-5 py-2.5 rounded-xl font-medium hover:bg-purple-200 transition-colors"
          >
            <Download :size="18" />
            解析下载
          </button>
          <p class="text-xs text-farm-400 mt-2">支持喜马拉雅、蜻蜓FM等平台</p>
        </div>
      </div>

        <!-- 有播放列表时 -->
      <div v-else>
        <!-- 当前目录信息 -->
        <div class="flex items-center justify-between mb-8 bg-white/40 backdrop-blur-md p-2 rounded-2xl border border-white/50 shadow-sm">
          <div class="flex items-center gap-2.5 text-sm text-farm-600 px-2">
            <div class="w-8 h-8 rounded-full bg-nature-100 flex items-center justify-center text-nature-600">
              <FolderOpen :size="16" />
            </div>
            <div class="flex flex-col leading-tight">
              <span class="font-bold text-farm-800 truncate max-w-[160px]">{{ store.directoryName }}</span>
              <span class="text-xs text-farm-400">{{ store.playlist.length }} 个音频</span>
            </div>
          </div>
          <button
            @click="handleSelectDirectory"
            class="text-xs font-medium bg-white text-nature-600 px-3 py-1.5 rounded-xl shadow-sm border border-farm-100 hover:bg-nature-50 transition-colors"
          >
            更换
          </button>
        </div>

        <!-- 封面区域 -->
        <div class="relative mb-10 group">
          <!-- 背景光晕 -->
          <div class="absolute inset-0 bg-nature-400/20 blur-3xl rounded-full transform scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
          
          <div class="bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-nature-900/5 p-8 border border-white/60 relative z-10">
            <!-- 虚拟封面 -->
            <div class="aspect-square w-full bg-gradient-to-br from-nature-50 to-nature-100 rounded-3xl flex flex-col items-center justify-center mb-8 relative overflow-hidden shadow-inner border border-nature-50">
              <div class="absolute inset-0 opacity-10 mix-blend-multiply">
                <div class="absolute inset-0" style="background-image: radial-gradient(#36a778 1px, transparent 1px); background-size: 20px 20px;"></div>
              </div>
              
              <div class="w-32 h-32 rounded-full bg-gradient-to-tr from-nature-400 to-nature-300 flex items-center justify-center shadow-lg shadow-nature-200/50 mb-6 animate-pulse-slow">
                <Music2 :size="48" class="text-white drop-shadow-md" />
              </div>
              
              <div class="text-center px-6 w-full z-10">
                <h2 class="text-xl font-bold text-nature-800 line-clamp-2 leading-snug mb-2">
                  {{ store.currentTrack ? getDisplayName(store.currentTrack.name) : '未选择' }}
                </h2>
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-nature-500/10 text-nature-600 text-xs font-medium">
                  <span>第 {{ store.currentIndex + 1 }} 首</span>
                  <span class="w-1 h-1 rounded-full bg-nature-400"></span>
                  <span>共 {{ store.playlist.length }} 首</span>
                </div>
              </div>
              
              <!-- 加载指示器 -->
              <div v-if="isLoading" class="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-20">
                <div class="w-12 h-12 border-4 border-nature-200 border-t-nature-500 rounded-full animate-spin"></div>
              </div>
            </div>

            <!-- 进度条 -->
            <div class="mb-8 px-2">
              <div 
                class="relative h-3 bg-farm-100/50 rounded-full cursor-pointer group/progress touch-none"
                @mousedown="onProgressMouseDown"
                @mousemove="onProgressMouseMove"
                @mouseup="onProgressMouseUp"
                @mouseleave="onProgressMouseUp"
                @touchstart="onProgressTouchStart"
                @touchmove="onProgressTouchMove"
                @touchend="onProgressTouchEnd"
              >
                <div 
                  class="absolute h-full bg-gradient-to-r from-nature-400 to-nature-500 rounded-full transition-all duration-100 ease-out shadow-sm"
                  :style="{ width: displayProgress + '%' }"
                >
                  <div class="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-md border-2 border-nature-500 scale-0 group-hover/progress:scale-100 transition-transform duration-200"></div>
                </div>
              </div>
              <div class="flex justify-between mt-3 text-xs text-farm-400 font-mono font-medium px-1">
                <span>{{ store.formattedCurrentTime }}</span>
                <span>{{ store.formattedDuration }}</span>
              </div>
            </div>

            <!-- 控制按钮 -->
            <div class="flex items-center justify-between gap-2 mb-6 px-2">
              <!-- 快退15秒 -->
              <button 
                @click="rewind"
                class="w-12 h-12 rounded-2xl text-farm-400 hover:text-farm-600 hover:bg-farm-50 transition-all flex items-center justify-center relative group"
              >
                <RotateCcw :size="22" />
                <span class="absolute -bottom-1 text-[9px] font-bold opacity-60">15</span>
              </button>
              
              <!-- 上一曲 -->
              <button 
                @click="previousTrack"
                class="w-12 h-12 rounded-2xl text-farm-600 hover:bg-farm-50 transition-all flex items-center justify-center"
              >
                <SkipBack :size="26" fill="currentColor" />
              </button>
              
              <!-- 播放/暂停 -->
              <button 
                @click="togglePlay"
                class="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-nature-400 to-nature-500 text-white flex items-center justify-center hover:shadow-xl hover:shadow-nature-200 hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-nature-100"
                :disabled="isLoading"
              >
                <Pause v-if="store.isPlaying" :size="36" fill="currentColor" />
                <Play v-else :size="36" fill="currentColor" class="ml-1.5" />
              </button>
              
              <!-- 下一曲 -->
              <button 
                @click="nextTrack"
                class="w-12 h-12 rounded-2xl text-farm-600 hover:bg-farm-50 transition-all flex items-center justify-center"
              >
                <SkipForward :size="26" fill="currentColor" />
              </button>
              
              <!-- 快进15秒 -->
              <button 
                @click="forward"
                class="w-12 h-12 rounded-2xl text-farm-400 hover:text-farm-600 hover:bg-farm-50 transition-all flex items-center justify-center relative group"
              >
                <RotateCw :size="22" />
                <span class="absolute -bottom-1 text-[9px] font-bold opacity-60">15</span>
              </button>
            </div>

            <!-- 功能按钮行 -->
            <div class="flex items-center justify-between px-2 pt-6 border-t border-farm-50">
              <!-- 播放模式 -->
              <button 
                @click="store.togglePlayMode()"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-farm-50 transition-colors w-16"
                :class="playModeConfig.class"
              >
                <component :is="playModeConfig.icon" :size="20" />
                <span class="text-[10px] font-medium">{{ playModeConfig.text }}</span>
              </button>
              
              <!-- 播放速度 -->
              <button 
                @click="changePlaybackRate"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-farm-50 transition-colors text-farm-600 w-16"
              >
                <div class="relative">
                  <Gauge :size="20" />
                  <span class="absolute -right-1 -top-1 w-2 h-2 bg-nature-500 rounded-full" v-if="store.playbackRate !== 1"></span>
                </div>
                <span class="text-[10px] font-mono font-bold">{{ store.playbackRate }}x</span>
              </button>
              
              <!-- 播放列表 -->
              <button 
                @click="showPlaylist = true"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-farm-50 transition-colors text-farm-600 w-16"
              >
                <List :size="20" />
                <span class="text-[10px] font-medium">列表</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 音量控制 -->
        <div class="bg-white/60 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4 border border-white/50 shadow-sm">
          <button @click="toggleMute" class="text-farm-400 hover:text-farm-600 transition-colors">
            <VolumeX v-if="store.volume === 0" :size="22" />
            <Volume2 v-else :size="22" />
          </button>
          <div class="flex-1 relative h-10 flex items-center group">
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="store.volume"
              @input="onVolumeChange"
              class="w-full h-1.5 bg-farm-200 rounded-full appearance-none cursor-pointer accent-nature-500 focus:outline-none focus:ring-2 focus:ring-nature-200 focus:ring-offset-2"
            />
          </div>
          <span class="text-xs text-farm-500 font-mono font-bold w-10 text-right">
            {{ Math.round(store.volume * 100) }}%
          </span>
        </div>
      </div>
    </main>

    <!-- 播放列表弹窗 -->
    <div 
      v-if="showPlaylist" 
      class="fixed inset-0 bg-farm-900/20 backdrop-blur-sm z-50 flex items-end"
      @click.self="showPlaylist = false"
    >
      <div class="bg-white/95 backdrop-blur-xl w-full max-h-[70vh] rounded-t-[2rem] overflow-hidden animate-slide-up shadow-2xl shadow-farm-900/20 border-t border-white/50">
        <!-- 头部 -->
        <div class="flex items-center justify-between p-6 border-b border-farm-100 sticky top-0 bg-white/95 backdrop-blur-md z-10">
          <h3 class="font-bold text-lg text-farm-800 flex items-center gap-2">
            <List :size="20" class="text-nature-500" />
            播放列表 <span class="text-sm font-normal text-farm-400">({{ store.playlist.length }})</span>
          </h3>
          <button 
            @click="showPlaylist = false"
            class="w-8 h-8 rounded-full bg-farm-50 flex items-center justify-center text-farm-400 hover:bg-farm-100 hover:text-farm-600 transition-colors"
          >
            <X :size="20" />
          </button>
        </div>
        
        <!-- 列表 -->
        <div class="overflow-y-auto max-h-[calc(70vh-80px)] p-2">
          <div 
            v-for="(track, index) in store.playlist" 
            :key="track.name"
            @click="playTrack(index)"
            class="flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer transition-all group mb-1"
            :class="index === store.currentIndex ? 'bg-gradient-to-r from-nature-50 to-transparent' : 'hover:bg-farm-50'"
          >
            <div 
              class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
              :class="index === store.currentIndex ? 'bg-nature-100 text-nature-600' : 'bg-farm-50 text-farm-400 group-hover:bg-farm-100 group-hover:text-farm-500'"
            >
              <span v-if="index === store.currentIndex && store.isPlaying" class="flex gap-0.5 items-end h-4">
                <span class="w-1 bg-nature-500 rounded-full animate-music-bar-1"></span>
                <span class="w-1 bg-nature-500 rounded-full animate-music-bar-2"></span>
                <span class="w-1 bg-nature-500 rounded-full animate-music-bar-3"></span>
              </span>
              <span v-else class="text-sm font-mono font-medium">{{ index + 1 }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p 
                class="text-base truncate font-medium transition-colors"
                :class="index === store.currentIndex ? 'text-nature-700' : 'text-farm-700'"
              >
                {{ getDisplayName(track.name) }}
              </p>
              <p v-if="store.progressMemory[track.name]" class="text-xs text-farm-400 flex items-center gap-1 mt-1">
                <Clock :size="12" />
                上次播放至 {{ store.formatTime(store.progressMemory[track.name].time) }}
              </p>
            </div>
            <div v-if="index === store.currentIndex" class="text-nature-500">
               <Play :size="18" fill="currentColor" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <AudioErrorDialog
      :visible="store.errorVisible"
      :message="store.errorMessage"
      @close="store.clearError()"
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
  border: 2px solid #36a778;
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
  border: 2px solid #36a778;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.1s;
}

/* 弹窗动画 */
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

/* 音乐条动画 */
.animate-music-bar-1 {
  animation: music-bar 0.5s ease-in-out infinite alternate;
}
.animate-music-bar-2 {
  animation: music-bar 0.5s ease-in-out infinite alternate 0.1s;
}
.animate-music-bar-3 {
  animation: music-bar 0.5s ease-in-out infinite alternate 0.2s;
}

@keyframes music-bar {
  from {
    height: 4px;
  }
  to {
    height: 12px;
  }
}

.animate-pulse-slow {
  animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
