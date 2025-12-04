<script setup>
import { Home, Flame, RefreshCw } from 'lucide-vue-next'

const props = defineProps({
  mode: {
    type: String,
    default: 'recommend' // recommend | popular | zone
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:mode', 'refresh'])

const modes = [
  { value: 'recommend', label: '推荐', icon: Home },
  { value: 'popular', label: '热门', icon: Flame }
]
</script>

<template>
  <div class="flex items-center justify-between px-4 mb-4">
    <div class="flex bg-white/70 backdrop-blur-sm p-1 rounded-xl border border-white/50 shadow-sm">
      <button 
        v-for="item in modes" 
        :key="item.value"
        @click="$emit('update:mode', item.value)"
        class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300"
        :class="mode === item.value 
          ? 'bg-white text-pink-600 shadow-sm scale-105' 
          : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'"
      >
        <component :is="item.icon" :size="14" />
        {{ item.label }}
      </button>
    </div>

    <button 
      @click="$emit('refresh')"
      :disabled="isLoading"
      class="p-2 rounded-xl text-gray-400 hover:text-pink-500 hover:bg-white transition-all active:scale-95"
      title="刷新内容"
    >
      <RefreshCw :size="18" :class="{ 'animate-spin': isLoading }" />
    </button>
  </div>
</template>
