<script setup>
import { ExternalLink, User, Play } from 'lucide-vue-next'

const props = defineProps({
  video: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['play', 'open-uploader', 'open-browser'])

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatPlayCount(count) {
  if (!count) return '0'
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + '万'
  }
  return count.toString()
}
</script>

<template>
  <div 
    class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col h-full group cursor-pointer"
    @click="$emit('play', video)"
  >
    <!-- 封面区域 -->
    <div class="relative aspect-video w-full overflow-hidden bg-gray-100">
      <img 
        :src="video.cover" 
        :alt="video.title"
        referrerpolicy="no-referrer"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      
      <!-- 播放遮罩 -->
      <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
        <div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
          <Play :size="20" class="text-pink-500 ml-1" fill="currentColor" />
        </div>
      </div>

      <!-- 时长标签 -->
      <div class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-medium text-white bg-black/60 backdrop-blur-sm rounded-md flex items-center gap-1">
        {{ formatDuration(video.duration) }}
      </div>

      <!-- 推荐理由/角标 -->
      <div v-if="video.rcmdReason" class="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-bold text-white bg-pink-500/90 backdrop-blur-sm rounded-md shadow-sm">
        {{ video.rcmdReason }}
      </div>
      
      <div v-else-if="video.zoneLabel" class="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-bold text-white bg-violet-500/90 backdrop-blur-sm rounded-md shadow-sm">
        {{ video.zoneLabel }}
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="p-3 flex-1 flex flex-col">
      <h3 class="text-[13px] font-medium text-gray-800 leading-snug line-clamp-2 mb-2 group-hover:text-pink-600 transition-colors">
        {{ video.title }}
      </h3>

      <div class="mt-auto flex items-center justify-between text-xs text-gray-400">
        <button 
          @click.stop="$emit('open-uploader', video)"
          class="flex items-center gap-1 hover:text-pink-500 max-w-[65%] transition-colors"
        >
          <User :size="12" />
          <span class="truncate">{{ video.author }}</span>
        </button>

        <div class="flex items-center gap-2">
          <span class="text-[10px] bg-gray-50 px-1 rounded">{{ formatPlayCount(video.play) }}</span>
          <button 
            @click.stop="$emit('open-browser', video)"
            class="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="浏览器打开"
          >
            <ExternalLink :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
