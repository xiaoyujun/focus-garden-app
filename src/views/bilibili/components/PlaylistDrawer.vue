<script setup>
import { List, X, RotateCcw, SkipBack, Pause, Play, SkipForward, RotateCw, VolumeX, Volume2 } from 'lucide-vue-next'

const props = defineProps({
  show: Boolean,
  playlist: Array,
  currentIndex: Number,
  isPlaying: Boolean,
  playbackRate: Number,
  volume: Number
})

const emit = defineEmits([
  'close', 'play-index', 'change-rate', 
  'rewind', 'prev', 'toggle-play', 'next', 'forward',
  'toggle-mute', 'update-volume'
])
</script>

<template>
  <div 
    v-if="show" 
    class="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-50 flex items-end"
    @click.self="$emit('close')"
  >
    <div class="bg-white/95 backdrop-blur-xl w-full max-h-[70vh] rounded-t-[2rem] flex flex-col animate-slide-up shadow-2xl border-t border-white/50">
      <!-- 头部 -->
      <div class="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-10">
        <h3 class="font-bold text-lg text-gray-800 flex items-center gap-2">
          <List :size="20" class="text-pink-500" />
          播放列表 <span class="text-sm font-normal text-gray-400">({{ playlist.length }})</span>
        </h3>
        <div class="flex items-center gap-2">
          <!-- 播放模式 -->
          <button @click="$emit('change-rate')" class="px-3 py-1.5 bg-pink-50 text-pink-600 rounded-lg text-xs font-bold">
            {{ playbackRate }}x
          </button>
          <button @click="$emit('close')" class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors">
            <X :size="20" />
          </button>
        </div>
      </div>
      
      <!-- 列表内容 -->
      <div class="flex-1 overflow-y-auto p-2">
        <div 
          v-for="(track, index) in playlist" 
          :key="track.cid"
          @click="$emit('play-index', index)"
          class="flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer transition-all group mb-1"
          :class="index === currentIndex ? 'bg-gradient-to-r from-pink-50 to-transparent' : 'hover:bg-gray-50'"
        >
          <div 
            class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
            :class="index === currentIndex ? 'bg-pink-100 text-pink-600' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-500'"
          >
            <span v-if="index === currentIndex && isPlaying" class="flex gap-0.5 items-end h-4">
              <span class="w-1 bg-pink-500 rounded-full animate-music-bar-1"></span>
              <span class="w-1 bg-pink-500 rounded-full animate-music-bar-2"></span>
              <span class="w-1 bg-pink-500 rounded-full animate-music-bar-3"></span>
            </span>
            <span v-else class="text-sm font-mono font-medium">{{ index + 1 }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p 
              class="text-base truncate font-medium transition-colors"
              :class="index === currentIndex ? 'text-pink-700' : 'text-gray-700'"
            >
              {{ track.title }}
            </p>
          </div>
          <div v-if="index === currentIndex" class="text-pink-500">
            <Play :size="18" fill="currentColor" />
          </div>
        </div>
      </div>

      <!-- 底部控制区 -->
      <div class="p-6 border-t border-gray-100 bg-white/50 backdrop-blur-md pb-8">
        <div class="flex items-center justify-center gap-6 mb-6">
          <button @click="$emit('rewind')" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <RotateCcw :size="20" />
            </div>
            <span class="text-[10px]">快退</span>
          </button>
          <button @click="$emit('prev')" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <SkipBack :size="24" fill="currentColor" />
            </div>
            <span class="text-[10px]">上一曲</span>
          </button>
          <button @click="$emit('toggle-play')" class="flex flex-col items-center gap-1 text-pink-600 transition-colors">
            <div class="w-16 h-16 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-lg shadow-pink-200 hover:scale-105 transition-transform">
              <Pause v-if="isPlaying" :size="32" fill="currentColor" />
              <Play v-else :size="32" fill="currentColor" class="ml-1" />
            </div>
          </button>
          <button @click="$emit('next')" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <SkipForward :size="24" fill="currentColor" />
            </div>
            <span class="text-[10px]">下一曲</span>
          </button>
          <button @click="$emit('forward')" class="flex flex-col items-center gap-1 text-gray-500 hover:text-pink-600 transition-colors">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <RotateCw :size="20" />
            </div>
            <span class="text-[10px]">快进</span>
          </button>
        </div>
        
        <!-- 音量 -->
        <div class="flex items-center gap-3 px-4">
          <button @click="$emit('toggle-mute')" class="text-gray-400 hover:text-pink-500">
            <VolumeX v-if="volume === 0" :size="20" />
            <Volume2 v-else :size="20" />
          </button>
          <div class="flex-1 h-8 flex items-center">
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="volume"
              @input="$emit('update-volume', parseFloat($event.target.value))"
              class="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
          </div>
          <span class="text-xs font-mono text-gray-400 w-8 text-right">{{ Math.round(volume * 100) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
