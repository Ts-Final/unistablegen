import fs from "node:fs"
import path from "node:path"
import { file_paths, PROJECT_ROOT } from "./file_path.js"

/**
 * server 自己的版本号（检查更新时和 Release 里的服务端版本比）。
 *
 * 打包成 exe 之后 server/package.json 并不在 exe 旁边，读不到文件，
 * 所以构建时由 esbuild 的 define 把版本号直接写进 bundle（见 scripts/bundle.mjs）。
 * 开发时（tsx 直接跑源码）没有这个常量，就从 server/package.json 读。
 *
 * 用 typeof 探测而不是直接引用：开发时那个标识符根本不存在，
 * 直接引用会 ReferenceError（file_path.ts 里的 __dirname 也是同样的处理）。
 * */
declare const __UNI_SERVER_VERSION__: string | undefined

function from_package_json(): string | null {
  // UNI_BASE 会把 file_paths.module 挪走，所以两个地方都找一遍
  for (const root of [file_paths.module, PROJECT_ROOT]) {
    const file = path.join(root, "server", "package.json")
    try {
      if (!fs.existsSync(file)) continue
      const version = (JSON.parse(fs.readFileSync(file, "utf-8")) as { version?: string }).version
      if (typeof version === "string" && version) return version
    } catch (e) {
      console.warn(`[version] 读 ${file} 失败：`, e)
    }
  }
  return null
}

export const SERVER_VERSION: string = (() => {
  if (typeof __UNI_SERVER_VERSION__ === "string" && __UNI_SERVER_VERSION__) {
    return __UNI_SERVER_VERSION__
  }
  return from_package_json() ?? "0.0.0"
})()
