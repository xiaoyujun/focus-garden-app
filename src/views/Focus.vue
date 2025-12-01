<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/gameStore'
import { useAudioStore } from '../stores/audioStore'
import { Play, Square, RotateCcw, Check, Star, Sparkles, CloudSun, Headphones, SkipBack, SkipForward } from 'lucide-vue-next'
import AudioErrorDialog from '../components/AudioErrorDialog.vue'

const store = useAppStore()
const audioStore = useAudioStore()
const router = useRouter()

// 状态
const selectedSeed = ref(null)
const note = ref('')
const timeLeft = ref(0)
const isRunning = ref(false)
const showComplete = ref(false)
const earnedCrop = ref(null) // 记录本次获得的作物
let timer = null

// 周期信息
const weeklyPattern = computed(() => store.getWeeklyPattern())
const currentSlot = computed(() => store.getTimeSlot())
const currentBonus = computed(() => {
  if (!selectedSeed.value) return null
  return store.calculateBonus(selectedSeed.value.id)
})

// 格式化时间
const formattedTime = computed(() => {
  const m = Math.floor(timeLeft.value / 60)
  const s = timeLeft.value % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
})

// 进度百分比
const progress = computed(() => {
  if (!selectedSeed.value) return 0
  const total = selectedSeed.value.minutes * 60
  return ((total - timeLeft.value) / total) * 100
})

// 听书迷你控件状态
const miniAudioRef = ref(null)
const audioLoading = ref(false)
let audioSaveTimer = null

const miniTrackName = computed(() => audioStore.currentTrack ? audioStore.currentTrack.name.replace(/\.[^/.]+$/, '') : '')
const audioAvailable = computed(() => audioStore.hasPlaylist && !!audioStore.currentTrack)

// 获取稀有度配置
function getRarityConfig(id) {
  return store.rarities.find(r => r.id === id) || store.rarities[0]
}

function getSelectedSeedMinutes() {
  return selectedSeed.value ? selectedSeed.value.minutes * 60 : 0
}

// 基于 store 的专注状态同步剩余时间，避免切屏丢进度
function syncFocusFromStore() {
  if (!store.currentFocus) {
    isRunning.value = false
    timeLeft.value = getSelectedSeedMinutes()
    return
  }

  // 补齐本地 UI 状态
  const seed = store.currentFocus.seed || store.seedTypes.find(s => s.id === store.currentFocus.seedId)
  if (seed) {
    selectedSeed.value = seed
    note.value = store.currentFocus.note || ''
  }

  const remaining = store.getCurrentFocusRemainingSeconds()
  timeLeft.value = remaining
  isRunning.value = store.currentFocus.status === 'running' && remaining > 0

  if (remaining <= 0 && store.currentFocus.status === 'running') {
    completeTimer()
    return
  }
}

function startTick() {
  clearInterval(timer)
  syncFocusFromStore()
  timer = setInterval(() => {
    syncFocusFromStore()
  }, 1000)
}

// 选择种子
function selectSeed(seed) {
  if (isRunning.value) return
  selectedSeed.value = seed
  timeLeft.value = seed.minutes * 60
}

// 开始计时
function startTimer() {
  if (!selectedSeed.value) return

  // 已暂停则继续
  if (store.currentFocus && store.currentFocus.status === 'paused') {
    store.resumeFocus()
    startTick()
    return
  }

  // 已在运行则忽略重复点击
  if (store.currentFocus && store.currentFocus.status === 'running') {
    return
  }

  if (!store.startFocus(selectedSeed.value.id, note.value)) return
  startTick()
}

// 暂停计时
function pauseTimer() {
  store.pauseFocus()
  clearInterval(timer)
  isRunning.value = false
  syncFocusFromStore()
}

// 重置
function resetTimer() {
  clearInterval(timer)
  isRunning.value = false
  store.cancelFocus()
  if (selectedSeed.value) {
    timeLeft.value = selectedSeed.value.minutes * 60
  }
}

// 完成
function completeTimer() {
  clearInterval(timer)
  isRunning.value = false
  store.completeFocus()
  
  // 获取刚刚生成的作物
  earnedCrop.value = store.focusRecords[store.focusRecords.length - 1]
  showComplete.value = true
}

// 关闭完成弹窗
function closeComplete() {
  showComplete.value = false
  selectedSeed.value = null
  note.value = ''
  timeLeft.value = 0
  earnedCrop.value = null
}

// 听书相关控制（番茄钟内的迷你入口）
function ensureCurrentAudioIndex() {
  if (!audioStore.currentTrack && audioStore.playlist.length > 0) {
    const targetIndex = audioStore.currentIndex >= 0 ? audioStore.currentIndex : 0
    audioStore.setCurrentIndex(targetIndex)
  }
}

async function loadMiniTrack() {
  if (!audioStore.currentTrack || !miniAudioRef.value) return

  audioLoading.value = true
  try {
    const url = await audioStore.getCurrentTrackUrl()
    if (url) {
      miniAudioRef.value.src = url
      miniAudioRef.value.volume = audioStore.volume
      miniAudioRef.value.playbackRate = audioStore.playbackRate

      const savedTime = audioStore.getSavedProgress(audioStore.currentTrack.name)
      if (savedTime > 0) {
        miniAudioRef.value.currentTime = savedTime
      }

      if (audioStore.isPlaying) {
        await miniAudioRef.value.play()
      }
    }
  } catch (e) {
    console.error('迷你听书加载失败', e)
    audioStore.notifyError(`迷你播放器加载失败：${e.message || e}`)
  } finally {
    audioLoading.value = false
  }
}

async function toggleMiniPlay() {
  // 如果没有播放列表但有保存的目录，先恢复
  if (!audioStore.hasPlaylist && audioStore.hasSavedDirectory) {
    await restoreAudio()
    if (!audioStore.hasPlaylist) return
  }
  
  ensureCurrentAudioIndex()
  if (!audioStore.currentTrack || !miniAudioRef.value) return

  if (!miniAudioRef.value.src) {
    await loadMiniTrack()
  }

  if (audioStore.isPlaying) {
    miniAudioRef.value.pause()
    audioStore.isPlaying = false
    audioStore.saveProgress()
  } else {
    try {
      await miniAudioRef.value.play()
      audioStore.isPlaying = true
    } catch (e) {
      await loadMiniTrack()
      try {
        await miniAudioRef.value.play()
        audioStore.isPlaying = true
      } catch (err) {
        console.error('播放失败', err)
        audioStore.notifyError(`播放失败：${err.message || err}`)
      }
    }
  }
}

async function playNextAudio() {
  if (!audioAvailable.value) return
  audioStore.saveProgress()
  audioStore.playNext()
  audioStore.isPlaying = true
  await loadMiniTrack()
}

async function playPrevAudio() {
  if (!audioAvailable.value) return
  audioStore.saveProgress()
  audioStore.playPrevious()
  audioStore.isPlaying = true
  await loadMiniTrack()
}

async function restoreAudio() {
  if (!audioStore.hasSavedDirectory || audioLoading.value) return
  audioLoading.value = true
  const result = await audioStore.restoreLastDirectory()
  audioLoading.value = false

  if (result.success && audioStore.playlist.length > 0) {
    ensureCurrentAudioIndex()
    await loadMiniTrack()
  } else if (!result.success) {
    const msg = result.error === 'no-native-cache'
      ? '未找到可恢复的音频，请重新选择目录'
      : (result.error || '恢复上次播放失败，请重新选择目录')
    audioStore.notifyError(msg)
  }
}

function openAudioPage() {
  router.push('/audio')
}

function onAudioTimeUpdate() {
  if (miniAudioRef.value) {
    audioStore.currentTime = miniAudioRef.value.currentTime
  }
}

function onAudioDurationChange() {
  if (miniAudioRef.value) {
    audioStore.duration = miniAudioRef.value.duration
  }
}

async function onAudioEnded() {
  audioStore.saveProgress()
  audioStore.playNext()
  await loadMiniTrack()
}

function onAudioError(e) {
  console.error('音频播放错误', e)
  audioStore.isPlaying = false
  audioStore.notifyError('音频播放失败，请检查文件是否还在原位置')
}

watch(() => audioStore.currentIndex, async (newVal, oldVal) => {
  if (newVal !== oldVal && newVal >= 0) {
    await loadMiniTrack()
  }
})

onMounted(() => {
  // 恢复专注计时（切屏/重进仍持续）
  syncFocusFromStore()
  if (isRunning.value) {
    startTick()
  }

  if (audioStore.hasPlaylist) {
    loadMiniTrack()
  }

  audioSaveTimer = setInterval(() => {
    if (audioStore.isPlaying && audioStore.currentTrack) {
      audioStore.saveProgress()
    }
  }, 30000)
})

// 清理定时器
onUnmounted(() => {
  clearInterval(timer)
  if (audioSaveTimer) {
    clearInterval(audioSaveTimer)
  }
  if (miniAudioRef.value) {
    audioStore.saveProgress()
    miniAudioRef.value.pause()
  }
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-farm-50 to-nature-50/30 pb-20">
    <!-- 头部 -->
    <header class="p-4 text-center">
      <h1 class="text-xl font-bold text-farm-900">专注时刻</h1>
      <!-- 天气和时段提示 -->
      <div class="flex items-center justify-center gap-3 mt-2">
        <span class="inline-flex items-center text-xs bg-white/60 px-3 py-1 rounded-full text-farm-500 backdrop-blur-sm border border-farm-100">
          <CloudSun :size="12" class="mr-1.5" />
          {{ weeklyPattern.weather.name }}
        </span>
        <span class="inline-flex items-center text-xs bg-white/60 px-3 py-1 rounded-full text-farm-500 backdrop-blur-sm border border-farm-100">
          {{ currentSlot.icon }} {{ currentSlot.name }}
        </span>
      </div>
    </header>

    <!-- 本周气候提示 -->
    <div v-if="!isRunning" class="mx-4 mb-6 p-4 bg-white/40 rounded-2xl border border-farm-100 backdrop-blur-sm">
      <p class="text-xs text-farm-500 italic text-center font-medium">
        「{{ weeklyPattern.weather.hint }}」
      </p>
      <div v-if="weeklyPattern.hints.length > 0" class="mt-2 space-y-1">
        <p v-for="(hint, i) in weeklyPattern.hints" :key="i" class="text-xs text-farm-400 text-center">
          {{ hint }}
        </p>
      </div>
    </div>

    <main class="px-4 pb-24 max-w-md mx-auto">
      <!-- 听书快捷入口 -->
      <audio 
        ref="miniAudioRef" 
        class="hidden" 
        @timeupdate="onAudioTimeUpdate"
        @durationchange="onAudioDurationChange"
        @ended="onAudioEnded"
        @error="onAudioError"
      />
      <div class="mb-8 bg-white/70 rounded-2xl border border-farm-100 shadow-sm backdrop-blur-sm p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-xl bg-nature-50 text-nature-600 flex items-center justify-center border border-nature-100">
              <Headphones :size="22" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] text-farm-400">听书随行</p>
              <p class="text-sm font-bold text-farm-900 truncate">
                {{ audioStore.currentTrack ? miniTrackName : (audioStore.hasSavedDirectory ? '恢复上次听书目录' : '未选择音频') }}
              </p>
              <p v-if="audioStore.currentTrack" class="text-[11px] text-farm-400 mt-0.5">
                {{ audioStore.formattedCurrentTime }} / {{ audioStore.formattedDuration }}
              </p>
              <p v-else class="text-[11px] text-farm-400 mt-0.5">
                {{ audioStore.hasSavedDirectory ? '可一键恢复后在此播放' : '先去听书页选择音频目录' }}
              </p>
            </div>
          </div>
          <button @click="openAudioPage" class="text-xs text-nature-600 underline decoration-1">
            打开听书
          </button>
        </div>

        <div class="flex items-center gap-3 mt-4">
          <button 
            @click="playPrevAudio"
            :disabled="!audioAvailable"
            class="w-11 h-11 rounded-full bg-farm-100 text-farm-600 flex items-center justify-center hover:bg-farm-200 transition-colors disabled:opacity-50"
          >
            <SkipBack :size="18" />
          </button>
          
          <button 
            @click="toggleMiniPlay"
            :disabled="audioLoading"
            class="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all disabled:opacity-60"
            :class="audioStore.isPlaying ? 'bg-amber-500 shadow-amber-200' : 'bg-nature-500 shadow-nature-200'"
          >
            <div v-if="audioLoading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <Square v-else-if="audioStore.isPlaying" :size="22" fill="currentColor" />
            <Play v-else :size="24" fill="currentColor" class="ml-1" />
          </button>
          
          <button 
            @click="playNextAudio"
            :disabled="!audioAvailable"
            class="w-11 h-11 rounded-full bg-farm-100 text-farm-600 flex items-center justify-center hover:bg-farm-200 transition-colors disabled:opacity-50"
          >
            <SkipForward :size="18" />
          </button>

          <button 
            v-if="!audioStore.hasPlaylist && audioStore.hasSavedDirectory"
            @click="restoreAudio"
            class="flex-1 text-xs bg-nature-500 text-white px-3 py-2 rounded-xl hover:bg-nature-600 transition-colors disabled:opacity-60"
            :disabled="audioLoading"
          >
            {{ audioLoading ? '正在恢复…' : '恢复上次听书' }}
          </button>
          <button 
            v-else-if="!audioStore.hasPlaylist"
            @click="openAudioPage"
            class="flex-1 text-xs bg-farm-100 text-farm-700 px-3 py-2 rounded-xl hover:bg-farm-200 transition-colors"
          >
            去选择音频
          </button>
          <div v-else class="flex-1 text-right">
            <span class="text-[11px] text-farm-400">列表 {{ audioStore.playlist.length }} 首</span>
          </div>
        </div>

        <p v-if="audioLoading" class="text-[11px] text-farm-400 mt-2">正在加载音频...</p>
      </div>

      <!-- 种子选择 -->
      <div class="grid grid-cols-4 gap-3 mb-10" v-if="!isRunning">
        <button 
          v-for="seed in store.seedTypes" 
          :key="seed.id"
          @click="selectSeed(seed)"
          class="flex flex-col items-center p-3 rounded-2xl transition-all border"
          :class="selectedSeed?.id === seed.id 
            ? 'bg-nature-500 text-white shadow-lg shadow-nature-200 scale-105 border-nature-500' 
            : 'bg-white text-farm-600 border-transparent hover:bg-farm-50 hover:border-farm-200'"
        >
          <span class="text-2xl mb-2">{{ seed.icon }}</span>
          <span class="text-xs font-medium">{{ seed.minutes }}分钟</span>
        </button>
      </div>

      <!-- 计时器 -->
      <div class="flex flex-col items-center mb-10">
        <div class="relative w-64 h-64 flex items-center justify-center">
          <!-- 背景圆环 -->
          <svg class="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#ede5cb" stroke-width="6" />
            <circle 
              v-if="selectedSeed"
              cx="50" cy="50" r="45" fill="none" 
              stroke="#36a778" 
              stroke-width="6" 
              stroke-linecap="round"
              :stroke-dasharray="283"
              :stroke-dashoffset="283 - (283 * progress) / 100"
              class="transition-all duration-1000"
            />
          </svg>
          <!-- 中间内容 -->
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span v-if="selectedSeed" class="text-5xl mb-3 animate-in zoom-in duration-300">{{ selectedSeed.icon }}</span>
            <span class="text-5xl font-mono font-bold text-farm-800 tracking-tight">{{ formattedTime }}</span>
            <span v-if="selectedSeed && !isRunning" class="text-xs text-farm-400 mt-2 font-medium">{{ selectedSeed.name }}</span>
            <span v-if="isRunning" class="text-xs text-nature-600 mt-2 font-medium flex items-center">
              <span class="w-2 h-2 bg-nature-500 rounded-full mr-1.5 animate-pulse"></span>
              专注中...
            </span>
          </div>
        </div>
      </div>

      <!-- 加成提示 -->
      <div v-if="selectedSeed && !isRunning && currentBonus?.bonus > 1" class="mb-6 p-4 bg-amber-50/80 rounded-2xl border border-amber-100 backdrop-blur-sm">
        <div class="flex items-center justify-center text-amber-600 mb-2">
          <Sparkles :size="16" class="mr-1.5" />
          <span class="text-sm font-bold">当前有加成！</span>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          <span 
            v-for="reason in currentBonus.reasons" 
            :key="reason"
            class="text-xs bg-white text-amber-700 px-2.5 py-1 rounded-full shadow-sm border border-amber-100"
          >
            {{ reason }}
          </span>
        </div>
      </div>

      <!-- 备注输入 -->
      <div v-if="selectedSeed && !isRunning" class="mb-8">
        <input 
          v-model="note"
          type="text"
          placeholder="正在做什么？（可选）"
          class="w-full px-4 py-3.5 bg-white border border-farm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-nature-400 focus:border-transparent text-farm-700 placeholder:text-farm-300 shadow-sm"
        />
      </div>

      <!-- 控制按钮 -->
      <div class="flex justify-center items-center space-x-6">
        <button 
          v-if="!isRunning && selectedSeed"
          @click="startTimer"
          class="w-20 h-20 rounded-full bg-nature-500 text-white flex items-center justify-center shadow-xl shadow-nature-200 hover:bg-nature-600 transition-all hover:scale-105 hover:shadow-2xl"
        >
          <Play :size="32" fill="currentColor" class="ml-1" />
        </button>
        
        <button 
          v-if="isRunning"
          @click="pauseTimer"
          class="w-20 h-20 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xl shadow-amber-200 hover:bg-amber-600 transition-all hover:scale-105"
        >
          <Square :size="28" fill="currentColor" />
        </button>

        <button 
          v-if="selectedSeed"
          @click="resetTimer"
          class="w-14 h-14 rounded-full bg-farm-200 text-farm-600 flex items-center justify-center hover:bg-farm-300 transition-all hover:scale-105"
        >
          <RotateCcw :size="20" />
        </button>
      </div>

      <!-- 提示 -->
      <p v-if="!selectedSeed" class="text-center text-farm-400 text-sm mt-12 flex flex-col items-center animate-bounce-slow opacity-70">
        <span class="text-2xl mb-2">👆</span>
        选择上方的种子开始专注
      </p>
    </main>

    <!-- 完成弹窗 -->
    <div v-if="showComplete && earnedCrop" class="fixed inset-0 bg-farm-900/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div class="bg-white p-8 rounded-[2rem] max-w-sm w-full text-center shadow-2xl animate-scale-in relative overflow-hidden border border-farm-100">
        <!-- 背景光效 -->
        <div class="absolute inset-0 opacity-10 pointer-events-none" :class="getRarityConfig(earnedCrop.rarity).bg"></div>
        
        <div class="relative z-10">
          <div class="text-7xl mb-4 animate-bounce-slow drop-shadow-md">🎉</div>
          <h2 class="text-2xl font-bold text-farm-800 mb-1">专注完成！</h2>
          <p class="text-farm-500 mb-8 text-sm">获得全新作物</p>
          
          <!-- 物品展示卡片 -->
          <div class="bg-farm-50 p-6 rounded-3xl mb-8 border-2 border-white shadow-inner">
            <div class="flex items-center justify-center mb-6 relative">
              <span class="text-7xl drop-shadow-lg filter">{{ earnedCrop.icon }}</span>
              <!-- 稀有度标识 -->
              <div class="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-md border border-farm-100">
                <Star :size="20" :class="getRarityConfig(earnedCrop.rarity).color" fill="currentColor" />
              </div>
            </div>
            
            <div class="text-center mb-6">
              <p class="font-bold text-xl tracking-tight" :class="getRarityConfig(earnedCrop.rarity).color">
                {{ earnedCrop.name }}
              </p>
              <p class="text-xs text-farm-400 font-mono mt-1 bg-white/50 inline-block px-2 py-0.5 rounded-md">
                 {{ getRarityConfig(earnedCrop.rarity).name }} | FL: {{ earnedCrop.float.toFixed(5) }}
              </p>
            </div>

            <div class="flex items-center justify-center gap-4 text-sm border-t border-farm-200/50 pt-4">
               <div class="flex flex-col items-center">
                 <span class="text-farm-400 text-xs mb-0.5">时长</span>
                 <span class="font-bold text-farm-700">{{ earnedCrop.minutes }}m</span>
               </div>
               <div class="w-px h-8 bg-farm-200"></div>
               <div class="flex flex-col items-center">
                 <span class="text-farm-400 text-xs mb-0.5">估值</span>
                 <span class="font-bold text-yellow-600 flex items-center">
                   {{ earnedCrop.price }}
                 </span>
               </div>
               <div class="w-px h-8 bg-farm-200"></div>
               <div class="flex flex-col items-center">
                 <span class="text-farm-400 text-xs mb-0.5">时段</span>
                 <span class="font-bold text-farm-700">{{ earnedCrop.timeSlot }}</span>
               </div>
            </div>
            
            <!-- 加成标记 -->
            <div v-if="earnedCrop.bonusApplied" class="mt-4 flex flex-wrap justify-center gap-1.5">
              <span 
                v-for="reason in earnedCrop.bonusReasons" 
                :key="reason"
                class="text-xs bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-200/50"
              >
                ✨ {{ reason }}
              </span>
            </div>
          </div>

          <button 
            @click="closeComplete"
            class="w-full bg-farm-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-farm-800 transition-all shadow-xl shadow-farm-200 active:scale-95 flex items-center justify-center"
          >
            <Check :size="22" stroke-width="3" class="mr-2" />
            收入花园
          </button>
        </div>
      </div>
    </div>

    <AudioErrorDialog 
      :visible="audioStore.errorVisible" 
      :message="audioStore.errorMessage" 
      @close="audioStore.clearError()" 
    />
  </div>
</template>

<style scoped>
.animate-scale-in {
  animation: scale-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.animate-bounce-slow {
  animation: bounce 2s infinite;
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes bounce {
  0%, 100% { transform: translateY(-5%); }
  50% { transform: translateY(0); }
}
</style>
