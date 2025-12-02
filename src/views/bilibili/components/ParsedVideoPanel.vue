<script setup>
import { User, Play, Loader2, Download, List } from 'lucide-vue-next'
import { ref } from 'vue'

const props = defineProps({
  parsedVideo: Object,
  batchDownloadState: Object,
  batchDownloadMessage: String,
  batchDownloadError: String
})

const emit = defineEmits(['play', 'open-uploader', 'download-all'])

const showParsedPages = ref(false)

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
</script>

<template>
  <div v-if="parsedVideo" class="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden">
      <!-- 头部：封面和基本信息 -->
      <div class="flex gap-4 p-4">
        <div class="relative flex-shrink-0">
          <img 
            :src="parsedVideo.cover" 
            :alt="parsedVideo.title"
            referrerpolicy="no-referrer"
            class="w-32 h-24 object-cover rounded-xl shadow-sm"
          />
          <!-- 多P标识 -->
          <span class="absolute top-1 left-1 px-2 py-0.5 text-[10px] rounded-md text-white bg-pink-500 backdrop-blur-[2px] shadow-sm font-bold">
            📚 {{ parsedVideo.pageCount }}集
          </span>
        </div>
        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h3 class="font-bold text-gray-800 line-clamp-2 text-sm leading-snug mb-1">{{ parsedVideo.title }}</h3>
            <button 
              @click.stop="$emit('open-uploader', { mid: parsedVideo.mid, name: parsedVideo.author })"
              class="text-xs text-gray-500 flex items-center gap-1 hover:text-pink-600 transition-colors"
            >
              <User :size="12" />
              <span class="truncate max-w-[100px]">{{ parsedVideo.author }}</span>
            </button>
          </div>
          <div class="flex items-center gap-2 mt-2">
            <button 
              @click="$emit('play', 0)"
              class="flex items-center gap-1.5 px-4 py-2 bg-pink-500 text-white rounded-xl text-xs font-bold hover:bg-pink-600 shadow-md shadow-pink-200 transition-all"
            >
              <Play :size="14" fill="currentColor" />
              从头播放
            </button>
            <button 
              @click="$emit('download-all')"
              :disabled="batchDownloadState.running"
              class="flex items-center gap-1.5 px-3 py-2 bg-white text-pink-600 rounded-xl text-xs font-bold border border-pink-100 hover:bg-pink-50 transition-colors disabled:opacity-50"
            >
              <Loader2 v-if="batchDownloadState.running" :size="14" class="animate-spin" />
              <Download v-else :size="14" />
              {{ batchDownloadState.running ? `缓存中 ${batchDownloadState.finished + batchDownloadState.failed}/${batchDownloadState.total}` : '批量下载' }}
            </button>
            <button 
              @click="showParsedPages = !showParsedPages"
              class="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              <List :size="14" />
              {{ showParsedPages ? '收起' : '选集' }}
            </button>
          </div>
          <div v-if="batchDownloadState.running || batchDownloadMessage || batchDownloadError" class="mt-2 text-xs space-y-1">
            <p v-if="batchDownloadState.running" class="text-pink-500 flex items-center gap-1">
              <Loader2 :size="12" class="animate-spin" />
              正在缓存音频 {{ batchDownloadState.finished + batchDownloadState.failed }}/{{ batchDownloadState.total }}
            </p>
            <p v-if="batchDownloadMessage" class="text-emerald-600">{{ batchDownloadMessage }}</p>
            <p v-if="batchDownloadError" class="text-red-500">{{ batchDownloadError }}</p>
          </div>
        </div>
      </div>
      
      <!-- 分P列表（可折叠） -->
      <Transition name="expand">
        <div v-if="showParsedPages" class="border-t border-gray-100">
          <div class="p-3 bg-gray-50/50">
            <div class="flex items-center justify-between mb-2 px-1">
              <span class="text-xs font-medium text-gray-500">选择章节开始播放</span>
              <span class="text-[10px] text-gray-400">共 {{ parsedVideo.pageCount }} 集</span>
            </div>
            <div class="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
              <button 
                v-for="(page, index) in parsedVideo.pages" 
                :key="page.cid"
                @click="$emit('play', index)"
                class="w-full flex items-center gap-3 p-2.5 bg-white rounded-xl text-left hover:bg-pink-50 hover:border-pink-200 border border-gray-100 transition-all group"
              >
                <span class="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 text-xs font-bold group-hover:bg-pink-500 group-hover:text-white transition-colors">
                  {{ page.page }}
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-700 truncate group-hover:text-pink-600">{{ page.title }}</p>
                  <p v-if="page.duration" class="text-[10px] text-gray-400 mt-0.5">{{ formatDuration(page.duration) }}</p>
                </div>
                <Play :size="14" class="text-gray-300 group-hover:text-pink-500 flex-shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  max-height: 500px;
  opacity: 1;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
