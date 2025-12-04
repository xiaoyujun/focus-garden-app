/**
 * 下载管理状态
 * 管理下载任务、进度和历史记录
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { parseUrl, downloadItem, downloadBatch, PRESET_SOURCES } from '../services/downloadService'
import { useUserStore, onUserSwitched, onUserRemoved } from './userStore'

const DOWNLOAD_STORAGE_KEY = 'download-manager-data'

export const useDownloadStore = defineStore('download', () => {
  const userStore = useUserStore()
  let isHydrating = false
  const getKey = (userId = userStore.activeUserId) => userStore.getStorageKey(DOWNLOAD_STORAGE_KEY, userId)
  // ===== 状态 =====
  const tasks = ref([])              // 下载任务列表
  const downloadHistory = ref([])    // 下载历史
  const parsedContent = ref(null)    // 当前解析的内容
  const isParsing = ref(false)       // 是否正在解析
  const isDownloading = ref(false)   // 是否正在下载
  const currentProgress = ref({      // 当前下载进度
    index: 0,
    total: 0,
    currentItem: null
  })

  function resetState() {
    tasks.value = []
    downloadHistory.value = []
    parsedContent.value = null
    isParsing.value = false
    isDownloading.value = false
    currentProgress.value = {
      index: 0,
      total: 0,
      currentItem: null
    }
  }

  // ===== 计算属性 =====
  const activeTasks = computed(() => tasks.value.filter(t => t.status === 'downloading'))
  const pendingTasks = computed(() => tasks.value.filter(t => t.status === 'pending'))
  const completedTasks = computed(() => tasks.value.filter(t => t.status === 'completed'))
  const hasActiveDownload = computed(() => isDownloading.value || activeTasks.value.length > 0)

  // ===== 本地存储 =====
  function loadFromStorage(targetUserId = userStore.activeUserId) {
    if (typeof localStorage === 'undefined') return
    isHydrating = true
    resetState()
    try {
      const data = localStorage.getItem(getKey(targetUserId))
      if (data) {
        const parsed = JSON.parse(data)
        downloadHistory.value = parsed.downloadHistory || []
        // 恢复未完成的任务为待定状态
        tasks.value = (parsed.tasks || []).map(t => ({
          ...t,
          status: t.status === 'downloading' ? 'pending' : t.status
        }))
      }
    } catch (e) {
      console.error('加载下载数据失败:', e)
    } finally {
      isHydrating = false
    }
  }

  function saveToStorage() {
    if (typeof localStorage === 'undefined' || isHydrating) return
    try {
      const data = {
        tasks: tasks.value,
        downloadHistory: downloadHistory.value.slice(0, 100) // 只保留最近100条
      }
      localStorage.setItem(getKey(), JSON.stringify(data))
    } catch (e) {
      console.error('保存下载数据失败:', e)
    }
  }

  function removeDataFor(userId) {
    localStorage.removeItem(getKey(userId))
  }

  onUserSwitched(() => {
    loadFromStorage()
  })

  onUserRemoved((userId) => {
    removeDataFor(userId)
  })

  // ===== 解析功能 =====
  
  /**
   * 解析 URL
   * @param {string} url - 要解析的链接
   */
  async function parse(url) {
    if (!url?.trim()) {
      throw new Error('请输入链接')
    }

    isParsing.value = true
    parsedContent.value = null

    try {
      const result = await parseUrl(url)
      parsedContent.value = {
        ...result,
        sourceUrl: url,
        parsedAt: new Date().toISOString()
      }
      return result
    } finally {
      isParsing.value = false
    }
  }

  /**
   * 清除解析结果
   */
  function clearParsed() {
    parsedContent.value = null
  }

  // ===== 下载功能 =====

  /**
   * 添加下载任务
   * @param {Object} item - 要下载的项目
   * @param {string} albumTitle - 专辑名称
   */
  function addTask(item, albumTitle) {
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      item,
      albumTitle,
      status: 'pending',
      progress: 0,
      error: null,
      createdAt: new Date().toISOString()
    }
    tasks.value.push(task)
    saveToStorage()
    return task
  }

  /**
   * 下载单个项目
   * @param {Object} item - 要下载的项目
   * @param {string} albumTitle - 专辑名称
   */
  async function downloadSingle(item, albumTitle) {
    const task = addTask(item, albumTitle)
    
    try {
      task.status = 'downloading'
      isDownloading.value = true
      
      const result = await downloadItem(item, albumTitle, (progress) => {
        task.progress = progress
      })
      
      task.status = 'completed'
      task.completedAt = new Date().toISOString()
      task.result = result
      
      // 添加到历史记录
      downloadHistory.value.unshift({
        id: task.id,
        title: item.title,
        albumTitle,
        downloadedAt: new Date().toISOString(),
        ...result
      })
      
      saveToStorage()
      return result
    } catch (e) {
      task.status = 'failed'
      task.error = e.message
      saveToStorage()
      throw e
    } finally {
      isDownloading.value = false
    }
  }

  /**
   * 批量下载选中的项目
   * @param {Array} items - 要下载的项目列表
   * @param {string} albumTitle - 专辑名称
   */
  async function downloadSelected(items, albumTitle) {
    if (!items?.length) {
      throw new Error('没有选中要下载的内容')
    }

    isDownloading.value = true
    currentProgress.value = { index: 0, total: items.length, currentItem: null }

    try {
      const result = await downloadBatch(items, albumTitle, (index, total, item) => {
        currentProgress.value = { index, total, currentItem: item }
      })

      // 添加到历史记录
      downloadHistory.value.unshift({
        id: `batch-${Date.now()}`,
        title: albumTitle,
        albumTitle,
        type: 'batch',
        downloadedAt: new Date().toISOString(),
        stats: result
      })

      saveToStorage()
      return result
    } finally {
      isDownloading.value = false
      currentProgress.value = { index: 0, total: 0, currentItem: null }
    }
  }

  /**
   * 取消下载任务
   * @param {string} taskId - 任务ID
   */
  function cancelTask(taskId) {
    const task = tasks.value.find(t => t.id === taskId)
    if (task && task.status === 'pending') {
      task.status = 'cancelled'
      saveToStorage()
    }
  }

  /**
   * 重试失败的任务
   * @param {string} taskId - 任务ID
   */
  async function retryTask(taskId) {
    const task = tasks.value.find(t => t.id === taskId)
    if (task && task.status === 'failed') {
      task.status = 'pending'
      task.error = null
      await downloadSingle(task.item, task.albumTitle)
    }
  }

  /**
   * 清除已完成的任务
   */
  function clearCompletedTasks() {
    tasks.value = tasks.value.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    saveToStorage()
  }

  /**
   * 清除下载历史
   */
  function clearHistory() {
    downloadHistory.value = []
    saveToStorage()
  }

  // 初始化
  loadFromStorage()

  return {
    // 状态
    tasks,
    downloadHistory,
    parsedContent,
    isParsing,
    isDownloading,
    currentProgress,
    resetState,
    loadFromStorage,
    removeDataFor,

    // 计算属性
    activeTasks,
    pendingTasks,
    completedTasks,
    hasActiveDownload,
    
    // 常量
    PRESET_SOURCES,
    
    // 解析方法
    parse,
    clearParsed,
    
    // 下载方法
    addTask,
    downloadSingle,
    downloadSelected,
    cancelTask,
    retryTask,
    clearCompletedTasks,
    clearHistory
  }
})
