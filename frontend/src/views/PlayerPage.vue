<template>
  <div class="player-page">
    <div class="header">
      <h1>🎵 音频播放器</h1>
    </div>

    <div class="main-content">
      <!-- 选择文件区域 -->
      <div class="file-selector" v-if="playerStore.playlist.length === 0">
        <div class="select-hint">
          <div class="folder-icon">📁</div>
          <p>选择音频文件开始播放</p>
          <van-button type="primary" round @click="selectFiles">
            选择音频文件
          </van-button>
        </div>
        <input 
          ref="fileInput" 
          type="file" 
          accept="audio/*" 
          multiple 
          style="display: none"
          @change="handleFilesSelected"
        />
      </div>

      <!-- 播放器界面 -->
      <div class="player-ui" v-else>
        <!-- 当前播放 -->
        <div class="now-playing">
          <div class="album-art">
            <div class="music-note" :class="{ spinning: playerStore.isPlaying }">🎵</div>
          </div>
          <div class="track-info">
            <h3>{{ playerStore.currentTrack?.name || '未知曲目' }}</h3>
            <p>{{ playerStore.currentIndex + 1 }} / {{ playerStore.playlist.length }}</p>
          </div>
        </div>

        <!-- 进度条 -->
        <div class="progress-section">
          <span class="time">{{ playerStore.currentTimeFormatted }}</span>
          <van-slider 
            v-model="progressValue" 
            :max="100"
            @change="onProgressChange"
            bar-height="4px"
            active-color="#4CAF50"
          />
          <span class="time">{{ playerStore.durationFormatted }}</span>
        </div>

        <!-- 控制按钮 -->
        <div class="controls">
          <van-button 
            icon="arrow-left" 
            round 
            :disabled="playerStore.currentIndex === 0"
            @click="playerStore.prev"
          />
          <van-button 
            :icon="playerStore.isPlaying ? 'pause' : 'play'" 
            type="primary" 
            round 
            size="large"
            @click="togglePlay"
          />
          <van-button 
            icon="arrow" 
            round 
            :disabled="playerStore.currentIndex >= playerStore.playlist.length - 1"
            @click="playerStore.next"
          />
        </div>

        <!-- 播放列表 -->
        <div class="playlist">
          <div class="playlist-header">
            <h3>播放列表</h3>
            <van-button size="small" plain @click="clearAll">清空</van-button>
          </div>
          <div class="playlist-items">
            <div 
              v-for="(track, index) in playerStore.playlist" 
              :key="track.id"
              class="playlist-item"
              :class="{ active: index === playerStore.currentIndex }"
              @click="playerStore.playAt(index)"
            >
              <span class="track-index">{{ index + 1 }}</span>
              <span class="track-name">{{ track.name }}</span>
              <span class="playing-indicator" v-if="index === playerStore.currentIndex && playerStore.isPlaying">
                🔊
              </span>
            </div>
          </div>
        </div>

        <!-- 添加更多按钮 -->
        <van-button 
          class="add-more" 
          type="default" 
          round 
          block 
          @click="selectFiles"
        >
          + 添加更多音频
        </van-button>
      </div>
    </div>

    <!-- 隐藏的 audio 元素 -->
    <audio 
      ref="audioEl" 
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @ended="onEnded"
    />

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
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'

const router = useRouter()
const playerStore = usePlayerStore()
const activeTab = ref('player')

const fileInput = ref(null)
const audioEl = ref(null)

const progressValue = computed({
  get: () => playerStore.progressPercent,
  set: () => {} // 由 onProgressChange 处理
})

function selectFiles() {
  fileInput.value?.click()
}

function handleFilesSelected(event) {
  const files = Array.from(event.target.files)
  if (files.length > 0) {
    playerStore.setPlaylist(files)
  }
}

function togglePlay() {
  playerStore.togglePlay()
}

function onTimeUpdate() {
  if (audioEl.value) {
    playerStore.currentTime = audioEl.value.currentTime
  }
}

function onLoadedMetadata() {
  if (audioEl.value) {
    playerStore.duration = audioEl.value.duration
  }
}

function onEnded() {
  // 自动播放下一首
  if (playerStore.currentIndex < playerStore.playlist.length - 1) {
    playerStore.next()
  } else {
    playerStore.isPlaying = false
  }
}

function onProgressChange(value) {
  if (audioEl.value && playerStore.duration > 0) {
    audioEl.value.currentTime = (value / 100) * playerStore.duration
  }
}

function clearAll() {
  if (audioEl.value) {
    audioEl.value.pause()
  }
  playerStore.clearPlaylist()
}

// 监听当前曲目变化
watch(() => playerStore.currentTrack, (track) => {
  if (track && audioEl.value) {
    audioEl.value.src = track.url
    if (playerStore.isPlaying) {
      audioEl.value.play()
    }
  }
}, { immediate: true })

// 监听播放状态
watch(() => playerStore.isPlaying, (playing) => {
  if (audioEl.value) {
    if (playing) {
      audioEl.value.play()
    } else {
      audioEl.value.pause()
    }
  }
})

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
.player-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  padding-bottom: 60px;
  color: white;
}

.header {
  padding: 20px;
  text-align: center;
}

.header h1 {
  font-size: 24px;
  margin: 0;
}

.main-content {
  padding: 0 16px;
}

.file-selector {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.select-hint {
  text-align: center;
}

.folder-icon {
  font-size: 80px;
  margin-bottom: 20px;
}

.select-hint p {
  color: #aaa;
  margin-bottom: 20px;
}

.player-ui {
  padding-top: 20px;
}

.now-playing {
  text-align: center;
  margin-bottom: 30px;
}

.album-art {
  width: 150px;
  height: 150px;
  margin: 0 auto 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.music-note {
  font-size: 60px;
}

.music-note.spinning {
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.track-info h3 {
  margin: 0 0 8px;
  font-size: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-info p {
  margin: 0;
  color: #888;
  font-size: 14px;
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 30px;
}

.progress-section .time {
  font-size: 12px;
  color: #888;
  min-width: 40px;
}

.progress-section .van-slider {
  flex: 1;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
}

.controls .van-button--large {
  width: 70px;
  height: 70px;
}

.playlist {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}

.playlist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.playlist-header h3 {
  margin: 0;
  font-size: 16px;
}

.playlist-items {
  max-height: 200px;
  overflow-y: auto;
}

.playlist-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.playlist-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.playlist-item.active {
  background: rgba(76, 175, 80, 0.3);
}

.track-index {
  width: 30px;
  color: #888;
  font-size: 14px;
}

.track-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
}

.playing-indicator {
  margin-left: 8px;
}

.add-more {
  margin-top: 10px;
}
</style>
