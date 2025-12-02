<script setup>
import { User } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps({
  isLoggedIn: {
    type: Boolean,
    default: false
  },
  userInfo: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['login'])

const displayAvatar = computed(() => props.userInfo?.avatar || '')
const displayName = computed(() => props.userInfo?.userName || '已登录')
</script>

<template>
  <header class="pt-6 pb-2 px-6 flex items-center justify-between relative z-10 bg-gradient-to-b from-pink-50/80 to-transparent">
    <h1 class="text-2xl font-bold text-pink-900 flex items-center gap-2.5 tracking-tight">
      <div class="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center shadow-lg shadow-pink-200 text-white transform hover:scale-105 transition-transform duration-300">
        <span class="text-xl">📺</span>
      </div>
      <span>B站听书</span>
    </h1>
    
    <!-- B站登录按钮 -->
    <button 
      @click="$emit('login')"
      class="flex items-center gap-2 px-3 py-2 rounded-xl transition-all shadow-sm border active:scale-95"
      :class="isLoggedIn ? 'bg-white border-pink-100 text-pink-600 hover:bg-pink-50' : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'"
    >
      <img 
        v-if="isLoggedIn && displayAvatar" 
        :src="displayAvatar" 
        referrerpolicy="no-referrer"
        class="w-6 h-6 rounded-full ring-2 ring-pink-100"
      />
      <User v-else :size="18" />
      <span class="text-xs font-medium">{{ isLoggedIn ? displayName : '登录B站' }}</span>
    </button>
  </header>
</template>
