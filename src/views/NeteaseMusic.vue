<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNeteaseStore } from '../stores/neteaseStore'
import { useAppStore } from '../stores/gameStore'
import { 
  Music4, QrCode, Cookie as CookieIcon, RefreshCw, Check, X, Loader2, 
  Play, Pause, ListMusic, Coins, ShieldCheck, WifiOff, ChevronDown, ChevronUp,
  Settings2, User, Disc3, Heart, Sparkles, Plus, LogOut, BarChart3
} from 'lucide-vue-next'

defineOptions({ name: 'NeteaseMusic' })

const neteaseStore = useNeteaseStore()
const appStore = useAppStore()

// 基础状态
const apiInput = ref(neteaseStore.apiBase)
const cookieInput = ref(neteaseStore.cookie)
const message = ref('')
const previewAudio = ref(null)
const previewingId = ref(null)
const previewLoadingId = ref(null)
const purchasingId = ref(null) // 正在购买的歌曲ID

// 折叠面板状态
const showSettings = ref(false)
const showPlaylistPicker = ref(false)

// 根据歌曲热度计算价格（pop 字段 0-100）
function getSongPrice(song) {
  const pop = song.pop ?? song.popularity ?? 50
  const base = 50
  const max = 500
  const price = base + Math.round(Math.sqrt(pop / 100) * (max - base))
  return Math.min(max, Math.max(base, price))
}

// 处理后的日推列表
const dailyList = computed(() => {
  return (neteaseStore.dailySongs || []).map(song => {
    const price = getSongPrice(song)
    return {
      id: song.id,
      name: song.name,
      artists: (song.ar || song.artists || []).map(a => a.name).join(' / '),
      album: song.al?.name || song.album?.name || '未知专辑',
      cover: song.al?.picUrl || song.album?.picUrl || '',
      fee: song.fee,
      reason: song.reason || song.recommendReason || '',
      privilege: song.privilege,
      pop: song.pop ?? 0,
      price
    }
  })
})

const canPreview = computed(() => !!neteaseStore.cookie)
const isLoggedIn = computed(() => neteaseStore.isLoggedIn)
const userAvatar = computed(() => neteaseStore.profile?.avatarUrl || '')

// 登录状态文本
const loginStatusText = computed(() => {
  if (neteaseStore.isLoggedIn) {
    return neteaseStore.profile?.nickname || '已登录'
  }
  return '未登录 · 点击设置登录'
})

watch(() => neteaseStore.apiBase, (val) => {
  apiInput.value = val
})

onMounted(async () => {
  if (neteaseStore.cookie) {
    await neteaseStore.refreshAll({ withDaily: true })
  }
})

onUnmounted(() => {
  stopPreview()
})

function setMessage(text) {
  message.value = text
  if (text) {
    setTimeout(() => { message.value = '' }, 3200)
  }
}

function saveApiBase() {
  neteaseStore.apiBase = (apiInput.value || '').trim() || '/api/netease'
  setMessage('API 地址已更新')
}

async function handleCookieLogin() {
  const res = await neteaseStore.setCookieAndRefresh(cookieInput.value)
  if (res.success) {
    setMessage('登录成功')
    showSettings.value = false
  } else {
    setMessage(res.error || '登录失败')
  }
}

function logout() {
  neteaseStore.cookie = ''
  neteaseStore.profile = null
  neteaseStore.uid = null
  neteaseStore.dailySongs = []
  setMessage('已退出登录')
}

async function handleRefreshDaily() {
  const res = await neteaseStore.fetchDailySongs()
  if (!res.success) {
    setMessage(res.error)
  } else {
    setMessage(`已刷新 ${res.count || 0} 首`)
  }
}

async function handlePurchase(song) {
  if (!neteaseStore.isLoggedIn) {
    setMessage('请先登录')
    showSettings.value = true
    return
  }
  if (!neteaseStore.targetPlaylistId) {
    setMessage('请先选择目标歌单')
    showPlaylistPicker.value = true
    return
  }
  if (neteaseStore.hasPurchased(song.id)) {
    setMessage('已购买')
    return
  }
  if (appStore.coins < song.price) {
    setMessage(`金币不足（需要 ${song.price}）`)
    return
  }

  purchasingId.value = song.id
  const res = await neteaseStore.addToPlaylist(song.id)
  purchasingId.value = null

  if (res.success) {
    appStore.coins -= song.price
    neteaseStore.markPurchased(song.id)
    setMessage('购买成功，已加入歌单')
  } else {
    setMessage(res.error || '加入失败')
  }
}

async function togglePreview(song) {
  if (!canPreview.value) {
    setMessage('请先登录')
    showSettings.value = true
    return
  }
  if (previewingId.value === song.id) {
    stopPreview()
    return
  }
  
  stopPreview() // 先停止之前的
  previewLoadingId.value = song.id
  
  try {
    const url = await neteaseStore.getPreviewUrl(song.id)
    if (!url) {
      setMessage('暂无试听资源')
      previewLoadingId.value = null
      return
    }
    
    if (previewAudio.value) {
      previewAudio.value.src = url
      await previewAudio.value.play()
      previewingId.value = song.id
      previewLoadingId.value = null
    }
  } catch (e) {
    console.error(e)
    setMessage('播放失败')
    previewLoadingId.value = null
  }
}

function stopPreview() {
  if (previewAudio.value) {
    previewAudio.value.pause()
    previewAudio.value.currentTime = 0
  }
  previewingId.value = null
  previewLoadingId.value = null
}

function onPreviewEnded() {
  previewingId.value = null
}

function selectPlaylist(plId) {
  neteaseStore.setTargetPlaylist(plId)
  showPlaylistPicker.value = false
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-[#fdfbf7] via-white to-rose-50/50 pb-32">
    <audio ref="previewAudio" @ended="onPreviewEnded" preload="none" />

    <!-- 顶部区域：沉浸式 Header -->
    <header class="relative overflow-hidden z-10">
      <!-- 装饰背景 -->
      <div class="absolute inset-0 bg-gradient-to-br from-red-600 via-rose-500 to-red-400"></div>
      <div class="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-30"></div>
      <div class="absolute -bottom-12 -right-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -top-8 -left-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
      
      <div class="relative px-5 pt-10 pb-12">
        <!-- 顶部栏 -->
        <div class="flex items-center justify-between mb-8">
          <div class="flex items-center gap-2 bg-black/20 backdrop-blur-md rounded-full pl-1 pr-3 py-1 border border-white/10">
            <div class="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-sm">
              <Coins :size="14" class="text-amber-900" />
            </div>
            <span class="font-bold text-white text-sm tabular-nums tracking-wide">{{ appStore.coins }}</span>
          </div>
          
          <button 
            @click="showSettings = !showSettings"
            class="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all border border-white/10"
          >
            <Settings2 :size="20" />
          </button>
        </div>
        
        <!-- 主要信息 -->
        <div class="flex items-center gap-6">
          <!-- 唱片头像 -->
          <div class="relative group cursor-pointer" @click="isLoggedIn ? null : (showSettings = true)">
            <div class="w-24 h-24 rounded-full bg-gray-900 shadow-2xl flex items-center justify-center ring-4 ring-white/20 relative overflow-hidden"
                 :class="{ 'animate-spin-slow': previewingId }">
              <!-- 唱片纹理 -->
              <div class="absolute inset-0 rounded-full bg-[conic-gradient(transparent_0deg,rgba(255,255,255,0.1)_45deg,transparent_90deg)] opacity-30"></div>
              <div class="absolute inset-2 rounded-full border border-gray-800"></div>
              <div class="absolute inset-5 rounded-full border border-gray-800"></div>
              <!-- 封面 -->
              <div class="w-10 h-10 rounded-full overflow-hidden relative z-10 shadow-inner">
                <img v-if="userAvatar" :src="userAvatar + '?param=100y100'" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full bg-gray-800 flex items-center justify-center">
                  <User :size="18" class="text-gray-500" />
                </div>
              </div>
            </div>
            <!-- 播放状态指示点 -->
            <div v-if="previewingId" class="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-rose-500 animate-pulse"></div>
          </div>
          
          <div class="flex-1 min-w-0 text-white">
            <div class="flex items-center gap-2 mb-1 opacity-80">
              <Music4 :size="14" />
              <span class="text-xs font-medium tracking-wider uppercase">Daily Recommend</span>
            </div>
            <h1 class="text-3xl font-bold mb-2 tracking-tight">每日推荐</h1>
            <div class="flex items-center gap-2">
              <span class="text-sm opacity-90 font-medium truncate">{{ loginStatusText }}</span>
              <span v-if="!isLoggedIn" class="w-1.5 h-1.5 rounded-full bg-red-200 animate-pulse"></span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 曲线分割 -->
      <div class="absolute bottom-0 left-0 right-0 h-6 bg-[#fdfbf7] rounded-t-[2rem]"></div>
    </header>

    <!-- 设置面板 -->
    <Transition name="expand">
      <section v-if="showSettings" class="mx-4 -mt-4 mb-6 relative z-20">
        <div class="bg-white rounded-2xl shadow-xl shadow-rose-100/50 overflow-hidden border border-rose-50">
          <div class="p-5 space-y-5">
            <!-- 标题 -->
            <div class="flex items-center justify-between border-b border-gray-50 pb-3">
              <h3 class="font-bold text-gray-800 flex items-center gap-2">
                <Settings2 :size="18" class="text-rose-500" />
                设置与登录
              </h3>
              <button v-if="isLoggedIn" @click="logout" class="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                <LogOut :size="12" /> 退出
              </button>
            </div>

            <!-- API -->
            <div class="space-y-2">
              <label class="text-xs font-medium text-gray-500">API 服务器地址</label>
              <div class="flex gap-2">
                <input v-model="apiInput" class="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition-all" placeholder="/api/netease" />
                <button @click="saveApiBase" class="px-3 py-2 bg-gray-800 text-white text-xs font-medium rounded-xl hover:bg-gray-900">保存</button>
              </div>
            </div>

            <!-- 登录选项 -->
            <div v-if="!isLoggedIn" class="space-y-4">
              <!-- 二维码 -->
              <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div class="flex gap-4">
                  <div class="w-24 h-24 bg-white rounded-lg shadow-sm p-2 flex-shrink-0 flex items-center justify-center relative">
                    <img v-if="neteaseStore.qrImage" :src="neteaseStore.qrImage" class="w-full h-full object-contain" />
                    <QrCode v-else :size="32" class="text-gray-300" />
                    <div v-if="neteaseStore.qrStatus === 'expired'" class="absolute inset-0 bg-white/90 flex items-center justify-center text-xs font-bold text-red-500">已过期</div>
                  </div>
                  <div class="flex-1 flex flex-col justify-between py-1">
                    <div class="space-y-1">
                      <p class="text-sm font-medium text-gray-800">扫码登录</p>
                      <p class="text-xs text-gray-500">{{ neteaseStore.qrMessage || '使用网易云APP扫码' }}</p>
                    </div>
                    <button 
                      @click="neteaseStore.startQrLogin"
                      :disabled="neteaseStore.checkingQr"
                      class="w-full py-2 bg-rose-500 text-white text-xs font-medium rounded-lg hover:bg-rose-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw :size="12" :class="{ 'animate-spin': neteaseStore.checkingQr }" />
                      {{ neteaseStore.qrImage ? '刷新二维码' : '获取二维码' }}
                    </button>
                  </div>
                </div>
              </div>
              
              <div class="relative flex py-1 items-center">
                <div class="flex-grow border-t border-gray-100"></div>
                <span class="flex-shrink-0 mx-3 text-gray-300 text-xs">或</span>
                <div class="flex-grow border-t border-gray-100"></div>
              </div>

              <!-- Cookie -->
              <div class="space-y-2">
                <label class="text-xs font-medium text-gray-500">Cookie 登录 (包含 MUSIC_U)</label>
                <textarea v-model="cookieInput" rows="2" class="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition-all resize-none" placeholder="MUSIC_U=..." />
                <button @click="handleCookieLogin" class="w-full py-2.5 bg-gray-800 text-white text-sm font-medium rounded-xl hover:bg-gray-900 transition-colors">
                  验证并登录
                </button>
              </div>
            </div>
            <div v-else class="text-center py-4">
              <div class="w-16 h-16 mx-auto rounded-full bg-gray-100 mb-3 overflow-hidden">
                <img v-if="userAvatar" :src="userAvatar" class="w-full h-full object-cover" />
              </div>
              <p class="font-bold text-gray-800">{{ neteaseStore.profile?.nickname }}</p>
              <p class="text-xs text-gray-400 mt-1">VIP: {{ neteaseStore.profile?.vipType ? '是' : '否' }}</p>
            </div>
          </div>
          
          <button @click="showSettings = false" class="w-full py-3 border-t border-gray-100 text-gray-400 text-xs hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <ChevronUp :size="14" /> 收起面板
          </button>
        </div>
      </section>
    </Transition>

    <main class="px-4 space-y-5 relative z-0">
      <!-- 歌单选择器 -->
      <section>
        <button 
          @click="showPlaylistPicker = !showPlaylistPicker"
          class="w-full bg-white p-1.5 pr-4 rounded-2xl shadow-sm border border-rose-100 flex items-center justify-between hover:shadow-md transition-all group"
        >
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 group-hover:scale-95 transition-transform">
              <ListMusic :size="22" />
            </div>
            <div class="text-left">
              <p class="text-[10px] text-rose-400 font-bold tracking-wider uppercase">Target Playlist</p>
              <p class="text-sm font-bold text-gray-800 truncate max-w-[180px]">
                {{ neteaseStore.targetPlaylist?.name || '选择存入歌单' }}
              </p>
            </div>
          </div>
          <ChevronDown :size="20" class="text-gray-300 transition-transform duration-300" :class="{ 'rotate-180': showPlaylistPicker }" />
        </button>

        <!-- 下拉列表 -->
        <Transition name="expand">
          <div v-if="showPlaylistPicker" class="mt-2 bg-white rounded-2xl shadow-xl border border-rose-100 overflow-hidden">
            <div v-if="neteaseStore.loadingPlaylists" class="p-6 text-center text-gray-400 text-sm">
              <Loader2 class="animate-spin mx-auto mb-2" :size="20" /> 加载歌单中...
            </div>
            <div v-else-if="neteaseStore.playlists.length === 0" class="p-6 text-center">
              <p class="text-gray-400 text-sm mb-3">未找到歌单</p>
              <button @click="neteaseStore.fetchPlaylists" class="px-4 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-lg">刷新</button>
            </div>
            <ul v-else class="max-h-[300px] overflow-y-auto py-2 custom-scrollbar">
              <li v-for="pl in neteaseStore.playlists" :key="pl.id">
                <button 
                  @click="selectPlaylist(pl.id)"
                  class="w-full px-4 py-3 flex items-center gap-3 hover:bg-rose-50 transition-colors relative"
                >
                  <div class="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                    <img v-if="pl.coverImgUrl" :src="pl.coverImgUrl + '?param=100y100'" class="w-full h-full object-cover" />
                    <Disc3 v-else :size="16" class="text-gray-300 m-auto" />
                  </div>
                  <div class="flex-1 text-left overflow-hidden">
                    <p class="text-sm font-medium text-gray-800 truncate" :class="{ 'text-rose-600': neteaseStore.targetPlaylistId === pl.id }">{{ pl.name }}</p>
                    <p class="text-xs text-gray-400">{{ pl.trackCount }} 首</p>
                  </div>
                  <Check v-if="neteaseStore.targetPlaylistId === pl.id" :size="16" class="text-rose-500" />
                </button>
              </li>
            </ul>
          </div>
        </Transition>
      </section>

      <!-- 日推列表 -->
      <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden min-h-[200px]">
        <!-- 列表头 -->
        <div class="px-5 py-4 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
          <div class="flex items-center gap-2">
            <Sparkles :size="16" class="text-amber-500 fill-amber-500" />
            <h2 class="font-bold text-gray-800 text-lg">推荐歌曲</h2>
            <span class="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full tabular-nums">{{ dailyList.length }}</span>
          </div>
          <button 
            @click="handleRefreshDaily"
            class="text-xs font-medium text-gray-500 hover:text-rose-500 flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-rose-50 transition-colors"
            :disabled="neteaseStore.loadingDaily"
          >
            <RefreshCw :size="14" :class="{ 'animate-spin': neteaseStore.loadingDaily }" />
            刷新
          </button>
        </div>

        <!-- 骨架屏 Loading -->
        <div v-if="neteaseStore.loadingDaily" class="p-5 space-y-4">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3 animate-pulse">
            <div class="w-12 h-12 rounded-xl bg-gray-100"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-gray-100 rounded w-3/4"></div>
              <div class="h-3 bg-gray-100 rounded w-1/2"></div>
            </div>
            <div class="w-16 h-8 bg-gray-100 rounded-lg"></div>
          </div>
        </div>

        <!-- 空状态/未登录 -->
        <div v-else-if="dailyList.length === 0" class="py-12 px-6 text-center">
          <div class="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Music4 :size="32" class="text-rose-300" />
          </div>
          <h3 class="font-bold text-gray-800 mb-2">暂无推荐内容</h3>
          <p class="text-sm text-gray-400 mb-6 max-w-xs mx-auto">登录网易云账号，即可获取每日个性化推荐歌曲</p>
          <button 
            v-if="!isLoggedIn"
            @click="showSettings = true"
            class="px-6 py-2.5 bg-rose-500 text-white text-sm font-bold rounded-full shadow-lg shadow-rose-200 hover:bg-rose-600 hover:scale-105 active:scale-95 transition-all"
          >
            立即登录
          </button>
        </div>

        <!-- 歌曲列表 -->
        <div v-else class="divide-y divide-gray-50">
          <div 
            v-for="(song, index) in dailyList" 
            :key="song.id"
            class="group p-3 hover:bg-rose-50/30 transition-colors flex items-center gap-3 relative"
          >
            <!-- 播放控制区 -->
            <button 
              @click.stop="togglePreview(song)"
              class="w-12 h-12 flex-shrink-0 relative rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-all border border-gray-100 group-hover:border-rose-200"
            >
              <img v-if="song.cover" :src="song.cover + '?param=200y200'" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full bg-gray-100 flex items-center justify-center">
                <Music4 :size="18" class="text-gray-300" />
              </div>
              
              <!-- 遮罩与图标 -->
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center"
                   :class="{ '!bg-black/40': previewingId === song.id || previewLoadingId === song.id }">
                
                <!-- Loading -->
                <Loader2 v-if="previewLoadingId === song.id" class="text-white animate-spin" :size="20" />
                
                <!-- Visualizer (Playing) -->
                <div v-else-if="previewingId === song.id" class="flex gap-0.5 items-end h-4">
                  <div class="w-1 bg-white animate-music-bar-1 rounded-full"></div>
                  <div class="w-1 bg-white animate-music-bar-2 rounded-full"></div>
                  <div class="w-1 bg-white animate-music-bar-3 rounded-full"></div>
                </div>
                
                <!-- Play Icon (Hover) -->
                <Play v-else :size="20" class="text-white opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all fill-white" />
              </div>
            </button>
            
            <!-- 信息 -->
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <p class="font-bold text-gray-800 text-sm truncate" :class="{ 'text-rose-600': previewingId === song.id }">
                  {{ song.name }}
                </p>
                <span v-if="song.fee === 1" class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-100 uppercase">VIP</span>
              </div>
              <p class="text-xs text-gray-500 truncate">{{ song.artists }}</p>
              
              <!-- 推荐理由/标签 -->
              <div class="flex gap-2 overflow-hidden">
                <span v-if="neteaseStore.hasPurchased(song.id)" class="text-[10px] flex items-center gap-0.5 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                  <Check :size="10" /> 已拥有
                </span>
                <span v-else class="text-[10px] flex items-center gap-0.5 text-rose-400 bg-rose-50 px-1.5 py-0.5 rounded font-medium">
                  <BarChart3 :size="10" /> 热度 {{ song.pop }}
                </span>
              </div>
            </div>

            <!-- 购买按钮 -->
            <button 
              @click="handlePurchase(song)"
              :disabled="neteaseStore.hasPurchased(song.id) || purchasingId === song.id"
              class="flex-shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 transition-all border"
              :class="neteaseStore.hasPurchased(song.id) 
                ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-default' 
                : 'bg-gradient-to-r from-amber-400 to-orange-400 border-transparent text-white shadow-lg shadow-amber-200 hover:shadow-xl hover:scale-105 active:scale-95'"
            >
              <template v-if="purchasingId === song.id">
                <Loader2 :size="14" class="animate-spin" />
              </template>
              <template v-else-if="neteaseStore.hasPurchased(song.id)">
                <Check :size="14" />
                <span class="text-xs font-bold">已购</span>
              </template>
              <template v-else>
                <Coins :size="14" class="fill-white/20" />
                <span class="text-xs font-bold tabular-nums">{{ song.price }}</span>
              </template>
            </button>
          </div>
        </div>
      </section>
    </main>

    <!-- Toast 通知 -->
    <Transition name="toast">
      <div v-if="message" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900/90 backdrop-blur text-white px-5 py-3 rounded-full shadow-xl border border-white/10">
        <span class="text-sm font-medium">{{ message }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #fecdd3;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #fb7185;
}

/* 动画定义 */
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 8s linear infinite;
}

@keyframes music-bar {
  0%, 100% { height: 4px; }
  50% { height: 12px; }
}
.animate-music-bar-1 { animation: music-bar 0.6s ease-in-out infinite; }
.animate-music-bar-2 { animation: music-bar 0.6s ease-in-out infinite 0.1s; }
.animate-music-bar-3 { animation: music-bar 0.6s ease-in-out infinite 0.2s; }

/* 过渡效果 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}
.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
  transform: translateY(0);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px) scale(0.9);
}
</style>
