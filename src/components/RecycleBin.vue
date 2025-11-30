<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/gameStore'
import { X, RotateCcw, Trash2, AlertCircle } from 'lucide-vue-next'

const store = useAppStore()
const emit = defineEmits(['close'])

const sortedRecycleBin = computed(() => {
  return [...store.recycleBin].sort((a, b) => 
    new Date(b.deletedAt) - new Date(a.deletedAt)
  )
})

function getGroupInfo(groupId) {
  const group = store.todoGroups.find(g => g.id === groupId || g.id === groupId)
  return group || { name: '未知', icon: '📁', color: 'gray' }
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function restore(id) {
  store.restoreFromRecycleBin(id)
}

function permanentDelete(id) {
  if (confirm('确定永久删除这个待办吗？此操作无法撤销！')) {
    store.deleteFromRecycleBin(id)
  }
}

function clearAll() {
  if (confirm('确定清空回收站吗？所有待办将被永久删除，此操作无法撤销！')) {
    store.clearRecycleBin()
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="emit('close')">
    <div class="bg-white rounded-3xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
      <!-- 头部 -->
      <div class="p-6 border-b border-farm-100">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-2">
            <Trash2 :size="24" class="text-farm-600" />
            <h2 class="text-xl font-bold text-farm-900">回收站</h2>
          </div>
          <button @click="emit('close')" class="p-2 hover:bg-farm-50 rounded-full transition-colors">
            <X :size="20" class="text-farm-500" />
          </button>
        </div>
        <p class="text-sm text-farm-500">已删除的待办将保留在这里</p>
      </div>

      <!-- 回收站列表 -->
      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="sortedRecycleBin.length === 0" class="text-center py-16">
          <div class="text-6xl mb-4 opacity-60">🗑️</div>
          <p class="text-farm-500 font-medium">回收站是空的</p>
          <p class="text-sm text-farm-400 mt-1">已删除的待办会出现在这里</p>
        </div>

        <div v-else class="space-y-3">
          <div 
            v-for="item in sortedRecycleBin" 
            :key="item.id"
            class="bg-farm-50 rounded-xl p-4 hover:bg-farm-100 transition-colors"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1 min-w-0">
                <p class="text-farm-900 font-medium truncate">{{ item.text }}</p>
                <div class="flex items-center mt-1 space-x-2">
                  <span 
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="`bg-${getGroupInfo(item.groupId || item.category).color}-50 text-${getGroupInfo(item.groupId || item.category).color}-600`"
                  >
                    {{ getGroupInfo(item.groupId || item.category).icon }} {{ getGroupInfo(item.groupId || item.category).name }}
                  </span>
                  <span class="text-xs text-farm-400">
                    删除于 {{ formatDate(item.deletedAt) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex space-x-2 mt-3">
              <button 
                @click="restore(item.id)"
                class="flex-1 py-2 bg-nature-500 text-white rounded-lg text-sm font-medium hover:bg-nature-600 transition-colors flex items-center justify-center space-x-1"
              >
                <RotateCcw :size="14" />
                <span>恢复</span>
              </button>
              <button 
                @click="permanentDelete(item.id)"
                class="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div v-if="sortedRecycleBin.length > 0" class="p-4 border-t border-farm-100 bg-farm-50">
        <div class="flex items-start space-x-2 mb-3 text-xs text-amber-700 bg-amber-50 p-3 rounded-lg">
          <AlertCircle :size="16" class="flex-shrink-0 mt-0.5" />
          <p>回收站中的待办可以恢复或永久删除</p>
        </div>
        <button 
          @click="clearAll"
          class="w-full py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
        >
          清空回收站
        </button>
      </div>
    </div>
  </div>
</template>
