<script setup>
import { ref } from 'vue'
import { User, History, Heart, LogOut, ChevronRight, Folder, Clock, Trash2, Loader2 } from 'lucide-vue-next'
import VideoCard from './VideoCard.vue'

const props = defineProps({
  userInfo: Object,
  isLoggedIn: Boolean,
  historyList: { type: Array, default: () => [] },
  favList: { type: Array, default: () => [] },
  biliFavList: { type: Array, default: () => [] },
  biliFavContent: { type: Array, default: () => [] },
  biliHistoryList: { type: Array, default: () => [] },
  activeTab: String,
  isHistoryLoading: Boolean,
  historyError: String,
  isFavLoading: Boolean,
  favError: String,
  selectedFavId: [String, Number],
  hasMoreHistory: Boolean
})

const emit = defineEmits([
  'login', 'logout', 'play', 'open-uploader', 
  'switch-tab', 'load-more-history', 'load-fav-content',
  'remove-favorite', 'remove-history' 
])

function formatLocalItem(item) {
  return {
    ...item,
    bvid: item.id || item.bvid,
    play: item.play || 0,
    duration: item.duration || 0,
    cover: item.cover || ''
  }
}
</script>

<template>
  <div class="space-y-6 pb-20">
    <!-- 用户信息卡片 -->
    <div class="px-4">
      <div v-if="isLoggedIn" class="bg-white rounded-2xl p-5 shadow-sm border border-pink-100 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <img 
            :src="userInfo?.avatar" 
            referrerpolicy="no-referrer"
            class="w-14 h-14 rounded-full ring-2 ring-pink-100"
          />
          <div>
            <h2 class="font-bold text-gray-800 text-lg">{{ userInfo?.userName }}</h2>
            <p class="text-xs text-gray-400 mt-0.5">UID: {{ userInfo?.userId }}</p>
          </div>
        </div>
        <button 
          @click="$emit('logout')"
          class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          title="退出登录"
        >
          <LogOut :size="20" />
        </button>
      </div>
      
      <div v-else class="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-6 text-white shadow-lg shadow-pink-200 text-center">
        <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
          <User :size="32" />
        </div>
        <h2 class="font-bold text-xl mb-2">登录 Bilibili</h2>
        <p class="text-pink-100 text-sm mb-6">解锁更高音质，同步收藏与历史</p>
        <button 
          @click="$emit('login')"
          class="px-8 py-2.5 bg-white text-pink-600 rounded-xl font-bold hover:bg-pink-50 transition-colors shadow-sm"
        >
          立即登录
        </button>
      </div>
    </div>

    <!-- 功能入口 (未登录/已登录通用) -->
    <div class="px-4 grid grid-cols-2 gap-3">
      <button 
        @click="$emit('switch-tab', 'history')"
        class="p-4 bg-white rounded-2xl border border-gray-50 shadow-sm hover:shadow-md transition-all text-left group"
        :class="{ 'ring-2 ring-pink-100 border-pink-200': activeTab === 'history' }"
      >
        <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
          <Clock :size="20" />
        </div>
        <div class="font-bold text-gray-800 text-sm">本地历史</div>
        <div class="text-xs text-gray-400 mt-1">最近播放记录</div>
      </button>
      
      <button 
        @click="$emit('switch-tab', 'favorites')"
        class="p-4 bg-white rounded-2xl border border-gray-50 shadow-sm hover:shadow-md transition-all text-left group"
        :class="{ 'ring-2 ring-pink-100 border-pink-200': activeTab === 'favorites' }"
      >
        <div class="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
          <Heart :size="20" />
        </div>
        <div class="font-bold text-gray-800 text-sm">本地收藏</div>
        <div class="text-xs text-gray-400 mt-1">我的喜爱内容</div>
      </button>
    </div>

    <!-- B站专属入口 (已登录) -->
    <div v-if="isLoggedIn" class="px-4">
      <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span class="w-1 h-4 bg-pink-500 rounded-full"></span>
        B站同步
      </h3>
      <div class="bg-white rounded-2xl border border-gray-50 shadow-sm overflow-hidden">
        <button 
          @click="$emit('switch-tab', 'biliFav')"
          class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
          :class="{ 'bg-pink-50/50': activeTab === 'biliFav' }"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-pink-50 text-pink-500 flex items-center justify-center">
              <Folder :size="16" />
            </div>
            <span class="text-sm font-medium text-gray-700">我的收藏夹</span>
          </div>
          <ChevronRight :size="16" class="text-gray-300" />
        </button>
        
        <button 
          @click="$emit('switch-tab', 'biliHistory')"
          class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          :class="{ 'bg-pink-50/50': activeTab === 'biliHistory' }"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-pink-50 text-pink-500 flex items-center justify-center">
              <History :size="16" />
            </div>
            <span class="text-sm font-medium text-gray-700">B站历史记录</span>
          </div>
          <ChevronRight :size="16" class="text-gray-300" />
        </button>
      </div>
    </div>

    <!-- 内容展示区域 -->
    <div v-if="activeTab !== 'recommend' && activeTab !== 'search'" class="px-4 animate-in slide-in-from-bottom-4 duration-300">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg text-gray-800">
          {{ 
            activeTab === 'history' ? '本地播放历史' :
            activeTab === 'favorites' ? '本地收藏' :
            activeTab === 'biliFav' ? 'B站收藏夹' :
            activeTab === 'biliHistory' ? 'B站历史' : ''
          }}
        </h3>
      </div>

      <!-- B站收藏夹列表选择 -->
      <div v-if="activeTab === 'biliFav' && biliFavList.length" class="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        <button 
          v-for="fav in biliFavList" 
          :key="fav.id"
          @click="$emit('load-fav-content', fav.id)"
          class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap"
          :class="selectedFavId === fav.id ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-white text-gray-600 border-gray-200'"
        >
          {{ fav.title }}
        </button>
      </div>

      <!-- 列表内容 -->
      <div class="grid grid-cols-2 gap-3">
        <!-- B站历史 -->
        <template v-if="activeTab === 'biliHistory'">
          <div v-if="isHistoryLoading && !biliHistoryList.length" class="col-span-2 text-center py-10">
             <Loader2 :size="24" class="animate-spin mx-auto text-pink-500" />
          </div>
          <div v-else-if="historyError" class="col-span-2 text-center py-10 text-red-500 text-sm">
            {{ historyError }}
          </div>
           <VideoCard 
            v-else
            v-for="item in biliHistoryList" 
            :key="item.bvid + item.viewAt" 
            :video="item"
            @play="$emit('play', item)"
            @open-uploader="$emit('open-uploader', { mid: item.mid, name: item.author })"
          />
          
          <!-- 加载更多 -->
          <div v-if="hasMoreHistory && biliHistoryList.length" class="col-span-2 text-center py-4">
            <button 
              @click="$emit('load-more-history')"
              :disabled="isHistoryLoading"
              class="px-4 py-2 text-sm text-pink-600 bg-pink-50 rounded-lg hover:bg-pink-100 disabled:opacity-50"
            >
              <span v-if="isHistoryLoading" class="flex items-center gap-1">
                <Loader2 :size="14" class="animate-spin" />
                加载中...
              </span>
              <span v-else>加载更多</span>
            </button>
          </div>
        </template>
        
        <!-- B站收藏 -->
        <template v-else-if="activeTab === 'biliFav'">
           <div v-if="isFavLoading && !biliFavContent.length" class="col-span-2 text-center py-10">
             <Loader2 :size="24" class="animate-spin mx-auto text-pink-500" />
          </div>
           <VideoCard 
            v-else
            v-for="item in biliFavContent" 
            :key="item.bvid" 
            :video="item"
            @play="$emit('play', item)"
            @open-uploader="$emit('open-uploader', { mid: item.mid, name: item.author })"
          />
        </template>
        
        <!-- 本地历史 -->
        <template v-else-if="activeTab === 'history'">
          <div v-if="!historyList.length" class="col-span-2 text-center py-10 text-gray-400">
            <Clock :size="32" class="mx-auto mb-2 opacity-50" />
            <p class="text-xs">暂无历史记录</p>
          </div>
          <VideoCard 
            v-for="item in historyList" 
            :key="item.id" 
            :video="formatLocalItem(item)"
            @play="$emit('play', formatLocalItem(item))"
            @open-uploader="$emit('open-uploader', { name: item.author })"
          />
        </template>
        
        <!-- 本地收藏 -->
        <template v-else-if="activeTab === 'favorites'">
          <div v-if="!favList.length" class="col-span-2 text-center py-10 text-gray-400">
             <Heart :size="32" class="mx-auto mb-2 opacity-50" />
             <p class="text-xs">暂无收藏内容</p>
          </div>
          <div 
            v-for="item in favList" 
            :key="item.id"
            class="relative group"
          >
            <VideoCard 
              :video="formatLocalItem(item)"
              @play="$emit('play', formatLocalItem(item))"
              @open-uploader="$emit('open-uploader', { name: item.author })"
            />
            <button 
              @click.stop="$emit('remove-favorite', item.id)"
              class="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-gray-400 hover:text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
