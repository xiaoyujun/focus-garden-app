<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { X, Key, LogOut, User, Crown, QrCode, RefreshCw } from 'lucide-vue-next'
import { 
  isLoggedIn, 
  isVip,
  getAuthInfo, 
  loginWithCookie, 
  logout,
  loadAuthFromStorage,
  generateQRCode,
  startQRCodePolling,
  stopQRCodePolling
} from '../services/ximalayaAuth'

const emit = defineEmits(['close', 'login-success'])

// 状态
const loggedIn = ref(false)
const vip = ref(false)
const authInfo = ref({})
const cookieInput = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

// 登录方式
const loginMode = ref('qrcode')  // qrcode | cookie

// 二维码状态
const qrcodeUrl = ref('')
const qrcodeStatus = ref('')
const isExpired = ref(false)
const isGenerating = ref(false)

function refreshStatus() {
  loadAuthFromStorage()
  loggedIn.value = isLoggedIn()
  vip.value = isVip()
  authInfo.value = loggedIn.value ? getAuthInfo() : {}
}

onMounted(() => {
  refreshStatus()
  if (!loggedIn.value && loginMode.value === 'qrcode') {
    createQRCode()
  }
})

onUnmounted(() => {
  stopQRCodePolling()
})

// 生成二维码
async function createQRCode() {
  isGenerating.value = true
  isExpired.value = false
  qrcodeStatus.value = '正在生成二维码...'
  errorMsg.value = ''
  successMsg.value = ''
  
  try {
    const result = await generateQRCode()
    qrcodeUrl.value = result.qrImg
    qrcodeStatus.value = '请使用喜马拉雅 App 扫码'
    
    // 开始轮询
    startQRCodePolling(
      // 状态变化
      (status) => {
        qrcodeStatus.value = status.message
      },
      // 登录成功
      () => {
        successMsg.value = '登录成功！'
        refreshStatus()
        emit('login-success')
      },
      // 过期
      () => {
        isExpired.value = true
        qrcodeStatus.value = '二维码已失效，请点击刷新'
      }
    )
  } catch (e) {
    errorMsg.value = e.message || '生成二维码失败，请改用 Cookie 登录'
  } finally {
    isGenerating.value = false
  }
}

// Cookie 登录
async function handleCookieLogin() {
  if (!cookieInput.value.trim()) {
    errorMsg.value = '请输入 Cookie'
    return
  }
  
  isLoading.value = true
  errorMsg.value = ''
  successMsg.value = ''
  
  try {
    await loginWithCookie(cookieInput.value)
    successMsg.value = '登录成功！'
    cookieInput.value = ''
    refreshStatus()
    emit('login-success')
  } catch (e) {
    errorMsg.value = e.message || '登录失败，请检查 Cookie'
  } finally {
    isLoading.value = false
  }
}

// 切换登录方式
function switchLoginMode(mode) {
  loginMode.value = mode
  errorMsg.value = ''
  successMsg.value = ''
  if (mode === 'qrcode' && !qrcodeUrl.value) {
    createQRCode()
  } else if (mode === 'qrcode') {
    // 已有二维码时重置过期提示
    isExpired.value = false
  }
}

// 退出登录
function handleLogout() {
  logout()
  refreshStatus()
}
</script>

<template>
  <div 
    class="fixed inset-0 bg-farm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white w-full max-w-sm rounded-2xl overflow-hidden">
      <!-- 头部 -->
      <div class="flex items-center justify-between p-4 border-b border-farm-100 bg-gradient-to-r from-orange-500 to-orange-600">
        <h3 class="font-bold text-white flex items-center gap-2">
          <span class="text-xl">🎧</span>
          喜马拉雅登录
        </h3>
        <button @click="emit('close')" class="p-2 rounded-full bg-white/20 text-white hover:bg-white/30">
          <X :size="18" />
        </button>
      </div>

      <div class="p-6">
        <!-- 已登录 -->
        <div v-if="loggedIn" class="text-center">
          <div class="relative inline-block">
            <img 
              v-if="authInfo.avatar" 
              :src="authInfo.avatar" 
              referrerpolicy="no-referrer"
              class="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-orange-100"
            />
            <div v-else class="w-20 h-20 rounded-full mx-auto mb-4 bg-orange-100 flex items-center justify-center">
              <User :size="32" class="text-orange-500" />
            </div>
            <!-- VIP 标记 -->
            <div 
              v-if="vip"
              class="absolute -bottom-1 -right-1 bg-gradient-to-r from-yellow-400 to-yellow-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
            >
              <Crown :size="12" />
              VIP
            </div>
          </div>
          
          <p class="font-bold text-farm-800 text-lg">{{ authInfo.userName || '已登录' }}</p>
          <p class="text-sm text-farm-400 mt-1">UID: {{ authInfo.userId }}</p>
          
          <div v-if="vip" class="mt-3 px-4 py-2 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg">
            <p class="text-sm text-orange-600 flex items-center justify-center gap-1">
              <Crown :size="16" class="text-yellow-500" />
              VIP 会员
            </p>
          </div>
          
          <button 
            @click="handleLogout"
            class="mt-6 w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 flex items-center justify-center gap-2"
          >
            <LogOut :size="18" />
            退出登录
          </button>
        </div>

        <!-- 未登录 -->
        <div v-else>
          <!-- 登录方式切换 -->
          <div class="flex gap-2 mb-4">
            <button 
              @click="switchLoginMode('qrcode')"
              class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
              :class="loginMode === 'qrcode' ? 'bg-orange-500 text-white' : 'bg-farm-100 text-farm-600'"
            >
              <QrCode :size="16" />
              扫码登录
            </button>
            <button 
              @click="switchLoginMode('cookie')"
              class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
              :class="loginMode === 'cookie' ? 'bg-orange-500 text-white' : 'bg-farm-100 text-farm-600'"
            >
              <Key :size="16" />
              Cookie 登录
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
                <img 
                  v-if="qrcodeUrl && !isGenerating" 
                  :src="qrcodeUrl" 
                  referrerpolicy="no-referrer"
                  class="w-48 h-48 rounded-lg"
                />
                <div v-else class="w-8 h-8 border-3 border-farm-200 border-t-orange-500 rounded-full animate-spin"></div>
              </div>
              
              <!-- 过期遮罩 -->
              <div v-if="isExpired" class="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
                <button 
                  @click="createQRCode"
                  class="px-4 py-2 bg-orange-500 text-white rounded-lg flex items-center gap-2"
                >
                  <RefreshCw :size="16" />
                  刷新二维码
                </button>
              </div>
            </div>
            
            <!-- 状态提示 -->
            <p class="mt-4 text-sm" :class="isExpired ? 'text-red-500' : 'text-farm-600'">
              {{ qrcodeStatus || '正在生成二维码...' }}
            </p>
            
            <!-- 错误/成功提示 -->
            <p v-if="errorMsg" class="text-sm text-red-500 mt-2">{{ errorMsg }}</p>
            <p v-if="successMsg" class="text-sm text-green-500 mt-2">{{ successMsg }}</p>
            
            <p class="mt-4 text-xs text-farm-400">
              请使用喜马拉雅 App 扫码登录
            </p>
          </div>

          <!-- Cookie 登录 -->
          <div v-if="loginMode === 'cookie'">
            <div class="mb-4">
              <label class="block text-sm font-medium text-farm-600 mb-2">请输入喜马拉雅 Cookie</label>
              <textarea 
                v-model="cookieInput"
                placeholder="从浏览器开发者工具复制 Cookie..."
                class="w-full px-3 py-2 border border-farm-200 rounded-xl text-sm h-24 resize-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none"
              ></textarea>
            </div>
            
            <!-- 错误/成功提示 -->
            <p v-if="errorMsg" class="text-sm text-red-500 mb-3">{{ errorMsg }}</p>
            <p v-if="successMsg" class="text-sm text-green-500 mb-3">{{ successMsg }}</p>
            
            <button 
              @click="handleCookieLogin"
              :disabled="isLoading"
              class="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {{ isLoading ? '登录中...' : '登录' }}
            </button>
            
            <!-- 获取 Cookie 说明 -->
            <div class="mt-4 p-3 bg-farm-50 rounded-xl">
              <p class="text-xs font-medium text-farm-600 mb-2">📌 如何获取 Cookie？</p>
              <ol class="text-xs text-farm-500 space-y-1 list-decimal list-inside text-left">
                <li>在电脑浏览器打开 ximalaya.com 并登录账号</li>
                <li>按 F12 打开开发者工具</li>
                <li>切换到「网络/Network」标签</li>
                <li>刷新页面，点击任意请求</li>
                <li>在「请求标头」中找到 Cookie 并复制</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
