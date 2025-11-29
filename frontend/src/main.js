import { createApp } from 'vue'
import App from './App.vue'

// 路由
import router from './router'

// Pinia 状态管理
import pinia from './stores'

// Vant UI 组件库
import Vant from 'vant'
import 'vant/lib/index.css'

// 触摸模拟（PC 调试用）
import '@vant/touch-emulator'

// 全局样式
import './style.css'

const app = createApp(App)

app.use(router)
app.use(pinia)
app.use(Vant)

app.mount('#app')
