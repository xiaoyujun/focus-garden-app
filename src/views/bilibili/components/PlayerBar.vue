<script setup>
import { Pause, Play, SkipForward, List } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps({
  currentTrack: Object,
  currentPlaylist: Array,
  currentIndex: Number,
  isPlaying: Boolean,
  isLoading: Boolean,
  currentTime: String,
  duration: String,
  displayProgress: Number,
  parseMode: String,
  parseModeOptions: Array,
  videoMode: Boolean
})

const emit = defineEmits([
  'toggle-play', 'next', 'show-playlist', 
  'seek-start', 'seek-move', 'seek-end',
  'change-parse-mode', 'toggle-video-mode'
])

const currentParseDesc = computed(() => {
  return props.parseModeOptions.find(opt => opt.value === props.parseMode)?.desc || ''
})
</script>

<template>
  <div v-if="currentTrack" class="fixed bottom-24 left-4 right-4 z-40">
    <div class="bg-white/90 backdrop-blur-xl rounded-[2rem] p-4 shadow-2xl shadow-pink-900/10 border border-white/50">
      <!-- 进度条 -->
      <div 
        class="absolute -top-1 left-6 right-6 h-2 cursor-pointer group"
        @mousedown="$emit('seek-start', $event)"
        @mousemove="$emit('seek-move', $event)"
        @mouseup="$emit('seek-end')"
        @mouseleave="$emit('seek-end')"
        @touchstart="$emit('seek-start', $event)"
        @touchmove="$emit('seek-move', $event)"
        @touchend="$emit('seek-end')"
      >
        <div class="h-full bg-pink-100 rounded-full overflow-hidden">
          <div 
            class="h-full bg-gradient-to-r from-pink-400 to-pink-600 transition-all group-hover:from-pink-500 group-hover:to-pink-700"
            :style="{ width: displayProgress + '%' }"
          ></div>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <!-- 封面 -->
        <div 
          @click="$emit('show-playlist')"
          class="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 shadow-md cursor-pointer relative group"
        >
          <img 
            v-if="currentTrack.cover"
            :src="currentTrack.cover"
            referrerpolicy="no-referrer"
            class="w-full h-full object-cover transition-transform group-hover:scale-110"
          />
          <!-- 播放动画覆盖层 -->
          <div v-if="isPlaying" class="absolute inset-0 bg-black/20 flex items-center justify-center gap-1">
            <div class="w-1 h-3 bg-white rounded-full animate-music-bar-1"></div>
            <div class="w-1 h-5 bg-white rounded-full animate-music-bar-2"></div>
            <div class="w-1 h-2 bg-white rounded-full animate-music-bar-3"></div>
          </div>
        </div>

        <!-- 信息 -->
        <div class="flex-1 min-w-0" @click="$emit('show-playlist')">
          <p class="font-bold text-gray-900 truncate text-sm mb-0.5">{{ currentTrack.title }}</p>
          <div class="flex items-center gap-2 text-xs text-gray-400">
            <span class="font-mono">{{ currentTime }} / {{ duration }}</span>
            <span v-if="currentPlaylist.length > 1" class="px-1.5 py-0.5 rounded bg-pink-50 text-pink-500 font-medium text-[10px]">
              {{ currentIndex + 1 }}/{{ currentPlaylist.length }}
            </span>
          </div>
        </div>

        <!-- 控制按钮 -->
        <div class="flex items-center gap-2">
          <button 
            @click="$emit('toggle-play')"
            :disabled="isLoading || videoMode"
            class="w-12 h-12 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-lg shadow-pink-200 hover:scale-105 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <div v-if="isLoading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <Pause v-else-if="isPlaying" :size="24" fill="currentColor" />
            <Play v-else :size="24" fill="currentColor" class="ml-1" />
          </button>
          
          <button @click="$emit('next')" class="w-10 h-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center hover:bg-pink-100 transition-colors">
            <SkipForward :size="20" fill="currentColor" />
          </button>
        </div>
      </div>

      <!-- 解析模式切换 -->
      <div class="mt-3 px-1">
        <div class="flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
          <span class="text-gray-700 font-semibold">解析模式</span>
          <div class="flex gap-2 flex-wrap">
            <button 
              v-for="opt in parseModeOptions" 
              :key="opt.value"
              @click="$emit('change-parse-mode', opt.value)"
              class="px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all"
              :class="parseMode === opt.value 
                ? 'bg-pink-500 text-white border-pink-500 shadow-pink-200 shadow-sm' 
                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'"
            >
              {{ opt.label }}
            </button>
          </div>
          <button 
            @click="$emit('toggle-video-mode')" 
            class="px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all"
            :class="videoMode 
              ? 'bg-emerald-500 text-white border-emerald-500 shadow-emerald-200 shadow-sm' 
              : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'"
          >
            视频模式 {{ videoMode ? '已开启' : '关闭' }}
          </button>
          <span class="text-[10px] text-gray-400 truncate max-w-full">
            {{ videoMode ? '使用官方播放器观看画面' : currentParseDesc }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
