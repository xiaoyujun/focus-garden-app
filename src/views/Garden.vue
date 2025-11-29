<script setup>
import { useAppStore } from '../stores/gameStore'
import { computed, ref } from 'vue'
import { Flower2, Timer, Coins, X, Star, ShoppingBag, Filter, ArrowUpDown, CheckSquare, Square, Trash2, Trophy, Sparkles } from 'lucide-vue-next'

const store = useAppStore()
const selectedCrop = ref(null)

// 筛选和排序状态
const filterRarity = ref('all') // 'all' 或稀有度ID
const sortBy = ref('time') // 'time', 'price', 'rarity'
const sortOrder = ref('desc') // 'asc', 'desc'
const showFilters = ref(false)

// 批量选择状态
const batchMode = ref(false)
const selectedIds = ref(new Set())

// 格式化时间显示
function formatTime(minutes) {
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

// 格式化日期
function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return '今天'
  
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

// 获取稀有度配置
function getRarityConfig(id) {
  return store.rarities.find(r => r.id === id) || store.rarities[0]
}

// 出售当前选中的作物
function handleSell() {
  if (selectedCrop.value) {
    if (confirm(`确定要以 ${selectedCrop.value.price} 金币的价格出售这个作物吗？`)) {
      store.sellCrop(selectedCrop.value.id)
      selectedCrop.value = null
    }
  }
}

// 切换收藏状态
function handleToggleStar() {
  if (selectedCrop.value) {
    store.toggleStar(selectedCrop.value.id)
    // 更新当前选中的作物状态
    selectedCrop.value = { ...selectedCrop.value, starred: !selectedCrop.value.starred }
  }
}

// 展览馆是否展开
const showGallery = ref(true)

// 切换排序方向
function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

// 稀有度排序权重
const rarityWeight = { common: 1, fine: 2, rare: 3, epic: 4, legendary: 5 }

// 切换批量选择
function toggleSelect(id) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  selectedIds.value = new Set(selectedIds.value) // 触发响应式更新
}

// 全选/取消全选
function toggleSelectAll() {
  if (selectedIds.value.size === filteredRecords.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredRecords.value.map(r => r.id))
  }
}

// 批量出售
function handleBatchSell() {
  if (selectedIds.value.size === 0) return
  const totalPrice = filteredRecords.value
    .filter(r => selectedIds.value.has(r.id))
    .reduce((sum, r) => sum + r.price, 0)
  
  if (confirm(`确定要批量出售 ${selectedIds.value.size} 个作物吗？\n总计可获得 ${totalPrice} 金币`)) {
    selectedIds.value.forEach(id => store.sellCrop(id))
    selectedIds.value = new Set()
    batchMode.value = false
  }
}

// 退出批量模式
function exitBatchMode() {
  batchMode.value = false
  selectedIds.value = new Set()
}

// 筛选后的记录
const filteredRecords = computed(() => {
  let records = [...store.gardenRecords]
  
  // 按稀有度筛选
  if (filterRarity.value !== 'all') {
    records = records.filter(r => (r.rarity || 'common') === filterRarity.value)
  }
  
  // 排序
  records.sort((a, b) => {
    let comparison = 0
    switch (sortBy.value) {
      case 'price':
        comparison = (a.price || 0) - (b.price || 0)
        break
      case 'rarity':
        comparison = rarityWeight[a.rarity || 'common'] - rarityWeight[b.rarity || 'common']
        break
      case 'time':
      default:
        comparison = new Date(a.completedAt) - new Date(b.completedAt)
    }
    return sortOrder.value === 'desc' ? -comparison : comparison
  })
  
  return records
})

// 按日期分组记录
const groupedRecords = computed(() => {
  const groups = {}
  
  filteredRecords.value.forEach(record => {
    const dateKey = new Date(record.completedAt).toDateString()
    if (!groups[dateKey]) {
      groups[dateKey] = {
        date: record.completedAt,
        records: []
      }
    }
    groups[dateKey].records.push(record)
  })
  
  return Object.values(groups)
})

// 选中作物的总价值
const selectedTotalPrice = computed(() => {
  return filteredRecords.value
    .filter(r => selectedIds.value.has(r.id))
    .reduce((sum, r) => sum + r.price, 0)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-nature-50/50 to-farm-50">
    <!-- 头部 -->
    <header class="p-4 bg-white/80 backdrop-blur-sm shadow-sm sticky top-0 z-10 border-b border-farm-100">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-farm-900 flex items-center">
          <Flower2 class="mr-2 text-nature-500" :size="24" />
          我的花园
        </h1>
        <div class="flex items-center space-x-2">
          <div class="flex items-center bg-yellow-50 px-3 py-1.5 rounded-full border border-yellow-100 shadow-sm">
            <Coins class="text-yellow-600 mr-1.5" :size="16" />
            <span class="text-sm font-bold text-yellow-700">{{ store.coins }}</span>
          </div>
          <div class="flex items-center bg-nature-50 px-3 py-1.5 rounded-full border border-nature-100 shadow-sm">
            <Timer class="text-nature-600 mr-1.5" :size="16" />
            <span class="text-sm font-medium text-nature-700">{{ formatTime(store.totalFocusMinutes) }}</span>
          </div>
        </div>
      </div>
    </header>

    <main class="p-4 pb-20">
      <!-- 收藏馆/展览区 -->
      <div v-if="store.starredRecords.length > 0" class="mb-4">
        <button 
          @click="showGallery = !showGallery"
          class="w-full bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-4 shadow-sm border border-amber-100 hover:shadow-md transition-all"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div class="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mr-3">
                <Trophy class="text-amber-600" :size="20" />
              </div>
              <div class="text-left">
                <h3 class="font-bold text-amber-800">我的收藏馆</h3>
                <p class="text-xs text-amber-600">{{ store.starredRecords.length }} 件珍藏</p>
              </div>
            </div>
            <span class="text-amber-400 text-sm">{{ showGallery ? '收起' : '展开' }}</span>
          </div>
        </button>
        
        <!-- 展览区内容 -->
        <div v-if="showGallery" class="mt-3 bg-gradient-to-br from-amber-50/50 via-white to-yellow-50/50 rounded-2xl p-4 border border-amber-100/50 shadow-inner">
          <!-- 展览架 -->
          <div class="relative">
            <!-- 装饰背景 -->
            <div class="absolute inset-0 bg-gradient-to-b from-transparent via-amber-100/20 to-amber-100/40 rounded-xl"></div>
            
            <!-- 展品网格 -->
            <div class="relative grid grid-cols-4 gap-4 p-3">
              <div 
                v-for="record in store.starredRecords.slice(0, 8)" 
                :key="record.id"
                @click="selectedCrop = record"
                class="group cursor-pointer"
              >
                <!-- 展台 -->
                <div class="relative">
                  <!-- 光效 -->
                  <div class="absolute -inset-1 bg-gradient-to-t from-amber-200/50 to-transparent rounded-2xl blur-sm group-hover:from-amber-300/60 transition-all"></div>
                  
                  <!-- 作物展示 -->
                  <div 
                    class="relative aspect-square rounded-2xl flex items-center justify-center text-3xl bg-white border-2 shadow-lg group-hover:scale-105 group-hover:-translate-y-1 transition-all duration-300"
                    :class="getRarityConfig(record.rarity || 'common').borderColor || 'border-amber-200'"
                  >
                    {{ record.icon }}
                    <!-- 收藏星星 -->
                    <div class="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
                      <Star :size="12" class="text-white fill-white" />
                    </div>
                  </div>
                  
                  <!-- 稀有度标签 -->
                  <div 
                    class="mt-1 text-center text-[10px] font-medium truncate px-1"
                    :class="getRarityConfig(record.rarity || 'common').color"
                  >
                    {{ getRarityConfig(record.rarity || 'common').name }}
                  </div>
                </div>
              </div>
              
              <!-- 空展位 -->
              <div 
                v-for="i in Math.max(0, 4 - store.starredRecords.length)"
                :key="'empty-' + i"
                class="aspect-square rounded-2xl border-2 border-dashed border-amber-200/50 flex items-center justify-center"
              >
                <Star :size="16" class="text-amber-200" />
              </div>
            </div>
          </div>
          
          <!-- 更多提示 -->
          <p v-if="store.starredRecords.length > 8" class="text-center text-xs text-amber-500 mt-2">
            还有 {{ store.starredRecords.length - 8 }} 件收藏...
          </p>
        </div>
      </div>

      <!-- 今日统计 -->
      <div class="bg-white rounded-2xl p-5 shadow-sm mb-4 border border-farm-100">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-farm-500 mb-0.5">今日专注</p>
            <p class="text-2xl font-bold text-farm-800">
              {{ store.todayRecords.length }} <span class="text-base font-normal text-farm-400">次</span>
            </p>
          </div>
          <div class="flex -space-x-3">
            <div 
              v-for="record in store.todayRecords.slice(0, 5)" 
              :key="record.id"
              class="w-11 h-11 rounded-full flex items-center justify-center text-xl border-[3px] border-white bg-farm-50 shadow-sm"
            >
              {{ record.icon }}
            </div>
            <div 
              v-if="store.todayRecords.length > 5"
              class="w-11 h-11 bg-farm-100 rounded-full flex items-center justify-center text-xs font-medium text-farm-500 border-[3px] border-white"
            >
              +{{ store.todayRecords.length - 5 }}
            </div>
          </div>
        </div>
      </div>

      <!-- 工具栏：筛选/排序/批量 -->
      <div v-if="store.gardenRecords.length > 0" class="bg-white rounded-2xl p-3 shadow-sm mb-4 border border-farm-100">
        <!-- 批量模式工具栏 -->
        <div v-if="batchMode" class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <button @click="toggleSelectAll" class="flex items-center text-sm text-farm-600 hover:text-farm-800 px-2 py-1 rounded-lg hover:bg-farm-50">
              <CheckSquare v-if="selectedIds.size === filteredRecords.length && filteredRecords.length > 0" :size="16" class="mr-1" />
              <Square v-else :size="16" class="mr-1" />
              全选
            </button>
            <span class="text-sm text-farm-400">
              已选 {{ selectedIds.size }} 个
              <span v-if="selectedIds.size > 0" class="text-yellow-600 font-medium">（{{ selectedTotalPrice }} 金币）</span>
            </span>
          </div>
          <div class="flex items-center space-x-2">
            <button 
              @click="handleBatchSell"
              :disabled="selectedIds.size === 0"
              class="flex items-center text-sm px-3 py-1.5 rounded-lg font-medium transition-colors"
              :class="selectedIds.size > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-farm-100 text-farm-300 cursor-not-allowed'"
            >
              <Trash2 :size="14" class="mr-1" />
              批量出售
            </button>
            <button @click="exitBatchMode" class="text-sm text-farm-500 hover:text-farm-700 px-2 py-1">
              取消
            </button>
          </div>
        </div>

        <!-- 普通模式工具栏 -->
        <div v-else class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <!-- 筛选按钮 -->
            <button 
              @click="showFilters = !showFilters"
              class="flex items-center text-sm px-3 py-1.5 rounded-lg transition-colors"
              :class="showFilters || filterRarity !== 'all' ? 'bg-nature-100 text-nature-700' : 'text-farm-600 hover:bg-farm-50'"
            >
              <Filter :size="14" class="mr-1" />
              筛选
              <span v-if="filterRarity !== 'all'" class="ml-1 px-1.5 py-0.5 text-xs bg-nature-500 text-white rounded-full">1</span>
            </button>

            <!-- 排序下拉 -->
            <div class="relative">
              <select 
                v-model="sortBy"
                class="appearance-none text-sm pl-7 pr-6 py-1.5 rounded-lg border-0 bg-farm-50 text-farm-700 focus:ring-2 focus:ring-nature-200 cursor-pointer"
              >
                <option value="time">按时间</option>
                <option value="price">按价格</option>
                <option value="rarity">按稀有度</option>
              </select>
              <ArrowUpDown :size="14" class="absolute left-2 top-1/2 -translate-y-1/2 text-farm-400 pointer-events-none" />
            </div>

            <!-- 排序方向 -->
            <button 
              @click="toggleSortOrder"
              class="text-sm px-2 py-1.5 rounded-lg text-farm-500 hover:bg-farm-50 transition-colors"
            >
              {{ sortOrder === 'desc' ? '↓ 降序' : '↑ 升序' }}
            </button>
          </div>

          <!-- 批量选择按钮 -->
          <button 
            @click="batchMode = true"
            class="flex items-center text-sm text-farm-600 hover:text-farm-800 px-2 py-1 rounded-lg hover:bg-farm-50"
          >
            <CheckSquare :size="14" class="mr-1" />
            批量
          </button>
        </div>

        <!-- 筛选面板 -->
        <div v-if="showFilters && !batchMode" class="mt-3 pt-3 border-t border-farm-100">
          <p class="text-xs text-farm-400 mb-2">按稀有度筛选</p>
          <div class="flex flex-wrap gap-2">
            <button 
              @click="filterRarity = 'all'"
              class="text-xs px-3 py-1.5 rounded-full transition-colors"
              :class="filterRarity === 'all' ? 'bg-farm-800 text-white' : 'bg-farm-100 text-farm-600 hover:bg-farm-200'"
            >
              全部
            </button>
            <button 
              v-for="rarity in store.rarities"
              :key="rarity.id"
              @click="filterRarity = rarity.id"
              class="text-xs px-3 py-1.5 rounded-full transition-colors"
              :class="filterRarity === rarity.id ? [rarity.bg, rarity.color, 'ring-2 ring-offset-1', `ring-current`] : 'bg-farm-100 text-farm-600 hover:bg-farm-200'"
            >
              {{ rarity.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- 筛选结果提示 -->
      <div v-if="filterRarity !== 'all' && store.gardenRecords.length > 0" class="text-center text-sm text-farm-400 mb-4">
        共 {{ filteredRecords.length }} 个 {{ store.rarities.find(r => r.id === filterRarity)?.name || '' }} 作物
      </div>

      <!-- 花园展示 -->
      <div v-if="filteredRecords.length > 0" class="space-y-6">
        <div v-for="group in groupedRecords" :key="group.date" class="bg-white/60 rounded-2xl p-4 shadow-sm border border-farm-100 backdrop-blur-sm">
          <h3 class="text-sm font-medium text-farm-500 mb-3 flex items-center">
            <span class="w-2 h-2 rounded-full bg-nature-400 mr-2"></span>
            {{ formatDate(group.date) }}
          </h3>
          <div class="grid grid-cols-5 gap-3">
            <button 
              v-for="record in group.records" 
              :key="record.id"
              @click="batchMode ? toggleSelect(record.id) : selectedCrop = record"
              class="aspect-square rounded-2xl flex items-center justify-center text-3xl transition-all relative group border-2 shadow-sm bg-white"
              :class="[
                selectedIds.has(record.id) ? 'border-nature-500 ring-2 ring-nature-200 scale-95' : (getRarityConfig(record.rarity || 'common').borderColor || 'border-transparent'),
                batchMode ? 'hover:scale-95' : 'hover:scale-105 hover:shadow-md'
              ]"
            >
              {{ record.icon }}
              <!-- 批量选择勾选标记 -->
              <div 
                v-if="batchMode"
                class="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs transition-colors"
                :class="selectedIds.has(record.id) ? 'bg-nature-500' : 'bg-farm-200'"
              >
                <CheckSquare v-if="selectedIds.has(record.id)" :size="12" />
                <Square v-else :size="12" class="text-farm-400" />
              </div>
              <!-- 收藏标记 -->
              <div 
                v-if="record.starred && !batchMode"
                class="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-md z-10"
              >
                <Star :size="10" class="text-white fill-white" />
              </div>
              <!-- 稀有度光点 -->
              <div 
                v-else-if="record.rarity && record.rarity !== 'common' && !batchMode"
                class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white"
                :class="getRarityConfig(record.rarity).bg.replace('bg-', 'bg-').replace('50', '500')"
              ></div>
              <!-- 批量模式下显示价格 -->
              <div 
                v-if="batchMode"
                class="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-yellow-100 rounded text-[10px] text-yellow-700 font-medium whitespace-nowrap"
              >
                {{ record.price }}
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- 筛选后无结果 -->
      <div v-else-if="store.gardenRecords.length > 0 && filteredRecords.length === 0" class="text-center py-16">
        <div class="text-5xl mb-4 opacity-60">🔍</div>
        <p class="text-farm-500 mb-2 font-medium">没有找到符合条件的作物</p>
        <p class="text-sm text-farm-400 mb-4">尝试调整筛选条件</p>
        <button 
          @click="filterRarity = 'all'"
          class="px-6 py-2 bg-farm-100 text-farm-600 rounded-xl text-sm font-medium hover:bg-farm-200 transition-colors"
        >
          清除筛选
        </button>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-20">
        <div class="text-7xl mb-6 opacity-80">🌱</div>
        <p class="text-farm-500 mb-2 font-medium">花园还是空的</p>
        <p class="text-sm text-farm-400">完成专注后，这里会长出花草</p>
        <router-link 
          to="/focus" 
          class="inline-block mt-6 px-8 py-3 bg-nature-500 text-white rounded-2xl text-sm font-bold hover:bg-nature-600 transition-all shadow-lg shadow-nature-200 hover:shadow-xl hover:-translate-y-0.5"
        >
          开始专注
        </router-link>
      </div>
    </main>

    <!-- 作物详情弹窗 -->
    <div v-if="selectedCrop" class="fixed inset-0 bg-farm-900/40 backdrop-blur-sm flex items-center justify-center z-50 px-4" @click.self="selectedCrop = null">
      <div class="bg-white p-6 rounded-[2rem] max-w-sm w-full shadow-2xl relative animate-scale-in border border-farm-100">
        <button 
          @click="selectedCrop = null"
          class="absolute top-4 right-4 p-2 rounded-full hover:bg-farm-100 text-farm-400 transition-colors"
        >
          <X :size="22" />
        </button>

        <div class="text-center pt-2">
          <!-- 稀有度背景 -->
          <div 
            class="w-28 h-28 mx-auto rounded-[1.5rem] flex items-center justify-center text-7xl mb-5 border-[6px] relative shadow-inner"
            :class="[
              getRarityConfig(selectedCrop.rarity || 'common').bg,
              'border-white shadow-sm'
            ]"
          >
            {{ selectedCrop.icon }}
            <div class="absolute -bottom-3 px-3 py-0.5 bg-white rounded-full text-xs font-bold shadow-md border border-farm-100" :class="getRarityConfig(selectedCrop.rarity || 'common').color">
              {{ getRarityConfig(selectedCrop.rarity || 'common').name }}
            </div>
          </div>

          <h3 class="text-2xl font-bold text-farm-800 mb-1">{{ selectedCrop.name }}</h3>
          <p class="text-farm-400 text-xs font-mono mb-8 bg-farm-50 inline-block px-2 py-0.5 rounded-md">ID: {{ selectedCrop.uuid?.slice(0,8) || 'Unknown' }}</p>

          <!-- 属性网格 -->
          <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="bg-farm-50 p-3 rounded-2xl text-left">
              <p class="text-xs text-farm-400 mb-1">磨损度</p>
              <p class="font-mono text-sm text-farm-700 font-medium">{{ selectedCrop.float?.toFixed(5) || '0.00000' }}</p>
            </div>
            <div class="bg-farm-50 p-3 rounded-2xl text-left">
              <p class="text-xs text-farm-400 mb-1">估值</p>
              <p class="font-bold text-yellow-600 flex items-center">
                <Coins :size="14" class="mr-1" />
                {{ selectedCrop.price || 0 }}
              </p>
            </div>
            <div class="bg-farm-50 p-3 rounded-2xl text-left">
              <p class="text-xs text-farm-400 mb-1">收获时段</p>
              <p class="text-sm text-farm-700 font-medium">{{ selectedCrop.timeSlot || '未知' }}</p>
            </div>
            <div class="bg-farm-50 p-3 rounded-2xl text-left">
              <p class="text-xs text-farm-400 mb-1">周期</p>
              <p class="text-sm text-farm-700 font-medium">第 {{ selectedCrop.weekNum || '?' }} 周</p>
            </div>
          </div>

          <!-- 加成标记 -->
          <div v-if="selectedCrop.bonusApplied" class="mb-6 p-3 bg-amber-50/80 rounded-2xl border border-amber-100">
            <p class="text-xs text-amber-700 text-center font-medium flex items-center justify-center">
              <Sparkles :size="14" class="mr-1" />
              该作物收获时有加成
            </p>
            <div class="flex flex-wrap justify-center gap-1 mt-2">
               <span v-for="r in selectedCrop.bonusReasons" :key="r" class="text-[10px] bg-white px-1.5 py-0.5 rounded shadow-sm text-amber-600">
                 {{ r }}
               </span>
            </div>
          </div>

          <!-- 备注 -->
          <div v-if="selectedCrop.note" class="mb-6 p-3 bg-farm-50 rounded-2xl text-left">
            <p class="text-xs text-farm-400 mb-1">备注</p>
            <p class="text-sm text-farm-600 truncate">{{ selectedCrop.note }}</p>
          </div>

          <!-- 按钮组 -->
          <div class="flex space-x-3">
            <button 
              @click="handleToggleStar"
              class="w-14 h-14 rounded-xl font-bold transition-all flex items-center justify-center"
              :class="selectedCrop.starred ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-farm-100 text-farm-400 hover:bg-amber-50 hover:text-amber-500'"
            >
              <Star :size="22" :class="selectedCrop.starred ? 'fill-amber-400' : ''" />
            </button>
            <button 
              @click="handleSell"
              class="flex-1 py-3.5 bg-farm-100 text-farm-600 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center"
            >
              <ShoppingBag :size="18" class="mr-2" />
              出售
            </button>
            <button 
              @click="selectedCrop = null"
              class="flex-1 py-3.5 bg-farm-900 text-white rounded-xl font-bold hover:bg-farm-800 transition-colors shadow-lg shadow-farm-200"
            >
              保留
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
