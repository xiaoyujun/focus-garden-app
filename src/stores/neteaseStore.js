import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useUserStore, onUserSwitched, onUserRemoved } from './userStore'
import { 
  createLoginQrKey, 
  createLoginQrImage, 
  checkQrStatus, 
  getLoginStatus, 
  getDailySongs, 
  getUserPlaylists, 
  addTrackToPlaylist, 
  getSongUrl 
} from '../services/neteaseService'

const SESSION_KEY = 'netease-session'
const SETTINGS_KEY = 'netease-settings'
const PURCHASE_KEY = 'netease-purchased'
const DEFAULT_API_BASE = (import.meta?.env?.VITE_NETEASE_API) || '/api/netease'

export const useNeteaseStore = defineStore('netease', () => {
  const userStore = useUserStore()
  let isHydrating = false
  const getKey = (baseKey, userId = userStore.activeUserId) => userStore.getStorageKey(baseKey, userId)

  const apiBase = ref(DEFAULT_API_BASE)
  const cookie = ref('')
  const profile = ref(null)
  const uid = ref(null)
  const dailySongs = ref([])
  const playlists = ref([])
  const targetPlaylistId = ref('')

  // 登录状态
  const lastLoginError = ref('')
  const checkingQr = ref(false)
  const qrImage = ref('')
  const qrKey = ref('')
  const qrStatus = ref('idle') // idle | waiting | scanned | confirmed | success | expired
  const qrMessage = ref('')
  let qrTimer = null

  // 加载状态
  const loadingDaily = ref(false)
  const loadingPlaylists = ref(false)

  // 购买记录
  const purchasedMap = ref({})

  function resetState() {
    stopQrPolling()
    apiBase.value = DEFAULT_API_BASE
    cookie.value = ''
    profile.value = null
    uid.value = null
    dailySongs.value = []
    playlists.value = []
    targetPlaylistId.value = ''
    lastLoginError.value = ''
    checkingQr.value = false
    qrImage.value = ''
    qrKey.value = ''
    qrStatus.value = 'idle'
    qrMessage.value = ''
    loadingDaily.value = false
    loadingPlaylists.value = false
    purchasedMap.value = {}
  }

  const isLoggedIn = computed(() => !!cookie.value && !!profile.value)
  const targetPlaylist = computed(() => playlists.value.find(p => p.id === targetPlaylistId.value) || null)
  const purchasedIds = computed(() => new Set(Object.keys(purchasedMap.value || {})))

  function persistSession(targetUserId = userStore.activeUserId) {
    if (typeof localStorage === 'undefined' || isHydrating) return
    try {
      const data = {
        cookie: cookie.value,
        profile: profile.value,
        uid: uid.value,
        targetPlaylistId: targetPlaylistId.value
      }
      localStorage.setItem(getKey(SESSION_KEY, targetUserId), JSON.stringify(data))
    } catch (error) {
      console.error('保存网易云会话失败', error)
    }
  }

  function persistSettings(targetUserId = userStore.activeUserId) {
    if (typeof localStorage === 'undefined' || isHydrating) return
    try {
      localStorage.setItem(getKey(SETTINGS_KEY, targetUserId), JSON.stringify({ apiBase: apiBase.value }))
    } catch (error) {
      console.error('保存网易云配置失败', error)
    }
  }

  function persistPurchases(targetUserId = userStore.activeUserId) {
    if (typeof localStorage === 'undefined' || isHydrating) return
    try {
      localStorage.setItem(getKey(PURCHASE_KEY, targetUserId), JSON.stringify(purchasedMap.value || {}))
    } catch (error) {
      console.error('保存购买记录失败', error)
    }
  }

  function initFromStorage(targetUserId = userStore.activeUserId) {
    if (typeof localStorage === 'undefined') return
    isHydrating = true
    resetState()
    try {
      const sessionRaw = localStorage.getItem(getKey(SESSION_KEY, targetUserId))
      if (sessionRaw) {
        const parsed = JSON.parse(sessionRaw)
        cookie.value = parsed.cookie || ''
        profile.value = parsed.profile || null
        uid.value = parsed.uid || null
        targetPlaylistId.value = parsed.targetPlaylistId || ''
      }
      const settingsRaw = localStorage.getItem(getKey(SETTINGS_KEY, targetUserId))
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw)
        if (parsed.apiBase) {
          apiBase.value = parsed.apiBase
        }
      }
      const purchaseRaw = localStorage.getItem(getKey(PURCHASE_KEY, targetUserId))
      if (purchaseRaw) {
        purchasedMap.value = JSON.parse(purchaseRaw)
      }
    } catch (error) {
      console.error('加载网易云缓存失败', error)
    } finally {
      isHydrating = false
    }
  }

  watch([cookie, profile, uid, targetPlaylistId], () => {
    if (isHydrating) return
    persistSession()
  }, { deep: true })
  watch(apiBase, () => {
    if (isHydrating) return
    persistSettings()
  })
  watch(purchasedMap, () => {
    if (isHydrating) return
    persistPurchases()
  }, { deep: true })

  function removeDataFor(userId) {
    localStorage.removeItem(getKey(SESSION_KEY, userId))
    localStorage.removeItem(getKey(SETTINGS_KEY, userId))
    localStorage.removeItem(getKey(PURCHASE_KEY, userId))
  }

  onUserSwitched(() => {
    initFromStorage()
  })

  onUserRemoved((userId) => {
    removeDataFor(userId)
  })

  function stopQrPolling() {
    if (qrTimer) {
      clearInterval(qrTimer)
      qrTimer = null
    }
  }

  async function refreshLoginStatus() {
    if (!cookie.value) {
      lastLoginError.value = ''
      return { success: false, error: '未登录' }
    }
    try {
      const res = await getLoginStatus({ baseUrl: apiBase.value, cookie: cookie.value })
      const data = res?.data || res
      const accountId = data?.account?.id || data?.profile?.userId
      if (!accountId) {
        lastLoginError.value = '登录已失效，请重新登录'
        profile.value = null
        uid.value = null
        return { success: false, error: lastLoginError.value }
      }
      profile.value = data.profile || data?.data?.profile || profile.value
      uid.value = accountId
      lastLoginError.value = ''
      persistSession()
      return { success: true, profile: profile.value }
    } catch (error) {
      lastLoginError.value = error.message || '登录状态检查失败'
      return { success: false, error: lastLoginError.value }
    }
  }

  async function refreshAll({ withDaily = true } = {}) {
    const status = await refreshLoginStatus()
    if (!status.success) return status
    await fetchPlaylists()
    if (withDaily) {
      await fetchDailySongs()
    }
    return { success: true }
  }

  async function setCookieAndRefresh(rawCookie) {
    cookie.value = (rawCookie || '').trim()
    return await refreshAll()
  }

  async function startQrLogin() {
    stopQrPolling()
    qrStatus.value = 'waiting'
    qrMessage.value = '请使用网易云音乐扫一扫'
    checkingQr.value = false
    try {
      const keyRes = await createLoginQrKey({ baseUrl: apiBase.value })
      const unikey = keyRes?.data?.unikey || keyRes?.unikey
      if (!unikey) {
        throw new Error('未能获取二维码 key')
      }
      qrKey.value = unikey
      const imgRes = await createLoginQrImage(unikey, { baseUrl: apiBase.value })
      qrImage.value = imgRes?.data?.qrimg || imgRes?.qrimg || ''
      qrStatus.value = 'waiting'
      checkingQr.value = false
      qrMessage.value = '等待扫码...'
      // 立即轮询一次，再启动定时器
      await pollQrStatus()
      qrTimer = setInterval(pollQrStatus, 1500)
    } catch (error) {
      qrStatus.value = 'idle'
      qrMessage.value = error.message || '二维码生成失败'
    }
  }

  async function pollQrStatus() {
    if (!qrKey.value) return
    checkingQr.value = true
    try {
      const res = await checkQrStatus(qrKey.value, { baseUrl: apiBase.value })
      const code = res?.code
      switch (code) {
        case 800:
          qrStatus.value = 'expired'
          qrMessage.value = '二维码已过期，点击刷新'
          stopQrPolling()
          break
        case 801:
          qrStatus.value = 'waiting'
          qrMessage.value = '等待扫码'
          break
        case 802:
          qrStatus.value = 'scanned'
          qrMessage.value = '已扫码，请确认登录'
          break
        case 803:
          qrStatus.value = 'success'
          qrMessage.value = '登录成功'
          stopQrPolling()
          if (res.cookie || res?.data?.cookie) {
            cookie.value = res.cookie || res?.data?.cookie
          }
          await refreshAll()
          break
        default:
          qrMessage.value = res?.message || '未知状态'
          break
      }
    } catch (error) {
      qrMessage.value = error.message || '二维码状态获取失败'
    } finally {
      checkingQr.value = false
    }
  }

  async function fetchDailySongs() {
    if (!cookie.value) return { success: false, error: '未登录' }
    loadingDaily.value = true
    try {
      const res = await getDailySongs({ baseUrl: apiBase.value, cookie: cookie.value })
      const list = res?.data?.dailySongs || res?.data?.songs || []
      dailySongs.value = Array.isArray(list) ? list : []
      return { success: true, count: dailySongs.value.length }
    } catch (error) {
      return { success: false, error: error.message || '获取日推失败' }
    } finally {
      loadingDaily.value = false
    }
  }

  async function fetchPlaylists() {
    if (!uid.value) return { success: false, error: '缺少用户信息' }
    loadingPlaylists.value = true
    try {
      const res = await getUserPlaylists(uid.value, { baseUrl: apiBase.value, cookie: cookie.value })
      const list = res?.playlist || res?.data?.playlist || []
      playlists.value = Array.isArray(list) ? list : []
      // 默认选中本人创建的第一个歌单
      if (!targetPlaylistId.value && playlists.value.length) {
        const owned = playlists.value.find(p => p.creator?.userId === uid.value) || playlists.value[0]
        targetPlaylistId.value = owned?.id || ''
      }
      return { success: true, count: playlists.value.length }
    } catch (error) {
      return { success: false, error: error.message || '获取歌单失败' }
    } finally {
      loadingPlaylists.value = false
    }
  }

  function setTargetPlaylist(id) {
    targetPlaylistId.value = id
  }

  function hasPurchased(trackId) {
    return !!purchasedMap.value?.[trackId]
  }

  function markPurchased(trackId) {
    purchasedMap.value = {
      ...purchasedMap.value,
      [trackId]: { purchasedAt: new Date().toISOString() }
    }
  }

  async function addToPlaylist(trackId) {
    if (!cookie.value) {
      return { success: false, error: '请先登录网易云' }
    }
    if (!targetPlaylistId.value) {
      return { success: false, error: '请先选择目标歌单' }
    }
    try {
      const res = await addTrackToPlaylist(targetPlaylistId.value, trackId, { baseUrl: apiBase.value, cookie: cookie.value })
      const code = res?.code ?? res?.body?.code ?? res?.status
      if (code && Number(code) !== 200) {
        throw new Error(res?.message || res?.msg || '加歌失败')
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message || '加入歌单失败' }
    }
  }

  async function getPreviewUrl(trackId) {
    try {
      const res = await getSongUrl(trackId, { baseUrl: apiBase.value, cookie: cookie.value })
      return res?.data?.[0]?.url || ''
    } catch (error) {
      return ''
    }
  }

  function logout() {
    stopQrPolling()
    cookie.value = ''
    profile.value = null
    uid.value = null
    dailySongs.value = []
    playlists.value = []
    targetPlaylistId.value = ''
    qrImage.value = ''
    qrKey.value = ''
    qrStatus.value = 'idle'
    qrMessage.value = ''
    lastLoginError.value = ''
    persistSession()
  }

  initFromStorage()

  return {
    apiBase,
    cookie,
    profile,
    uid,
    dailySongs,
    playlists,
    targetPlaylistId,
    isLoggedIn,
    targetPlaylist,
    purchasedIds,
    lastLoginError,
    checkingQr,
    qrImage,
    qrStatus,
    qrMessage,
    loadingDaily,
    loadingPlaylists,
    hasPurchased,
    resetState,
    initFromStorage,
    removeDataFor,
    // 登录相关
    refreshLoginStatus,
    refreshAll,
    setCookieAndRefresh,
    startQrLogin,
    pollQrStatus,
    // 数据获取
    fetchDailySongs,
    fetchPlaylists,
    setTargetPlaylist,
    // 操作
    addToPlaylist,
    markPurchased,
    getPreviewUrl,
    logout,
    setTargetPlaylistId: setTargetPlaylist // 兼容写法
  }
})
