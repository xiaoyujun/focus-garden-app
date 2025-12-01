<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '../stores/gameStore'
import { Capacitor } from '@capacitor/core'
import { Download, Upload, Trash2, Database, Timer, ListTodo, AlertCircle, RefreshCw, ExternalLink, Smartphone } from 'lucide-vue-next'
import { APP_VERSION, checkForUpdate, hasNewVersion, formatReleaseDate } from '../services/updateService'

const store = useAppStore()

// 状态
const showImportModal = ref(false)
const importText = ref('')
const importError = ref('')
const showConfirmClear = ref(false)
const exporting = ref(false)

// 更新检测状态
const checking = ref(false)
const updateInfo = ref(null)
const updateError = ref('')
const showUpdateModal = ref(false)

// 统计
const stats = computed(() => ({
  totalFocusMinutes: store.totalFocusMinutes,
  focusCount: store.focusRecords.length,
  todoCount: store.todos.length,
  completedCount: store.completedTodos.length
}))

// 格式化时间
function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

// 导出数据
async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  const fileName = `focus-garden-${new Date().toISOString().slice(0, 10)}.json`

  try {
    const data = store.exportData()
    if (Capacitor.isNativePlatform()) {
      await exportOnNative(data, fileName)
    } else {
      exportOnWeb(data, fileName)
      alert('导出成功，请在浏览器下载列表中查看。')
    }
  } catch (error) {
    alert(`导出失败：${error?.message || error}`)
  } finally {
    exporting.value = false
  }
}

// 浏览器环境：a 标签触发下载
function exportOnWeb(data, fileName) {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 移动端：写入系统文件目录，避免部分 WebView 拦截下载
async function exportOnNative(data, fileName) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const folder = 'FocusGarden'
  const path = `${folder}/${fileName}`

  try {
    await Filesystem.mkdir({
      path: folder,
      directory: Directory.Documents,
      recursive: true
    })
  } catch (e) {
    // 目录已存在忽略
  }

  await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Documents,
    encoding: Encoding.UTF8
  })

  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Documents
  })

  const fileUrl = Capacitor.convertFileSrc(uri)
  try {
    // 尝试直接打开，便于用户跳转到系统文件查看
    window.open(fileUrl, '_blank')
  } catch (e) {
    // 忽略打开失败，仍提示路径
  }

  alert(`导出成功：${fileName}\n已保存到“文件/文档/FocusGarden”目录。\n若文件管理器未显示，请搜索文件名或在 Download/下载 目录中查找。`)
}

// 打开导入弹窗
function openImport() {
  importText.value = ''
  importError.value = ''
  showImportModal.value = true
}

// 导入数据
function handleImport() {
  const result = store.importData(importText.value)
  if (result.success) {
    showImportModal.value = false
    alert('导入成功！')
  } else {
    importError.value = result.error || '导入失败，请检查数据格式'
  }
}

// 从文件导入
function handleFileImport(event) {
  const file = event.target.files[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    importText.value = e.target.result
  }
  reader.readAsText(file)
}

// 清除数据
function handleClear() {
  store.clearAllData()
  showConfirmClear.value = false
  alert('数据已清除')
}

// 检测更新
async function handleCheckUpdate() {
  checking.value = true
  updateError.value = ''
  updateInfo.value = null
  
  try {
    const info = await checkForUpdate()
    if (info) {
      updateInfo.value = {
        ...info,
        hasUpdate: hasNewVersion(APP_VERSION, info.version)
      }
      showUpdateModal.value = true
    } else {
      updateError.value = '暂无发布版本'
    }
  } catch (error) {
    updateError.value = error.message || '检测更新失败，请稍后重试'
  } finally {
    checking.value = false
  }
}

// 打开下载链接
function openDownload(url) {
  window.open(url, '_blank')
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- 头部 -->
    <header class="p-4 bg-white shadow-sm">
      <h1 class="text-xl font-bold text-slate-800">设置</h1>
    </header>

    <main class="p-4 pb-24 space-y-4">
      <!-- 统计卡片 -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <h2 class="text-sm font-medium text-slate-500 mb-4 flex items-center">
          <Database :size="16" class="mr-2" />
          数据统计
        </h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-emerald-50 rounded-xl p-4">
            <div class="flex items-center text-emerald-600 mb-2">
              <Timer :size="18" class="mr-2" />
              <span class="text-sm">总专注时间</span>
            </div>
            <p class="text-xl font-bold text-emerald-800">{{ formatMinutes(stats.totalFocusMinutes) }}</p>
          </div>
          <div class="bg-blue-50 rounded-xl p-4">
            <div class="flex items-center text-blue-600 mb-2">
              <Timer :size="18" class="mr-2" />
              <span class="text-sm">专注次数</span>
            </div>
            <p class="text-xl font-bold text-blue-800">{{ stats.focusCount }} 次</p>
          </div>
          <div class="bg-amber-50 rounded-xl p-4">
            <div class="flex items-center text-amber-600 mb-2">
              <ListTodo :size="18" class="mr-2" />
              <span class="text-sm">待办总数</span>
            </div>
            <p class="text-xl font-bold text-amber-800">{{ stats.todoCount }} 项</p>
          </div>
          <div class="bg-purple-50 rounded-xl p-4">
            <div class="flex items-center text-purple-600 mb-2">
              <ListTodo :size="18" class="mr-2" />
              <span class="text-sm">已完成</span>
            </div>
            <p class="text-xl font-bold text-purple-800">{{ stats.completedCount }} 项</p>
          </div>
        </div>
      </div>

      <!-- 数据管理 -->
      <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
        <h2 class="text-sm font-medium text-slate-500 p-4 pb-2">数据管理</h2>
        
        <button 
          @click="handleExport"
          :disabled="exporting"
          class="w-full p-4 flex items-center hover:bg-slate-50 transition-colors border-b border-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div class="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mr-4">
            <Download :size="20" class="text-emerald-600" />
          </div>
          <div class="flex-1 text-left">
            <p class="font-medium text-slate-800">{{ exporting ? '导出中...' : '导出数据' }}</p>
            <p class="text-sm text-slate-500">下载/保存 JSON 格式的备份文件</p>
          </div>
        </button>

        <button 
          @click="openImport"
          class="w-full p-4 flex items-center hover:bg-slate-50 transition-colors border-b border-slate-100"
        >
          <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4">
            <Upload :size="20" class="text-blue-600" />
          </div>
          <div class="flex-1 text-left">
            <p class="font-medium text-slate-800">导入数据</p>
            <p class="text-sm text-slate-500">从备份文件恢复数据</p>
          </div>
        </button>

        <button 
          @click="showConfirmClear = true"
          class="w-full p-4 flex items-center hover:bg-red-50 transition-colors"
        >
          <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-4">
            <Trash2 :size="20" class="text-red-600" />
          </div>
          <div class="flex-1 text-left">
            <p class="font-medium text-red-600">清除所有数据</p>
            <p class="text-sm text-slate-500">删除所有待办和专注记录</p>
          </div>
        </button>
      </div>

      <!-- 应用更新 -->
      <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
        <h2 class="text-sm font-medium text-slate-500 p-4 pb-2">应用更新</h2>
        
        <button 
          @click="handleCheckUpdate"
          :disabled="checking"
          class="w-full p-4 flex items-center hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <div class="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mr-4">
            <RefreshCw :size="20" class="text-indigo-600" :class="{ 'animate-spin': checking }" />
          </div>
          <div class="flex-1 text-left">
            <p class="font-medium text-slate-800">{{ checking ? '检测中...' : '检测更新' }}</p>
            <p class="text-sm text-slate-500">当前版本: v{{ APP_VERSION }}</p>
          </div>
        </button>
        
        <!-- 更新错误提示 -->
        <div v-if="updateError" class="mx-4 mb-4 p-3 bg-red-50 rounded-xl flex items-center text-sm text-red-600">
          <AlertCircle :size="16" class="mr-2 flex-shrink-0" />
          {{ updateError }}
        </div>
      </div>

      <!-- 关于 -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <h2 class="text-sm font-medium text-slate-500 mb-2">关于</h2>
        <p class="text-slate-600 text-sm">专注花园 v{{ APP_VERSION }}</p>
        <p class="text-slate-400 text-xs mt-1">一个简单的番茄钟 + 待办管理应用</p>
      </div>
    </main>

    <!-- 导入弹窗 -->
    <div v-if="showImportModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <h2 class="text-lg font-bold text-slate-800 mb-4">导入数据</h2>
        
        <!-- 文件选择 -->
        <label class="block mb-4">
          <span class="text-sm text-slate-600 mb-2 block">选择 JSON 文件</span>
          <input 
            type="file" 
            accept=".json"
            @change="handleFileImport"
            class="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
        </label>

        <!-- 或手动粘贴 -->
        <div class="mb-4">
          <span class="text-sm text-slate-600 mb-2 block">或粘贴 JSON 内容</span>
          <textarea 
            v-model="importText"
            placeholder='{"todos":[], "focusRecords":[]}'
            class="w-full h-32 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
          ></textarea>
        </div>

        <!-- 错误提示 -->
        <div v-if="importError" class="mb-4 p-3 bg-red-50 rounded-xl flex items-start text-sm text-red-600">
          <AlertCircle :size="18" class="mr-2 flex-shrink-0 mt-0.5" />
          {{ importError }}
        </div>

        <div class="flex space-x-3">
          <button 
            @click="showImportModal = false"
            class="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button 
            @click="handleImport"
            :disabled="!importText.trim()"
            class="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            导入
          </button>
        </div>
      </div>
    </div>

    <!-- 更新信息弹窗 -->
    <div v-if="showUpdateModal && updateInfo" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
        <div class="text-center mb-4">
          <div 
            class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            :class="updateInfo.hasUpdate ? 'bg-emerald-100' : 'bg-slate-100'"
          >
            <Smartphone :size="32" :class="updateInfo.hasUpdate ? 'text-emerald-500' : 'text-slate-400'" />
          </div>
          <h2 class="text-lg font-bold text-slate-800">
            {{ updateInfo.hasUpdate ? '发现新版本！' : '已是最新版本' }}
          </h2>
        </div>
        
        <div class="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-slate-500">当前版本</span>
            <span class="font-medium text-slate-700">v{{ APP_VERSION }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-slate-500">最新版本</span>
            <span class="font-medium" :class="updateInfo.hasUpdate ? 'text-emerald-600' : 'text-slate-700'">v{{ updateInfo.version }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-slate-500">发布日期</span>
            <span class="text-slate-700">{{ formatReleaseDate(updateInfo.publishedAt) }}</span>
          </div>
        </div>
        
        <!-- 更新说明 -->
        <div v-if="updateInfo.description" class="mb-4">
          <p class="text-xs text-slate-500 mb-1">更新说明:</p>
          <p class="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">{{ updateInfo.description }}</p>
        </div>

        <div class="space-y-2">
          <!-- APK 下载按钮 -->
          <button 
            v-if="updateInfo.downloadUrl && updateInfo.hasUpdate"
            @click="openDownload(updateInfo.downloadUrl)"
            class="w-full py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center"
          >
            <Download :size="18" class="mr-2" />
            下载 APK 安装包
          </button>
          
          <!-- GitHub 发布页 -->
          <button 
            @click="openDownload(updateInfo.releaseUrl)"
            class="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors flex items-center justify-center"
          >
            <ExternalLink :size="18" class="mr-2" />
            查看 GitHub 发布页
          </button>
          
          <button 
            @click="showUpdateModal = false"
            class="w-full py-3 text-slate-500 font-medium hover:text-slate-700 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- 确认清除弹窗 -->
    <div v-if="showConfirmClear" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center">
        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle :size="32" class="text-red-500" />
        </div>
        <h2 class="text-lg font-bold text-slate-800 mb-2">确认清除？</h2>
        <p class="text-slate-500 text-sm mb-6">所有数据将被永久删除，无法恢复。建议先导出备份。</p>
        
        <div class="flex space-x-3">
          <button 
            @click="showConfirmClear = false"
            class="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button 
            @click="handleClear"
            class="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors"
          >
            确认清除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
