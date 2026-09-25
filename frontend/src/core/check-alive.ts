import { notify } from './misc/notify'
import type { IServerSocketMessage } from '@type/update.ts'

/**
 * keep-alive 用的 websocket（server 靠它判断还有没有前端连着，没前端就自己退出）。
 *
 * 顺便当成 server -> 前端的推送通道：server 把 page/ 换成新版本之后会推一条
 * frontend-updated 过来，这里收到就刷新页面（对应新的前端代码）。
 * */
export const CheckAlive = {
  alive: true,
  last_check: Date.now(),
  ws: null as WebSocket | null,
  /** 重连次数，用来算退避时间 */
  retry: 0,

  start() {
    const ws = new WebSocket(`ws://${window.location.host}/api`)
    this.ws = ws
    ws.onopen = () => {
      console.log('Connection opened')
      this.alive = true
      this.retry = 0
    }
    ws.onmessage = (ev: MessageEvent) => this.on_message(ev.data)
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      this.alive = false
      this.ws = null
      // 更新页面 / 重启 server 都会断一下，退避重连（最多 10 秒一次）
      const delay = Math.min(1000 * 2 ** this.retry, 10_000)
      this.retry++
      setTimeout(() => this.start(), delay)
    }
  },

  on_message(raw: unknown) {
    if (typeof raw !== 'string') return
    let msg: IServerSocketMessage
    try {
      msg = JSON.parse(raw) as IServerSocketMessage
    } catch {
      return
    }
    if (msg?.type === 'frontend-updated') {
      notify.success(`前端页面已更新${msg.version ? `到 ${msg.version}` : ''}，正在刷新…`)
      setTimeout(() => location.reload(), 600)
    }
  }
}
