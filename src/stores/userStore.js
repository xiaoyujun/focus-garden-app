import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const USER_META_KEY = 'focus-garden-user-meta'
const BILI_SESSION_KEY = 'bilibili-auth-sessions'
const LEGACY_USER_ID = 'local:legacy'
const DEFAULT_GUEST_ID = 'local:guest'

const LEGACY_DATA_KEYS = [
  'focus-garden-data',
  'focus-garden-badges',
  'focus-garden-machines',
  'audiobook-player-data',
  'audiobook-last-played',
  'download-manager-data',
  'platform-source-data',
  'netease-session',
  'netease-settings',
  'netease-purchased'
]

const switchListeners = new Set()
const removeListeners = new Set()

export function onUserSwitched(callback) {
  switchListeners.add(callback)
  return () => switchListeners.delete(callback)
}

export function onUserRemoved(callback) {
  removeListeners.add(callback)
  return () => removeListeners.delete(callback)
}

function emitSwitch(userId) {
  switchListeners.forEach(cb => {
    try {
      cb(userId)
    } catch (error) {
      console.error('切换用户事件回调异常:', error)
    }
  })
}

function emitRemoved(userId) {
  removeListeners.forEach(cb => {
    try {
      cb(userId)
    } catch (error) {
      console.error('删除用户事件回调异常:', error)
    }
  })
}

function readBiliSessions() {
  try {
    const raw = localStorage.getItem(BILI_SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed.sessions || {}
  } catch {
    return {}
  }
}

function writeBiliSessions(sessions) {
  try {
    localStorage.setItem(BILI_SESSION_KEY, JSON.stringify({ sessions }))
  } catch (error) {
    console.error('保存B站会话失败:', error)
  }
}

export const useUserStore = defineStore('user', () => {
  const activeUserId = ref('')
  const users = ref({})
  const loadingUser = ref(false)
  const migrated = ref(false)
  let initialized = false

  const activeUser = computed(() => users.value[activeUserId.value] || null)

  function persistMeta() {
    try {
      localStorage.setItem(
        USER_META_KEY,
        JSON.stringify({
          activeUserId: activeUserId.value,
          users: users.value,
          migrated: migrated.value
        })
      )
    } catch (error) {
      console.error('保存用户元数据失败:', error)
    }
  }

  function ensureUserExists(userId, payload = {}) {
    if (!users.value[userId]) {
      users.value[userId] = {
        uid: payload.uid || userId.replace(/^.*:/, ''),
        source: payload.source || (userId.startsWith('bili:') ? 'bilibili' : 'local'),
        displayName: payload.displayName || (payload.source === 'bilibili' ? 'B站用户' : '离线用户'),
        avatar: payload.avatar || '',
        sessionKey: payload.sessionKey || null,
        createdAt: payload.createdAt || new Date().toISOString(),
        lastActiveAt: payload.lastActiveAt || new Date().toISOString()
      }
    }
    return users.value[userId]
  }

  function getStorageKey(baseKey, userId = activeUserId.value) {
    return userId ? `${baseKey}::${userId}` : baseKey
  }

  function listUsers() {
    return Object.entries(users.value).map(([id, meta]) => ({
      id,
      ...meta
    }))
  }

  function migrateLegacyDataTo(userId) {
    LEGACY_DATA_KEYS.forEach(key => {
      const legacyValue = localStorage.getItem(key)
      if (legacyValue !== null && !localStorage.getItem(`${key}::${userId}`)) {
        localStorage.setItem(`${key}::${userId}`, legacyValue)
      }
    })
  }

  function migrateLegacyAuth() {
    try {
      const raw = localStorage.getItem('bilibili-auth')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed?.userId || !parsed?.cookies) return null
      const sessionKey = `bili:${parsed.userId}`
      const sessions = readBiliSessions()
      sessions[sessionKey] = {
        cookies: parsed.cookies,
        userId: parsed.userId,
        userName: parsed.userName || `UID ${parsed.userId}`,
        avatar: parsed.avatar || '',
        expiresAt: parsed.expiresAt || '',
        lastValidatedAt: new Date().toISOString()
      }
      writeBiliSessions(sessions)
      return {
        sessionKey,
        userMeta: {
          uid: String(parsed.userId),
          source: 'bilibili',
          displayName: parsed.userName || `UID ${parsed.userId}`,
          avatar: parsed.avatar || '',
          sessionKey
        }
      }
    } catch (error) {
      console.warn('迁移旧版B站登录信息失败:', error)
      return null
    }
  }

  function initFromStorage() {
    if (initialized) return
    initialized = true
    loadingUser.value = true
    try {
      const rawMeta = localStorage.getItem(USER_META_KEY)
      if (rawMeta) {
        const parsed = JSON.parse(rawMeta)
        activeUserId.value = parsed.activeUserId || ''
        users.value = parsed.users || {}
        migrated.value = !!parsed.migrated
      }

      if (!activeUserId.value) {
        const guest = ensureUserExists(DEFAULT_GUEST_ID, { displayName: '离线用户', source: 'local' })
        activeUserId.value = guest ? DEFAULT_GUEST_ID : ''
      }

      if (!migrated.value) {
        const legacyUser = ensureUserExists(LEGACY_USER_ID, { displayName: '本地数据', source: 'local' })
        migrateLegacyDataTo(LEGACY_USER_ID)
        const migratedAuth = migrateLegacyAuth()
        if (migratedAuth) {
          ensureUserExists(migratedAuth.sessionKey, migratedAuth.userMeta)
          activeUserId.value = migratedAuth.sessionKey
        } else if (!activeUserId.value) {
          activeUserId.value = legacyUser ? LEGACY_USER_ID : activeUserId.value
        }
        migrated.value = true
      }

      touchActiveUser()
      persistMeta()
    } catch (error) {
      console.error('加载用户元数据失败:', error)
    } finally {
      loadingUser.value = false
    }
  }

  function touchActiveUser() {
    const user = users.value[activeUserId.value]
    if (user) {
      user.lastActiveAt = new Date().toISOString()
    }
  }

  function registerOrUpdate(userMeta) {
    if (!userMeta?.sessionKey) return
    const meta = ensureUserExists(userMeta.sessionKey, {
      uid: userMeta.uid,
      source: userMeta.source || (userMeta.sessionKey.startsWith('bili:') ? 'bilibili' : 'local'),
      displayName: userMeta.displayName || userMeta.userName || '新用户',
      avatar: userMeta.avatar || '',
      sessionKey: userMeta.sessionKey,
      createdAt: userMeta.createdAt,
      lastActiveAt: new Date().toISOString()
    })
    users.value[userMeta.sessionKey] = { ...meta, ...userMeta, lastActiveAt: new Date().toISOString() }
    activeUserId.value = userMeta.sessionKey
    persistMeta()
    emitSwitch(activeUserId.value)
  }

  function switchUser(userId) {
    if (!userId) return
    ensureUserExists(userId)
    activeUserId.value = userId
    touchActiveUser()
    persistMeta()
    emitSwitch(userId)
  }

  async function logoutUser(userId = activeUserId.value) {
    if (!userId) return
    const sessions = readBiliSessions()
    if (sessions[userId]) {
      delete sessions[userId]
      writeBiliSessions(sessions)
    }
    if (users.value[userId]) {
      users.value[userId] = {
        ...users.value[userId],
        sessionKey: null
      }
    }
    persistMeta()
  }

  function cleanupUserData(userId) {
    LEGACY_DATA_KEYS.forEach(key => {
      localStorage.removeItem(`${key}::${userId}`)
    })
    const sessions = readBiliSessions()
    if (sessions[userId]) {
      delete sessions[userId]
      writeBiliSessions(sessions)
    }
  }

  function removeUser(userId, { removeData = false } = {}) {
    if (!users.value[userId]) return
    delete users.value[userId]
    if (removeData) {
      cleanupUserData(userId)
      emitRemoved(userId)
    }
    if (activeUserId.value === userId) {
      const fallback = Object.keys(users.value)[0] || DEFAULT_GUEST_ID
      ensureUserExists(fallback)
      activeUserId.value = fallback
      emitSwitch(activeUserId.value)
    }
    persistMeta()
  }

  return {
    activeUserId,
    users,
    loadingUser,
    migrated,
    activeUser,
    initFromStorage,
    getStorageKey,
    listUsers,
    registerOrUpdate,
    switchUser,
    logoutUser,
    removeUser,
    ensureUserExists
  }
})
