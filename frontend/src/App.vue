<script setup>
// App 根组件 - 只负责路由出口
</script>

<template>
  <router-view />
</template>

<style>
/* 全局重置样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 移动端适配 */
body {
  max-width: 500px;
  margin: 0 auto;
  background: #f5f5f5;
}
</style>
