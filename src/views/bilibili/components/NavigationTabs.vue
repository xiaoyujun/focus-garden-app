<script setup>
import { Home, Search, Clock, Heart, Folder, History } from 'lucide-vue-next'

const props = defineProps({
  activeTab: {
    type: String,
    required: true
  },
  isLoggedIn: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:activeTab'])

const tabs = [
  { id: 'recommend', label: '首页', icon: Home },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'history', label: '本地历史', icon: Clock },
  { id: 'favorites', label: '本地收藏', icon: Heart },
]

const loginTabs = [
  { id: 'biliFav', label: 'B站收藏', icon: Folder },
  { id: 'biliHistory', label: 'B站历史', icon: History },
]
</script>

<template>
  <div class="px-4 mb-6">
    <div class="flex p-1 bg-white/80 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-x-auto scrollbar-hide">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        @click="$emit('update:activeTab', tab.id)"
        class="flex-1 min-w-[4.5rem] py-2.5 px-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 whitespace-nowrap"
        :class="activeTab === tab.id ? 'bg-pink-50 text-pink-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'"
      >
        <component :is="tab.icon" :size="18" />
        {{ tab.label }}
      </button>
      
      <!-- 分割线 -->
      <div v-if="isLoggedIn" class="w-px bg-gray-100 mx-1 my-2"></div>

      <template v-if="isLoggedIn">
        <button 
          v-for="tab in loginTabs" 
          :key="tab.id"
          @click="$emit('update:activeTab', tab.id)"
          class="flex-1 min-w-[4.5rem] py-2.5 px-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 whitespace-nowrap"
          :class="activeTab === tab.id ? 'bg-pink-50 text-pink-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'"
        >
          <component :is="tab.icon" :size="18" />
          {{ tab.label }}
        </button>
      </template>
    </div>
  </div>
</template>
