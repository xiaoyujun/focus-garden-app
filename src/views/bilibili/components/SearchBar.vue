<script setup>
import { Search, X, SlidersHorizontal } from 'lucide-vue-next'
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  isSearching: {
    type: Boolean,
    default: false
  },
  showFilter: {
    type: Boolean,
    default: false
  },
  hasActiveFilters: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'search', 'toggle-filter', 'clear'])

const inputVal = ref(props.modelValue)

watch(() => props.modelValue, (newVal) => {
  inputVal.value = newVal
})

function handleInput(e) {
  inputVal.value = e.target.value
  emit('update:modelValue', inputVal.value)
}

function handleSearch() {
  if (!inputVal.value.trim()) return
  emit('search', inputVal.value)
}

function clearSearch() {
  inputVal.value = ''
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <div class="px-4 mb-4">
    <div class="flex gap-2">
      <div class="relative flex-1 group">
        <div class="absolute inset-0 bg-pink-200/30 rounded-2xl blur-xl transition-opacity opacity-0 group-hover:opacity-100"></div>
        <div class="relative bg-white rounded-2xl shadow-lg shadow-pink-100/50 overflow-hidden flex items-center transition-transform focus-within:scale-[1.02] border border-pink-50/50">
          <div class="pl-4 text-pink-300">
            <Search :size="20" />
          </div>
          <input 
            :value="inputVal"
            @input="handleInput"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="搜索有声书、输入B站链接..."
            class="w-full px-3 py-3.5 bg-transparent outline-none text-pink-900 placeholder:text-pink-300/70 text-sm"
          />
          <button 
            v-if="inputVal"
            @click="clearSearch"
            class="p-2 text-pink-300 hover:text-pink-500 transition-colors"
          >
            <X :size="18" />
          </button>
        </div>
      </div>
      
      <button 
        @click="handleSearch"
        :disabled="isSearching || !inputVal.trim()"
        class="px-4 bg-pink-500 text-white rounded-2xl text-sm font-bold hover:bg-pink-600 disabled:opacity-50 disabled:bg-gray-300 transition-all shadow-md shadow-pink-200 flex items-center justify-center min-w-[4.5rem]"
      >
        {{ isSearching ? '...' : '搜索' }}
      </button>

      <button 
        @click="$emit('toggle-filter')"
        class="px-3 bg-white border border-pink-100 text-pink-500 rounded-2xl hover:bg-pink-50 transition-colors flex items-center justify-center shadow-sm"
        :class="{ 'bg-pink-50 border-pink-200 text-pink-600': showFilter || hasActiveFilters }"
      >
        <SlidersHorizontal :size="20" />
        <span v-if="hasActiveFilters" class="absolute top-0 right-0 -mt-1 -mr-1 w-2.5 h-2.5 bg-pink-500 rounded-full border-2 border-white"></span>
      </button>
    </div>
  </div>
</template>
