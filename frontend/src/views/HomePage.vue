<template>
  <div class="home-page">
    <!-- 顶部金币显示 -->
    <div class="header">
      <div class="coins-display">
        <span class="coin-icon">🪙</span>
        <span class="coin-count">{{ choresStore.coins }}</span>
      </div>
    </div>

    <!-- 主要内容区 -->
    <div class="main-content">
      <!-- 农场装饰背景 -->
      <div class="farm-decoration">
        <div class="sun">☀️</div>
        <div class="clouds">
          <span>☁️</span>
          <span>☁️</span>
        </div>
      </div>

      <!-- 家务目标卡片 -->
      <div class="goal-card">
        <h2 class="card-title">今日家务</h2>
        
        <div class="goal-input-area">
          <van-field
            v-model="choresStore.currentGoal"
            placeholder="写下你的家务目标..."
            :disabled="choresStore.isRunning"
          />
        </div>

        <!-- 时间设置 -->
        <div class="time-setting" v-if="!choresStore.isRunning && choresStore.elapsedSeconds === 0">
          <span>目标时间：</span>
          <van-stepper 
            v-model="choresStore.targetMinutes" 
            :min="5" 
            :max="120" 
            :step="5"
          />
          <span>分钟</span>
        </div>

        <!-- 计时器显示 -->
        <div class="timer-display">
          <div class="timer-circle">
            <svg viewBox="0 0 100 100">
              <circle 
                class="timer-bg" 
                cx="50" cy="50" r="45" 
                fill="none" 
                stroke="#e8e8e8" 
                stroke-width="8"
              />
              <circle 
                class="timer-progress" 
                cx="50" cy="50" r="45" 
                fill="none" 
                stroke="#4CAF50" 
                stroke-width="8"
                :stroke-dasharray="283"
                :stroke-dashoffset="283 - (283 * choresStore.progress / 100)"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div class="timer-text">
              <span class="elapsed">{{ choresStore.elapsedFormatted }}</span>
              <span class="divider">/</span>
              <span class="target">{{ choresStore.targetFormatted }}</span>
            </div>
          </div>
        </div>

        <!-- 控制按钮 -->
        <div class="control-buttons">
          <van-button 
            v-if="!choresStore.isRunning" 
            type="primary" 
            round 
            size="large"
            @click="handleStart"
          >
            {{ choresStore.elapsedSeconds > 0 ? '继续' : '开始家务' }}
          </van-button>
          
          <van-button 
            v-else 
            type="warning" 
            round 
            size="large"
            @click="choresStore.pauseTimer"
          >
            暂停
          </van-button>

          <van-button 
            v-if="choresStore.elapsedSeconds > 0"
            type="success" 
            round 
            size="large"
            @click="handleComplete"
          >
            完成 ✓
          </van-button>
        </div>
      </div>
    </div>

    <!-- 底部导航 -->
    <van-tabbar v-model="activeTab" @change="onTabChange">
      <van-tabbar-item name="home" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item name="player" icon="music-o">播放器</van-tabbar-item>
      <van-tabbar-item name="garden" icon="flower-o">农场</van-tabbar-item>
      <van-tabbar-item name="history" icon="bar-chart-o">记录</van-tabbar-item>
      <van-tabbar-item name="settings" icon="setting-o">设置</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChoresStore } from '../stores/chores'
import { showToast } from 'vant'

const router = useRouter()
const choresStore = useChoresStore()
const activeTab = ref('home')

let timerInterval = null

// 启动计时器刷新
function startTimerTick() {
  if (timerInterval) return
  timerInterval = setInterval(() => {
    choresStore.tick()
  }, 1000)
}

function stopTimerTick() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

function handleStart() {
  choresStore.startTimer()
  startTimerTick()
}

function handleComplete() {
  const earned = choresStore.completeChore()
  stopTimerTick()
  showToast({
    message: `太棒了！获得 ${earned} 金币 🪙`,
    type: 'success',
    duration: 2000
  })
}

function onTabChange(name) {
  const routes = {
    home: '/',
    player: '/player',
    garden: '/garden',
    history: '/history',
    settings: '/settings'
  }
  router.push(routes[name])
}

onMounted(() => {
  if (choresStore.isRunning) {
    startTimerTick()
  }
})

onUnmounted(() => {
  stopTimerTick()
})
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #87CEEB 0%, #98FB98 50%, #90EE90 100%);
  padding-bottom: 60px;
}

.header {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
}

.coins-display {
  background: rgba(255, 255, 255, 0.9);
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.coin-icon {
  font-size: 20px;
}

.coin-count {
  font-size: 18px;
  font-weight: bold;
  color: #DAA520;
}

.main-content {
  padding: 0 16px;
  position: relative;
}

.farm-decoration {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100px;
  pointer-events: none;
}

.sun {
  position: absolute;
  top: 10px;
  left: 20px;
  font-size: 40px;
  animation: pulse 2s infinite;
}

.clouds {
  position: absolute;
  top: 20px;
  right: 20px;
  font-size: 30px;
}

.clouds span:last-child {
  margin-left: -15px;
  opacity: 0.7;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.goal-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 24px;
  margin-top: 60px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.card-title {
  text-align: center;
  color: #2E7D32;
  margin-bottom: 20px;
  font-size: 22px;
}

.goal-input-area {
  margin-bottom: 20px;
}

.time-setting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 20px;
  color: #666;
}

.timer-display {
  display: flex;
  justify-content: center;
  margin: 30px 0;
}

.timer-circle {
  position: relative;
  width: 180px;
  height: 180px;
}

.timer-circle svg {
  width: 100%;
  height: 100%;
}

.timer-progress {
  transition: stroke-dashoffset 0.3s ease;
}

.timer-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.elapsed {
  font-size: 28px;
  font-weight: bold;
  color: #2E7D32;
}

.divider {
  color: #999;
  margin: 0 4px;
}

.target {
  font-size: 16px;
  color: #999;
}

.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-buttons .van-button {
  height: 50px;
  font-size: 18px;
}
</style>
