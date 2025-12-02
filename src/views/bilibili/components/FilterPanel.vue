<script setup>
import { ref } from 'vue'

const props = defineProps({
  filters: {
    type: Object,
    required: true
  },
  options: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:filters', 'reset', 'apply', 'close'])

const localFilters = ref({ ...props.filters })

function updateFilter(key, value) {
  localFilters.value[key] = value
}

function handleReset() {
  localFilters.value = {
    type: 'all',
    duration: 'all',
    order: 'default'
  }
}

function handleApply() {
  emit('update:filters', localFilters.value)
  emit('apply')
}
</script>

<template>
  <div class="px-4 mb-4 animate-in slide-in-from-top-2 duration-200">
    <div class="p-5 bg-white rounded-2xl border border-pink-100 shadow-lg shadow-pink-50/50">
      <!-- 排序方式 -->
      <div class="mb-5">
        <label class="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">排序方式</label>
        <div class="flex flex-wrap gap-2">
          <button 
            v-for="opt in options.order" 
            :key="opt.value"
            @click="updateFilter('order', opt.value)"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            :class="localFilters.order === opt.value 
              ? 'bg-pink-500 text-white border-pink-500 shadow-sm' 
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 视频时长 -->
      <div class="mb-5">
        <label class="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">视频时长</label>
        <div class="flex flex-wrap gap-2">
          <button 
            v-for="opt in options.duration" 
            :key="opt.value"
            @click="updateFilter('duration', opt.value)"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            :class="localFilters.duration === opt.value 
              ? 'bg-pink-500 text-white border-pink-500 shadow-sm' 
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 视频类型 (搜索专用) -->
      <div class="mb-6">
        <label class="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">内容类型</label>
        <div class="flex flex-wrap gap-2">
          <button 
            v-for="opt in options.type" 
            :key="opt.value"
            @click="updateFilter('type', opt.value)"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex items-center gap-1"
            :class="localFilters.type === opt.value 
              ? 'bg-violet-500 text-white border-violet-500 shadow-sm' 
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'"
          >
            <span>{{ opt.icon }}</span>
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="flex gap-3 pt-2 border-t border-gray-50">
        <button 
          @click="handleReset"
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          重置
        </button>
        <button 
          @click="handleApply"
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-pink-500 hover:bg-pink-600 shadow-md shadow-pink-200 transition-colors"
        >
          确认筛选
        </button>
      </div>
    </div>
  </div>
</template>
