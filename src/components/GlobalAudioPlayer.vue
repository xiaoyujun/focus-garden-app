<script setup>
/**
 * 全局音频播放器
 * 包含隐藏的 audio 元素和迷你播放器浮层
 */
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnlineAudioStore } from '../stores/onlineAudioStore'
import { getAudioUrls } from '../services/bilibiliService'
import { Play, Pause, SkipForward, X, ChevronUp } from 'lucide-vue-next'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

// 平台判断
const isNative = Capacitor.isNativePlatform()

// 存储 Blob URL 以便后续释放
let currentBlobUrl = null

/**
 * 原生端通过 CapacitorHttp 获取音频并转为 Blob URL
 * 这样可以设置正确的 Referer 头绕过B站防盗链
 */
async function fetchAudioAsBlobUrl(url) {
  try {
    // 释放之前的 Blob URL
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl)
      currentBlobUrl = null
    }
    
    const response = await CapacitorHttp.get({
      url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Origin': 'https://www.bilibili.com'
      },
      responseType: 'blob'
    })
    
    // CapacitorHttp 返回 base64 编码的数据
    if (response.data) {
      let blob
      if (typeof response.data === 'string') {
        // base64 字符串转 Blob
        const byteCharacters = atob(response.data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        blob = new Blob([byteArray], { type: 'audio/mp4' })
      } else if (response.data instanceof Blob) {
        blob = response.data
      } else {
        throw new Error('未知的响应格式')
      }
      
      currentBlobUrl = URL.createObjectURL(blob)
      return currentBlobUrl
    }
    
    throw new Error('无法获取音频数据')
  } catch (error) {
    console.error('fetchAudioAsBlobUrl 失败:', error)
    throw error
  }
}

const route = useRoute()
const router = useRouter()
const store = useOnlineAudioStore()

const audioRef = ref(null)
const showMiniPlayer = computed(() => {
  // 在非 online 页面且有播放内容时显示迷你播放器
  return route.path !== '/online' && store.hasTrack
})

// 当前加载版本号
let loadVersion = 0

// 监听 audio 元素挂载
onMounted(() => {
  if (audioRef.value) {
    store.setAudioElement(audioRef.value)
  }
})

onUnmounted(() => {
  store.saveProgress(true)
  // 释放 Blob URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }
})

// 监听播放索引变化，自动加载新曲目
watch(() => store.currentIndex, async (newIndex, oldIndex) => {
  // 等待 audio 元素挂载
  if (!audioRef.value) return
  
  // index 为 -1 时表示正在切换视频，取消当前加载
  if (newIndex < 0) {
    loadVersion++ // 取消进行中的加载
    return
  }
  
  if (newIndex >= store.currentPlaylist.length) return
  // oldIndex 为 undefined 时是初始化，不自动播放（恢复上次状态）
  if (oldIndex === undefined) return
  
  await loadAndPlayTrack(newIndex)
})

// 加载并播放
async function loadAndPlayTrack(index) {
  const currentVersion = ++loadVersion
  
  store.saveProgress(true)
  store.isLoading = true
  store.error = ''
  
  // 先重置音频
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.removeAttribute('src')
    audioRef.value.load()
  }
  
  try {
    const track = store.currentPlaylist[index]
    if (!track) return
    
    // 获取音频URL
    const audioUrls = await getAudioUrls(track.bvid, track.cid)
    
    if (currentVersion !== loadVersion) return
    
    if (audioUrls.length === 0) {
      throw new Error('无法获取音频地址')
    }
    
    // 尝试播放
    let success = false
    for (let i = 0; i < Math.min(audioUrls.length, 3); i++) {
      if (currentVersion !== loadVersion) return
      
      try {
        await tryPlayUrl(audioUrls[i], track, currentVersion)
        success = true
        break
      } catch (e) {
        console.warn(`URL ${i + 1} 失败:`, e.message)
      }
    }
    
    if (!success) {
      throw new Error('所有音频地址都无法播放')
    }
    
    // 更新 Media Session
    store.updateMediaSession()
    
  } catch (error) {
    if (currentVersion !== loadVersion) return
    console.error('加载音频失败:', error)
    store.error = error.message || '加载失败'
  } finally {
    if (currentVersion === loadVersion) {
      store.isLoading = false
    }
  }
}

// 尝试使用URL播放
async function tryPlayUrl(url, track, version) {
  if (!audioRef.value || version !== loadVersion) {
    throw new Error('已取消')
  }
  
  const audio = audioRef.value
  
  // 原生端需要通过 CapacitorHttp 获取音频数据（带 Referer 绕过防盗链）
  // Web 端通过代理服务器访问
  let finalUrl
  if (isNative) {
    try {
      finalUrl = await fetchAudioAsBlobUrl(url)
    } catch (e) {
      console.warn('原生端获取音频失败，尝试直连:', e.message)
      finalUrl = url // fallback
    }
  } else {
    finalUrl = `/api/bili-proxy?url=${encodeURIComponent(url)}`
  }
  
  // 检查是否已取消
  if (version !== loadVersion) {
    throw new Error('已取消')
  }
  
  return new Promise((resolve, reject) => {
    // 登录用户使用官方 API，响应通常较快，8秒超时足够
    const timeout = setTimeout(() => reject(new Error('超时')), 8000)
    
    const onCanPlay = async () => {
      clearTimeout(timeout)
      cleanup()
      
      // 恢复进度
      const savedProgress = store.getSavedProgress(track)
      if (savedProgress > 0 && savedProgress < audio.duration - 5) {
        audio.currentTime = savedProgress
      }
      
      try {
        await audio.play()
        store.isPlaying = true
        resolve()
      } catch (e) {
        if (e.name === 'AbortError') {
          resolve() // 忽略中断
        } else {
          reject(e)
        }
      }
    }
    
    const onError = () => {
      clearTimeout(timeout)
      cleanup()
      reject(new Error('加载失败'))
    }
    
    const cleanup = () => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
    }
    
    audio.addEventListener('canplay', onCanPlay, { once: true })
    audio.addEventListener('error', onError, { once: true })
    
    audio.src = finalUrl
    audio.volume = store.volume
    audio.playbackRate = store.playbackRate
  })
}

// 音频事件处理
function onTimeUpdate() {
  if (audioRef.value) {
    store.currentTime = audioRef.value.currentTime
    store.saveProgress()
  }
}

function onDurationChange() {
  if (audioRef.value) {
    store.duration = audioRef.value.duration
  }
}

function onEnded() {
  store.clearTrackProgress(store.currentTrack)
  // 自动下一曲
  if (store.currentIndex < store.currentPlaylist.length - 1) {
    store.nextTrack()
  } else {
    store.isPlaying = false
  }
}

function onPlay() {
  store.isPlaying = true
}

function onPause() {
  store.isPlaying = false
  store.saveProgress(true)
}

function onError(e) {
  const audio = e.target
  if (!audio.src || audio.src === window.location.href) return
  
  console.error('音频错误:', audio.error)
  store.isPlaying = false
  store.isLoading = false
}

// 跳转到在线页面
function goToOnlinePage() {
  router.push('/online')
}

// 关闭迷你播放器
function closeMiniPlayer() {
  store.clearPlayback()
}
</script>

<template>
  <!-- 全局隐藏的 audio 元素 -->
  <audio
    ref="audioRef"
    @timeupdate="onTimeUpdate"
    @durationchange="onDurationChange"
    @ended="onEnded"
    @play="onPlay"
    @pause="onPause"
    @error="onError"
    preload="auto"
    playsinline
  />

  <!-- 迷你播放器浮层（非 online 页面显示） -->
  <Transition name="slide-up">
    <div 
      v-if="showMiniPlayer"
      class="fixed bottom-24 left-4 right-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-farm-200/50 z-40 overflow-hidden"
    >
      <!-- 进度条 -->
      <div class="h-1 bg-farm-100">
        <div 
          class="h-full bg-pink-500 transition-all"
          :style="{ width: store.progress + '%' }"
        ></div>
      </div>
      
      <div class="flex items-center gap-3 p-3">
        <!-- 封面 -->
        <div 
          @click="goToOnlinePage"
          class="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer"
        >
          <img 
            v-if="store.currentVideo?.cover"
            :src="store.currentVideo.cover"
            referrerpolicy="no-referrer"
            class="w-full h-full object-cover"
          />
          <div class="absolute inset-0 bg-black/10 flex items-center justify-center">
            <ChevronUp :size="16" class="text-white" />
          </div>
        </div>
        
        <!-- 信息 -->
        <div class="flex-1 min-w-0" @click="goToOnlinePage">
          <p class="font-medium text-farm-800 truncate text-sm">
            {{ store.currentTrack?.title || '未知标题' }}
          </p>
          <p class="text-xs text-farm-400 truncate">
            {{ store.formattedCurrentTime }} / {{ store.formattedDuration }}
            <span class="ml-1 text-pink-500">B站</span>
          </p>
        </div>
        
        <!-- 控制按钮 -->
        <div class="flex items-center gap-1">
          <!-- 播放/暂停 -->
          <button 
            @click="store.togglePlay"
            :disabled="store.isLoading"
            class="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center active:bg-pink-600"
          >
            <div v-if="store.isLoading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <Pause v-else-if="store.isPlaying" :size="18" fill="currentColor" />
            <Play v-else :size="18" fill="currentColor" class="ml-0.5" />
          </button>
          
          <!-- 下一曲 -->
          <button 
            @click="store.nextTrack"
            class="w-9 h-9 rounded-full text-farm-500 flex items-center justify-center active:bg-farm-100"
          >
            <SkipForward :size="18" fill="currentColor" />
          </button>
          
          <!-- 关闭 -->
          <button 
            @click="closeMiniPlayer"
            class="w-8 h-8 rounded-full text-farm-400 flex items-center justify-center active:bg-farm-100"
          >
            <X :size="16" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
