import { Invoke } from './ipc-handler'
import { notify } from './misc/notify'
import { Version } from './storage'
import type { IUpdateCheck, IUpdateResult } from '@type/update.ts'

/**
 * 检查更新 / 更新前端页面。
 *
 * 干活的是 server：它去 GitHub 拿最新 Release 比对版本，也能把 Release 里的
 * page.zip 下载下来替换掉 page/ 文件夹（浏览器不参与下载）。
 * 这里只负责「调用 + 提示」，弹窗由调用方决定（设置里的按钮、启动时的自动检查）。
 * */
export const Update = {
  /** 最近一次检查的结果，调试用 */
  last: null as IUpdateCheck | null,

  /**
   * 检查更新。
   * @param silent 启动时的自动检查：没更新、检查失败都不打扰用户，开发模式下也不弹
   * @returns 有更新时返回结果，否则 null
   */
  async check(silent = false): Promise<IUpdateCheck | null> {
    let info: IUpdateCheck
    try {
      info = await Invoke('check-update', { frontend_version: Version.str })
    } catch (e) {
      console.warn('[update] 检查更新失败：', e)
      if (!silent) notify.error('检查更新失败：连不上 server')
      return null
    }
    this.last = info

    if (!info?.ok) {
      if (!silent) notify.error(info?.reason ?? '检查更新失败')
      return null
    }
    // 开发模式下版本号本来就是随手写的，自动检查不弹窗（手动点还是能看到）
    if (silent && info.dev) return null
    if (!info.has_frontend_update && !info.has_backend_update) {
      if (!silent) notify.success('已经是最新版本了')
      return null
    }
    return info
  },

  /**
   * 让 server 用最新 Release 里的 page.zip 替换 page/。
   *
   * 成功之后 server 会通过 websocket 推一条 frontend-updated，页面收到就刷新
   * （见 check-alive.ts）。这里再挂一个兜底刷新，免得推送那一路断了页面停在旧版本上。
   */
  async install(): Promise<IUpdateResult> {
    let r: IUpdateResult
    try {
      r = await Invoke('update-frontend', { frontend_version: Version.str })
    } catch (e) {
      return { ok: false, reason: `更新失败：${e instanceof Error ? e.message : String(e)}` }
    }
    // 换完 page/ 得重启 exe 才生效（启动时就没有 page/ 目录的情况），这时候别刷新
    if (r.ok && !r.restart_required) {
      setTimeout(() => location.reload(), 2500)
    }
    return r
  }
}
