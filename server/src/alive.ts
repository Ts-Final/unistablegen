/*
* Here for the mechanics of keep-alive.
* The server will check whether there's a client using this server, and if not, terminate this process
* to release application.
* We implement this by using websocket.
* */

import {Server} from "http"
import {WebSocketServer} from "ws"
import {exit} from "node:process"

let disconnectTimer: NodeJS.Timeout | null = null

export function initAliveWS(server: Server) {
  const wss = new WebSocketServer({server})
  wss.on("connection", (ws) => {
    console.log("ws-connect")
    if (disconnectTimer) {
      clearTimeout(disconnectTimer)
      console.log("reconnected")
      disconnectTimer = null
    }
    
    ws.on("close", () => {
      console.log("ws disconnected")
      disconnectTimer = setTimeout(() => {
        console.log("disconnected, shutting down")
        server.close()
        exit(0)
      }, 2000)
    })
    
    ws.on("error", () => ws.close())
  })
}