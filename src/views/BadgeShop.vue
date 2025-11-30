<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, Trophy, Coins, Check, Lock, Sparkles } from 'lucide-vue-next'
import { useAppStore } from '../stores/gameStore'
import { useBadgeStore } from '../stores/badgeStore'

const router = useRouter()
const appStore = useAppStore()
const badgeStore = useBadgeStore()

// 当前查看模式：'shop' 商店 | 'collection' 收藏
const viewMode = ref('shop')

// 当前选中的分类
const selectedCategory = ref('all')

// 选中的徽章（用于详情弹窗）
const selectedBadge = ref(null)

// 显示购买结果的提示
const toast = ref({ show: false, message: '', type: 'success' })

// 动态导入 SVG 徽章
const badgeModules = import.meta.glob('../assets/badges/*.svg', { eager: true, query: '?url', import: 'default' })

function getBadgeSvgUrl(svgFileName) {
  const key = `../assets/badges/${svgFileName}`
  return badgeModules[key] || ''
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

// 筛选后的徽章列表
const filteredBadges = computed(() => {
  let badges = badgeStore.badgeCatalog
  
  if (viewMode.value === 'collection') {
    badges = badges.filter(b => badgeStore.hasBadge(b.id))
  }
  
  if (selectedCategory.value !== 'all') {
    badges = badges.filter(b => b.category === selectedCategory.value)
  }
  
  // 按稀有度排序
  const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary']
  return [...badges].sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity))
})

// 显示徽章详情
function showBadgeDetail(badge) {
  selectedBadge.value = {
    ...badge,
    owned: badgeStore.hasBadge(badge.id),
    rarityInfo: badgeStore.rarityConfig[badge.rarity],
    categoryInfo: badgeStore.categoryConfig[badge.category]
  }
}

// 关闭详情弹窗
function closeBadgeDetail() {
  selectedBadge.value = null
}

// 购买徽章
function purchaseBadge() {
  if (!selectedBadge.value) return
  
  const result = badgeStore.purchaseBadge(selectedBadge.value.id)
  
  // 更新弹窗中的拥有状态
  if (result.success) {
    selectedBadge.value.owned = true
  }
  
  // 显示提示
  showToast(result.message, result.success ? 'success' : 'error')
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
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-amber-200/50">
      <div class="flex items-center justify-between px-4 py-3">
        <button @click="goBack" class="p-2 -ml-2 text-farm-500 hover:text-farm-700">
          <ChevronLeft :size="24" />
        </button>
        <h1 class="text-lg font-bold text-farm-800 flex items-center gap-2">
          <Trophy :size="20" class="text-amber-500" />
          徽章商店
        </h1>
        <div class="flex items-center gap-1 px-3 py-1.5 bg-amber-100 rounded-full">
          <Coins :size="16" class="text-amber-600" />
          <span class="text-sm font-bold text-amber-700">{{ appStore.coins }}</span>
        </div>
      </div>
    </header>

    <!-- 统计卡片 -->
    <div class="px-4 py-4">
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm text-farm-500">收集进度</span>
          <span class="text-sm font-medium text-farm-700">
            {{ badgeStore.stats.owned }} / {{ badgeStore.stats.total }}
          </span>
        </div>
        <div class="h-2 bg-amber-100 rounded-full overflow-hidden">
          <div 
            class="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-500"
            :style="{ width: `${badgeStore.stats.progress}%` }"
          ></div>
        </div>
        <div class="flex justify-between mt-2 text-xs text-farm-400">
          <span>已投入 {{ badgeStore.stats.ownedValue }} 金币</span>
          <span>{{ badgeStore.stats.progress }}% 完成</span>
        </div>
      </div>
    </div>

    <!-- 视图切换 -->
    <div class="px-4 mb-3">
      <div class="flex bg-white rounded-xl p-1 shadow-sm border border-amber-100">
        <button 
          @click="viewMode = 'shop'"
          class="flex-1 py-2 text-sm font-medium rounded-lg transition-all"
          :class="viewMode === 'shop' 
            ? 'bg-amber-500 text-white shadow-sm' 
            : 'text-farm-500 hover:text-farm-700'"
        >
          🛒 商店
        </button>
        <button 
          @click="viewMode = 'collection'"
          class="flex-1 py-2 text-sm font-medium rounded-lg transition-all"
          :class="viewMode === 'collection' 
            ? 'bg-amber-500 text-white shadow-sm' 
            : 'text-farm-500 hover:text-farm-700'"
        >
          🏆 我的收藏
        </button>
      </div>
    </div>

    <!-- 分类筛选 -->
    <div class="px-4 mb-4">
      <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          v-for="cat in categories"
          :key="cat.id"
          @click="selectedCategory = cat.id"
          class="flex-shrink-0 px-3 py-1.5 text-sm rounded-full border transition-all whitespace-nowrap"
          :class="selectedCategory === cat.id 
            ? 'bg-amber-500 text-white border-amber-500' 
            : 'bg-white text-farm-600 border-amber-200 hover:border-amber-400'"
        >
          {{ cat.icon }} {{ cat.name }}
        </button>
      </div>
    </div>

    <!-- 徽章网格 -->
    <div class="px-4 pb-32">
      <div v-if="filteredBadges.length === 0" class="text-center py-12 text-farm-400">
        <Trophy :size="48" class="mx-auto mb-3 opacity-30" />
        <p>{{ viewMode === 'collection' ? '还没有收藏徽章' : '该分类暂无徽章' }}</p>
      </div>
      
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="badge in filteredBadges"
          :key="badge.id"
          @click="showBadgeDetail(badge)"
          class="relative bg-white rounded-xl p-3 shadow-sm border cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95"
          :class="[
            badgeStore.rarityConfig[badge.rarity]?.border || 'border-stone-200',
            badgeStore.hasBadge(badge.id) ? 'ring-2 ring-amber-400 ring-opacity-50' : ''
          ]"
        >
          <!-- 稀有度标识 -->
          <div 
            class="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full"
            :class="[
              badgeStore.rarityConfig[badge.rarity]?.bg,
              badgeStore.rarityConfig[badge.rarity]?.color
            ]"
          >
            {{ badgeStore.rarityConfig[badge.rarity]?.name }}
          </div>
          
          <!-- 已拥有标识 -->
          <div 
            v-if="badgeStore.hasBadge(badge.id)"
            class="absolute -top-1 -left-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm"
          >
            <Check :size="12" class="text-white" />
          </div>
          
          <!-- 徽章图标 -->
          <div class="w-16 h-16 mx-auto mb-2">
            <img 
              :src="getBadgeSvgUrl(badge.svg)" 
              :alt="badge.name"
              class="w-full h-full object-contain"
              :class="{ 'opacity-40 grayscale': !badgeStore.hasBadge(badge.id) && viewMode === 'collection' }"
            />
          </div>
          
          <!-- 徽章名称 -->
          <div class="text-xs font-medium text-center text-farm-700 truncate">
            {{ badge.name }}
          </div>
          
          <!-- 价格 -->
          <div class="flex items-center justify-center gap-1 mt-1">
            <Coins :size="12" class="text-amber-500" />
            <span class="text-xs font-bold text-amber-600">{{ badge.price }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 徽章详情弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div 
          v-if="selectedBadge"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          @click.self="closeBadgeDetail"
        >
          <div class="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <!-- 徽章展示区 -->
            <div 
              class="p-6 text-center"
              :class="selectedBadge.rarityInfo?.bg || 'bg-stone-50'"
            >
              <div class="w-24 h-24 mx-auto mb-3">
                <img 
                  :src="getBadgeSvgUrl(selectedBadge.svg)" 
                  :alt="selectedBadge.name"
                  class="w-full h-full object-contain"
                />
              </div>
              <h3 class="text-xl font-bold text-farm-800">{{ selectedBadge.name }}</h3>
              <div class="flex items-center justify-center gap-2 mt-2">
                <span 
                  class="px-2 py-0.5 text-xs font-medium rounded-full"
                  :class="[selectedBadge.rarityInfo?.bg, selectedBadge.rarityInfo?.color]"
                >
                  {{ selectedBadge.rarityInfo?.name }}
                </span>
                <span class="text-xs text-farm-500">
                  {{ selectedBadge.categoryInfo?.icon }} {{ selectedBadge.categoryInfo?.name }}
                </span>
              </div>
            </div>
            
            <!-- 徽章描述 -->
            <div class="px-6 py-4 border-t border-farm-100">
              <p class="text-sm text-farm-600 text-center">
                {{ selectedBadge.description }}
              </p>
            </div>
            
            <!-- 操作区 -->
            <div class="px-6 py-4 border-t border-farm-100 space-y-3">
              <div class="flex items-center justify-between text-sm">
                <span class="text-farm-500">价格</span>
                <span class="flex items-center gap-1 font-bold text-amber-600">
                  <Coins :size="16" />
                  {{ selectedBadge.price }}
                </span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-farm-500">当前金币</span>
                <span class="font-medium text-farm-700">{{ appStore.coins }}</span>
              </div>
              
              <div class="pt-2 flex gap-3">
                <button
                  @click="closeBadgeDetail"
                  class="flex-1 py-2.5 text-sm font-medium text-farm-500 bg-farm-100 rounded-xl hover:bg-farm-200 transition-colors"
                >
                  关闭
                </button>
                <button
                  v-if="!selectedBadge.owned"
                  @click="purchaseBadge"
                  :disabled="appStore.coins < selectedBadge.price"
                  class="flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-all flex items-center justify-center gap-1"
                  :class="appStore.coins >= selectedBadge.price 
                    ? 'bg-amber-500 hover:bg-amber-600 active:scale-95' 
                    : 'bg-gray-300 cursor-not-allowed'"
                >
                  <template v-if="appStore.coins >= selectedBadge.price">
                    <Sparkles :size="16" />
                    兑换
                  </template>
                  <template v-else>
                    <Lock :size="16" />
                    金币不足
                  </template>
                </button>
                <div 
                  v-else
                  class="flex-1 py-2.5 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-xl flex items-center justify-center gap-1"
                >
                  <Check :size="16" />
                  已拥有
                </div>
              </div>
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
          class="fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg text-sm font-medium"
          :class="toast.type === 'success' 
            ? 'bg-emerald-500 text-white' 
            : 'bg-red-500 text-white'"
        >
          {{ toast.message }}
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
