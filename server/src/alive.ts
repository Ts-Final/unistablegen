/*
* Here for the mechanics of keep-alive.
* The server will check whether there's a client using this server, and if not, terminate this process
* to release application.
* We implement this by using websocket.
*
* 开发模式下不做这件事（keep_alive = false）：HMR / 刷新页面会让 websocket 断一下，
* 断开 2 秒就把进程退掉的话 dev server 会莫名其妙消失。
* 此时连接照收（前端不会报错），只是不再因为断开而退出，进程交给开发者 Ctrl+C。
*
* 这条连接顺便当成 server -> 前端的推送通道：前端页面更新完之后
* server 用 broadcast() 通知所有开着的页面刷新（见 updater.ts / api.ts）。
* */

import {Server} from "http"
import {WebSocketServer, WebSocket} from "ws"
import {exit} from "node:process"

/** 现在连着的前端。keep-alive 判定和 broadcast() 都用它 */
const clients = new Set<WebSocket>()

let disconnectTimer: NodeJS.Timeout | null = null

export function initAliveWS(server: Server, keep_alive = true) {
  const wss = new WebSocketServer({server})
  wss.on("connection", (ws) => {
    console.log("ws-connect")
    clients.add(ws)
    if (disconnectTimer) {
      clearTimeout(disconnectTimer)
      console.log("reconnected")
      disconnectTimer = null
    }

    ws.on("error", () => ws.close())

    ws.on("close", () => {
      clients.delete(ws)
      if (!keep_alive) {
        console.log("ws disconnected（开发模式：不退出）")
        return
      }
      // 还有别的页面连着就不算断线（多开标签页 / 更新页面时的瞬时重连）
      if (clients.size > 0) return
      console.log("ws disconnected")
      disconnectTimer = setTimeout(() => {
        console.log("disconnected, shutting down")
        server.close()
        exit(0)
      }, 2000)
    })
  })
}

/**
 * 给所有连着的前端推一条消息（对象会被 JSON 序列化）。
 * @returns 实际发出去的连接数
 * */
export function broadcast(message: unknown): number {
  const text = typeof message === "string" ? message : JSON.stringify(message)
  let sent = 0
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue
    try {
      ws.send(text)
      sent++
    } catch (e) {
      console.warn("[alive] 推送失败：", e)
    }
  }
  return sent
}
