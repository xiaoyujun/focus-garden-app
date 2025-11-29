<template>
  <div class="garden-page">
    <div class="header">
      <h1>🌻 我的农场</h1>
      <div class="coins-display">
        <span class="coin-icon">🪙</span>
        <span class="coin-count">{{ choresStore.coins }}</span>
      </div>
    </div>

    <div class="main-content">
      <!-- 种植区域 -->
      <div class="farm-area">
        <h3>🌱 种植区</h3>
        <div class="crops-grid" v-if="gardenStore.cropsWithProgress.length > 0">
          <div 
            v-for="(crop, index) in gardenStore.cropsWithProgress" 
            :key="index"
            class="crop-slot"
          >
            <div class="crop-icon">
              {{ getStageIcon(crop) }}
            </div>
            <div class="crop-name">{{ crop.name }}</div>
            <van-progress 
              :percentage="crop.progress * 100" 
              :show-pivot="false"
              color="#4CAF50"
              track-color="#e8e8e8"
            />
            <div class="crop-status">
              {{ crop.stage === 3 ? '已成熟 🎉' : `生长中...` }}
            </div>
          </div>
        </div>
        <div class="empty-farm" v-else>
          <p>还没有种植任何作物</p>
          <p>购买种子后可以在这里种植</p>
        </div>
      </div>

      <!-- 种子背包 -->
      <div class="seed-bag" v-if="gardenStore.ownedSeeds.length > 0">
        <h3>🎒 种子背包</h3>
        <div class="seeds-list">
          <div 
            v-for="(seed, index) in gardenStore.ownedSeeds" 
            :key="index"
            class="seed-item"
            @click="plantSeed(index)"
          >
            <span class="seed-icon">{{ seed.icon }}</span>
            <span class="seed-name">{{ seed.name }}</span>
            <van-button size="small" type="primary" plain>种植</van-button>
          </div>
        </div>
      </div>

      <!-- 种子商店 -->
      <div class="seed-shop">
        <h3>🏪 种子商店</h3>
        <div class="shop-grid">
          <div 
            v-for="seed in gardenStore.seedCatalog" 
            :key="seed.id"
            class="shop-item"
          >
            <div class="item-icon">{{ seed.icon }}</div>
            <div class="item-name">{{ seed.name }}</div>
            <div class="item-info">生长：{{ seed.growthDays }}天</div>
            <van-button 
              size="small" 
              type="primary"
              :disabled="choresStore.coins < seed.price"
              @click="buySeed(seed.id)"
            >
              🪙 {{ seed.price }}
            </van-button>
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChoresStore } from '../stores/chores'
import { useGardenStore } from '../stores/garden'
import { showToast } from 'vant'

const router = useRouter()
const choresStore = useChoresStore()
const gardenStore = useGardenStore()
const activeTab = ref('garden')

function getStageIcon(crop) {
  const stages = ['🌱', '🌿', '🪴', crop.icon]
  return stages[crop.stage] || '🌱'
}

function buySeed(seedId) {
  const result = gardenStore.buySeed(seedId, choresStore)
  showToast({
    message: result.message,
    type: result.success ? 'success' : 'fail'
  })
}

function plantSeed(index) {
  const result = gardenStore.plantSeed(index)
  showToast({
    message: result.message,
    type: result.success ? 'success' : 'fail'
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
.garden-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #87CEEB 0%, #90EE90 50%, #228B22 100%);
  padding-bottom: 60px;
}

.header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  margin: 0;
  font-size: 22px;
  color: #2E7D32;
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
}

.farm-area, .seed-bag, .seed-shop {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h3 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #2E7D32;
}

.crops-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.crop-slot {
  background: #f5f5f5;
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}

.crop-icon {
  font-size: 40px;
  margin-bottom: 8px;
}

.crop-name {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 8px;
}

.crop-status {
  font-size: 12px;
  color: #666;
  margin-top: 8px;
}

.empty-farm {
  text-align: center;
  padding: 30px;
  color: #999;
}

.empty-farm p {
  margin: 8px 0;
}

.seeds-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.seed-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 10px;
}

.seed-icon {
  font-size: 30px;
}

.seed-name {
  flex: 1;
  font-weight: 500;
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.shop-item {
  background: #f9f9f9;
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}

.item-icon {
  font-size: 36px;
  margin-bottom: 6px;
}

.item-name {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}

.item-info {
  font-size: 11px;
  color: #888;
  margin-bottom: 8px;
}
</style>
