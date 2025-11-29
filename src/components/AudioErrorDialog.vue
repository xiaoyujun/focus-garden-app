<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '播放提示' },
  message: { type: String, default: '' }
})

const emit = defineEmits(['close'])
</script>

<template>
  <div
    v-if="props.visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-farm-900/40 backdrop-blur-sm px-4"
  >
    <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-farm-100 p-6">
      <h3 class="text-lg font-bold text-farm-900 mb-2">{{ props.title }}</h3>
      <p class="text-sm text-farm-600 leading-relaxed mb-4">
        {{ props.message || '发生未知错误，请稍后重试' }}
      </p>
      <button
        type="button"
        class="w-full bg-nature-500 text-white py-3 rounded-xl font-semibold hover:bg-nature-600 transition-colors shadow-lg shadow-nature-200 active:scale-95"
        @click="emit('close')"
      >
        我知道了
      </button>
    </div>
  </div>
</template>
