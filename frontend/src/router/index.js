import { createRouter, createWebHistory } from 'vue-router'

// 页面组件
import HomePage from '../views/HomePage.vue'
import PlayerPage from '../views/PlayerPage.vue'
import GardenPage from '../views/GardenPage.vue'
import HistoryPage from '../views/HistoryPage.vue'
import SettingsPage from '../views/SettingsPage.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomePage,
    meta: { title: '今日家务' }
  },
  {
    path: '/player',
    name: 'Player',
    component: PlayerPage,
    meta: { title: '音频播放' }
  },
  {
    path: '/garden',
    name: 'Garden',
    component: GardenPage,
    meta: { title: '我的农场' }
  },
  {
    path: '/history',
    name: 'History',
    component: HistoryPage,
    meta: { title: '家务记录' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsPage,
    meta: { title: '设置' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
