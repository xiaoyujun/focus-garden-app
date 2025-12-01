<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, Trophy, Coins, Check, Clock, Sparkles, RotateCw, Gift, HelpCircle, X } from 'lucide-vue-next'
import { useAppStore } from '../stores/gameStore'
import { useBadgeStore } from '../stores/badgeStore'

const router = useRouter()
const appStore = useAppStore()
const badgeStore = useBadgeStore()

// 当前查看模式：'machines' 推币机 | 'collection' 收藏
const viewMode = ref('machines')

// 当前选中的分类（收藏页面用）
const selectedCategory = ref('all')

// 抽取状态
const isDrawing = ref(false)
const drawingMachineIndex = ref(-1)

// 抽取结果弹窗
const showResult = ref(false)
const drawResults = ref([])
const isDoubleResult = ref(false)

// 帮助弹窗
const showHelp = ref(false)

// 倒计时
const countdown = ref('')
let countdownTimer = null

// 显示购买结果的提示
const toast = ref({ show: false, message: '', type: 'success' })

// 动态导入 SVG 徽章
const badgeModules = import.meta.glob('../assets/badges/*.svg', { eager: true, query: '?url', import: 'default' })

function getBadgeSvgUrl(svgFileName) {
  const key = `../assets/badges/${svgFileName}`
  return badgeModules[key] || ''
}

// 机器特征对应的渐变颜色（用于 SVG）
const traitColorMap = {
  lucky_rare: { from: '#c084fc', to: '#ec4899' },      // 紫到粉 - 幸运之星
  lucky_duplicate: { from: '#34d399', to: '#14b8a6' }, // 翠绿到青 - 回收大师
  lucky_common: { from: '#4ade80', to: '#a3e635' },    // 绿到黄绿 - 平民福音
  all_category: { from: '#38bdf8', to: '#6366f1' },    // 天蓝到靛蓝 - 万象之轮
  double_draw: { from: '#fbbf24', to: '#f97316' }      // 琥珀到橙 - 双子星座
}

function getMachineColors(traitId) {
  return traitColorMap[traitId] || { from: '#a78bfa', to: '#f472b6' }
}

// 分类列表
const categories = computed(() => {
  return [
    { id: 'all', name: '全部', icon: '🏷️' },
    ...Object.entries(badgeStore.categoryConfig).map(([id, config]) => ({
      id,
      ...config
    }))
  ]
})

// 筛选后的徽章列表（图鉴页面 - 显示所有徽章）
const filteredBadges = computed(() => {
  let badges = badgeStore.badgeCatalog
  
  // 图鉴模式：显示所有徽章，不再过滤已拥有
  if (selectedCategory.value !== 'all') {
    badges = badges.filter(b => b.category === selectedCategory.value)
  }
  
  // 按稀有度排序，已拥有的排在前面
  const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary']
  return [...badges].sort((a, b) => {
    // 先按拥有状态排序（已拥有优先）
    const aOwned = badgeStore.hasBadge(a.id) ? 0 : 1
    const bOwned = badgeStore.hasBadge(b.id) ? 0 : 1
    if (aOwned !== bOwned) return aOwned - bOwned
    // 再按稀有度排序
    return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity)
  })
})

// 更新倒计时
function updateCountdown() {
  const now = new Date()
  const next = badgeStore.nextRefreshTime
  const diff = next - now
  
  if (diff <= 0) {
    countdown.value = '即将刷新...'
    badgeStore.refreshMachinesIfNeeded()
    return
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  
  if (days > 0) {
    countdown.value = `${days}天${hours}小时`
  } else if (hours > 0) {
    countdown.value = `${hours}小时${minutes}分钟`
  } else {
    countdown.value = `${minutes}分钟`
  }
}

// 执行抽取
async function handleDraw(machineIndex) {
  if (isDrawing.value) return
  
  const price = badgeStore.getMachinePrice(machineIndex)
  if (appStore.coins < price) {
    showToast('金币不足！', 'error')
    return
  }
  
  isDrawing.value = true
  drawingMachineIndex.value = machineIndex
  
  // 模拟抽取动画延迟
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  const result = badgeStore.drawFromMachine(machineIndex)
  
  isDrawing.value = false
  drawingMachineIndex.value = -1
  
  if (result.success) {
    drawResults.value = result.results
    isDoubleResult.value = result.isDouble
    showResult.value = true
  } else {
    showToast(result.message, 'error')
  }
}

// 关闭结果弹窗
function closeResult() {
  showResult.value = false
  drawResults.value = []
}

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 2000)
}

function goBack() {
  router.back()
}

onMounted(() => {
  badgeStore.refreshMachinesIfNeeded()
  updateCountdown()
  countdownTimer = setInterval(updateCountdown, 60000)
})

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})
</script>

<template>
  <div class="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-100 via-purple-50 to-white pb-20">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-40 bg-white/70 backdrop-blur-lg border-b border-purple-100 shadow-sm supports-[backdrop-filter]:bg-white/60">
      <div class="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto w-full">
        <button @click="goBack" class="p-2 -ml-2 rounded-full hover:bg-purple-50 text-purple-600 transition-colors">
          <ChevronLeft :size="24" />
        </button>
        <h1 class="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 flex items-center gap-2">
          <Gift :size="20" class="text-pink-500" />
          推币乐园
        </h1>
        <div class="flex items-center gap-2">
          <button 
            @click="showHelp = true"
            class="p-2 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
          >
            <HelpCircle :size="20" />
          </button>
          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200 rounded-full shadow-sm">
            <Coins :size="16" class="text-amber-600" />
            <span class="text-sm font-bold text-amber-700 tabular-nums">{{ appStore.coins }}</span>
          </div>
        </div>
      </div>
    </header>

    <div class="max-w-2xl mx-auto w-full">
      <!-- 刷新倒计时 -->
      <div class="px-4 pt-4">
        <div class="flex items-center justify-center gap-2 text-xs font-medium text-purple-600 bg-purple-50/80 backdrop-blur border border-purple-100 rounded-full py-1.5 px-4 shadow-sm w-fit mx-auto">
          <Clock :size="12" />
          <span>机器特征刷新：<strong class="tabular-nums">{{ countdown }}</strong></span>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="px-4 py-4">
        <div class="bg-white/80 backdrop-blur rounded-3xl p-5 shadow-sm border border-purple-100 relative overflow-hidden group">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-100/50 to-pink-100/50 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>
          
          <div class="flex items-center justify-between mb-3 relative z-10">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-gray-700">徽章图鉴</span>
              <span class="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                {{ Math.round(badgeStore.stats.progress) }}%
              </span>
            </div>
            <span class="text-sm font-bold text-purple-600 tabular-nums">
              {{ badgeStore.stats.owned }} <span class="text-purple-300">/</span> {{ badgeStore.stats.total }}
            </span>
          </div>
          
          <div class="h-2.5 bg-purple-50 rounded-full overflow-hidden border border-purple-100 relative z-10">
            <div 
              class="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(168,85,247,0.4)]"
              :style="{ width: `${badgeStore.stats.progress}%` }"
            >
              <div class="w-full h-full opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PCEtLUNyZWF0ZWQgd2l0aCBTVkdHcmFkaWVudC5jb20tLT48ZGVmcz48cGF0dGVybiBpZD0iR3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9InVybCgjZ3JhZGllbnQpIi8+PHBhdGggZD0iTTAgNDBMMzAgMEg0MEwwIDQwIiBmaWxsPSJ1cmwoI3BhdHRlcm4pIi8+PHBhdGggZD0iTTAgMTBMMTAgMEgyMEwwIDIwIiBmaWxsPSJ1cmwoI3BhdHRlcm4pIi8+PHBhdGggZD0iTTAgMzBMMzAgMEg0MEwwIDMwIiBmaWxsPSJ1cmwoI3BhdHRlcm4pIi8+PHBhdGggZD0iTTEwIDQwTDQwIDEwVjIwTDYwIDQwIiBmaWxsPSJ1cmwoI3BhdHRlcm4pIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI0dyaWQpIi8+PC9zdmc+')] animate-[slide_2s_linear_infinite]"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 视图切换 -->
      <div class="px-4 mb-6">
        <div class="flex bg-white/60 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-purple-100/50">
          <button 
            @click="viewMode = 'machines'"
            class="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 relative overflow-hidden"
            :class="viewMode === 'machines' 
              ? 'text-white shadow-md' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'"
          >
            <div v-if="viewMode === 'machines'" class="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500"></div>
            <span class="relative z-10 flex items-center justify-center gap-2">
              <span class="text-lg">🎰</span> 推币机
            </span>
          </button>
          <button 
            @click="viewMode = 'collection'"
            class="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 relative overflow-hidden"
            :class="viewMode === 'collection' 
              ? 'text-white shadow-md' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'"
          >
            <div v-if="viewMode === 'collection'" class="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
            <span class="relative z-10 flex items-center justify-center gap-2">
              <span class="text-lg">📖</span> 徽章图鉴
            </span>
          </button>
        </div>
      </div>

      <!-- 推币机页面 -->
      <div v-if="viewMode === 'machines'" class="px-4 space-y-8 pb-10">
        <!-- 三台推币机 -->
        <div
          v-for="(machine, index) in badgeStore.machines"
          :key="machine.id"
          class="relative flex justify-center"
        >
          <!-- SVG 机器外观 -->
          <div class="relative w-full max-w-[320px] aspect-[3/5] drop-shadow-2xl transition-transform duration-300"
            :class="drawingMachineIndex === index ? 'scale-[1.02]' : ''"
          >
            <!-- 机器主体 SVG -->
            <svg viewBox="0 0 300 500" class="w-full h-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient :id="'bodyGrad-' + index" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" :stop-color="getMachineColors(machine.trait.id).from" />
                  <stop offset="100%" :stop-color="getMachineColors(machine.trait.id).to" />
                </linearGradient>
                <linearGradient :id="'topGrad-' + index" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="white" stop-opacity="0.3" />
                  <stop offset="100%" stop-color="white" stop-opacity="0" />
                </linearGradient>
              </defs>
              
              <!-- 顶部装饰 (天线/圆顶) -->
              <path d="M100,40 Q150,10 200,40" fill="none" stroke="#cbd5e1" stroke-width="8" stroke-linecap="round" />
              <circle cx="150" cy="25" r="15" fill="#fbbf24" />

              <!-- 机身主体 -->
              <rect x="20" y="40" width="260" height="440" rx="30" :fill="'url(#bodyGrad-' + index + ')'" />
              <path d="M30,50 h240 a20,20 0 0 1 20,20 v400 a20,20 0 0 1 -20,20 h-240 a20,20 0 0 1 -20,-20 v-400 a20,20 0 0 1 20,-20" fill="white" fill-opacity="0.1" />
              
              <!-- 屏幕边框 -->
              <rect x="40" y="110" width="220" height="160" rx="15" fill="#334155" />
              
              <!-- 控制面板区域 -->
              <rect x="40" y="290" width="220" height="160" rx="10" fill="rgba(255,255,255,0.2)" />
              
              <!-- 出货口 -->
              <path d="M80,420 h140 a10,10 0 0 1 10,10 v20 a10,10 0 0 1 -10,10 h-140 a10,10 0 0 1 -10,-10 v-20 a10,10 0 0 1 10,-10" fill="#1e293b" />
              <path d="M90,430 h120" stroke="#334155" stroke-width="4" stroke-linecap="round" />
              
              <!-- 装饰线 -->
              <rect x="20" y="80" width="260" height="10" fill="rgba(0,0,0,0.1)" />
            </svg>

            <!-- 机器屏幕内容 (绝对定位) -->
            <div class="absolute top-[22%] left-[15%] w-[70%] h-[32%] bg-sky-100 rounded-xl overflow-hidden shadow-inner border-4 border-gray-700/50 z-10">
              <!-- 屏幕背景 -->
              <div class="absolute inset-0 opacity-30" :class="machine.trait.bgColor"></div>
              
              <!-- 动画区域 -->
              <div v-if="drawingMachineIndex === index" class="absolute inset-0 flex items-center justify-center bg-white">
                 <div class="animate-shake-machine w-full h-full flex items-center justify-center overflow-hidden">
                  <div class="flex gap-4 animate-scroll-track px-4">
                    <div v-for="i in 5" :key="i" class="text-4xl filter drop-shadow-sm">
                      {{ ['❓', '⭐', '🎁', '💎', '✨'][i-1] }}
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 待机画面 -->
              <div v-else class="absolute inset-0 flex flex-col items-center justify-center p-2">
                 <div class="text-3xl mb-1 animate-bounce">{{ machine.trait.icon }}</div>
                 <div class="text-[10px] font-bold text-center text-gray-500 leading-tight px-1">
                   {{ index + 1 }}号机
                 </div>
                 <div v-if="machine.trait.id === 'lucky_rare'" class="mt-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[9px] rounded-full font-bold animate-pulse">
                   UP!
                 </div>
              </div>
              
              <!-- 玻璃反光 -->
              <div class="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none"></div>
            </div>

            <!-- 交互按钮区域 (绝对定位) -->
            <div class="absolute bottom-[15%] left-[20%] w-[60%] h-[12%] z-20">
               <button
                @click="handleDraw(index)"
                :disabled="isDrawing || appStore.coins < badgeStore.getMachinePrice(index)"
                class="w-full h-full rounded-full font-bold text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 active:border-b-0 active:translate-y-1"
                :class="[
                  isDrawing ? 'bg-gray-400 border-gray-600 cursor-wait' :
                  appStore.coins < badgeStore.getMachinePrice(index) ? 'bg-gray-400 border-gray-600 cursor-not-allowed' :
                  `bg-gradient-to-b from-red-500 to-red-600 border-red-800 hover:from-red-400 hover:to-red-500`
                ]"
              >
                <template v-if="drawingMachineIndex === index">
                  <RotateCw :size="20" class="animate-spin" />
                </template>
                <template v-else>
                  <div class="flex flex-col items-center">
                    <span class="text-xs opacity-90">PUSH</span>
                    <div class="flex items-center gap-1 text-sm">
                      <Coins :size="14" />
                      {{ badgeStore.getMachinePrice(index) }}
                    </div>
                  </div>
                </template>
              </button>
            </div>
            
            <!-- 特征标签 -->
            <div class="absolute top-[8%] right-[10%] rotate-12 z-20">
              <div class="bg-yellow-300 text-yellow-800 text-xs font-black px-2 py-1 rounded shadow-md border border-yellow-400 transform hover:scale-110 transition-transform cursor-help"
                @click.stop="showHelp = true"
              >
                特征???
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- 收藏图鉴页面 -->
      <div v-else class="px-4 pb-10">
        <!-- 顶部统计 -->
        <div class="mb-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
          <div class="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl translate-x-10 -translate-y-10"></div>
          <div class="relative z-10 flex justify-between items-end">
            <div>
              <h2 class="text-lg font-bold mb-1 flex items-center gap-2">
                <Trophy :size="20" class="text-yellow-300" />
                徽章图鉴
              </h2>
              <p class="text-blue-100 text-xs">收集所有徽章，成为专注大师！</p>
            </div>
            <div class="text-right">
              <div class="text-2xl font-black tabular-nums">{{ badgeStore.stats.owned }}<span class="text-sm opacity-70">/{{ badgeStore.stats.total }}</span></div>
              <div class="text-xs text-blue-100">收集进度</div>
            </div>
          </div>
          <!-- 进度条 -->
          <div class="mt-3 h-2 bg-black/20 rounded-full overflow-hidden">
            <div class="h-full bg-yellow-400 rounded-full transition-all duration-1000" :style="{ width: `${badgeStore.stats.progress}%` }"></div>
          </div>
        </div>

        <!-- 分类筛选 -->
        <div class="sticky top-[60px] z-30 bg-white/90 backdrop-blur-sm py-3 -mx-4 px-4 border-b border-gray-100 mb-4 shadow-sm">
          <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <button
              v-for="cat in categories"
              :key="cat.id"
              @click="selectedCategory = cat.id"
              class="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-full border transition-all whitespace-nowrap active:scale-95"
              :class="selectedCategory === cat.id 
                ? 'bg-gray-800 text-white border-gray-800 shadow-md' 
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'"
            >
              <span class="mr-1">{{ cat.icon }}</span>
              {{ cat.name }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
          <div
            v-for="badge in filteredBadges"
            :key="badge.id"
            class="group relative bg-white rounded-2xl p-2 shadow-sm border transition-all duration-300"
            :class="[
              badgeStore.hasBadge(badge.id) 
                ? (badgeStore.rarityConfig[badge.rarity]?.border || 'border-gray-100') + ' hover:shadow-lg hover:-translate-y-1' 
                : 'border-gray-100 bg-gray-50 opacity-80'
            ]"
          >
            <!-- 状态标识 -->
            <div class="absolute -top-1.5 right-1 z-10">
              <div v-if="badgeStore.hasBadge(badge.id)" 
                class="bg-emerald-500 text-white p-1 rounded-full shadow-sm"
              >
                <Check :size="10" />
              </div>
              <div v-else 
                class="bg-gray-300 text-gray-500 p-1 rounded-full shadow-sm"
              >
                <span class="text-[10px] font-bold px-1">🔒</span>
              </div>
            </div>
            
            <!-- 稀有度标签 (仅已拥有显示，或者显示未知) -->
            <div 
              class="absolute -top-1.5 left-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full shadow-sm z-10 whitespace-nowrap"
              :class="[
                badgeStore.hasBadge(badge.id) 
                  ? (badgeStore.rarityConfig[badge.rarity]?.bg + ' ' + badgeStore.rarityConfig[badge.rarity]?.color)
                  : 'bg-gray-200 text-gray-400'
              ]"
            >
              {{ badgeStore.hasBadge(badge.id) ? badgeStore.rarityConfig[badge.rarity]?.name : '???' }}
            </div>
            
            <!-- 徽章图标 -->
            <div class="aspect-square w-full flex items-center justify-center mb-1 p-2 relative">
              <img 
                :src="getBadgeSvgUrl(badge.svg)" 
                :alt="badge.name"
                class="w-full h-full object-contain transition-all duration-500"
                :class="badgeStore.hasBadge(badge.id) ? 'drop-shadow-sm group-hover:scale-110' : 'grayscale opacity-30 contrast-50'"
              />
              <!-- 未解锁时的问号 -->
              <div v-if="!badgeStore.hasBadge(badge.id)" class="absolute inset-0 flex items-center justify-center text-gray-300/50 text-3xl font-black pointer-events-none select-none">
                ?
              </div>
            </div>
            
            <!-- 徽章名称 -->
            <div class="text-xs font-bold text-center truncate px-1"
              :class="badgeStore.hasBadge(badge.id) ? 'text-gray-700' : 'text-gray-400'"
            >
              {{ badge.name }}
            </div>
          </div>
        </div>
        
        <!-- 底部提示 -->
        <div class="mt-8 text-center">
           <p class="text-xs text-gray-400">加油！还差 {{ badgeStore.stats.total - badgeStore.stats.owned }} 个徽章就能集齐了！</p>
        </div>
      </div>
    </div>

    <!-- 抽取结果弹窗 -->
    <Teleport to="body">
      <Transition name="pop">
        <div 
          v-if="showResult"
          class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          @click.self="closeResult"
        >
          <!-- 光效背景 -->
          <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200vw] h-[200vw] bg-gradient-to-r from-transparent via-white/10 to-transparent animate-spin-slow origin-center"></div>
          </div>

          <div class="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden relative z-10 animate-bounce-in">
            <!-- 装饰光晕 -->
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-b from-yellow-200/50 to-transparent blur-xl"></div>

            <!-- 标题 -->
            <div class="relative pt-8 pb-2 text-center">
              <div class="inline-flex items-center gap-2 px-4 py-1 bg-yellow-100 text-yellow-700 rounded-full font-bold text-sm mb-2 shadow-sm">
                <Sparkles :size="14" />
                {{ isDoubleResult ? '双倍快乐！' : '抽取成功！' }}
              </div>
              <h3 class="text-2xl font-black text-gray-800 tracking-tight">
                恭喜获得
              </h3>
            </div>
            
            <!-- 结果展示 -->
            <div class="p-6 relative">
              <div :class="isDoubleResult ? 'grid grid-cols-2 gap-4' : 'flex justify-center'">
                <div 
                  v-for="(result, idx) in drawResults" 
                  :key="idx"
                  class="text-center relative group"
                  :style="{ animationDelay: `${idx * 0.1}s` }"
                >
                  <!-- 物品卡片 -->
                  <div 
                    class="w-24 h-24 mx-auto mb-3 rounded-2xl p-4 shadow-inner flex items-center justify-center relative overflow-hidden"
                    :class="[result.badge.rarityInfo?.bg, 'bg-opacity-20']"
                  >
                    <!-- 放射光 -->
                    <div class="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 animate-shimmer"></div>
                    
                    <img 
                      :src="getBadgeSvgUrl(result.badge.svg)" 
                      :alt="result.badge.name"
                      class="w-full h-full object-contain drop-shadow-md transform group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>

                  <div class="font-bold text-lg text-gray-800">{{ result.badge.name }}</div>
                  <div 
                    class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mt-1 border"
                    :class="[
                      result.badge.rarityInfo?.bg, 
                      result.badge.rarityInfo?.color,
                      'border-current border-opacity-20'
                    ]"
                  >
                    {{ result.badge.rarityInfo?.name }}
                  </div>
                  
                  <!-- 状态提示 -->
                  <div class="mt-3">
                    <div v-if="result.isDuplicate" class="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-1">
                      <RotateCw :size="10" />
                      重复返还 {{ result.refund }}币
                    </div>
                    <div v-else class="inline-flex items-center gap-1 text-xs font-bold text-pink-600 bg-pink-50 border border-pink-100 rounded-full px-2 py-1 animate-pulse">
                      <Sparkles :size="10" />
                      NEW 新获得
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 确认按钮 -->
            <div class="px-6 pb-6">
              <button
                @click="closeResult"
                class="w-full py-3.5 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-[0.98] active:shadow-sm text-lg"
              >
                收入囊中
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Toast 提示 -->
    <Teleport to="body">
      <Transition name="toast">
        <div 
          v-if="toast.show"
          class="fixed top-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-xl text-sm font-bold flex items-center gap-2 backdrop-blur-md border-2"
          :class="toast.type === 'success' 
            ? 'bg-emerald-500/90 text-white border-emerald-400' 
            : 'bg-red-500/90 text-white border-red-400'"
        >
          <div v-if="toast.type === 'success'" class="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
            <Check :size="12" />
          </div>
          {{ toast.message }}
        </div>
      </Transition>
    </Teleport>

    <!-- 帮助弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div 
          v-if="showHelp"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          @click.self="showHelp = false"
        >
          <div class="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-pop-in">
            <!-- 标题 -->
            <div class="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 flex items-center justify-between flex-shrink-0 relative overflow-hidden">
              <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPjwvc3ZnPg==')] opacity-30"></div>
              <h3 class="text-xl font-bold text-white flex items-center gap-2 relative z-10">
                <HelpCircle :size="24" class="text-purple-200" />
                机器特征图鉴
              </h3>
              <button @click="showHelp = false" class="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors relative z-10">
                <X :size="24" />
              </button>
            </div>
            
            <!-- 内容区域 -->
            <div class="p-5 space-y-4 overflow-y-auto flex-1 bg-gray-50/50">
              <div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700 leading-relaxed shadow-sm">
                <p>每周一凌晨 <span class="font-bold font-mono bg-blue-100 px-1 rounded">00:00</span> 自动刷新所有机器特征。通过观察机器外观和图标颜色，猜测它们的真实效果！</p>
              </div>
              
              <div class="space-y-3">
                <div 
                  v-for="(trait, key) in badgeStore.machineTraits" 
                  :key="key"
                  class="flex items-start gap-4 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-purple-100"
                >
                  <div 
                    class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 bg-gradient-to-br shadow-inner"
                    :class="trait.color"
                  >
                    {{ trait.icon }}
                  </div>
                  <div class="flex-1 min-w-0 py-0.5">
                    <h4 class="font-bold text-gray-800 text-base">{{ trait.name }}</h4>
                    <p class="text-xs text-gray-500 mt-1 leading-relaxed">{{ trait.description }}</p>
                  </div>
                </div>
              </div>

              <div class="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
                <h5 class="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Sparkles :size="12" /> Tips
                </h5>
                <ul class="text-xs text-amber-700 space-y-1.5 list-disc list-inside marker:text-amber-400">
                  <li>基础投币价格为 80 金币</li>
                  <li>回收大师机器会让重复徽章返还更多金币</li>
                  <li>双子星座有几率一次抽出两个徽章</li>
                </ul>
              </div>
            </div>
            
            <!-- 底部按钮 -->
            <div class="p-5 border-t bg-white flex-shrink-0">
              <button
                @click="showHelp = false"
                class="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-all active:scale-95 shadow-lg shadow-gray-200"
              >
                我明白了
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* 基础淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 弹窗动画 */
.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Toast 动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px) scale(0.9);
}

/* 闪光效果 */
@keyframes shimmer {
  0% { transform: translateX(-150%); }
  100% { transform: translateX(150%); }
}
.animate-shimmer {
  animation: shimmer 2s infinite linear;
}

/* 背景滑动 */
@keyframes slide {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}

/* 机器震动 */
@keyframes shake-machine {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  25% { transform: translate(-2px, 2px) rotate(-1deg); }
  50% { transform: translate(2px, -2px) rotate(1deg); }
  75% { transform: translate(-2px, -2px) rotate(-1deg); }
}
.animate-shake-machine {
  animation: shake-machine 0.1s ease-in-out infinite;
}

/* 旋转光芒 */
@keyframes spin-slow {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 20s linear infinite;
}

/* 弹跳进入 */
@keyframes bounce-in {
  0% { opacity: 0; transform: scale(0.3); }
  50% { opacity: 1; transform: scale(1.05); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
.animate-bounce-in {
  animation: bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 滚动内容模拟 */
@keyframes scroll-track {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.animate-scroll-track {
  animation: scroll-track 0.5s linear infinite;
}

/* 稀有度光效 */
.rarity-glow-common { box-shadow: 0 0 15px rgba(168, 162, 158, 0.3); }
.rarity-glow-uncommon { box-shadow: 0 0 15px rgba(34, 197, 94, 0.3); }
.rarity-glow-rare { box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }
.rarity-glow-epic { box-shadow: 0 0 25px rgba(168, 85, 247, 0.5); }
.rarity-glow-legendary { box-shadow: 0 0 30px rgba(234, 179, 8, 0.6); }
</style>
