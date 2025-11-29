<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '../stores/gameStore'
import { Download, Upload, Trash2, Database, Timer, ListTodo, AlertCircle } from 'lucide-vue-next'

const store = useAppStore()

// 状态
const showImportModal = ref(false)
const importText = ref('')
const importError = ref('')
const showConfirmClear = ref(false)

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
function handleExport() {
  const data = store.exportData()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `focus-garden-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
          class="w-full p-4 flex items-center hover:bg-slate-50 transition-colors border-b border-slate-100"
        >
          <div class="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mr-4">
            <Download :size="20" class="text-emerald-600" />
          </div>
          <div class="flex-1 text-left">
            <p class="font-medium text-slate-800">导出数据</p>
            <p class="text-sm text-slate-500">下载 JSON 格式的备份文件</p>
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

      <!-- 关于 -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <h2 class="text-sm font-medium text-slate-500 mb-2">关于</h2>
        <p class="text-slate-600 text-sm">专注花园 v1.0</p>
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
