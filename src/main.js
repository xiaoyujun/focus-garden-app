import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import { useUserStore } from './stores/userStore'

// 页面组件
import Garden from './views/Garden.vue'
import Focus from './views/Focus.vue'
import Todos from './views/Todos.vue'
import Settings from './views/Settings.vue'
import NeteaseMusic from './views/NeteaseMusic.vue'
import OnlinePlayer from './views/OnlinePlayer.vue'
import DownloadManager from './views/DownloadManager.vue'
import BadgeShop from './views/BadgeShop.vue'

const routes = [
  { path: '/', component: Garden },
  { path: '/focus', component: Focus },
  { path: '/todos', component: Todos },
  { path: '/settings', component: Settings },
  { 
    path: '/audio', 
    component: NeteaseMusic,
    name: 'NeteaseMusic',
    meta: { keepAlive: true }
  },
  { 
    path: '/online', 
    component: OnlinePlayer,
    name: 'OnlinePlayer',
    meta: { keepAlive: true } 
  },
  {
    path: '/download',
    component: DownloadManager,
    name: 'DownloadManager'
  },
  {
    path: '/badges',
    component: BadgeShop,
    name: 'BadgeShop'
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const pinia = createPinia()
const app = createApp(App)
const userStore = useUserStore(pinia)

// 初始化用户元数据与多账户存储
userStore.initFromStorage()

app.use(pinia)
app.use(router)
app.mount('#app')
