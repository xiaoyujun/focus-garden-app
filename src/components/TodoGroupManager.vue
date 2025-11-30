<script setup>
import { ref } from 'vue'
import { useAppStore } from '../stores/gameStore'
import { Plus, Edit2, Trash2, X, Check } from 'lucide-vue-next'

const store = useAppStore()
const emit = defineEmits(['close'])

const showAddDialog = ref(false)
const editingGroup = ref(null)
const newGroupName = ref('')
const newGroupIcon = ref('📁')
const newGroupColor = ref('gray')

const availableColors = [
  { id: 'gray', name: '灰色', class: 'bg-gray-500' },
  { id: 'red', name: '红色', class: 'bg-red-500' },
  { id: 'orange', name: '橙色', class: 'bg-orange-500' },
  { id: 'amber', name: '琥珀', class: 'bg-amber-500' },
  { id: 'yellow', name: '黄色', class: 'bg-yellow-500' },
  { id: 'lime', name: '青柠', class: 'bg-lime-500' },
  { id: 'green', name: '绿色', class: 'bg-green-500' },
  { id: 'emerald', name: '翡翠', class: 'bg-emerald-500' },
  { id: 'teal', name: '青色', class: 'bg-teal-500' },
  { id: 'cyan', name: '青蓝', class: 'bg-cyan-500' },
  { id: 'sky', name: '天蓝', class: 'bg-sky-500' },
  { id: 'blue', name: '蓝色', class: 'bg-blue-500' },
  { id: 'indigo', name: '靛蓝', class: 'bg-indigo-500' },
  { id: 'violet', name: '紫罗兰', class: 'bg-violet-500' },
  { id: 'purple', name: '紫色', class: 'bg-purple-500' },
  { id: 'fuchsia', name: '紫红', class: 'bg-fuchsia-500' },
  { id: 'pink', name: '粉色', class: 'bg-pink-500' },
  { id: 'rose', name: '玫瑰', class: 'bg-rose-500' }
]

const commonIcons = ['📁', '📝', '💼', '🎯', '📚', '💡', '🎨', '🏃', '🏠', '🛒', '💰', '🎮', '📱', '✈️', '🍔', '🏥']

function openAddDialog() {
  editingGroup.value = null
  newGroupName.value = ''
  newGroupIcon.value = '📁'
  newGroupColor.value = 'gray'
  showAddDialog.value = true
}

function openEditDialog(group) {
  if (group.builtin) return
  editingGroup.value = group
  newGroupName.value = group.name
  newGroupIcon.value = group.icon
  newGroupColor.value = group.color
  showAddDialog.value = true
}

function saveGroup() {
  if (!newGroupName.value.trim()) return
  
  if (editingGroup.value) {
    store.updateTodoGroup(editingGroup.value.id, {
      name: newGroupName.value.trim(),
      icon: newGroupIcon.value,
      color: newGroupColor.value
    })
  } else {
    store.addTodoGroup(newGroupName.value.trim(), newGroupIcon.value, newGroupColor.value)
  }
  
  showAddDialog.value = false
}

function deleteGroup(id) {
  if (confirm('删除分组后，该分组下的待办将移至"待办"分组，确定删除吗？')) {
    store.deleteTodoGroup(id)
  }
}

function getTodoCount(groupId) {
  return store.todos.filter(t => t.groupId === groupId || t.category === groupId).length
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="emit('close')">
    <div class="bg-white rounded-3xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
      <!-- 头部 -->
      <div class="p-6 border-b border-farm-100 flex items-center justify-between">
        <h2 class="text-xl font-bold text-farm-900">管理分组</h2>
        <button @click="emit('close')" class="p-2 hover:bg-farm-50 rounded-full transition-colors">
          <X :size="20" class="text-farm-500" />
        </button>
      </div>

      <!-- 分组列表 -->
      <div class="flex-1 overflow-y-auto p-4">
        <div class="space-y-2">
          <div 
            v-for="group in store.todoGroups" 
            :key="group.id"
            class="bg-farm-50 rounded-xl p-4 flex items-center justify-between hover:bg-farm-100 transition-colors"
          >
            <div class="flex items-center space-x-3 flex-1">
              <div 
                class="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg"
                :class="`bg-${group.color}-500`"
              >
                {{ group.icon }}
              </div>
              <div class="flex-1">
                <div class="font-medium text-farm-900">{{ group.name }}</div>
                <div class="text-xs text-farm-500">{{ getTodoCount(group.id) }} 个待办</div>
              </div>
            </div>
            
            <div v-if="!group.builtin" class="flex space-x-1">
              <button 
                @click="openEditDialog(group)"
                class="p-2 text-farm-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-colors"
              >
                <Edit2 :size="16" />
              </button>
              <button 
                @click="deleteGroup(group.id)"
                class="p-2 text-farm-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 :size="16" />
              </button>
            </div>
            <div v-else class="text-xs text-farm-400 px-3 py-1 bg-farm-200 rounded-full">
              内置
            </div>
          </div>
        </div>
      </div>

      <!-- 添加按钮 -->
      <div class="p-4 border-t border-farm-100">
        <button 
          @click="openAddDialog"
          class="w-full py-3 bg-nature-500 text-white rounded-xl font-medium hover:bg-nature-600 transition-colors flex items-center justify-center space-x-2"
        >
          <Plus :size="20" />
          <span>添加新分组</span>
        </button>
      </div>
    </div>

    <!-- 添加/编辑对话框 -->
    <div 
      v-if="showAddDialog" 
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      @click.self="showAddDialog = false"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
        <h3 class="text-lg font-bold text-farm-900 mb-4">
          {{ editingGroup ? '编辑分组' : '新建分组' }}
        </h3>
        
        <!-- 分组名称 -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-farm-700 mb-2">分组名称</label>
          <input 
            v-model="newGroupName"
            type="text"
            placeholder="输入分组名称"
            class="w-full px-4 py-2 bg-farm-50 border border-farm-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-nature-400"
            maxlength="10"
          />
        </div>

        <!-- 选择图标 -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-farm-700 mb-2">选择图标</label>
          <div class="grid grid-cols-8 gap-2">
            <button
              v-for="icon in commonIcons"
              :key="icon"
              @click="newGroupIcon = icon"
              class="w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all"
              :class="newGroupIcon === icon ? 'bg-nature-100 ring-2 ring-nature-500' : 'bg-farm-50 hover:bg-farm-100'"
            >
              {{ icon }}
            </button>
          </div>
        </div>

        <!-- 选择颜色 -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-farm-700 mb-2">选择颜色</label>
          <div class="grid grid-cols-6 gap-2">
            <button
              v-for="color in availableColors"
              :key="color.id"
              @click="newGroupColor = color.id"
              class="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
              :class="[color.class, newGroupColor === color.id ? 'ring-2 ring-offset-2 ring-farm-900' : '']"
            >
              <Check v-if="newGroupColor === color.id" :size="16" class="text-white" />
            </button>
          </div>
        </div>

        <!-- 按钮 -->
        <div class="flex space-x-2">
          <button 
            @click="showAddDialog = false"
            class="flex-1 py-2 bg-farm-100 text-farm-700 rounded-xl font-medium hover:bg-farm-200 transition-colors"
          >
            取消
          </button>
          <button 
            @click="saveGroup"
            :disabled="!newGroupName.trim()"
            class="flex-1 py-2 bg-nature-500 text-white rounded-xl font-medium hover:bg-nature-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ editingGroup ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
