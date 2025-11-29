<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAudioStore } from '../stores/audioStore'
import { 
  FolderOpen, Play, Pause, SkipBack, SkipForward, 
  Volume2, VolumeX, Repeat, Repeat1, Shuffle, 
  List, ChevronLeft, ChevronRight, Gauge, Clock,
  RotateCcw, RotateCw, X, Music2, Headphones
} from 'lucide-vue-next'
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
  <div class="min-h-screen bg-gradient-to-b from-farm-50 to-nature-50/30 pb-24">
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
    <header class="p-4 text-center">
      <h1 class="text-xl font-bold text-farm-900 flex items-center justify-center gap-2">
        <Headphones :size="24" class="text-nature-500" />
        有声小说
      </h1>
      <p class="text-xs text-farm-400 mt-1">边做家务边听书</p>
    </header>

    <main class="px-4 max-w-md mx-auto">
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
      </div>

      <!-- 有播放列表时 -->
      <div v-else>
        <!-- 当前目录信息 -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-2 text-sm text-farm-500 bg-white/60 px-3 py-1.5 rounded-lg">
            <FolderOpen :size="16" />
            <span class="truncate max-w-[200px]">{{ store.directoryName }}</span>
            <span class="text-farm-400">({{ store.playlist.length }})</span>
          </div>
          <button
            @click="handleSelectDirectory"
            class="text-xs text-nature-600 hover:text-nature-700 underline"
          >
            更换目录
          </button>
        </div>

        <!-- 封面区域 -->
        <div class="bg-white rounded-3xl shadow-xl shadow-farm-100 p-6 mb-6 border border-farm-100">
          <!-- 虚拟封面 -->
          <div class="aspect-square max-w-[280px] mx-auto bg-gradient-to-br from-nature-100 to-nature-200 rounded-2xl flex flex-col items-center justify-center mb-6 relative overflow-hidden">
            <div class="absolute inset-0 opacity-10">
              <div class="absolute inset-0" style="background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px);"></div>
            </div>
            <Music2 :size="64" class="text-nature-400 mb-4" />
            <div class="text-center px-4">
              <p class="text-lg font-bold text-nature-700 line-clamp-2">
                {{ store.currentTrack ? getDisplayName(store.currentTrack.name) : '未选择' }}
              </p>
              <p class="text-xs text-nature-500 mt-2">
                {{ store.currentIndex + 1 }} / {{ store.playlist.length }}
              </p>
            </div>
            <!-- 加载指示器 -->
            <div v-if="isLoading" class="absolute inset-0 bg-white/80 flex items-center justify-center">
              <div class="w-8 h-8 border-3 border-nature-200 border-t-nature-500 rounded-full animate-spin"></div>
            </div>
          </div>

          <!-- 进度条 -->
          <div class="mb-4">
            <div 
              class="relative h-2 bg-farm-100 rounded-full cursor-pointer group"
              @mousedown="onProgressMouseDown"
              @mousemove="onProgressMouseMove"
              @mouseup="onProgressMouseUp"
              @mouseleave="onProgressMouseUp"
              @touchstart="onProgressTouchStart"
              @touchmove="onProgressTouchMove"
              @touchend="onProgressTouchEnd"
            >
              <div 
                class="absolute h-full bg-nature-500 rounded-full transition-all"
                :style="{ width: displayProgress + '%' }"
              ></div>
              <div 
                class="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-nature-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                :style="{ left: `calc(${displayProgress}% - 8px)` }"
              ></div>
            </div>
            <div class="flex justify-between mt-1.5 text-xs text-farm-400 font-mono">
              <span>{{ store.formattedCurrentTime }}</span>
              <span>{{ store.formattedDuration }}</span>
            </div>
          </div>

          <!-- 控制按钮 -->
          <div class="flex items-center justify-center gap-4 mb-4">
            <!-- 快退15秒 -->
            <button 
              @click="rewind"
              class="w-12 h-12 rounded-full bg-farm-100 text-farm-600 flex items-center justify-center hover:bg-farm-200 transition-colors relative"
            >
              <RotateCcw :size="20" />
              <span class="absolute -bottom-0.5 text-[10px] font-bold">15</span>
            </button>
            
            <!-- 上一曲 -->
            <button 
              @click="previousTrack"
              class="w-12 h-12 rounded-full bg-farm-100 text-farm-600 flex items-center justify-center hover:bg-farm-200 transition-colors"
            >
              <SkipBack :size="22" fill="currentColor" />
            </button>
            
            <!-- 播放/暂停 -->
            <button 
              @click="togglePlay"
              class="w-16 h-16 rounded-full bg-nature-500 text-white flex items-center justify-center hover:bg-nature-600 transition-colors shadow-lg shadow-nature-200"
              :disabled="isLoading"
            >
              <Pause v-if="store.isPlaying" :size="28" fill="currentColor" />
              <Play v-else :size="28" fill="currentColor" class="ml-1" />
            </button>
            
            <!-- 下一曲 -->
            <button 
              @click="nextTrack"
              class="w-12 h-12 rounded-full bg-farm-100 text-farm-600 flex items-center justify-center hover:bg-farm-200 transition-colors"
            >
              <SkipForward :size="22" fill="currentColor" />
            </button>
            
            <!-- 快进15秒 -->
            <button 
              @click="forward"
              class="w-12 h-12 rounded-full bg-farm-100 text-farm-600 flex items-center justify-center hover:bg-farm-200 transition-colors relative"
            >
              <RotateCw :size="20" />
              <span class="absolute -bottom-0.5 text-[10px] font-bold">15</span>
            </button>
          </div>

          <!-- 功能按钮行 -->
          <div class="flex items-center justify-between px-2">
            <!-- 播放模式 -->
            <button 
              @click="store.togglePlayMode()"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-farm-50 transition-colors"
              :class="playModeConfig.class"
            >
              <component :is="playModeConfig.icon" :size="18" />
              <span class="text-xs">{{ playModeConfig.text }}</span>
            </button>
            
            <!-- 播放速度 -->
            <button 
              @click="changePlaybackRate"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-farm-50 transition-colors text-farm-600"
            >
              <Gauge :size="18" />
              <span class="text-xs font-mono font-bold">{{ store.playbackRate }}x</span>
            </button>
            
            <!-- 播放列表 -->
            <button 
              @click="showPlaylist = true"
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-farm-50 transition-colors text-farm-600"
            >
              <List :size="18" />
              <span class="text-xs">列表</span>
            </button>
          </div>
        </div>

        <!-- 音量控制 -->
        <div class="bg-white/60 rounded-2xl p-4 flex items-center gap-3">
          <button @click="toggleMute" class="text-farm-500 hover:text-farm-700">
            <VolumeX v-if="store.volume === 0" :size="20" />
            <Volume2 v-else :size="20" />
          </button>
          <input 
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="store.volume"
            @input="onVolumeChange"
            class="flex-1 h-2 bg-farm-200 rounded-full appearance-none cursor-pointer accent-nature-500"
          />
          <span class="text-xs text-farm-500 font-mono w-10 text-right">
            {{ Math.round(store.volume * 100) }}%
          </span>
        </div>

        <!-- 快捷键提示 -->
        <div class="text-center mt-6 text-xs text-farm-400">
          <p>快捷键: 空格播放/暂停 | ← → 快退/快进 | ↑ ↓ 音量</p>
        </div>
      </div>
    </main>

    <!-- 播放列表弹窗 -->
    <div 
      v-if="showPlaylist" 
      class="fixed inset-0 bg-farm-900/50 backdrop-blur-sm z-50 flex items-end"
      @click.self="showPlaylist = false"
    >
      <div class="bg-white w-full max-h-[70vh] rounded-t-3xl overflow-hidden animate-slide-up">
        <!-- 头部 -->
        <div class="flex items-center justify-between p-4 border-b border-farm-100 sticky top-0 bg-white z-10">
          <h3 class="font-bold text-farm-800">播放列表 ({{ store.playlist.length }})</h3>
          <button 
            @click="showPlaylist = false"
            class="w-8 h-8 rounded-full bg-farm-100 flex items-center justify-center text-farm-500 hover:bg-farm-200"
          >
            <X :size="18" />
          </button>
        </div>
        
        <!-- 列表 -->
        <div class="overflow-y-auto max-h-[calc(70vh-60px)]">
          <div 
            v-for="(track, index) in store.playlist" 
            :key="track.name"
            @click="playTrack(index)"
            class="flex items-center gap-3 px-4 py-3 hover:bg-farm-50 cursor-pointer transition-colors border-b border-farm-50"
            :class="{ 'bg-nature-50': index === store.currentIndex }"
          >
            <div class="w-8 h-8 rounded-lg bg-farm-100 flex items-center justify-center text-farm-400 flex-shrink-0">
              <span v-if="index === store.currentIndex && store.isPlaying" class="flex gap-0.5">
                <span class="w-1 h-3 bg-nature-500 rounded-full animate-music-bar-1"></span>
                <span class="w-1 h-3 bg-nature-500 rounded-full animate-music-bar-2"></span>
                <span class="w-1 h-3 bg-nature-500 rounded-full animate-music-bar-3"></span>
              </span>
              <span v-else class="text-xs font-mono">{{ index + 1 }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p 
                class="text-sm truncate"
                :class="index === store.currentIndex ? 'text-nature-600 font-medium' : 'text-farm-700'"
              >
                {{ getDisplayName(track.name) }}
              </p>
              <p v-if="store.progressMemory[track.name]" class="text-xs text-farm-400 flex items-center gap-1 mt-0.5">
                <Clock :size="10" />
                上次播放至 {{ store.formatTime(store.progressMemory[track.name].time) }}
              </p>
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
  background: #36a778;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #36a778;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
</style>
