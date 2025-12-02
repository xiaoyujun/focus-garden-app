// 通知与小组件原生交互封装，网页端降级为无操作。
import { registerPlugin, Capacitor } from '@capacitor/core'

const FocusStatusPlugin = Capacitor.isNativePlatform()
  ? registerPlugin('FocusStatusPlugin')
  : null

export async function ensureNotificationPermission() {
  if (!FocusStatusPlugin) return { granted: false }
  try {
    const status = await FocusStatusPlugin.checkPermission()
    if (status?.state === 'granted') return { granted: true }
    const result = await FocusStatusPlugin.requestPermission()
    return { granted: result?.state === 'granted' }
  } catch (err) {
    console.warn('检查通知权限失败', err)
    return { granted: false, error: err?.message }
  }
}

export async function startFocusNotification(payload) {
  if (!FocusStatusPlugin) return
  try {
    await FocusStatusPlugin.startService(payload)
  } catch (err) {
    console.warn('启动前台通知失败', err)
  }
}

export async function updateFocusNotification(payload) {
  if (!FocusStatusPlugin) return
  try {
    await FocusStatusPlugin.updateService(payload)
  } catch (err) {
    console.warn('更新前台通知失败', err)
  }
}

export async function stopFocusNotification() {
  if (!FocusStatusPlugin) return
  try {
    await FocusStatusPlugin.stopService()
  } catch (err) {
    console.warn('停止前台通知失败', err)
  }
}

export async function updateWidget(payload) {
  if (!FocusStatusPlugin) return
  try {
    await FocusStatusPlugin.updateWidget(payload)
  } catch (err) {
    console.warn('更新小组件失败', err)
  }
}

export function onFocusAction(listener) {
  if (!FocusStatusPlugin || typeof FocusStatusPlugin.addListener !== 'function') {
    return () => {}
  }
  const handle = FocusStatusPlugin.addListener('focusAction', listener)
  return () => handle.remove && handle.remove()
}
