/*
* Here for the mechanics of keep-alive.
* The server will check whether there's a client using this server, and if not, terminate this process
* to release application.
* We implement this by using websocket.
*
* 开发模式下不做这件事（keep_alive = false）：HMR / 刷新页面会让 websocket 断一下，
* 断开 2 秒就把进程退掉的话 dev server 会莫名其妙消失。
* 此时连接照收（前端不会报错），只是不再因为断开而退出，进程交给开发者 Ctrl+C。
* */

import {Server} from "http"
import {WebSocketServer} from "ws"
import {exit} from "node:process"

let disconnectTimer: NodeJS.Timeout | null = null

export function initAliveWS(server: Server, keep_alive = true) {
  const wss = new WebSocketServer({server})
  wss.on("connection", (ws) => {
    console.log("ws-connect")
    if (disconnectTimer) {
      clearTimeout(disconnectTimer)
      console.log("reconnected")
      disconnectTimer = null
    }

    ws.on("error", () => ws.close())

    if (!keep_alive) {
      ws.on("close", () => console.log("ws disconnected（开发模式：不退出）"))
      return
    }

    ws.on("close", () => {
      console.log("ws disconnected")
      disconnectTimer = setTimeout(() => {
        console.log("disconnected, shutting down")
        server.close()
        exit(0)
      }, 2000)
    })
  })
}