import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAppStore } from './gameStore'

// ==================== 推币机系统配置 ====================

// 推币机特征配置
const MACHINE_TRAITS = {
  lucky_rare: {
    id: 'lucky_rare',
    name: '幸运之星',
    description: '更容易抽出稀有徽章',
    icon: '⭐',
    color: 'from-purple-400 to-pink-500',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    // 稀有度权重调整：稀有及以上概率翻倍
    rarityMultiplier: { common: 0.5, uncommon: 0.8, rare: 2, epic: 2.5, legendary: 3 }
  },
  lucky_duplicate: {
    id: 'lucky_duplicate',
    name: '回收大师',
    description: '更容易抽出重复徽章，重复返还50%金币',
    icon: '🔄',
    color: 'from-emerald-400 to-teal-500',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    // 已拥有的徽章权重增加
    duplicateBonus: 3,
    refundRate: 0.5
  },
  lucky_common: {
    id: 'lucky_common',
    name: '平民福音',
    description: '更容易抽出低级徽章，价格更便宜',
    icon: '🍀',
    color: 'from-green-400 to-lime-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    // 低级徽章概率大幅提升
    rarityMultiplier: { common: 3, uncommon: 2, rare: 0.5, epic: 0.3, legendary: 0.1 },
    priceDiscount: 0.7
  },
  all_category: {
    id: 'all_category',
    name: '万象之轮',
    description: '所有类型徽章均匀抽出',
    icon: '🌈',
    color: 'from-sky-400 to-indigo-500',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-300',
    // 所有分类平均概率
    equalCategory: true
  },
  double_draw: {
    id: 'double_draw',
    name: '双子星座',
    description: '有机会一次抽出两个徽章',
    icon: '✨',
    color: 'from-amber-400 to-orange-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    // 双抽概率
    doubleChance: 0.35
  }
}

// 推币机基础配置
const MACHINE_BASE_PRICE = 80 // 基础价格

// ==================== 徽章目录配置 ====================

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
  pokemon: { name: '精灵系列', icon: '🐱' },
  game: { name: '游戏系列', icon: '🎮' }
}

const STORAGE_KEY = 'focus-garden-badges'
const MACHINE_STORAGE_KEY = 'focus-garden-machines'

// 获取本周的周一日期字符串（用于判断是否需要刷新）
function getWeekMonday() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // 调整到周一
  const monday = new Date(now.setDate(diff))
  return monday.toISOString().split('T')[0]
}

// 基于种子的伪随机数生成器（确保同一周内机器特征一致）
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// 根据周数生成三台机器的特征
function generateMachineTraits(weekSeed) {
  const traitKeys = Object.keys(MACHINE_TRAITS)
  const machines = []
  const usedTraits = new Set()
  
  for (let i = 0; i < 3; i++) {
    let attempts = 0
    let traitIndex
    do {
      traitIndex = Math.floor(seededRandom(weekSeed + i + attempts * 100) * traitKeys.length)
      attempts++
    } while (usedTraits.has(traitKeys[traitIndex]) && attempts < 50)
    
    const traitKey = traitKeys[traitIndex]
    usedTraits.add(traitKey)
    
    machines.push({
      id: `machine_${i + 1}`,
      slot: i + 1,
      trait: MACHINE_TRAITS[traitKey],
      drawCount: 0
    })
  }
  
  return machines
}

export const useBadgeStore = defineStore('badge', () => {
  // 徽章目录（只读）
  const badgeCatalog = ref(BADGE_CATALOG)
  const rarityConfig = ref(RARITY_CONFIG)
  const categoryConfig = ref(CATEGORY_CONFIG)
  const machineTraits = ref(MACHINE_TRAITS)

  // 已拥有的徽章ID列表
  const ownedBadges = ref([])
  
  // 推币机状态
  const machines = ref([])
  const lastRefreshWeek = ref('')
  const drawHistory = ref([]) // 抽取历史

  // 从本地存储加载数据
  function loadFromStorage() {
    if (typeof localStorage === 'undefined') return
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        ownedBadges.value = parsed.ownedBadges || []
      }
      
      // 加载推币机数据
      const machineData = localStorage.getItem(MACHINE_STORAGE_KEY)
      if (machineData) {
        const parsed = JSON.parse(machineData)
        lastRefreshWeek.value = parsed.lastRefreshWeek || ''
        machines.value = parsed.machines || []
        drawHistory.value = parsed.drawHistory || []
      }
      
      // 检查是否需要刷新机器
      refreshMachinesIfNeeded()
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
  
  // 保存推币机数据
  function saveMachineData() {
    if (typeof localStorage === 'undefined') return
    const data = {
      lastRefreshWeek: lastRefreshWeek.value,
      machines: machines.value,
      drawHistory: drawHistory.value.slice(-50), // 只保留最近50条
      savedAt: new Date().toISOString()
    }
    localStorage.setItem(MACHINE_STORAGE_KEY, JSON.stringify(data))
  }
  
  // 刷新推币机（如果需要）
  function refreshMachinesIfNeeded() {
    const currentWeek = getWeekMonday()
    if (lastRefreshWeek.value !== currentWeek) {
      // 新的一周，刷新机器特征
      const weekSeed = currentWeek.split('-').reduce((a, b) => a + parseInt(b), 0)
      machines.value = generateMachineTraits(weekSeed)
      lastRefreshWeek.value = currentWeek
      saveMachineData()
    }
  }
  
  // 获取下次刷新时间
  const nextRefreshTime = computed(() => {
    const now = new Date()
    const day = now.getDay()
    const daysUntilMonday = day === 0 ? 1 : (8 - day)
    const nextMonday = new Date(now)
    nextMonday.setDate(now.getDate() + daysUntilMonday)
    nextMonday.setHours(0, 0, 0, 0)
    return nextMonday
  })

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
  
  // ==================== 推币机核心逻辑 ====================
  
  // 获取推币机价格
  function getMachinePrice(machineIndex) {
    const machine = machines.value[machineIndex]
    if (!machine) return MACHINE_BASE_PRICE
    
    let price = MACHINE_BASE_PRICE
    // 平民福音有折扣
    if (machine.trait.priceDiscount) {
      price = Math.floor(price * machine.trait.priceDiscount)
    }
    return price
  }
  
  // 根据机器特征计算徽章权重
  function calculateBadgeWeights(machine) {
    const trait = machine.trait
    const weights = []
    
    for (const badge of badgeCatalog.value) {
      let weight = 1
      
      // 稀有度权重调整
      if (trait.rarityMultiplier) {
        weight *= trait.rarityMultiplier[badge.rarity] || 1
      }
      
      // 重复徽章加成
      if (trait.duplicateBonus && hasBadge(badge.id)) {
        weight *= trait.duplicateBonus
      }
      
      // 分类均匀分布
      if (trait.equalCategory) {
        const categoryCount = badgeCatalog.value.filter(b => b.category === badge.category).length
        weight = 1 / categoryCount
      }
      
      weights.push({ badge, weight })
    }
    
    return weights
  }
  
  // 根据权重随机选择徽章
  function weightedRandomSelect(weights) {
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
    let random = Math.random() * totalWeight
    
    for (const item of weights) {
      random -= item.weight
      if (random <= 0) {
        return item.badge
      }
    }
    
    return weights[weights.length - 1].badge
  }
  
  // 执行抽取
  function drawFromMachine(machineIndex) {
    const appStore = useAppStore()
    const machine = machines.value[machineIndex]
    
    if (!machine) {
      return { success: false, message: '机器不存在' }
    }
    
    const price = getMachinePrice(machineIndex)
    
    if (appStore.coins < price) {
      return { success: false, message: `金币不足，需要 ${price} 金币` }
    }
    
    // 扣除金币
    appStore.coins -= price
    
    // 计算权重并抽取
    const weights = calculateBadgeWeights(machine)
    const results = []
    
    // 判断是否双抽
    const isDouble = machine.trait.doubleChance && Math.random() < machine.trait.doubleChance
    const drawCount = isDouble ? 2 : 1
    
    for (let i = 0; i < drawCount; i++) {
      const badge = weightedRandomSelect(weights)
      const isDuplicate = hasBadge(badge.id)
      let refund = 0
      
      if (isDuplicate) {
        // 重复徽章返还
        const refundRate = machine.trait.refundRate || 0.3
        refund = Math.floor(price * refundRate)
        appStore.coins += refund
      } else {
        // 新徽章加入收藏
        ownedBadges.value.push(badge.id)
      }
      
      results.push({
        badge: getBadgeInfo(badge.id),
        isDuplicate,
        refund
      })
    }
    
    // 更新机器抽取次数
    machine.drawCount++
    
    // 记录历史
    drawHistory.value.push({
      machineId: machine.id,
      machineTrait: machine.trait.name,
      results: results.map(r => ({
        badgeId: r.badge.id,
        badgeName: r.badge.name,
        isDuplicate: r.isDuplicate,
        refund: r.refund
      })),
      cost: price,
      timestamp: new Date().toISOString()
    })
    
    saveMachineData()
    
    return {
      success: true,
      results,
      isDouble,
      cost: price,
      message: isDouble ? '🎉 双子幸运！一次获得两个！' : `成功抽取「${results[0].badge.name}」！`
    }
  }
  
  // 获取机器信息
  function getMachineInfo(machineIndex) {
    const machine = machines.value[machineIndex]
    if (!machine) return null
    
    return {
      ...machine,
      price: getMachinePrice(machineIndex)
    }
  }

  // 启动时加载数据
  loadFromStorage()

  return {
    // 配置
    badgeCatalog,
    rarityConfig,
    categoryConfig,
    machineTraits,
    // 状态
    ownedBadges,
    machines,
    drawHistory,
    lastRefreshWeek,
    // 计算属性
    badgesByCategory,
    ownedBadgeDetails,
    stats,
    nextRefreshTime,
    // 方法
    purchaseBadge,
    hasBadge,
    getBadgeInfo,
    exportBadgeData,
    importBadgeData,
    clearBadgeData,
    loadFromStorage,
    // 推币机方法
    getMachinePrice,
    getMachineInfo,
    drawFromMachine,
    refreshMachinesIfNeeded
  }
})
