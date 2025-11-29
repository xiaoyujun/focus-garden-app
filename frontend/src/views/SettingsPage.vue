<template>
  <div class="settings-page">
    <div class="header">
      <h1>⚙️ 设置</h1>
    </div>

    <div class="main-content">
      <!-- 家务设置 -->
      <div class="settings-group">
        <h3>家务设置</h3>
        <van-cell-group inset>
          <van-cell title="默认家务时长">
            <template #value>
              <van-stepper v-model="defaultMinutes" :min="5" :max="120" :step="5" />
            </template>
          </van-cell>
          <van-cell title="完成提醒声音" is-link>
            <template #value>
              <van-switch v-model="soundEnabled" />
            </template>
          </van-cell>
        </van-cell-group>
      </div>

      <!-- 金币设置 -->
      <div class="settings-group">
        <h3>金币规则</h3>
        <van-cell-group inset>
          <van-cell title="每分钟获得金币" :value="`${coinsPerMinute} 个`" />
          <van-cell title="当前金币余额" :value="`🪙 ${choresStore.coins}`" />
        </van-cell-group>
      </div>

      <!-- 数据管理 -->
      <div class="settings-group">
        <h3>数据管理</h3>
        <van-cell-group inset>
          <van-cell 
            title="导出数据" 
            is-link 
            @click="exportData"
          />
          <van-cell 
            title="清空所有数据" 
            is-link 
            @click="confirmClearData"
          />
        </van-cell-group>
      </div>

      <!-- 关于 -->
      <div class="settings-group">
        <h3>关于</h3>
        <van-cell-group inset>
          <van-cell title="版本" value="1.0.0" />
          <van-cell title="家务App" label="让做家务变得更有趣 🌻" />
        </van-cell-group>
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChoresStore } from '../stores/chores'
import { useGardenStore } from '../stores/garden'
import { showConfirmDialog, showToast } from 'vant'

const router = useRouter()
const choresStore = useChoresStore()
const gardenStore = useGardenStore()
const activeTab = ref('settings')

const defaultMinutes = ref(30)
const soundEnabled = ref(true)
const coinsPerMinute = ref(1)

function exportData() {
  const data = {
    chores: {
      coins: choresStore.coins,
      history: choresStore.history
    },
    garden: {
      ownedSeeds: gardenStore.ownedSeeds,
      plantedCrops: gardenStore.plantedCrops
    },
    exportedAt: new Date().toISOString()
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `家务app数据_${new Date().toLocaleDateString()}.json`
  a.click()
  URL.revokeObjectURL(url)

  showToast('数据已导出')
}

function confirmClearData() {
  showConfirmDialog({
    title: '清空所有数据',
    message: '此操作将清空所有家务记录、金币和种子数据，且无法恢复。确定要继续吗？',
  })
    .then(() => {
      // 清空数据
      choresStore.coins = 0
      choresStore.history = []
      gardenStore.ownedSeeds = []
      gardenStore.plantedCrops = []
      showToast('数据已清空')
    })
    .catch(() => {
      // 取消
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
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: #f5f5f5;
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
  padding: 16px 0;
}

.settings-group {
  margin-bottom: 20px;
}

.settings-group h3 {
  margin: 0 0 10px;
  padding: 0 16px;
  font-size: 14px;
  color: #888;
}
</style>
