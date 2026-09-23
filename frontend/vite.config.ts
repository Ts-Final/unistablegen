import vue from "@vitejs/plugin-vue"
import {defineConfig} from "vite"
import { resolve } from 'node:path'
// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 带选项的完整写法
      "/api": {
        target: "http://localhost:3000/api",       // 后端服务地址
        changeOrigin: true,                     // 修改请求头 Host 为目标地址
        rewrite: (path) => path.replace(/^\/api/, ""), // 路径重写，去掉 /api 前缀
        secure: true,                          // 允许代理到 HTTPS 且证书无效的后端
        ws: true,                               // 是否代理 WebSocket
      },
    },
  },
  resolve: {
    alias: {
      "@core": resolve(import.meta.dirname, "./src/core"),
      "@components": resolve(import.meta.dirname, "./src/core"),
      "@type": resolve(import.meta.dirname, "../type"),
    }
  }
})
