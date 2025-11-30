<script setup>
import { ref, computed } from 'vue'
import { useDownloadStore } from '../stores/downloadStore'
import { 
  Download, Link, Search, Check, X, Loader2, 
  FolderDown, Trash2, RefreshCw, AlertCircle,
  ChevronDown, ChevronUp, Music, Clock, CheckCircle2
} from 'lucide-vue-next'

defineOptions({ name: 'DownloadManager' })

const store = useDownloadStore()

// 输入状态
const inputUrl = ref('')
const parseError = ref('')
const downloadError = ref('')
const downloadSuccess = ref('')

// 选择状态
const selectedItems = ref(new Set())
const selectAll = ref(false)

// UI 状态
const activeTab = ref('parse')  // parse | tasks | history
const expandedAlbum = ref(true)

// 解析链接
async function handleParse() {
  if (!inputUrl.value.trim()) {
    parseError.value = '请输入链接'
    return
  }
  
  parseError.value = ''
  selectedItems.value = new Set()
  selectAll.value = false
  
  try {
    await store.parse(inputUrl.value.trim())
  } catch (e) {
    parseError.value = e.message
  }
}

// 切换选择
function toggleSelect(itemId) {
  if (selectedItems.value.has(itemId)) {
    selectedItems.value.delete(itemId)
  } else {
    selectedItems.value.add(itemId)
  }
  selectedItems.value = new Set(selectedItems.value)
  
  // 更新全选状态
  if (store.parsedContent?.items) {
    selectAll.value = selectedItems.value.size === store.parsedContent.items.length
  }
}

// 全选/取消全选
function toggleSelectAll() {
  if (!store.parsedContent?.items) return
  
  if (selectAll.value) {
    selectedItems.value = new Set()
  } else {
    selectedItems.value = new Set(store.parsedContent.items.map(item => item.id))
  }
  selectAll.value = !selectAll.value
}

// 下载选中项
async function handleDownload() {
  if (selectedItems.value.size === 0) {
    downloadError.value = '请先选择要下载的内容'
    return
  }
  
  downloadError.value = ''
  downloadSuccess.value = ''
  
  const items = store.parsedContent.items.filter(item => selectedItems.value.has(item.id))
  const albumTitle = store.parsedContent.title
  
  try {
    const result = await store.downloadSelected(items, albumTitle)
    downloadSuccess.value = `下载完成！成功 ${result.success} 个，失败 ${result.failed} 个`
    
    // 清除选择
    selectedItems.value = new Set()
    selectAll.value = false
    
    setTimeout(() => {
      downloadSuccess.value = ''
    }, 3000)
  } catch (e) {
    downloadError.value = e.message
  }
}

// 下载单个
async function handleDownloadSingle(item) {
  downloadError.value = ''
  
  try {
    await store.downloadSingle(item, store.parsedContent?.title || '下载')
    downloadSuccess.value = `"${item.title}" 下载完成`
    setTimeout(() => downloadSuccess.value = '', 2000)
  } catch (e) {
    downloadError.value = `下载失败: ${e.message}`
  }
}

// 清除解析结果
function handleClear() {
  store.clearParsed()
  inputUrl.value = ''
  parseError.value = ''
  downloadError.value = ''
  selectedItems.value = new Set()
  selectAll.value = false
}

// 格式化时长
function formatDuration(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 源图标映射
const sourceIcons = {
  xmly: '🎧',
  qingting: '🦟',
  lrts: '📚'
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-farm-50 via-white to-purple-50 pb-24">
    <!-- 头部 -->
    <header class="pt-6 pb-4 px-6 text-center">
      <h1 class="text-2xl font-bold text-farm-900 flex items-center justify-center gap-2">
        <FolderDown :size="24" class="text-purple-500" />
        <span>资源下载</span>
      </h1>
      <p class="text-sm text-farm-400 mt-1">解析并下载有声资源到本地</p>
    </header>

    <!-- 标签栏 -->
    <div class="px-6 mb-4">
      <div class="flex bg-white/60 rounded-xl p-1 border border-farm-100">
        <button
          @click="activeTab = 'parse'"
          class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all"
          :class="activeTab === 'parse' ? 'bg-white text-purple-600 shadow-sm' : 'text-farm-500'"
        >
          解析下载
        </button>
        <button
          @click="activeTab = 'history'"
          class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all"
          :class="activeTab === 'history' ? 'bg-white text-purple-600 shadow-sm' : 'text-farm-500'"
        >
          下载记录
        </button>
      </div>
    </div>

    <main class="px-6 max-w-lg mx-auto">
      <!-- 解析下载 Tab -->
      <div v-if="activeTab === 'parse'">
        <!-- 输入区域 -->
        <div class="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-white/50 shadow-sm mb-4">
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <Link :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-farm-400" />
              <input
                v-model="inputUrl"
                type="text"
                placeholder="粘贴音频链接..."
                class="w-full pl-10 pr-4 py-3 bg-farm-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-purple-200 transition-all"
                @keyup.enter="handleParse"
              />
            </div>
            <button
              @click="handleParse"
              :disabled="store.isParsing"
              class="px-4 py-3 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Loader2 v-if="store.isParsing" :size="18" class="animate-spin" />
              <Search v-else :size="18" />
              <span class="hidden sm:inline">{{ store.isParsing ? '解析中' : '解析' }}</span>
            </button>
          </div>
          
          <!-- 错误提示 -->
          <div v-if="parseError" class="mt-3 p-3 bg-red-50 text-red-600 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle :size="16" />
            {{ parseError }}
          </div>
          
          <!-- 支持的源 -->
          <div class="mt-3 text-xs text-farm-400">
            支持：喜马拉雅、蜻蜓FM、懒人听书
          </div>
        </div>

        <!-- 解析结果 -->
        <div v-if="store.parsedContent" class="bg-white/80 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm overflow-hidden">
          <!-- 专辑信息 -->
          <div 
            class="p-4 border-b border-farm-100 cursor-pointer"
            @click="expandedAlbum = !expandedAlbum"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ sourceIcons[store.parsedContent.source] || '📚' }}</span>
                <div>
                  <h3 class="font-bold text-farm-800">{{ store.parsedContent.title }}</h3>
                  <p class="text-xs text-farm-400">{{ store.parsedContent.items?.length || 0 }} 个音频</p>
                </div>
              </div>
              <ChevronUp v-if="expandedAlbum" :size="20" class="text-farm-400" />
              <ChevronDown v-else :size="20" class="text-farm-400" />
            </div>
          </div>

          <!-- 操作栏 -->
          <div v-if="expandedAlbum" class="p-3 border-b border-farm-100 bg-farm-50/50 flex items-center justify-between">
            <label class="flex items-center gap-2 text-sm text-farm-600 cursor-pointer">
              <input 
                type="checkbox" 
                :checked="selectAll"
                @change="toggleSelectAll"
                class="w-4 h-4 rounded text-purple-500 focus:ring-purple-200"
              />
              全选 ({{ selectedItems.size }}/{{ store.parsedContent.items?.length || 0 }})
            </label>
            
            <div class="flex items-center gap-2">
              <button
                @click="handleClear"
                class="px-3 py-1.5 text-sm text-farm-500 hover:text-farm-700 transition-colors"
              >
                清除
              </button>
              <button
                @click="handleDownload"
                :disabled="selectedItems.size === 0 || store.isDownloading"
                class="px-4 py-1.5 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Loader2 v-if="store.isDownloading" :size="14" class="animate-spin" />
                <Download v-else :size="14" />
                下载选中
              </button>
            </div>
          </div>

          <!-- 下载进度 -->
          <div v-if="store.isDownloading && store.currentProgress.total > 0" class="p-3 bg-purple-50 border-b border-purple-100">
            <div class="flex items-center justify-between text-sm mb-2">
              <span class="text-purple-700">正在下载: {{ store.currentProgress.currentItem?.title }}</span>
              <span class="text-purple-500">{{ store.currentProgress.index + 1 }} / {{ store.currentProgress.total }}</span>
            </div>
            <div class="h-1.5 bg-purple-100 rounded-full overflow-hidden">
              <div 
                class="h-full bg-purple-500 transition-all duration-300"
                :style="{ width: `${((store.currentProgress.index + 1) / store.currentProgress.total) * 100}%` }"
              ></div>
            </div>
          </div>

          <!-- 成功/错误提示 -->
          <div v-if="downloadSuccess" class="p-3 bg-green-50 text-green-600 text-sm flex items-center gap-2">
            <CheckCircle2 :size="16" />
            {{ downloadSuccess }}
          </div>
          <div v-if="downloadError" class="p-3 bg-red-50 text-red-600 text-sm flex items-center gap-2">
            <AlertCircle :size="16" />
            {{ downloadError }}
          </div>

          <!-- 音频列表 -->
          <div v-if="expandedAlbum" class="max-h-[50vh] overflow-y-auto">
            <div 
              v-for="(item, index) in store.parsedContent.items" 
              :key="item.id"
              class="flex items-center gap-3 p-3 border-b border-farm-50 last:border-b-0 hover:bg-farm-50/50 transition-colors"
            >
              <!-- 选择框 -->
              <input 
                type="checkbox"
                :checked="selectedItems.has(item.id)"
                @change="toggleSelect(item.id)"
                class="w-4 h-4 rounded text-purple-500 focus:ring-purple-200 flex-shrink-0"
              />
              
              <!-- 序号 -->
              <span class="w-8 text-center text-xs text-farm-400 font-mono">{{ index + 1 }}</span>
              
              <!-- 信息 -->
              <div class="flex-1 min-w-0">
                <p class="text-sm text-farm-700 truncate">{{ item.title }}</p>
                <p v-if="item.duration" class="text-xs text-farm-400 flex items-center gap-1 mt-0.5">
                  <Clock :size="10" />
                  {{ formatDuration(item.duration) }}
                </p>
              </div>
              
              <!-- 单独下载 -->
              <button
                @click.stop="handleDownloadSingle(item)"
                :disabled="store.isDownloading"
                class="p-2 text-farm-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                title="下载"
              >
                <Download :size="16" />
              </button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!store.isParsing" class="text-center py-16">
          <div class="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Link :size="32" class="text-purple-300" />
          </div>
          <p class="text-farm-500 mb-2">粘贴链接开始解析</p>
          <p class="text-xs text-farm-400">支持喜马拉雅、蜻蜓FM、懒人听书等平台</p>
        </div>
      </div>

      <!-- 下载记录 Tab -->
      <div v-if="activeTab === 'history'">
        <div v-if="store.downloadHistory.length === 0" class="text-center py-16">
          <div class="w-20 h-20 bg-farm-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderDown :size="32" class="text-farm-300" />
          </div>
          <p class="text-farm-500">暂无下载记录</p>
        </div>

        <div v-else class="space-y-3">
          <!-- 清除按钮 -->
          <div class="flex justify-end">
            <button
              @click="store.clearHistory()"
              class="text-sm text-farm-400 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <Trash2 :size="14" />
              清除记录
            </button>
          </div>

          <!-- 记录列表 -->
          <div 
            v-for="record in store.downloadHistory" 
            :key="record.id"
            class="bg-white/80 backdrop-blur-md rounded-xl p-4 border border-white/50 shadow-sm"
          >
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle2 :size="20" class="text-green-500" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-farm-800 truncate">{{ record.title }}</p>
                <p class="text-xs text-farm-400 mt-1">
                  {{ new Date(record.downloadedAt).toLocaleString('zh-CN') }}
                </p>
                <p v-if="record.stats" class="text-xs text-farm-500 mt-1">
                  成功 {{ record.stats.success }} / 失败 {{ record.stats.failed }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
