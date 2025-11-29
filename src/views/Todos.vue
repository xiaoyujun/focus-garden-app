<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '../stores/gameStore'
import { Plus, Check, Trash2, Home, ListTodo, X } from 'lucide-vue-next'

const store = useAppStore()

// 状态
const newTodo = ref('')
const activeTab = ref('all') // 'all', 'general', 'housework'
const showInput = ref(false)
const newTodoCategory = ref('general')

// 筛选后的待办
const filteredTodos = computed(() => {
  let list = store.todos
  if (activeTab.value === 'general') {
    list = list.filter(t => t.category === 'general')
  } else if (activeTab.value === 'housework') {
    list = list.filter(t => t.category === 'housework')
  }
  // 未完成的在前面
  return [...list].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
})

// 统计
const stats = computed(() => ({
  total: store.todos.length,
  pending: store.pendingTodos.length,
  completed: store.completedTodos.length
}))

// 添加待办
function addTodo() {
  if (!newTodo.value.trim()) return
  store.addTodo(newTodo.value.trim(), newTodoCategory.value)
  newTodo.value = ''
  showInput.value = false
}

// 长按删除
function handleDelete(id) {
  if (confirm('确定删除这个待办吗？')) {
    store.deleteTodo(id)
  }
}
</script>

<template>
  <div class="min-h-screen bg-farm-50">
    <!-- 头部 -->
    <header class="p-4 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-farm-900">待办事项</h1>
        <div class="text-sm text-farm-500">
          {{ stats.pending }} 待完成
        </div>
      </div>
      
      <!-- 标签切换 -->
      <div class="flex space-x-2">
        <button 
          @click="activeTab = 'all'"
          class="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
          :class="activeTab === 'all' ? 'bg-farm-800 text-white shadow-md shadow-farm-200' : 'bg-white text-farm-600 border border-farm-200 hover:bg-farm-50'"
        >
          全部
        </button>
        <button 
          @click="activeTab = 'general'"
          class="px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center"
          :class="activeTab === 'general' ? 'bg-sky-500 text-white shadow-md shadow-sky-200' : 'bg-white text-farm-600 border border-farm-200 hover:bg-farm-50'"
        >
          <ListTodo :size="14" class="mr-1" />
          待办
        </button>
        <button 
          @click="activeTab = 'housework'"
          class="px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center"
          :class="activeTab === 'housework' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'bg-white text-farm-600 border border-farm-200 hover:bg-farm-50'"
        >
          <Home :size="14" class="mr-1" />
          家务
        </button>
      </div>
    </header>

    <main class="p-4 pb-32">
      <!-- 待办列表 -->
      <div class="space-y-3">
        <div 
          v-for="todo in filteredTodos" 
          :key="todo.id"
          class="bg-white p-4 rounded-2xl shadow-sm border border-farm-100 flex items-center group hover:shadow-md transition-all"
          :class="{ 'opacity-60 bg-farm-50': todo.completed }"
        >
          <!-- 完成按钮 -->
          <button 
            @click="store.toggleTodo(todo.id)"
            class="w-6 h-6 rounded-full border-2 flex items-center justify-center mr-3 transition-colors flex-shrink-0"
            :class="todo.completed 
              ? 'bg-nature-500 border-nature-500 text-white' 
              : 'border-farm-300 hover:border-nature-400 text-white'"
          >
            <Check v-if="todo.completed" :size="14" />
          </button>
          
          <!-- 内容 -->
          <div class="flex-1 min-w-0">
            <p 
              class="text-farm-900 truncate transition-all"
              :class="{ 'line-through text-farm-400': todo.completed }"
            >
              {{ todo.text }}
            </p>
            <div class="flex items-center mt-1 space-x-2">
              <span 
                class="text-xs px-2.5 py-0.5 rounded-full font-medium"
                :class="todo.category === 'housework' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'"
              >
                {{ todo.category === 'housework' ? '家务' : '待办' }}
              </span>
            </div>
          </div>

          <!-- 删除按钮 -->
          <button 
            @click="handleDelete(todo.id)"
            class="p-2 text-farm-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 :size="18" />
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredTodos.length === 0" class="text-center py-16">
        <div class="text-6xl mb-4 opacity-80">📝</div>
        <p class="text-farm-500 font-medium">暂无待办事项</p>
        <p class="text-sm text-farm-400 mt-1">点击下方按钮添加</p>
      </div>

      <!-- 清除已完成 -->
      <div v-if="stats.completed > 0" class="mt-6 text-center">
        <button 
          @click="store.clearCompletedTodos"
          class="text-sm text-farm-400 hover:text-farm-600 underline transition-colors"
        >
          清除 {{ stats.completed }} 个已完成
        </button>
      </div>
    </main>

    <!-- 添加按钮 -->
    <button 
      v-if="!showInput"
      @click="showInput = true"
      class="fixed bottom-24 right-6 w-14 h-14 bg-nature-500 text-white rounded-full shadow-lg shadow-nature-200 flex items-center justify-center hover:bg-nature-600 transition-all hover:scale-105 hover:rotate-90 z-20"
    >
      <Plus :size="28" />
    </button>

    <!-- 添加输入框 -->
    <div v-if="showInput" class="fixed bottom-24 left-4 right-4 bg-white rounded-2xl p-4 z-20 shadow-xl shadow-farm-900/10 border border-farm-100 animate-in slide-in-from-bottom-4 duration-200">
      <div class="flex items-center space-x-2 mb-3">
        <button 
          @click="newTodoCategory = 'general'"
          class="px-3 py-1 rounded-full text-sm transition-colors font-medium"
          :class="newTodoCategory === 'general' ? 'bg-sky-500 text-white' : 'bg-farm-100 text-farm-600'"
        >
          待办
        </button>
        <button 
          @click="newTodoCategory = 'housework'"
          class="px-3 py-1 rounded-full text-sm transition-colors font-medium"
          :class="newTodoCategory === 'housework' ? 'bg-amber-500 text-white' : 'bg-farm-100 text-farm-600'"
        >
          家务
        </button>
        <button 
          @click="showInput = false"
          class="ml-auto p-1 text-farm-400 hover:text-farm-600 bg-farm-50 rounded-full hover:bg-farm-100 transition-colors"
        >
          <X :size="18" />
        </button>
      </div>
      <div class="flex space-x-2">
        <input 
          v-model="newTodo"
          type="text"
          :placeholder="newTodoCategory === 'housework' ? '添加家务...' : '添加待办...'"
          class="flex-1 px-4 py-3 bg-farm-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-nature-400 placeholder:text-farm-300 text-farm-800"
          @keyup.enter="addTodo"
          autofocus
        />
        <button 
          @click="addTodo"
          :disabled="!newTodo.trim()"
          class="px-5 py-3 bg-nature-500 text-white rounded-xl font-medium hover:bg-nature-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-nature-200"
        >
          添加
        </button>
      </div>
    </div>
  </div>
</template>
