import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'

// 页面组件
import Garden from './views/Garden.vue'
import Focus from './views/Focus.vue'
import Todos from './views/Todos.vue'
import Settings from './views/Settings.vue'
import AudioPlayer from './views/AudioPlayer.vue'
import OnlinePlayer from './views/OnlinePlayer.vue'

const routes = [
  { path: '/', component: Garden },
  { path: '/focus', component: Focus },
  { path: '/todos', component: Todos },
  { path: '/settings', component: Settings },
  { path: '/audio', component: AudioPlayer },
  { path: '/online', component: OnlinePlayer },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.mount('#app')
