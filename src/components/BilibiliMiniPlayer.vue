<script setup>
/**
 * B站视频 Mini 播放器
 * 底部悬浮式，单一视频源，支持后台播放
 * 原生端通过 CapacitorHttp 下载音频后用 Blob URL 播放
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { 
  Play, Pause, Volume2, VolumeX, ChevronUp, ChevronDown, X, Settings,
  Heart, SkipBack, SkipForward, Loader2, AlertCircle, RotateCcw, ExternalLink
} from 'lucide-vue-next'
import { QUALITY_MAP } from '../services/bilibiliService'
const REMOTE_PROXY_URL = import.meta.env.VITE_BILI_PROXY_URL || ''

const props = defineProps({
  playInfo: { type: Object, default: null },
  videoInfo: { type: Object, default: null },
  currentPage: { type: Object, default: null },
  qualityOptions: { type: Array, default: () => [] },
  currentQuality: { type: Number, default: 80 },
  visible: { type: Boolean, default: false },
  isFavorited: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'quality-change', 'ended', 'error', 'toggle-favorite', 'open-browser'])

const isNative = Capacitor.isNativePlatform()

// 单一 Refs
const videoRef = ref(null)
const audioRef = ref(null)

// State
const isExpanded = ref(false)
const isPlaying = ref(false)
const isBuffering = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const isMuted = ref(false)
const error = ref('')
const showQualityMenu = ref(false)

// 原生端 Blob URL 缓存
const nativeAudioBlobUrl = ref('')
const nativeVideoBlobUrl = ref('')

// 防止 play/load 竞态
let isLoadingMedia = false
let currentPlayPromise = null

// Computed
const isDashMode = computed(() => props.playInfo?.type === 'dash' && props.playInfo?.audioUrl)
const progressPercent = computed(() => duration.value ? (currentTime.value / duration.value) * 100 : 0)
const currentQualityName = computed(() => QUALITY_MAP[props.currentQuality] || '默认')

// 获取播放 URL（Web 用代理，原生用 Blob URL）
const audioSrc = computed(() => {
  if (isNative && nativeAudioBlobUrl.value) return nativeAudioBlobUrl.value
  const url = isDashMode.value ? props.playInfo?.audioUrl : props.playInfo?.videoUrl
  return buildProxyUrl(url)
})

const videoSrc = computed(() => {
  if (isNative && nativeVideoBlobUrl.value) return nativeVideoBlobUrl.value
  return buildProxyUrl(props.playInfo?.videoUrl)
})

// 构建代理后的 URL，优先使用远程代理，原生无代理时退回直连
function buildProxyUrl(url) {
  if (!url) return ''
  if (REMOTE_PROXY_URL) {
    return `${REMOTE_PROXY_URL}${encodeURIComponent(url)}`
  }
  return isNative ? url : `/api/bili-proxy?url=${encodeURIComponent(url)}`
}

// 原生端：使用 CapacitorHttp 下载媒体并创建 Blob URL
async function loadNativeMedia() {
  if (!isNative || !props.playInfo) return
  
  isBuffering.value = true
  error.value = ''
  
  // 清理旧的 Blob URL
  cleanupBlobUrls()
  
  try {
    // 下载音频（主要）
    const audioUrl = isDashMode.value ? props.playInfo.audioUrl : props.playInfo.videoUrl
    if (audioUrl) {
      console.log('[原生播放] 下载音频...', audioUrl.substring(0, 80))
      const downloadUrl = REMOTE_PROXY_URL ? `${REMOTE_PROXY_URL}${encodeURIComponent(audioUrl)}` : audioUrl
      const audioBlob = await fetchMediaAsBlob(downloadUrl)
      nativeAudioBlobUrl.value = URL.createObjectURL(audioBlob)
      console.log('[原生播放] 音频 Blob URL 创建成功')
    }
    
    // DASH 模式下还需要下载视频（仅用于画面显示）
    if (isDashMode.value && props.playInfo.videoUrl) {
      // 视频较大，可选择延迟加载或不加载
      // 这里先不下载视频，用封面替代
      console.log('[原生播放] DASH 模式，视频画面使用封面替代')
    }
    
    isBuffering.value = false
  } catch (e) {
    console.error('[原生播放] 加载失败:', e)
    error.value = '加载失败: ' + (e.message || '网络错误')
    isBuffering.value = false
  }
}

// 使用 CapacitorHttp 下载媒体文件
async function fetchMediaAsBlob(url) {
  const response = await CapacitorHttp.get({
    url,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Origin': 'https://www.bilibili.com'
    },
    responseType: 'blob'
  })
  
  // CapacitorHttp 返回 base64 或 ArrayBuffer
  if (response.data instanceof Blob) {
    return response.data
  }
  
  // 如果是 base64 字符串
  if (typeof response.data === 'string') {
    const byteCharacters = atob(response.data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: 'audio/mp4' })
  }
  
  // ArrayBuffer
  return new Blob([response.data], { type: 'audio/mp4' })
}

// 清理 Blob URL
function cleanupBlobUrls() {
  if (nativeAudioBlobUrl.value) {
    URL.revokeObjectURL(nativeAudioBlobUrl.value)
    nativeAudioBlobUrl.value = ''
  }
  if (nativeVideoBlobUrl.value) {
    URL.revokeObjectURL(nativeVideoBlobUrl.value)
    nativeVideoBlobUrl.value = ''
  }
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
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
    if (e.name === 'AbortError') {
      console.log('[播放] 被新加载中断，忽略')
      return
    }
    throw e
  }
}

// 播放控制
async function togglePlay() {
  if (!audioRef.value || isLoadingMedia) return
  try {
    if (isPlaying.value) {
      audioRef.value.pause()
      if (videoRef.value) videoRef.value.pause()
    } else {
      await safePlay(audioRef.value)
      if (videoRef.value) safePlay(videoRef.value)
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      error.value = '播放失败: ' + e.message
    }
  }
}

// 同步视频画面到音频时间
function syncVideo() {
  if (!videoRef.value || !audioRef.value) return
  if (Math.abs(videoRef.value.currentTime - audioRef.value.currentTime) > 0.5) {
    videoRef.value.currentTime = audioRef.value.currentTime
  }
}

function seekTo(time) {
  if (audioRef.value) audioRef.value.currentTime = time
  if (videoRef.value) videoRef.value.currentTime = time
  currentTime.value = time
}

function onProgressClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  seekTo(percent * duration.value)
}

function skip(s) { seekTo(Math.max(0, Math.min(duration.value, currentTime.value + s))) }
function toggleMute() { 
  isMuted.value = !isMuted.value 
  if (audioRef.value) audioRef.value.muted = isMuted.value
}
function toggleExpand() { isExpanded.value = !isExpanded.value }
function closePlayer() {
  if (audioRef.value) audioRef.value.pause()
  if (videoRef.value) videoRef.value.pause()
  isExpanded.value = false
  emit('close')
}

// 音频事件（主控）
function onAudioPlay() {
  isPlaying.value = true
  if (videoRef.value) videoRef.value.play().catch(() => {})
  updateMediaSession()
}
function onAudioPause() {
  isPlaying.value = false
  if (videoRef.value) videoRef.value.pause()
}
function onAudioTimeUpdate() {
  if (audioRef.value) currentTime.value = audioRef.value.currentTime
  syncVideo()
}
function onAudioLoadedMetadata() {
  if (audioRef.value) duration.value = audioRef.value.duration || props.playInfo?.duration || 0
  isBuffering.value = false
  updateMediaSession()
  // 自动播放
  if (!isLoadingMedia) {
    safePlay(audioRef.value)
  }
}
function onAudioWaiting() { isBuffering.value = true }
function onAudioCanPlay() { isBuffering.value = false }
function onAudioEnded() { isPlaying.value = false; emit('ended') }
function onAudioError() { error.value = '音频加载失败'; emit('error', error.value) }

// Media Session（后台播放控制）
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: props.videoInfo?.title || 'B站视频',
    artist: props.videoInfo?.author || '',
    artwork: props.videoInfo?.cover ? [{ src: props.videoInfo.cover, sizes: '512x512', type: 'image/jpeg' }] : []
  })
  navigator.mediaSession.setActionHandler('play', togglePlay)
  navigator.mediaSession.setActionHandler('pause', togglePlay)
  navigator.mediaSession.setActionHandler('seekbackward', () => skip(-10))
  navigator.mediaSession.setActionHandler('seekforward', () => skip(10))
}

function retryPlay() {
  error.value = ''
  isBuffering.value = true
  if (isNative) {
    loadNativeMedia()
  } else {
    audioRef.value?.load()
    videoRef.value?.load()
  }
}

// 监听播放源变化
watch(() => props.playInfo?.videoUrl, async (url) => {
  if (url) {
    error.value = ''
    isBuffering.value = true
    currentTime.value = 0
    isLoadingMedia = true
    
    // 等待当前播放完成
    if (currentPlayPromise) {
      try { await currentPlayPromise } catch (e) {}
      currentPlayPromise = null
    }
    
    // 先暂停
    audioRef.value?.pause()
    videoRef.value?.pause()
    
    if (isNative) {
      // 原生端：下载媒体后播放
      await loadNativeMedia()
      nextTick(() => {
        audioRef.value?.load()
        setTimeout(() => {
          isLoadingMedia = false
          safePlay(audioRef.value)
        }, 100)
      })
    } else {
      // Web 端：直接加载代理 URL
      nextTick(() => {
        audioRef.value?.load()
        videoRef.value?.load()
        setTimeout(() => {
          isLoadingMedia = false
        }, 100)
      })
    }
  }
})

// visible 变化时自动播放
watch(() => props.visible, async (v) => {
  if (v && props.playInfo) {
    if (isNative && !nativeAudioBlobUrl.value) {
      // 原生端首次打开需要先加载
      await loadNativeMedia()
    }
    if (!isLoadingMedia) {
      nextTick(() => safePlay(audioRef.value))
    }
  }
})

onMounted(() => {
  if (audioRef.value) audioRef.value.volume = 1
})

onBeforeUnmount(() => {
  cleanupBlobUrls()
})
</script>

<template>
  <Transition name="slide-up">
    <div 
      v-if="visible && playInfo"
      class="fixed left-0 right-0 z-40"
      :class="isExpanded ? 'top-0 bottom-0' : 'bottom-24'"
    >
      <!-- 隐藏的音频元素（主控，支持后台播放） -->
      <audio
        ref="audioRef"
        :src="audioSrc"
        preload="auto"
        class="hidden"
        @play="onAudioPlay"
        @pause="onAudioPause"
        @timeupdate="onAudioTimeUpdate"
        @loadedmetadata="onAudioLoadedMetadata"
        @waiting="onAudioWaiting"
        @canplay="onAudioCanPlay"
        @ended="onAudioEnded"
        @error="onAudioError"
      />

      <!-- 背景遮罩（展开时） -->
      <div 
        v-if="isExpanded"
        class="absolute inset-0 bg-black/95"
        @click="toggleExpand"
      />

      <!-- 播放器容器 -->
      <div 
        class="relative bg-gray-900 shadow-2xl transition-all duration-300"
        :class="isExpanded ? 'h-full flex flex-col' : 'rounded-t-2xl'"
      >
        <!-- 展开状态 -->
        <div v-if="isExpanded" class="flex-1 flex flex-col">
          <!-- 顶部栏 -->
          <div class="flex items-center justify-between p-4">
            <button @click="toggleExpand" class="p-2 rounded-full hover:bg-white/10">
              <ChevronDown :size="24" class="text-white" />
            </button>
            <div class="text-center flex-1 px-4">
              <p class="text-white text-sm font-medium truncate">{{ videoInfo?.title }}</p>
            </div>
            <button @click="closePlayer" class="p-2 rounded-full hover:bg-white/10">
              <X :size="20" class="text-gray-400" />
            </button>
          </div>

          <!-- 视频画面 -->
          <div class="flex-1 flex items-center justify-center px-4">
            <div class="relative w-full max-w-lg aspect-video bg-black rounded-2xl overflow-hidden" @click="togglePlay">
              <video
                v-if="isDashMode && !isNative"
                ref="videoRef"
                :src="videoSrc"
                class="w-full h-full object-contain"
                preload="auto"
                playsinline
                webkit-playsinline
                muted
              />
              <!-- 非 DASH 模式显示封面 -->
              <img 
                v-else-if="videoInfo?.cover"
                :src="videoInfo.cover"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover"
              />
              
              <!-- 加载/错误/播放状态 -->
              <div class="absolute inset-0 flex items-center justify-center">
                <Loader2 v-if="isBuffering && !error" :size="48" class="animate-spin text-white" />
                <div v-else-if="error" class="text-center p-4">
                  <AlertCircle :size="40" class="text-red-400 mx-auto mb-2" />
                  <p class="text-white text-sm mb-3">{{ error }}</p>
                  <button @click.stop="retryPlay" class="px-4 py-2 bg-pink-500 rounded-lg text-sm text-white">重试</button>
                </div>
                <div v-else-if="!isPlaying" class="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Play :size="32" class="text-white ml-1" />
                </div>
              </div>
            </div>
          </div>

          <!-- 控制区 -->
          <div class="p-4 space-y-4">
            <!-- 进度条 -->
            <div class="space-y-2">
              <div 
                class="h-1.5 bg-gray-700 rounded-full cursor-pointer"
                @click="onProgressClick"
              >
                <div class="h-full bg-pink-500 rounded-full" :style="{ width: `${progressPercent}%` }" />
              </div>
              <div class="flex justify-between text-xs text-gray-400">
                <span>{{ formatTime(currentTime) }}</span>
                <span>{{ formatTime(duration) }}</span>
              </div>
            </div>

            <!-- 播放控制 -->
            <div class="flex items-center justify-center gap-8">
              <button @click="skip(-10)" class="p-3 hover:bg-white/10 rounded-full">
                <SkipBack :size="28" class="text-white" />
              </button>
              <button 
                @click="togglePlay"
                class="w-16 h-16 rounded-full bg-pink-500 flex items-center justify-center hover:bg-pink-600"
              >
                <component :is="isPlaying ? Pause : Play" :size="32" class="text-white" :class="!isPlaying && 'ml-1'" />
              </button>
              <button @click="skip(10)" class="p-3 hover:bg-white/10 rounded-full">
                <SkipForward :size="28" class="text-white" />
              </button>
            </div>

            <!-- 功能按钮 - 居中均匀分布 -->
            <div class="flex items-center justify-center gap-8">
              <button @click="$emit('toggle-favorite')" class="flex flex-col items-center gap-1 w-14">
                <Heart :size="24" :class="isFavorited ? 'text-pink-500 fill-pink-500' : 'text-gray-400'" />
                <span class="text-[10px] text-gray-500">收藏</span>
              </button>
              <button @click="toggleMute" class="flex flex-col items-center gap-1 w-14">
                <component :is="isMuted ? VolumeX : Volume2" :size="24" class="text-gray-400" />
                <span class="text-[10px] text-gray-500">{{ isMuted ? '静音' : '声音' }}</span>
              </button>
              <!-- 画质 -->
              <div class="relative flex flex-col items-center gap-1 w-14">
                <button @click="showQualityMenu = !showQualityMenu" class="p-1">
                  <Settings :size="24" class="text-gray-400" />
                </button>
                <span class="text-[10px] text-gray-500">{{ currentQualityName }}</span>
                <div v-if="showQualityMenu" class="absolute bottom-full mb-2 bg-gray-800 rounded-xl overflow-hidden shadow-xl min-w-[120px] z-10">
                  <button 
                    v-for="opt in qualityOptions" :key="opt.value"
                    @click="$emit('quality-change', opt.value); showQualityMenu = false"
                    class="w-full px-4 py-2.5 text-left text-sm hover:bg-white/10"
                    :class="opt.value === currentQuality ? 'text-pink-400' : 'text-white'"
                  >{{ opt.label }}</button>
                </div>
              </div>
              <button @click="$emit('open-browser')" class="flex flex-col items-center gap-1 w-14">
                <ExternalLink :size="24" class="text-gray-400" />
                <span class="text-[10px] text-gray-500">浏览器</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 收起状态：Mini 播放条 -->
        <template v-else>
          <div class="flex items-center gap-3 p-3">
            <!-- 封面/缩略图 -->
            <div class="relative w-14 h-14 bg-gray-800 rounded-xl overflow-hidden flex-shrink-0" @click="toggleExpand">
              <img 
                v-if="videoInfo?.cover"
                :src="videoInfo.cover"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover"
              />
              <div class="absolute inset-0 flex items-center justify-center bg-black/40">
                <ChevronUp :size="20" class="text-white" />
              </div>
            </div>

            <!-- 信息 -->
            <div class="flex-1 min-w-0" @click="toggleExpand">
              <p class="text-sm text-white font-medium truncate">{{ videoInfo?.title || '加载中...' }}</p>
              <p class="text-xs text-gray-400">{{ videoInfo?.author }} · {{ formatTime(currentTime) }}/{{ formatTime(duration) }}</p>
            </div>

            <!-- 控制 -->
            <div class="flex items-center">
              <button @click="togglePlay" class="p-2.5 rounded-full hover:bg-white/10">
                <component :is="isPlaying ? Pause : Play" :size="24" class="text-white" />
              </button>
              <button @click="closePlayer" class="p-2 rounded-full hover:bg-white/10">
                <X :size="20" class="text-gray-400" />
              </button>
            </div>
          </div>

          <!-- Mini 进度条 -->
          <div class="h-0.5 bg-gray-700" @click="onProgressClick">
            <div class="h-full bg-pink-500" :style="{ width: `${progressPercent}%` }" />
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0);
}
</style>
