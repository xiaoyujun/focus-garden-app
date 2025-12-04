<script setup>
/**
 * B站视频播放器组件
 * 支持 DASH 格式（音视频分离同步）和 durl 格式
 * 通过代理解决防盗链问题，支持进度控制、画质切换、后台播放
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Capacitor } from '@capacitor/core'
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, 
  SkipBack, SkipForward, Settings, Loader2, AlertCircle,
  X, RotateCcw
} from 'lucide-vue-next'

const props = defineProps({
  // 播放信息
  playInfo: { type: Object, default: null },
  // 视频信息
  videoInfo: { type: Object, default: null },
  // 当前分P
  currentPage: { type: Object, default: null },
  // 可用画质选项
  qualityOptions: { type: Array, default: () => [] },
  // 当前画质
  currentQuality: { type: Number, default: 80 },
  // 是否显示
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'quality-change', 'ended', 'error'])

const isNative = Capacitor.isNativePlatform()
const useServerProxy = import.meta.env.VITE_FORCE_SERVER_PROXY === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_USE_SERVER_PROXY !== 'false')

// ===== Refs =====
const videoRef = ref(null)
const audioRef = ref(null)
const containerRef = ref(null)
const progressRef = ref(null)

// ===== State =====
const isPlaying = ref(false)
const isBuffering = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const isFullscreen = ref(false)
const showControls = ref(true)
const error = ref('')
const showQualityMenu = ref(false)

// 进度条拖动状态
const isDragging = ref(false)
const dragTime = ref(0)

// 防止 play/load 竞态
let isLoadingMedia = false
let currentPlayPromise = null

// 控制栏自动隐藏
let controlsTimer = null

// ===== Computed =====
const proxyVideoUrl = computed(() => {
  if (!props.playInfo?.videoUrl) return ''
  return getProxyUrl(props.playInfo.videoUrl)
})

const proxyAudioUrl = computed(() => {
  if (!props.playInfo?.audioUrl) return ''
  return getProxyUrl(props.playInfo.audioUrl)
})

const isDashMode = computed(() => props.playInfo?.type === 'dash' && props.playInfo?.audioUrl)

const progressPercent = computed(() => {
  if (!duration.value) return 0
  const time = isDragging.value ? dragTime.value : currentTime.value
  return (time / duration.value) * 100
})

const formattedCurrentTime = computed(() => formatTime(isDragging.value ? dragTime.value : currentTime.value))
const formattedDuration = computed(() => formatTime(duration.value))

// ===== 远程代理配置 =====
// 原生平台需要通过远程代理来绕过 B站 Referer 防盗链
// 可以部署自己的代理服务，或使用公开的 CORS 代理
// 格式: PROXY_BASE_URL + encodeURIComponent(videoUrl)
const REMOTE_PROXY_URL = import.meta.env.VITE_BILI_PROXY_URL || ''

// ===== Methods =====
function getProxyUrl(url) {
  if (!url) return ''
  
  if (REMOTE_PROXY_URL) {
    return `${REMOTE_PROXY_URL}${encodeURIComponent(url)}`
  }

  if (isNative) {
    // 没有代理时尝试直连，可能因为防盗链失败
    console.warn('[视频播放] 原生平台未配置远程代理，可能无法播放视频')
    return url
  }
  
  if (useServerProxy) {
    return `/api/bili-proxy?url=${encodeURIComponent(url)}`
  }

  console.warn('[视频播放] 未配置 Web 代理，直接使用原始地址，可能因防盗链被拒绝')
  return url
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 安全播放（处理竞态条件）
async function safePlay(element) {
  if (!element || isLoadingMedia) return
  try {
    const playPromise = element.play()
    if (playPromise !== undefined) {
      currentPlayPromise = playPromise
      await playPromise
    }
  } catch (e) {
    // 忽略 "interrupted" 错误，这是正常的加载中断
    if (e.name === 'AbortError') {
      console.log('[播放] 被新加载中断，忽略')
      return
    }
    throw e
  }
}

// 播放/暂停
async function togglePlay() {
  const video = videoRef.value
  if (!video || isLoadingMedia) return

  try {
    if (isPlaying.value) {
      video.pause()
      if (isDashMode.value && audioRef.value) {
        audioRef.value.pause()
      }
    } else {
      await safePlay(video)
      if (isDashMode.value && audioRef.value) {
        await safePlay(audioRef.value)
      }
    }
  } catch (e) {
    console.error('播放控制失败:', e)
    // 不显示 interrupted 错误
    if (e.name !== 'AbortError') {
      error.value = '播放失败: ' + e.message
    }
  }
}

// 音视频同步（DASH 模式）
function syncAudioWithVideo() {
  const video = videoRef.value
  const audio = audioRef.value
  if (!video || !audio || !isDashMode.value || isLoadingMedia) return

  // 同步播放状态
  if (!video.paused && audio.paused) {
    safePlay(audio)
  } else if (video.paused && !audio.paused) {
    audio.pause()
  }

  // 同步时间（允许 0.3s 误差）
  if (Math.abs(video.currentTime - audio.currentTime) > 0.3) {
    audio.currentTime = video.currentTime
  }
}

// 进度条事件
function onProgressClick(e) {
  if (!progressRef.value || !duration.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  seekTo(percent * duration.value)
}

function onProgressMouseDown(e) {
  isDragging.value = true
  updateDragTime(e)
  document.addEventListener('mousemove', onProgressMouseMove)
  document.addEventListener('mouseup', onProgressMouseUp)
}

function onProgressMouseMove(e) {
  if (!isDragging.value) return
  updateDragTime(e)
}

function onProgressMouseUp() {
  if (isDragging.value) {
    seekTo(dragTime.value)
  }
  isDragging.value = false
  document.removeEventListener('mousemove', onProgressMouseMove)
  document.removeEventListener('mouseup', onProgressMouseUp)
}

function updateDragTime(e) {
  if (!progressRef.value || !duration.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  dragTime.value = percent * duration.value
}

// 触摸事件
function onProgressTouchStart(e) {
  isDragging.value = true
  updateDragTimeTouch(e)
}

function onProgressTouchMove(e) {
  if (!isDragging.value) return
  updateDragTimeTouch(e)
}

function onProgressTouchEnd() {
  if (isDragging.value) {
    seekTo(dragTime.value)
  }
  isDragging.value = false
}

function updateDragTimeTouch(e) {
  if (!progressRef.value || !duration.value) return
  const touch = e.touches[0]
  const rect = progressRef.value.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
  dragTime.value = percent * duration.value
}

// 跳转播放
function seekTo(time) {
  const video = videoRef.value
  if (!video) return
  
  video.currentTime = time
  if (isDashMode.value && audioRef.value) {
    audioRef.value.currentTime = time
  }
  currentTime.value = time
}

// 快进/快退
function skip(seconds) {
  const newTime = Math.max(0, Math.min(duration.value, currentTime.value + seconds))
  seekTo(newTime)
}

// 音量控制
function toggleMute() {
  isMuted.value = !isMuted.value
  if (videoRef.value) {
    videoRef.value.muted = isMuted.value
  }
  if (audioRef.value) {
    audioRef.value.muted = isMuted.value
  }
}

function setVolume(val) {
  volume.value = val
  if (videoRef.value) {
    videoRef.value.volume = val
  }
  if (audioRef.value) {
    audioRef.value.volume = val
  }
}

// 全屏
async function toggleFullscreen() {
  if (!containerRef.value) return

  try {
    if (!document.fullscreenElement) {
      await containerRef.value.requestFullscreen()
      isFullscreen.value = true
    } else {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
  } catch (e) {
    console.error('全屏切换失败:', e)
  }
}

// 画质切换
function selectQuality(qn) {
  if (qn === props.currentQuality) return
  showQualityMenu.value = false
  emit('quality-change', qn)
}

// 控制栏显示/隐藏
function showControlsTemporarily() {
  showControls.value = true
  clearTimeout(controlsTimer)
  if (isPlaying.value) {
    controlsTimer = setTimeout(() => {
      showControls.value = false
    }, 3000)
  }
}

function onContainerClick() {
  if (showControls.value) {
    togglePlay()
  }
  showControlsTemporarily()
}

// 视频事件处理
function onVideoPlay() {
  isPlaying.value = true
  syncAudioWithVideo()
  showControlsTemporarily()
  updateMediaSession()
}

function onVideoPause() {
  isPlaying.value = false
  syncAudioWithVideo()
  showControls.value = true
}

function onVideoTimeUpdate() {
  if (videoRef.value && !isDragging.value) {
    currentTime.value = videoRef.value.currentTime
  }
  // 定期同步音频
  syncAudioWithVideo()
}

function onVideoLoadedMetadata() {
  if (videoRef.value) {
    duration.value = videoRef.value.duration || props.playInfo?.duration || 0
  }
  isBuffering.value = false
  updateMediaSession()
}

function onVideoWaiting() {
  isBuffering.value = true
}

function onVideoCanPlay() {
  isBuffering.value = false
}

function onVideoEnded() {
  isPlaying.value = false
  showControls.value = true
  emit('ended')
}

function onVideoError(e) {
  const video = videoRef.value
  const errCode = video?.error?.code
  let errMsg = {
    1: '视频加载被中止',
    2: '网络错误',
    3: '视频解码失败',
    4: '视频格式不支持'
  }[errCode] || '未知错误'
  
  // 原生平台未配置代理时提供更明确的提示
  if (isNative && !REMOTE_PROXY_URL && (errCode === 2 || errCode === 4)) {
    errMsg = '视频防盗链限制，请配置远程代理服务'
  }
  
  error.value = `播放失败: ${errMsg}`
  console.error('视频错误:', video?.error)
  emit('error', error.value)
}

// Media Session API（后台播放控制）
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return

  navigator.mediaSession.metadata = new MediaMetadata({
    title: props.videoInfo?.title || 'B站视频',
    artist: props.videoInfo?.author || '',
    album: props.currentPage?.title || '',
    artwork: props.videoInfo?.cover ? [
      { src: props.videoInfo.cover, sizes: '512x512', type: 'image/jpeg' }
    ] : []
  })

  navigator.mediaSession.setActionHandler('play', () => togglePlay())
  navigator.mediaSession.setActionHandler('pause', () => togglePlay())
  navigator.mediaSession.setActionHandler('seekbackward', () => skip(-10))
  navigator.mediaSession.setActionHandler('seekforward', () => skip(10))
}

// 重试播放
function retryPlay() {
  error.value = ''
  isBuffering.value = true
  if (videoRef.value) {
    videoRef.value.load()
  }
  if (audioRef.value) {
    audioRef.value.load()
  }
}

// 关闭播放器
function closePlayer() {
  if (videoRef.value) {
    videoRef.value.pause()
  }
  if (audioRef.value) {
    audioRef.value.pause()
  }
  emit('close')
}

// ===== Lifecycle =====
onMounted(() => {
  // 监听全屏变化
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })

  // 初始化音量
  if (videoRef.value) {
    videoRef.value.volume = volume.value
  }
  if (audioRef.value) {
    audioRef.value.volume = volume.value
  }
})

onBeforeUnmount(() => {
  clearTimeout(controlsTimer)
  document.removeEventListener('mousemove', onProgressMouseMove)
  document.removeEventListener('mouseup', onProgressMouseUp)
})

// 监听播放信息变化，重新加载
watch(() => props.playInfo?.videoUrl, async (newUrl) => {
  if (newUrl) {
    error.value = ''
    isBuffering.value = true
    currentTime.value = 0
    isLoadingMedia = true
    
    // 等待当前播放 Promise 完成或中断
    if (currentPlayPromise) {
      try {
        await currentPlayPromise
      } catch (e) {
        // 忽略中断错误
      }
      currentPlayPromise = null
    }
    
    // 先暂停再加载
    if (videoRef.value) {
      videoRef.value.pause()
    }
    if (audioRef.value) {
      audioRef.value.pause()
    }
    
    nextTick(() => {
      if (videoRef.value) {
        videoRef.value.load()
      }
      if (audioRef.value) {
        audioRef.value.load()
      }
      // 延迟解除加载锁
      setTimeout(() => {
        isLoadingMedia = false
      }, 100)
    })
  }
})
</script>

<template>
  <Transition name="fade">
    <div 
      v-if="visible && playInfo"
      class="fixed inset-0 z-50 bg-black flex items-center justify-center"
      ref="containerRef"
    >
      <!-- 视频播放区 -->
      <div 
        class="relative w-full h-full flex items-center justify-center"
        @click="onContainerClick"
        @mousemove="showControlsTemporarily"
      >
        <!-- 视频元素 -->
        <video
          ref="videoRef"
          class="w-full h-full object-contain bg-black"
          :src="proxyVideoUrl"
          preload="auto"
          playsinline
          webkit-playsinline
          x5-video-player-type="h5"
          @play="onVideoPlay"
          @pause="onVideoPause"
          @timeupdate="onVideoTimeUpdate"
          @loadedmetadata="onVideoLoadedMetadata"
          @waiting="onVideoWaiting"
          @canplay="onVideoCanPlay"
          @ended="onVideoEnded"
          @error="onVideoError"
        />

        <!-- 音频元素（DASH 模式下音视频分离） -->
        <audio
          v-if="isDashMode"
          ref="audioRef"
          :src="proxyAudioUrl"
          preload="auto"
          class="hidden"
        />

        <!-- 加载中 -->
        <div 
          v-if="isBuffering && !error"
          class="absolute inset-0 flex items-center justify-center bg-black/50"
        >
          <div class="text-center text-white">
            <Loader2 :size="48" class="animate-spin mx-auto mb-3" />
            <p class="text-sm opacity-80">加载中...</p>
          </div>
        </div>

        <!-- 错误提示 -->
        <div 
          v-if="error"
          class="absolute inset-0 flex items-center justify-center bg-black/80"
        >
          <div class="text-center text-white p-6">
            <AlertCircle :size="48" class="mx-auto mb-3 text-red-400" />
            <p class="text-sm mb-4">{{ error }}</p>
            <div class="flex gap-3 justify-center">
              <button 
                @click.stop="retryPlay"
                class="px-4 py-2 bg-pink-500 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-pink-600"
              >
                <RotateCcw :size="16" />
                重试
              </button>
              <button 
                @click.stop="closePlayer"
                class="px-4 py-2 bg-white/20 rounded-lg text-sm font-medium hover:bg-white/30"
              >
                关闭
              </button>
            </div>
          </div>
        </div>

        <!-- 控制栏 -->
        <Transition name="fade">
          <div 
            v-show="showControls && !error"
            class="absolute inset-0 pointer-events-none"
            @click.stop
          >
            <!-- 顶部栏 -->
            <div class="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4 pointer-events-auto">
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0 mr-4">
                  <h3 class="text-white font-semibold truncate text-sm md:text-base">
                    {{ videoInfo?.title || 'B站视频' }}
                  </h3>
                  <p class="text-white/60 text-xs truncate">
                    {{ videoInfo?.author }}
                    <span v-if="currentPage?.page" class="ml-1">· P{{ currentPage.page }}</span>
                  </p>
                </div>
                <button 
                  @click.stop="closePlayer"
                  class="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X :size="20" class="text-white" />
                </button>
              </div>
            </div>

            <!-- 中央播放按钮 -->
            <div 
              class="absolute inset-0 flex items-center justify-center pointer-events-auto"
              @click.stop="togglePlay"
            >
              <button 
                v-if="!isPlaying && !isBuffering"
                class="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <Play :size="32" class="text-white ml-1" />
              </button>
            </div>

            <!-- 底部控制栏 -->
            <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pointer-events-auto">
              <!-- 进度条 -->
              <div 
                ref="progressRef"
                class="relative h-1 bg-white/30 rounded-full cursor-pointer mb-4 group"
                @click.stop="onProgressClick"
                @mousedown.stop="onProgressMouseDown"
                @touchstart.stop="onProgressTouchStart"
                @touchmove.stop="onProgressTouchMove"
                @touchend.stop="onProgressTouchEnd"
              >
                <!-- 已播放进度 -->
                <div 
                  class="absolute h-full bg-pink-500 rounded-full transition-all"
                  :style="{ width: `${progressPercent}%` }"
                />
                <!-- 拖动圆点 -->
                <div 
                  class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  :style="{ left: `calc(${progressPercent}% - 6px)` }"
                />
              </div>

              <!-- 控制按钮 -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <!-- 播放/暂停 -->
                  <button 
                    @click.stop="togglePlay"
                    class="p-2 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <component :is="isPlaying ? Pause : Play" :size="24" class="text-white" />
                  </button>

                  <!-- 快退/快进 -->
                  <button 
                    @click.stop="skip(-10)"
                    class="p-2 rounded-full hover:bg-white/10 transition-colors hidden sm:block"
                  >
                    <SkipBack :size="20" class="text-white" />
                  </button>
                  <button 
                    @click.stop="skip(10)"
                    class="p-2 rounded-full hover:bg-white/10 transition-colors hidden sm:block"
                  >
                    <SkipForward :size="20" class="text-white" />
                  </button>

                  <!-- 时间显示 -->
                  <span class="text-white text-xs md:text-sm tabular-nums">
                    {{ formattedCurrentTime }} / {{ formattedDuration }}
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <!-- 音量 -->
                  <div class="hidden sm:flex items-center gap-2">
                    <button 
                      @click.stop="toggleMute"
                      class="p-2 rounded-full hover:bg-white/10 transition-colors"
                    >
                      <component :is="isMuted ? VolumeX : Volume2" :size="20" class="text-white" />
                    </button>
                    <input 
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      :value="volume"
                      @input="setVolume(parseFloat($event.target.value))"
                      @click.stop
                      class="w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>

                  <!-- 画质选择 -->
                  <div class="relative">
                    <button 
                      @click.stop="showQualityMenu = !showQualityMenu"
                      class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white text-xs font-medium"
                    >
                      {{ playInfo?.qualityName || '画质' }}
                    </button>
                    <Transition name="fade">
                      <div 
                        v-if="showQualityMenu"
                        class="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur rounded-lg overflow-hidden min-w-[120px] shadow-xl"
                      >
                        <button 
                          v-for="opt in qualityOptions"
                          :key="opt.value"
                          @click.stop="selectQuality(opt.value)"
                          class="w-full px-4 py-2 text-left text-sm hover:bg-white/10 transition-colors"
                          :class="opt.value === currentQuality ? 'text-pink-400' : 'text-white'"
                        >
                          {{ opt.label }}
                        </button>
                      </div>
                    </Transition>
                  </div>

                  <!-- 全屏 -->
                  <button 
                    @click.stop="toggleFullscreen"
                    class="p-2 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <component :is="isFullscreen ? Minimize : Maximize" :size="20" class="text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
