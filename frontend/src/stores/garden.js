import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 种子商店数据（后续由 LLM 生成更多）
const SEED_CATALOG = [
  { id: 'sunflower', name: '向日葵', price: 10, growthDays: 3, icon: '🌻' },
  { id: 'tomato', name: '番茄', price: 15, growthDays: 5, icon: '🍅' },
  { id: 'carrot', name: '胡萝卜', price: 8, growthDays: 2, icon: '🥕' },
  { id: 'strawberry', name: '草莓', price: 20, growthDays: 4, icon: '🍓' },
  { id: 'corn', name: '玉米', price: 12, growthDays: 6, icon: '🌽' }
]

export const useGardenStore = defineStore('garden', () => {
  // 种子目录
  const seedCatalog = ref(SEED_CATALOG)

  // 已拥有的种子
  const ownedSeeds = ref([])

  // 已种植的植物
  const plantedCrops = ref([])

  // 购买种子
  function buySeed(seedId, choresStore) {
    const seed = seedCatalog.value.find(s => s.id === seedId)
    if (!seed) return { success: false, message: '种子不存在' }
    if (choresStore.coins < seed.price) {
      return { success: false, message: '金币不足' }
    }

    choresStore.coins -= seed.price
    ownedSeeds.value.push({
      ...seed,
      purchasedAt: new Date().toISOString()
    })

    return { success: true, message: `成功购买 ${seed.name}` }
  }

  // 种植种子
  function plantSeed(seedIndex) {
    if (seedIndex < 0 || seedIndex >= ownedSeeds.value.length) {
      return { success: false, message: '种子不存在' }
    }

    const seed = ownedSeeds.value.splice(seedIndex, 1)[0]
    plantedCrops.value.push({
      ...seed,
      plantedAt: new Date().toISOString(),
      stage: 0 // 0: 刚种下, 1: 发芽, 2: 成长, 3: 成熟
    })

    return { success: true, message: `${seed.name} 已种下` }
  }

  // 计算植物生长阶段
  const cropsWithProgress = computed(() => {
    const now = Date.now()
    return plantedCrops.value.map(crop => {
      const plantedTime = new Date(crop.plantedAt).getTime()
      const elapsedDays = (now - plantedTime) / (1000 * 60 * 60 * 24)
      const progress = Math.min(elapsedDays / crop.growthDays, 1)
      let stage = 0
      if (progress >= 1) stage = 3
      else if (progress >= 0.6) stage = 2
      else if (progress >= 0.3) stage = 1

      return { ...crop, progress, stage }
    })
  })

  return {
    seedCatalog,
    ownedSeeds,
    plantedCrops,
    cropsWithProgress,
    buySeed,
    plantSeed
  }
})
