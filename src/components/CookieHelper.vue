<script setup>
import { ref, computed } from 'vue'
import { X, Copy, ExternalLink, Check, BookMarked, Terminal, Sparkles } from 'lucide-vue-next'

const emit = defineEmits(['close', 'cookie-obtained'])

// 状态
const copiedItem = ref('')
const obtainedCookie = ref('')

// 控制台脚本 - 用户在喜马拉雅网站控制台执行
const consoleScript = `(function(){
  const c = document.cookie;
  if(!c) { alert('未检测到Cookie，请先登录！'); return; }
  navigator.clipboard.writeText(c).then(()=>{
    alert('✅ Cookie已复制到剪贴板！\\n\\n请返回应用粘贴使用');
  }).catch(()=>{
    prompt('请手动复制以下Cookie:', c);
  });
})();`

// Bookmarklet 代码
const bookmarkletCode = computed(() => {
  return `javascript:${encodeURIComponent(consoleScript)}`
})

// 简化版脚本（更短，方便复制）
const shortScript = `copy(document.cookie)`

// 打开喜马拉雅网站
function openXimalaya() {
  window.open('https://www.ximalaya.com', '_blank')
}

// 复制到剪贴板
async function copyToClipboard(text, itemName) {
  try {
    await navigator.clipboard.writeText(text)
    copiedItem.value = itemName
    setTimeout(() => {
      copiedItem.value = ''
    }, 2000)
  } catch (e) {
    // 回退方案
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copiedItem.value = itemName
    setTimeout(() => {
      copiedItem.value = ''
    }, 2000)
  }
}

// 从剪贴板读取 Cookie
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text && text.includes('=')) {
      obtainedCookie.value = text
      emit('cookie-obtained', text)
    } else {
      alert('剪贴板内容不像是有效的 Cookie')
    }
  } catch (e) {
    alert('无法读取剪贴板，请手动粘贴')
  }
}
</script>

<template>
  <div 
    class="fixed inset-0 bg-farm-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white w-full max-w-md rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
      <!-- 头部 -->
      <div class="flex items-center justify-between p-4 border-b border-farm-100 bg-gradient-to-r from-orange-500 to-orange-600 sticky top-0">
        <h3 class="font-bold text-white flex items-center gap-2">
          <Sparkles :size="20" />
          Cookie 快捷获取工具
        </h3>
        <button @click="emit('close')" class="p-2 rounded-full bg-white/20 text-white hover:bg-white/30">
          <X :size="18" />
        </button>
      </div>

      <div class="p-5 space-y-5">
        <!-- 方法一：控制台脚本 -->
        <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">1</div>
            <h4 class="font-bold text-blue-800">控制台脚本（推荐）</h4>
          </div>
          
          <div class="space-y-3 text-sm">
            <div class="flex gap-2">
              <button 
                @click="openXimalaya"
                class="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 flex items-center justify-center gap-2"
              >
                <ExternalLink :size="16" />
                打开喜马拉雅
              </button>
              <button 
                @click="copyToClipboard(consoleScript, 'script')"
                class="flex-1 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center justify-center gap-2"
              >
                <component :is="copiedItem === 'script' ? Check : Copy" :size="16" />
                {{ copiedItem === 'script' ? '已复制' : '复制脚本' }}
              </button>
            </div>
            
            <div class="bg-white/60 rounded-lg p-3 text-blue-700">
              <p class="font-medium mb-2">操作步骤：</p>
              <ol class="list-decimal list-inside space-y-1 text-blue-600">
                <li>点击上方按钮打开喜马拉雅并登录</li>
                <li>按 <kbd class="px-1.5 py-0.5 bg-blue-100 rounded text-xs">F12</kbd> 打开开发者工具</li>
                <li>切换到 <span class="font-medium">Console/控制台</span> 标签</li>
                <li>粘贴脚本并按回车执行</li>
                <li>Cookie 将自动复制到剪贴板</li>
              </ol>
            </div>
          </div>
        </div>

        <!-- 方法二：简易命令 -->
        <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">2</div>
            <h4 class="font-bold text-green-800">极简命令</h4>
          </div>
          
          <div class="text-sm">
            <p class="text-green-600 mb-2">在喜马拉雅网站的控制台直接输入：</p>
            <div class="flex gap-2 items-center">
              <code class="flex-1 bg-gray-800 text-green-400 px-4 py-3 rounded-lg font-mono text-base">
                {{ shortScript }}
              </code>
              <button 
                @click="copyToClipboard(shortScript, 'short')"
                class="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                <component :is="copiedItem === 'short' ? Check : Copy" :size="18" />
              </button>
            </div>
            <p class="text-green-500 text-xs mt-2">* 执行后 Cookie 会直接复制到剪贴板</p>
          </div>
        </div>

        <!-- 方法三：书签工具 -->
        <div class="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-100">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold">3</div>
            <h4 class="font-bold text-purple-800">书签小工具</h4>
          </div>
          
          <div class="text-sm space-y-3">
            <p class="text-purple-600">将下方按钮拖到书签栏，以后一键获取：</p>
            
            <div class="flex justify-center">
              <a 
                :href="bookmarkletCode"
                @click.prevent
                class="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium shadow-lg cursor-move flex items-center gap-2"
                title="拖动到书签栏"
              >
                <BookMarked :size="18" />
                📋 获取喜马拉雅Cookie
              </a>
            </div>
            
            <div class="bg-white/60 rounded-lg p-3 text-purple-600">
              <p class="font-medium mb-1">使用方法：</p>
              <ol class="list-decimal list-inside space-y-0.5">
                <li>将上方按钮拖到浏览器书签栏</li>
                <li>在喜马拉雅登录后点击该书签</li>
                <li>Cookie 自动复制到剪贴板</li>
              </ol>
            </div>
          </div>
        </div>

        <!-- 快捷粘贴 -->
        <div class="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-4 border border-amber-200">
          <div class="flex items-center gap-2 mb-3">
            <Terminal :size="20" class="text-amber-600" />
            <h4 class="font-bold text-amber-800">快捷粘贴</h4>
          </div>
          
          <button 
            @click="pasteFromClipboard"
            class="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:from-amber-600 hover:to-orange-600 flex items-center justify-center gap-2"
          >
            <Copy :size="18" />
            从剪贴板粘贴 Cookie
          </button>
          
          <p v-if="obtainedCookie" class="text-green-600 text-sm mt-2 text-center">
            ✅ 已获取 Cookie，可以关闭此窗口
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
