import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 家务相关状态
export const useChoresStore = defineStore('chores', () => {
  // 当前家务目标
  const currentGoal = ref('')
  // 设定的家务时间（分钟）
  const targetMinutes = ref(30)
  // 计时器状态
  const isRunning = ref(false)
  const startTime = ref(null)
  const elapsedSeconds = ref(0)

  // 金币
  const coins = ref(0)

  // 家务历史记录
  const history = ref([])

  // 计算已用时间的格式化显示
  const elapsedFormatted = computed(() => {
    const mins = Math.floor(elapsedSeconds.value / 60)
    const secs = elapsedSeconds.value % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  })

  // 目标时间格式化
  const targetFormatted = computed(() => {
    return `${String(targetMinutes.value).padStart(2, '0')}:00`
  })

  // 进度百分比
  const progress = computed(() => {
    const targetSecs = targetMinutes.value * 60
    return Math.min((elapsedSeconds.value / targetSecs) * 100, 100)
  })

  // 开始计时
  function startTimer() {
    isRunning.value = true
    startTime.value = Date.now() - elapsedSeconds.value * 1000
  }

  // 暂停计时
  function pauseTimer() {
    isRunning.value = false
  }

  // 重置计时
  function resetTimer() {
    isRunning.value = false
    elapsedSeconds.value = 0
    startTime.value = null
  }

  // 完成家务，获得金币
  function completeChore() {
    const earned = Math.floor(elapsedSeconds.value / 60) // 每分钟1金币
    coins.value += earned

    // 记录历史
    history.value.unshift({
      id: Date.now(),
      goal: currentGoal.value || '日常家务',
      duration: elapsedSeconds.value,
      earnedCoins: earned,
      completedAt: new Date().toISOString()
    })

    // 重置
    resetTimer()
    currentGoal.value = ''

    return earned
  }

  // 更新计时器（由外部定时调用）
  function tick() {
    if (isRunning.value && startTime.value) {
      elapsedSeconds.value = Math.floor((Date.now() - startTime.value) / 1000)
    }
  }

  return {
    currentGoal,
    targetMinutes,
    isRunning,
    elapsedSeconds,
    elapsedFormatted,
    targetFormatted,
    progress,
    coins,
    history,
    startTimer,
    pauseTimer,
    resetTimer,
    completeChore,
    tick
  }
})
