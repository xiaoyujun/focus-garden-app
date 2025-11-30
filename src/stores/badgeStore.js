import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAppStore } from './gameStore'

// 徽章目录配置
// 添加新徽章时只需在此数组中添加一项
const BADGE_CATALOG = [
  {
    id: 'focus-beginner',
    name: '专注新手',
    description: '迈出专注的第一步，每一次开始都值得铭记',
    price: 50,
    rarity: 'common',
    category: 'focus',
    svg: 'focus-beginner.svg'
  },
  {
    id: 'focus-warrior',
    name: '专注战士',
    description: '勇敢面对时间的挑战，专注力量日益增长',
    price: 150,
    rarity: 'uncommon',
    category: 'focus',
    svg: 'focus-warrior.svg'
  },
  {
    id: 'early-bird',
    name: '早起鸟',
    description: '清晨的阳光属于早起的人，一日之计在于晨',
    price: 100,
    rarity: 'common',
    category: 'time',
    svg: 'early-bird.svg'
  },
  {
    id: 'night-owl',
    name: '夜猫子',
    description: '夜深人静时的专注，静谧中蕴藏力量',
    price: 100,
    rarity: 'common',
    category: 'time',
    svg: 'night-owl.svg'
  },
  {
    id: 'streak-master',
    name: '连续达人',
    description: '坚持不懈的努力，连续打卡的荣耀',
    price: 300,
    rarity: 'rare',
    category: 'achievement',
    svg: 'streak-master.svg'
  },
  {
    id: 'garden-expert',
    name: '花园专家',
    description: '精心培育花园，见证生命的成长',
    price: 200,
    rarity: 'uncommon',
    category: 'garden',
    svg: 'garden-expert.svg'
  },
  {
    id: 'todo-champion',
    name: '待办冠军',
    description: '高效完成任务，GTD大师的象征',
    price: 180,
    rarity: 'uncommon',
    category: 'todo',
    svg: 'todo-champion.svg'
  },
  {
    id: 'coin-collector',
    name: '金币收藏家',
    description: '财富的积累源于点滴的努力',
    price: 250,
    rarity: 'uncommon',
    category: 'economy',
    svg: 'coin-collector.svg'
  },
  {
    id: 'zen-master',
    name: '禅心大师',
    description: '心如止水，专注当下，禅意满满',
    price: 500,
    rarity: 'epic',
    category: 'special',
    svg: 'zen-master.svg'
  },
  {
    id: 'star-hunter',
    name: '追星猎人',
    description: '收集稀有作物的勇者，追逐每一颗闪耀的星',
    price: 350,
    rarity: 'rare',
    category: 'collection',
    svg: 'star-hunter.svg'
  },
  {
    id: 'legendary-focus',
    name: '传奇专注',
    description: '专注力的巅峰，传说中的存在，仅供真正的大师',
    price: 1000,
    rarity: 'legendary',
    category: 'special',
    svg: 'legendary-focus.svg'
  },
  {
    id: 'time-traveler',
    name: '时间旅者',
    description: '掌控时间的流逝，穿梭于专注的时空',
    price: 400,
    rarity: 'rare',
    category: 'time',
    svg: 'time-traveler.svg'
  },
  // 宝可梦系列
  {
    id: 'poke-ball',
    name: '专注球',
    description: '能够捕捉任何灵感的神秘球体',
    price: 100,
    rarity: 'common',
    category: 'pokemon',
    svg: 'poke-ball.svg'
  },
  {
    id: 'pika-spark',
    name: '电光鼠',
    description: '充满活力的十万伏特专注力',
    price: 250,
    rarity: 'rare',
    category: 'pokemon',
    svg: 'pika-spark.svg'
  },
  {
    id: 'charm-flame',
    name: '小火龙',
    description: '尾巴上的火焰代表着永不熄灭的热情',
    price: 250,
    rarity: 'rare',
    category: 'pokemon',
    svg: 'charm-flame.svg'
  },
  {
    id: 'bulb-seed',
    name: '奇异种子',
    description: '背上的种子蕴含着无限的生长潜力',
    price: 250,
    rarity: 'rare',
    category: 'pokemon',
    svg: 'bulb-seed.svg'
  },
  {
    id: 'squirt-bubble',
    name: '杰尼龟',
    description: '冷静如水，从容面对一切挑战',
    price: 250,
    rarity: 'rare',
    category: 'pokemon',
    svg: 'squirt-bubble.svg'
  },
  {
    id: 'evee-star',
    name: '伊布星',
    description: '拥有无限进化的可能性，未来由你决定',
    price: 300,
    rarity: 'epic',
    category: 'pokemon',
    svg: 'evee-star.svg'
  },
  {
    id: 'snor-sleep',
    name: '瞌睡兽',
    description: '休息是为了走更长远的路',
    price: 200,
    rarity: 'uncommon',
    category: 'pokemon',
    svg: 'snor-sleep.svg'
  }
]

// 稀有度配置
const RARITY_CONFIG = {
  common: { name: '普通', color: 'text-stone-600', bg: 'bg-stone-100', border: 'border-stone-300' },
  uncommon: { name: '优秀', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-300' },
  rare: { name: '稀有', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-300' },
  epic: { name: '史诗', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-400' },
  legendary: { name: '传奇', color: 'text-amber-600', bg: 'bg-gradient-to-br from-amber-50 to-yellow-100', border: 'border-amber-400' }
}

// 分类配置
const CATEGORY_CONFIG = {
  focus: { name: '专注系列', icon: '🎯' },
  time: { name: '时间系列', icon: '⏰' },
  achievement: { name: '成就系列', icon: '🏆' },
  garden: { name: '花园系列', icon: '🌸' },
  todo: { name: '待办系列', icon: '📋' },
  economy: { name: '经济系列', icon: '💰' },
  collection: { name: '收藏系列', icon: '⭐' },
  special: { name: '特别系列', icon: '✨' },
  pokemon: { name: '精灵系列', icon: '🐱' }
}

const STORAGE_KEY = 'focus-garden-badges'

export const useBadgeStore = defineStore('badge', () => {
  // 徽章目录（只读）
  const badgeCatalog = ref(BADGE_CATALOG)
  const rarityConfig = ref(RARITY_CONFIG)
  const categoryConfig = ref(CATEGORY_CONFIG)

  // 已拥有的徽章ID列表
  const ownedBadges = ref([])

  // 从本地存储加载数据
  function loadFromStorage() {
    if (typeof localStorage === 'undefined') return
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        ownedBadges.value = parsed.ownedBadges || []
      }
    } catch (e) {
      console.error('加载徽章数据失败:', e)
    }
  }

  // 保存到本地存储
  function saveToStorage() {
    if (typeof localStorage === 'undefined') return
    const data = {
      ownedBadges: ownedBadges.value,
      savedAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  // 监听数据变化自动保存
  watch(ownedBadges, saveToStorage, { deep: true })

  // 购买徽章
  function purchaseBadge(badgeId) {
    const appStore = useAppStore()
    const badge = badgeCatalog.value.find(b => b.id === badgeId)
    
    if (!badge) {
      return { success: false, message: '徽章不存在' }
    }
    
    if (ownedBadges.value.includes(badgeId)) {
      return { success: false, message: '您已拥有此徽章' }
    }
    
    if (appStore.coins < badge.price) {
      return { success: false, message: `金币不足，还需要 ${badge.price - appStore.coins} 金币` }
    }
    
    // 扣除金币
    appStore.coins -= badge.price
    
    // 添加到已拥有列表
    ownedBadges.value.push(badgeId)
    
    return { success: true, message: `成功兑换「${badge.name}」！` }
  }

  // 检查是否拥有某徽章
  function hasBadge(badgeId) {
    return ownedBadges.value.includes(badgeId)
  }

  // 获取徽章详情（带拥有状态）
  function getBadgeInfo(badgeId) {
    const badge = badgeCatalog.value.find(b => b.id === badgeId)
    if (!badge) return null
    return {
      ...badge,
      owned: hasBadge(badgeId),
      rarityInfo: rarityConfig.value[badge.rarity],
      categoryInfo: categoryConfig.value[badge.category]
    }
  }

  // 按分类筛选徽章
  const badgesByCategory = computed(() => {
    const result = {}
    for (const category of Object.keys(categoryConfig.value)) {
      result[category] = badgeCatalog.value.filter(b => b.category === category)
    }
    return result
  })

  // 已拥有徽章详情列表
  const ownedBadgeDetails = computed(() => {
    return ownedBadges.value
      .map(id => getBadgeInfo(id))
      .filter(Boolean)
  })

  // 统计信息
  const stats = computed(() => {
    const total = badgeCatalog.value.length
    const owned = ownedBadges.value.length
    const totalValue = badgeCatalog.value.reduce((sum, b) => sum + b.price, 0)
    const ownedValue = ownedBadgeDetails.value.reduce((sum, b) => sum + b.price, 0)
    
    return {
      total,
      owned,
      progress: total > 0 ? Math.round((owned / total) * 100) : 0,
      totalValue,
      ownedValue
    }
  })

  // 导出徽章数据（用于备份）
  function exportBadgeData() {
    return {
      ownedBadges: ownedBadges.value,
      exportedAt: new Date().toISOString()
    }
  }

  // 导入徽章数据
  function importBadgeData(data) {
    try {
      if (data && Array.isArray(data.ownedBadges)) {
        ownedBadges.value = data.ownedBadges.filter(id => 
          badgeCatalog.value.some(b => b.id === id)
        )
        saveToStorage()
        return { success: true }
      }
      return { success: false, error: '无效的数据格式' }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // 清空徽章数据
  function clearBadgeData() {
    ownedBadges.value = []
    saveToStorage()
  }

  // 启动时加载数据
  loadFromStorage()

  return {
    // 配置
    badgeCatalog,
    rarityConfig,
    categoryConfig,
    // 状态
    ownedBadges,
    // 计算属性
    badgesByCategory,
    ownedBadgeDetails,
    stats,
    // 方法
    purchaseBadge,
    hasBadge,
    getBadgeInfo,
    exportBadgeData,
    importBadgeData,
    clearBadgeData,
    loadFromStorage
  }
})
