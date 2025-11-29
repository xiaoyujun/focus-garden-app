<template>
  <div class="history-page">
    <div class="header">
      <h1>📊 家务记录</h1>
    </div>

    <div class="main-content">
      <!-- 统计卡片 -->
      <div class="stats-card">
        <div class="stat-item">
          <div class="stat-value">{{ totalChores }}</div>
          <div class="stat-label">完成次数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ totalMinutes }}</div>
          <div class="stat-label">总时长(分钟)</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ choresStore.coins }}</div>
          <div class="stat-label">当前金币</div>
        </div>
      </div>

      <!-- 历史记录列表 -->
      <div class="history-list">
        <h3>历史记录</h3>
        <div v-if="choresStore.history.length === 0" class="empty-history">
          <p>还没有家务记录</p>
          <p>完成家务后会在这里显示</p>
        </div>
        <div v-else class="records">
          <div 
            v-for="record in choresStore.history" 
            :key="record.id"
            class="record-item"
          >
            <div class="record-main">
              <div class="record-goal">{{ record.goal }}</div>
              <div class="record-meta">
                <span>⏱️ {{ formatDuration(record.duration) }}</span>
                <span>🪙 +{{ record.earnedCoins }}</span>
              </div>
            </div>
            <div class="record-time">
              {{ formatDate(record.completedAt) }}
            </div>
          </div>
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
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChoresStore } from '../stores/chores'

const router = useRouter()
const choresStore = useChoresStore()
const activeTab = ref('history')

const totalChores = computed(() => choresStore.history.length)

const totalMinutes = computed(() => {
  return choresStore.history.reduce((sum, r) => sum + Math.floor(r.duration / 60), 0)
})

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}分${secs}秒`
}

function formatDate(isoString) {
  const date = new Date(isoString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const min = date.getMinutes()
  return `${month}/${day} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
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
</script>

<style scoped>
.history-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%);
  padding-bottom: 60px;
}

.header {
  padding: 20px 16px;
  background: white;
}

.header h1 {
  margin: 0;
  font-size: 22px;
  color: #333;
}

.main-content {
  padding: 16px;
}

.stats-card {
  display: flex;
  background: white;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #4CAF50;
}

.stat-label {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}

.history-list {
  background: white;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.history-list h3 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #333;
}

.empty-history {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.empty-history p {
  margin: 8px 0;
}

.records {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px;
  background: #f9f9f9;
  border-radius: 12px;
}

.record-goal {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 6px;
}

.record-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #666;
}

.record-time {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
}
</style>
