import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'focus-garden-data'

export const useAppStore = defineStore('app', () => {
  // 种子类型（固定时长）
  const seedTypes = [
    { id: 'sprout', name: '嫩芽', icon: '🌱', minutes: 5, description: '快速专注' },
    { id: 'grass', name: '小草', icon: '🌿', minutes: 15, description: '短时专注' },
    { id: 'flower', name: '小花', icon: '🌸', minutes: 25, description: '标准专注' },
    { id: 'tree', name: '大树', icon: '🌲', minutes: 45, description: '深度专注' },
  ]

  // 状态
  const coins = ref(0) // 金币
  const todos = ref([]) // 待办事项
  const todoGroups = ref([
    { id: 'general', name: '待办', icon: '📝', color: 'sky', builtin: true },
    { id: 'housework', name: '家务', icon: '🏠', color: 'amber', builtin: true }
  ]) // 待办分组
  const recycleBin = ref([]) // 回收站
  const focusRecords = ref([]) // 专注记录（包括在花园的和已出售的）
  const currentFocus = ref(null) // 当前专注会话

  // 品质定义（植物主题）
  const rarities = [
    { id: 'common', name: '凡品', color: 'text-stone-500', bg: 'bg-stone-100', chance: 0.5, multiplier: 1 },
    { id: 'fine', name: '良品', color: 'text-emerald-600', bg: 'bg-emerald-50', chance: 0.3, multiplier: 1.5 },
    { id: 'rare', name: '珍品', color: 'text-sky-600', bg: 'bg-sky-50', chance: 0.15, multiplier: 3 },
    { id: 'epic', name: '极品', color: 'text-violet-600', bg: 'bg-violet-50', chance: 0.04, multiplier: 10 },
    { id: 'legendary', name: '仙品', color: 'text-amber-500', bg: 'bg-amber-50', chance: 0.01, multiplier: 50 },
  ]

  // ===== 周期规律系统 =====
  // 伪随机生成器（基于种子，同一周内结果固定）
  function seededRandom(seed) {
    const x = Math.sin(seed * 9999) * 10000
    return x - Math.floor(x)
  }

  // 获取当前周数
  function getWeekNumber() {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    return Math.floor((now - start) / 604800000)
  }

  // 获取当前时段 (0=凌晨, 1=早晨, 2=下午, 3=傍晚, 4=夜间)
  function getTimeSlot() {
    const hour = new Date().getHours()
    if (hour >= 0 && hour < 6) return { id: 0, name: '凌晨', icon: '🌙' }
    if (hour >= 6 && hour < 11) return { id: 1, name: '早晨', icon: '🌅' }
    if (hour >= 11 && hour < 14) return { id: 2, name: '正午', icon: '☀️' }
    if (hour >= 14 && hour < 18) return { id: 3, name: '下午', icon: '🌤️' }
    if (hour >= 18 && hour < 21) return { id: 4, name: '傍晚', icon: '🌇' }
    return { id: 5, name: '夜间', icon: '🌃' }
  }

  // 获取本周的隐藏规律配置
  function getWeeklyPattern() {
    const weekNum = getWeekNumber()
    const seedIds = ['sprout', 'grass', 'flower', 'tree']
    
    // 本周幸运种子（1-2个）
    const lucky1 = Math.floor(seededRandom(weekNum * 1111) * 4)
    const lucky2 = Math.floor(seededRandom(weekNum * 2222) * 4)
    const hasSecondLucky = seededRandom(weekNum * 3333) > 0.6
    
    const luckySeeds = [seedIds[lucky1]]
    if (hasSecondLucky && lucky2 !== lucky1) {
      luckySeeds.push(seedIds[lucky2])
    }

    // 本周黄金时段（1-2个）
    const luckySlot1 = Math.floor(seededRandom(weekNum * 4444) * 6)
    const luckySlot2 = Math.floor(seededRandom(weekNum * 5555) * 6)
    const hasSecondSlot = seededRandom(weekNum * 6666) > 0.7
    
    const luckySlots = [luckySlot1]
    if (hasSecondSlot && luckySlot2 !== luckySlot1) {
      luckySlots.push(luckySlot2)
    }

    // 本周天气（影响提示语）
    const weatherIndex = Math.floor(seededRandom(weekNum * 7777) * 4)
    const weathers = [
      { name: '和风', hint: '微风轻拂，适合细腻的作物生长' },
      { name: '细雨', hint: '雨露滋润，某些植物格外茂盛' },
      { name: '暖阳', hint: '阳光充沛，耐久的作物长势喜人' },
      { name: '薄雾', hint: '雾气氤氲，似乎隐藏着什么规律' },
    ]

    return {
      weekNum,
      luckySeeds,      // 幸运种子ID列表
      luckySlots,      // 幸运时段ID列表  
      weather: weathers[weatherIndex],
      // 生成模糊提示（不直接揭示答案）
      hints: generateHints(luckySeeds, luckySlots, seedIds)
    }
  }

  // 生成模糊提示
  function generateHints(luckySeeds, luckySlots, seedIds) {
    const hints = []
    const slotNames = ['凌晨', '早晨', '正午', '下午', '傍晚', '夜间']
    
    // 种子相关提示（模糊）
    if (luckySeeds.includes('sprout') || luckySeeds.includes('grass')) {
      hints.push('本周气候似乎对快速生长的植物有利...')
    }
    if (luckySeeds.includes('flower') || luckySeeds.includes('tree')) {
      hints.push('空气中弥漫着促进深度扎根的气息...')
    }
    
    // 时段相关提示（模糊）
    const hasNight = luckySlots.some(s => s === 0 || s === 5)
    const hasDay = luckySlots.some(s => s >= 1 && s <= 4)
    if (hasNight) hints.push('夜间的露水似乎格外充沛')
    if (hasDay && !hasNight) hints.push('日照时分蕴含着特别的能量')
    
    return hints
  }

  // 计算种植加成
  function calculateBonus(seedId) {
    const pattern = getWeeklyPattern()
    const currentSlot = getTimeSlot()
    
    let bonus = 1.0
    let bonusReasons = []
    
    // 幸运种子加成 (+50% 品质提升概率)
    if (pattern.luckySeeds.includes(seedId)) {
      bonus *= 1.5
      bonusReasons.push('本周气候加成')
    }
    
    // 幸运时段加成 (+30% 品质提升概率)
    if (pattern.luckySlots.includes(currentSlot.id)) {
      bonus *= 1.3
      bonusReasons.push('时段加成')
    }
    
    // 双重加成时额外奖励
    if (bonus > 1.8) {
      bonus *= 1.2
      bonusReasons.push('天时地利')
    }
    
    return { bonus, reasons: bonusReasons, pattern, currentSlot }
  }

  // 从本地存储加载数据
  function loadFromStorage() {
    if (typeof localStorage === 'undefined') return
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        todos.value = parsed.todos || []
        if (parsed.todoGroups && parsed.todoGroups.length > 0) {
          todoGroups.value = parsed.todoGroups
        }
        recycleBin.value = parsed.recycleBin || []
        focusRecords.value = parsed.focusRecords || []
        coins.value = parsed.coins || 0
      }
    } catch (e) {
      console.error('加载数据失败:', e)
    }
  }

  // 保存到本地存储
  function saveToStorage() {
    if (typeof localStorage === 'undefined') return
    const data = {
      todos: todos.value,
      todoGroups: todoGroups.value,
      recycleBin: recycleBin.value,
      focusRecords: focusRecords.value,
      coins: coins.value,
      exportedAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  // 监听数据变化自动保存
  watch([todos, todoGroups, recycleBin, focusRecords, coins], saveToStorage, { deep: true })

  // ===== 待办事项相关 =====
  function addTodo(text, groupId = 'general') {
    const todo = {
      id: Date.now().toString(),
      text,
      groupId,
      category: groupId,
      completed: false,
      createdAt: new Date().toISOString()
    }
    todos.value = [todo, ...todos.value]
  }

  function toggleTodo(id) {
    const todo = todos.value.find(t => t.id === id)
    if (todo) {
      todo.completed = !todo.completed
      if (todo.completed) {
        todo.completedAt = new Date().toISOString()
      } else {
        delete todo.completedAt
      }
    }
  }

  function deleteTodo(id) {
    todos.value = todos.value.filter(t => t.id !== id)
  }

  function moveToRecycleBin(id) {
    const todo = todos.value.find(t => t.id === id)
    if (todo) {
      recycleBin.value.push({
        ...todo,
        deletedAt: new Date().toISOString()
      })
      todos.value = todos.value.filter(t => t.id !== id)
    }
  }

  function clearCompletedTodos() {
    const completed = todos.value.filter(t => t.completed)
    completed.forEach(todo => {
      recycleBin.value.push({
        ...todo,
        deletedAt: new Date().toISOString()
      })
    })
    todos.value = todos.value.filter(t => !t.completed)
  }

  function restoreFromRecycleBin(id) {
    const item = recycleBin.value.find(t => t.id === id)
    if (item) {
      const { deletedAt, ...todo } = item
      todos.value = [todo, ...todos.value]
      recycleBin.value = recycleBin.value.filter(t => t.id !== id)
    }
  }

  function deleteFromRecycleBin(id) {
    recycleBin.value = recycleBin.value.filter(t => t.id !== id)
  }

  function clearRecycleBin() {
    recycleBin.value = []
  }

  // ===== 待办分组管理 =====
  function addTodoGroup(name, icon = '📁', color = 'gray') {
    const group = {
      id: Date.now().toString(),
      name,
      icon,
      color,
      builtin: false,
      createdAt: new Date().toISOString()
    }
    todoGroups.value.push(group)
    return group
  }

  function updateTodoGroup(id, updates) {
    const group = todoGroups.value.find(g => g.id === id)
    if (group && !group.builtin) {
      Object.assign(group, updates)
    }
  }

  function deleteTodoGroup(id) {
    const group = todoGroups.value.find(g => g.id === id)
    if (group && !group.builtin) {
      todos.value.forEach(todo => {
        if (todo.groupId === id) {
          todo.groupId = 'general'
          todo.category = 'general'
        }
      })
      todoGroups.value = todoGroups.value.filter(g => g.id !== id)
    }
  }

  // ===== 专注会话相关 =====
  function startFocus(seedId, note = '') {
    // 已有进行中的会话时避免重复开启
    if (currentFocus.value) return false
    const seed = seedTypes.find(s => s.id === seedId)
    if (!seed) return false

    currentFocus.value = {
      seedId,
      seed,
      note,
      startedAt: new Date().toISOString(),
      status: 'running'
    }
    return true
  }

  function cancelFocus() {
    currentFocus.value = null
  }

  // 生成随机作物属性（受周期加成影响）
  function generateCropAttributes(baseMinutes, seedId) {
    // 获取加成信息
    const bonusInfo = calculateBonus(seedId)
    const bonus = bonusInfo.bonus
    
    // 1. 随机稀有度（加成影响：提升获得高品质的概率）
    // 原理：bonus越高，随机数越容易"偏向"高品质区间
    let rand = Math.random()
    // 加成公式：将随机数向高品质方向压缩
    if (bonus > 1) {
      rand = Math.pow(rand, 1 / bonus) // bonus=1.5时，0.5会变成约0.63
    }
    
    let cumulativeChance = 0
    let selectedRarity = rarities[0]
    
    for (const rarity of rarities) {
      cumulativeChance += rarity.chance
      if (rand <= cumulativeChance) {
        selectedRarity = rarity
        break
      }
    }

    // 2. 随机磨损度 (0.00 - 1.00)，加成也会略微降低磨损
    let float = Math.random()
    if (bonus > 1) {
      float = float * (1 / bonus) + (1 - 1/bonus) * Math.random() * 0.3
      float = Math.min(1, Math.max(0, float))
    }
    
    // 3. 计算价格
    const basePrice = baseMinutes
    const price = Math.floor(basePrice * selectedRarity.multiplier * (1 + (1 - float)))

    return {
      rarity: selectedRarity.id,
      float: parseFloat(float.toFixed(5)),
      price,
      uuid: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      // 记录获得时的加成信息（供玩家分析）
      bonusApplied: bonus > 1,
      bonusReasons: bonusInfo.reasons,
      timeSlot: bonusInfo.currentSlot.name,
      weekNum: bonusInfo.pattern.weekNum
    }
  }

  function completeFocus() {
    if (!currentFocus.value) return
    
    const attrs = generateCropAttributes(currentFocus.value.seed.minutes, currentFocus.value.seedId)

    // 添加到专注记录
    focusRecords.value.push({
      id: Date.now().toString(),
      ...attrs,
      seedId: currentFocus.value.seedId,
      icon: currentFocus.value.seed.icon,
      name: currentFocus.value.seed.name,
      minutes: currentFocus.value.seed.minutes,
      note: currentFocus.value.note,
      completedAt: new Date().toISOString(),
      status: 'garden' // 'garden' or 'sold'
    })
    
    currentFocus.value = null
  }

  function sellCrop(id) {
    const record = focusRecords.value.find(r => r.id === id)
    if (record && record.status === 'garden') {
      record.status = 'sold'
      record.soldAt = new Date().toISOString()
      coins.value += record.price
      return true
    }
    return false
  }

  // 收藏/取消收藏作物
  function toggleStar(id) {
    const record = focusRecords.value.find(r => r.id === id)
    if (record) {
      record.starred = !record.starred
      return record.starred
    }
    return false
  }

  // ... (export/import methods update) ...
  
  function exportData() {
    const data = {
      todos: todos.value,
      todoGroups: todoGroups.value,
      recycleBin: recycleBin.value,
      focusRecords: focusRecords.value,
      coins: coins.value,
      exportedAt: new Date().toISOString(),
      version: '2.1'
    }
    return JSON.stringify(data, null, 2)
  }

  function importData(jsonString) {
    try {
      const data = JSON.parse(jsonString)
      if (data.todos) todos.value = data.todos
      if (data.todoGroups) todoGroups.value = data.todoGroups
      if (data.recycleBin) recycleBin.value = data.recycleBin
      if (data.focusRecords) focusRecords.value = data.focusRecords
      if (data.coins !== undefined) coins.value = data.coins
      saveToStorage()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  function clearAllData() {
    todos.value = []
    todoGroups.value = [
      { id: 'general', name: '待办', icon: '📝', color: 'sky', builtin: true },
      { id: 'housework', name: '家务', icon: '🏠', color: 'amber', builtin: true }
    ]
    recycleBin.value = []
    focusRecords.value = []
    coins.value = 0
    currentFocus.value = null
    saveToStorage()
  }

  // ===== 计算属性 =====
  const pendingTodos = computed(() => todos.value.filter(t => !t.completed))
  const completedTodos = computed(() => todos.value.filter(t => t.completed))
  const houseworkTodos = computed(() => todos.value.filter(t => t.category === 'housework'))
  const generalTodos = computed(() => todos.value.filter(t => t.category === 'general'))
  
  // 花园只展示未出售的
  const gardenRecords = computed(() => focusRecords.value.filter(r => r.status === 'garden'))

  // 收藏的作物（展览馆）
  const starredRecords = computed(() => focusRecords.value.filter(r => r.starred && r.status === 'garden'))

  const todayRecords = computed(() => {
    const today = new Date().toDateString()
    return focusRecords.value.filter(r => 
      new Date(r.completedAt).toDateString() === today
    )
  })

  const totalFocusMinutes = computed(() => 
    focusRecords.value.reduce((sum, r) => sum + r.minutes, 0)
  )

  // 启动时尝试恢复本地存档
  loadFromStorage()

  return {
    // 基础配置
    seedTypes,
    rarities,
    // 状态
    coins,
    todos,
    todoGroups,
    recycleBin,
    focusRecords,
    currentFocus,
    // 计算属性
    pendingTodos,
    completedTodos,
    houseworkTodos,
    generalTodos,
    gardenRecords,
    starredRecords,
    todayRecords,
    totalFocusMinutes,
    // 周期系统
    getWeeklyPattern,
    getTimeSlot,
    calculateBonus,
    // 方法
    addTodo,
    toggleTodo,
    deleteTodo,
    moveToRecycleBin,
    clearCompletedTodos,
    restoreFromRecycleBin,
    deleteFromRecycleBin,
    clearRecycleBin,
    addTodoGroup,
    updateTodoGroup,
    deleteTodoGroup,
    startFocus,
    completeFocus,
    cancelFocus,
    sellCrop,
    toggleStar,
    exportData,
    importData,
    clearAllData,
    loadFromStorage
  }
})
