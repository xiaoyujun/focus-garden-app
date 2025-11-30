<script setup>
import { useRoute } from 'vue-router'
import { Flower2, Clock, ListTodo, Settings, BookOpen, Globe } from 'lucide-vue-next'
import GlobalAudioPlayer from './components/GlobalAudioPlayer.vue'

const route = useRoute()
</script>

<template>
  <div class="min-h-screen bg-farm-50 pb-24">
    <!-- 全局B站音频播放器（包含隐藏audio元素和迷你播放器） -->
    <GlobalAudioPlayer />
    
    <!-- 主要内容区域，在线听书页保持保活，切页不打断播放 -->
    <router-view v-slot="{ Component, route: currentRoute }">
      <transition name="fade" mode="out-in">
        <component 
          v-if="!(currentRoute.meta && currentRoute.meta.keepAlive)" 
          :is="Component" 
          :key="currentRoute.fullPath"
        />
        <KeepAlive v-else :include="['OnlinePlayer', 'BookSourcePlayer']">
          <component :is="Component" />
        </KeepAlive>
      </transition>
    </router-view>

    <!-- 底部导航栏 -->
    <nav class="fixed bottom-6 left-4 right-4 bg-white/90 backdrop-blur-md border border-farm-200/50 shadow-xl shadow-farm-200/20 rounded-2xl pb-safe z-50">
      <div class="flex justify-around items-center h-16 px-2">
        <router-link to="/" class="flex flex-col items-center p-2 text-farm-400 hover:text-nature-600 transition-colors" :class="{ '!text-nature-600': route.path === '/' }">
          <Flower2 :size="24" stroke-width="2.5" />
        </router-link>
        
        <router-link to="/focus" class="flex flex-col items-center p-2 text-farm-400 hover:text-nature-600 transition-colors group" :class="{ '!text-nature-600': route.path === '/focus' }">
          <div class="bg-nature-500 text-white p-3.5 rounded-2xl -mt-8 shadow-lg shadow-nature-200 group-hover:bg-nature-600 group-hover:scale-105 transition-all border-[6px] border-farm-50">
            <Clock :size="26" stroke-width="2.5" />
          </div>
        </router-link>

        <router-link to="/todos" class="flex flex-col items-center p-2 text-farm-400 hover:text-nature-600 transition-colors" :class="{ '!text-nature-600': route.path === '/todos' }">
          <ListTodo :size="24" stroke-width="2.5" />
        </router-link>

        <router-link to="/audio" class="flex flex-col items-center p-2 text-farm-400 hover:text-purple-600 transition-colors" :class="{ '!text-purple-600': route.path === '/audio' }">
          <BookOpen :size="24" stroke-width="2.5" />
        </router-link>

        <router-link to="/online" class="flex flex-col items-center p-2 text-farm-400 hover:text-nature-600 transition-colors" :class="{ '!text-nature-600': route.path === '/online' }">
          <Globe :size="24" stroke-width="2.5" />
        </router-link>

        <router-link to="/settings" class="flex flex-col items-center p-2 text-farm-400 hover:text-nature-600 transition-colors" :class="{ '!text-nature-600': route.path === '/settings' }">
          <Settings :size="24" stroke-width="2.5" />
        </router-link>
      </div>
    </nav>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
