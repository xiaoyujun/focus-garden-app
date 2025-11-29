<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import QRCode from 'qrcode'
import { 
  generateQRCode, 
  checkQRCodeStatus, 
  getAuthInfo, 
  clearAuth,
  loginWithCookies,
  isLoggedIn
} from '../services/bilibiliAuth'
import { X, QrCode, LogOut, User, RefreshCw, Key } from 'lucide-vue-next'

const emit = defineEmits(['close', 'login-success'])

// 状态
const qrcodeUrl = ref('')
const qrcodeKey = ref('')
const statusMessage = ref('正在生成二维码...')
const isScanned = ref(false)
const isExpired = ref(false)
const isLoading = ref(false)
const loginMode = ref('qrcode') // qrcode | cookie
const cookieInput = ref('')
const errorMessage = ref('')

// 轮询定时器
let pollTimer = null

// 当前登录信息
const authInfo = computed(() => getAuthInfo())
const loggedIn = computed(() => isLoggedIn())

// 生成二维码
async function createQRCode() {
  isLoading.value = true
  isExpired.value = false
  errorMessage.value = ''
  statusMessage.value = '正在生成二维码...'
  
  try {
    const result = await generateQRCode()
    qrcodeKey.value = result.qrcode_key
    
    // 生成二维码图片
    qrcodeUrl.value = await QRCode.toDataURL(result.url, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
    
    statusMessage.value = '请使用B站App扫描二维码'
    
    // 开始轮询
    startPolling()
  } catch (error) {
    errorMessage.value = error.message || '生成二维码失败'
    statusMessage.value = '生成失败，请重试'
  } finally {
    isLoading.value = false
  }
}

// 开始轮询检查状态
function startPolling() {
  stopPolling()
  
  pollTimer = setInterval(async () => {
    if (!qrcodeKey.value) return
    
    try {
      const result = await checkQRCodeStatus(qrcodeKey.value)
      statusMessage.value = result.message
      
      switch (result.status) {
        case 86101: // 未扫码
          isScanned.value = false
          break
        case 86090: // 已扫码未确认
          isScanned.value = true
          break
        case 86038: // 已过期
          isExpired.value = true
          stopPolling()
          break
        case 0: // 登录成功
          stopPolling()
          emit('login-success')
          emit('close')
          break
      }
    } catch (error) {
      console.error('轮询失败:', error)
    }
  }, 2000) // 每2秒检查一次
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// Cookie登录
async function handleCookieLogin() {
  if (!cookieInput.value.trim()) {
    errorMessage.value = '请输入Cookie'
    return
  }
  
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    await loginWithCookies(cookieInput.value.trim())
    emit('login-success')
    emit('close')
  } catch (error) {
    errorMessage.value = error.message || '登录失败'
  } finally {
    isLoading.value = false
  }
}

// 退出登录
function handleLogout() {
  clearAuth()
  qrcodeUrl.value = ''
  qrcodeKey.value = ''
  statusMessage.value = ''
}

onMounted(() => {
  if (!loggedIn.value) {
    createQRCode()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="fixed inset-0 bg-farm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="bg-white w-full max-w-sm rounded-2xl overflow-hidden">
      <!-- 头部 -->
      <div class="flex items-center justify-between p-4 border-b border-farm-100">
        <h3 class="font-bold text-farm-800 flex items-center gap-2">
          <User :size="20" />
          B站账号
        </h3>
        <button @click="$emit('close')" class="p-2 rounded-full bg-farm-100 text-farm-500 hover:bg-farm-200">
          <X :size="18" />
        </button>
      </div>

      <div class="p-6">
        <!-- 已登录状态 -->
        <div v-if="loggedIn" class="text-center">
          <img 
            v-if="authInfo.avatar" 
            :src="authInfo.avatar" 
            referrerpolicy="no-referrer"
            class="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-nature-100"
          />
          <div v-else class="w-20 h-20 rounded-full mx-auto mb-4 bg-nature-100 flex items-center justify-center">
            <User :size="32" class="text-nature-500" />
          </div>
          <p class="font-bold text-farm-800 text-lg">{{ authInfo.userName || '已登录' }}</p>
          <p class="text-sm text-farm-400 mt-1">UID: {{ authInfo.userId }}</p>
          
          <button 
            @click="handleLogout"
            class="mt-6 w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 flex items-center justify-center gap-2"
          >
            <LogOut :size="18" />
            退出登录
          </button>
        </div>

        <!-- 未登录 - 登录方式选择 -->
        <div v-else>
          <!-- 切换登录方式 -->
          <div class="flex gap-2 mb-4">
            <button 
              @click="loginMode = 'qrcode'"
              class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
              :class="loginMode === 'qrcode' ? 'bg-nature-500 text-white' : 'bg-farm-100 text-farm-600'"
            >
              <QrCode :size="16" />
              扫码登录
            </button>
            <button 
              @click="loginMode = 'cookie'"
              class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
              :class="loginMode === 'cookie' ? 'bg-nature-500 text-white' : 'bg-farm-100 text-farm-600'"
            >
              <Key :size="16" />
              Cookie登录
            </button>
          </div>

          <!-- 二维码登录 -->
          <div v-if="loginMode === 'qrcode'" class="text-center">
            <div class="relative inline-block">
              <!-- 二维码 -->
              <div 
                class="w-52 h-52 mx-auto bg-farm-50 rounded-xl flex items-center justify-center border-2 border-farm-100"
                :class="{ 'opacity-50': isExpired }"
              >
                <img v-if="qrcodeUrl" :src="qrcodeUrl" referrerpolicy="no-referrer" class="w-48 h-48" />
                <div v-else class="w-8 h-8 border-3 border-farm-200 border-t-nature-500 rounded-full animate-spin"></div>
              </div>
              
              <!-- 过期遮罩 -->
              <div v-if="isExpired" class="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
                <button 
                  @click="createQRCode"
                  class="px-4 py-2 bg-nature-500 text-white rounded-lg flex items-center gap-2"
                >
                  <RefreshCw :size="16" />
                  刷新二维码
                </button>
              </div>
            </div>
            
            <!-- 状态提示 -->
            <p class="mt-4 text-sm" :class="isScanned ? 'text-nature-600' : 'text-farm-500'">
              {{ statusMessage }}
            </p>
            
            <p class="mt-2 text-xs text-farm-400">
              登录后可获取高清画质和更多内容
            </p>
          </div>

          <!-- Cookie登录 -->
          <div v-if="loginMode === 'cookie'">
            <p class="text-sm text-farm-500 mb-3">
              从浏览器开发者工具中复制B站Cookie
            </p>
            <textarea 
              v-model="cookieInput"
              placeholder="粘贴包含SESSDATA的Cookie..."
              class="w-full h-32 p-3 border border-farm-200 rounded-xl text-sm resize-none focus:border-nature-400 focus:ring-2 focus:ring-nature-100 outline-none"
            ></textarea>
            
            <button 
              @click="handleCookieLogin"
              :disabled="isLoading"
              class="mt-4 w-full py-3 bg-nature-500 text-white rounded-xl font-medium hover:bg-nature-600 disabled:opacity-50"
            >
              {{ isLoading ? '登录中...' : '登录' }}
            </button>
            
            <div class="mt-4 p-3 bg-farm-50 rounded-lg text-xs text-farm-500">
              <p class="font-medium mb-1">如何获取Cookie：</p>
              <ol class="list-decimal list-inside space-y-1">
                <li>在电脑浏览器登录B站</li>
                <li>按F12打开开发者工具</li>
                <li>切换到"网络/Network"标签</li>
                <li>刷新页面，点击任意请求</li>
                <li>在Headers中找到Cookie并复制</li>
              </ol>
            </div>
          </div>

          <!-- 错误提示 -->
          <p v-if="errorMessage" class="mt-3 text-sm text-red-500 text-center">
            {{ errorMessage }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
