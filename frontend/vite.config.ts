import vue from "@vitejs/plugin-vue"
import {defineConfig} from "vite"
import { resolve } from 'node:path'

/**
 * 后端代理。
 * 注意 server 与 preview 都要配 —— 只配 server.proxy 的话，
 * `vite preview` 会把 /api/* 当成静态路径，SPA 回退返回 index.html（200 + HTML），
 * 前端拿到的就不是 JSON 了。
 */
const proxy = {
  "/api": {
    target: "http://localhost:3000/api",       // 后端服务地址
    changeOrigin: true,                     // 修改请求头 Host 为目标地址
    rewrite: (path: string) => path.replace(/^\/api/, ""), // 路径重写，去掉 /api 前缀
    secure: true,                          // 允许代理到 HTTPS 且证书无效的后端
    ws: true,                               // 是否代理 WebSocket
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: { proxy },
  preview: { proxy },
  build: {
    // 打包 exe 时页面要放在 unistablegen.exe 旁边：build/page/index.html
    outDir: '../build/page',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@core": resolve(import.meta.dirname, "./src/core"),
      "@components": resolve(import.meta.dirname, "./src/components"),
      "@type": resolve(import.meta.dirname, "../type"),
    }
  }
})
