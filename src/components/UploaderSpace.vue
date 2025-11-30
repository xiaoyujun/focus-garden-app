<script setup>
import { ref, onMounted, computed } from 'vue'
import { X, User, Play, Clock, ChevronRight, Loader2 } from 'lucide-vue-next'
import { getUploaderInfo, getUploaderStat, getUploaderVideos } from '../services/bilibiliService'

const props = defineProps({
  mid: { type: Number, required: true },
  initialName: { type: String, default: '' }
})

const emit = defineEmits(['close', 'play-video'])

// 状态
const isLoading = ref(true)
const uploaderInfo = ref(null)
const uploaderStat = ref(null)
const videos = ref([])
const page = ref(1)
const hasMore = ref(true)
const isLoadingMore = ref(false)
const error = ref('')

// 格式化粉丝数
function formatNumber(num) {
  if (!num) return '0'
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toString()
}

// 格式化时长
function formatDuration(duration) {
  if (!duration) return '00:00'
  // 如果是 "MM:SS" 格式字符串
  if (typeof duration === 'string' && duration.includes(':')) {
    return duration
  }
  // 如果是秒数
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// 加载UP主信息
async function loadUploaderData() {
  isLoading.value = true
  error.value = ''
  
  try {
    // 并行获取UP主信息和统计
    const [info, stat, videoData] = await Promise.all([
      getUploaderInfo(props.mid),
      getUploaderStat(props.mid),
      getUploaderVideos(props.mid, 1, 20)
    ])
    
    uploaderInfo.value = info
    uploaderStat.value = stat
    videos.value = videoData.videos
    hasMore.value = videoData.total > videos.value.length
    page.value = 1
  } catch (e) {
    console.error('加载UP主信息失败:', e)
    error.value = e.message || '加载失败'
  } finally {
    isLoading.value = false
  }
}

// 加载更多视频
async function loadMoreVideos() {
  if (isLoadingMore.value || !hasMore.value) return
  
  isLoadingMore.value = true
  try {
    const nextPage = page.value + 1
    const videoData = await getUploaderVideos(props.mid, nextPage, 20)
    
    videos.value = [...videos.value, ...videoData.videos]
    page.value = nextPage
    hasMore.value = videoData.total > videos.value.length
  } catch (e) {
    console.error('加载更多视频失败:', e)
  } finally {
    isLoadingMore.value = false
  }
}

// 播放视频
function handlePlayVideo(video) {
  emit('play-video', {
    id: video.bvid,
    bvid: video.bvid,
    title: video.title,
    cover: video.cover,
    author: uploaderInfo.value?.name || props.initialName,
    mid: props.mid,
    duration: video.duration,
    source: 'bilibili'
  })
}

onMounted(() => {
  loadUploaderData()
})
</script>

<template>
  <div class="fixed inset-0 bg-farm-900/50 backdrop-blur-sm z-50 flex items-end justify-center" @click.self="$emit('close')">
    <div class="bg-white w-full max-w-md rounded-t-3xl max-h-[85vh] flex flex-col animate-slide-up">
      <!-- 头部 -->
      <div class="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
        <h3 class="font-bold text-gray-800">UP主空间</h3>
        <button @click="$emit('close')" class="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
          <X :size="18" />
        </button>
      </div>

      <!-- 内容区 -->
      <div class="flex-1 overflow-y-auto">
        <!-- 加载中 -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-16">
          <Loader2 :size="32" class="text-nature-500 animate-spin mb-3" />
          <p class="text-gray-400 text-sm">加载中...</p>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="error" class="text-center py-16 px-4">
          <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <User :size="24" class="text-red-300" />
          </div>
          <p class="text-gray-500 text-sm mb-4">{{ error }}</p>
          <button @click="loadUploaderData" class="px-4 py-2 bg-nature-500 text-white rounded-lg text-sm">
            重试
          </button>
        </div>

        <!-- 内容 -->
        <template v-else>
          <!-- UP主信息卡片 -->
          <div class="p-4 bg-gradient-to-r from-nature-50 to-farm-50">
            <div class="flex gap-4">
              <!-- 头像 -->
              <img 
                v-if="uploaderInfo?.face"
                :src="uploaderInfo.face"
                referrerpolicy="no-referrer"
                class="w-16 h-16 rounded-full border-2 border-white shadow-md"
              />
              <div v-else class="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                <User :size="24" class="text-gray-400" />
              </div>
              
              <!-- 信息 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-gray-800 truncate">
                    {{ uploaderInfo?.name || initialName }}
                  </h4>
                  <!-- 等级 -->
                  <span 
                    v-if="uploaderInfo?.level"
                    class="px-1.5 py-0.5 text-[10px] rounded bg-nature-100 text-nature-600 font-medium"
                  >
                    Lv{{ uploaderInfo.level }}
                  </span>
                  <!-- 认证 -->
                  <span 
                    v-if="uploaderInfo?.official?.title"
                    class="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-600"
                  >
                    {{ uploaderInfo.official.type === 0 ? '个人' : '机构' }}
                  </span>
                </div>
                
                <!-- 统计 -->
                <div class="flex gap-4 mt-2 text-sm">
                  <div>
                    <span class="text-gray-800 font-medium">{{ formatNumber(uploaderStat?.follower) }}</span>
                    <span class="text-gray-400 ml-1">粉丝</span>
                  </div>
                  <div>
                    <span class="text-gray-800 font-medium">{{ formatNumber(uploaderStat?.following) }}</span>
                    <span class="text-gray-400 ml-1">关注</span>
                  </div>
                </div>
                
                <!-- 签名 -->
                <p v-if="uploaderInfo?.sign" class="text-xs text-gray-400 mt-2 line-clamp-2">
                  {{ uploaderInfo.sign }}
                </p>
              </div>
            </div>
          </div>

          <!-- 视频列表 -->
          <div class="p-4">
            <h5 class="text-sm font-medium text-gray-600 mb-3 flex items-center gap-1">
              <Play :size="14" />
              TA的投稿
            </h5>
            
            <div class="space-y-3">
              <div 
                v-for="video in videos"
                :key="video.bvid"
                @click="handlePlayVideo(video)"
                class="flex gap-3 p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <!-- 封面 -->
                <div class="relative flex-shrink-0">
                  <img 
                    :src="video.cover?.startsWith('//') ? `https:${video.cover}` : video.cover"
                    referrerpolicy="no-referrer"
                    class="w-28 h-[72px] object-cover rounded-lg"
                  />
                  <!-- 时长 -->
                  <span class="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 text-white text-[10px] rounded">
                    {{ formatDuration(video.duration) }}
                  </span>
                </div>
                
                <!-- 信息 -->
                <div class="flex-1 min-w-0 py-0.5">
                  <h6 class="text-sm text-gray-800 line-clamp-2 font-medium leading-tight">
                    {{ video.title }}
                  </h6>
                  <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <span class="flex items-center gap-0.5">
                      <Play :size="12" />
                      {{ formatNumber(video.play) }}
                    </span>
                  </div>
                </div>
                
                <ChevronRight :size="16" class="text-gray-300 self-center flex-shrink-0" />
              </div>
            </div>

            <!-- 加载更多 -->
            <div v-if="hasMore" class="mt-4 text-center">
              <button 
                @click="loadMoreVideos"
                :disabled="isLoadingMore"
                class="px-4 py-2 text-sm text-nature-600 bg-nature-50 rounded-lg hover:bg-nature-100 disabled:opacity-50"
              >
                <span v-if="isLoadingMore" class="flex items-center gap-1">
                  <Loader2 :size="14" class="animate-spin" />
                  加载中...
                </span>
                <span v-else>加载更多</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
</style>
