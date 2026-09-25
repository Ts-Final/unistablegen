import { spawn } from "node:child_process"
import fs from "node:fs"
import { read_browser_path } from "./conf.js"
import { IS_DEV } from "./file_path.js"
import type { IBrowserLaunch } from "../../type/ipc.js"

/**
 * 打包成 exe 之后，server 启动时要自己把页面用浏览器打开。
 *
 * 浏览器取自 charts/config.json 里的 settings.browser_path：
 * - 留空 -> 系统默认浏览器；
 * - 填了但那个文件不存在（或起不来）-> 退回系统默认浏览器，
 *   并把说明记在 IBrowserLaunch.notice 里，前端启动时读 /api/browser-status 弹提示。
 * */

/** 最近一次启动浏览器的结果（/api/browser-status 会把它给前端） */
let last: IBrowserLaunch = { used: "default" }

export function browser_status(): IBrowserLaunch {
  return last
}

/** 开发时（tsx 跑源码）不自动开浏览器，否则每次重启都弹一个窗口 */
export function should_open_browser() {
  if (process.env.UNI_OPEN_BROWSER === "1") return true
  if (process.env.UNI_OPEN_BROWSER === "0") return false
  return !IS_DEV
}

/** 用系统默认浏览器打开（Windows 交给 explorer 走默认关联） */
function open_default(url: string) {
  const cmd =
    process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open"
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref()
  } catch (e) {
    console.error("[open-browser] 打开默认浏览器失败：", e)
  }
}

/**
 * 打开页面。
 * @param url 形如 http://localhost:3000/
 * @returns 本次用的浏览器（含给前端的提示）
 */
export function open_browser(url: string): IBrowserLaunch {
  const configured = read_browser_path()
  last = { used: "default", path: configured || undefined }

  if (configured) {
    let usable = false
    try {
      usable = fs.statSync(configured).isFile()
    } catch {
      usable = false
    }

    if (!usable) {
      last.notice = `设置里指定的浏览器用不了（找不到这个文件）：<br><code>${configured}</code><br>已经改用系统默认浏览器打开。`
      console.warn(`[open-browser] 找不到配置的浏览器：${configured}`)
    } else {
      try {
        const child = spawn(configured, [url], { detached: true, stdio: "ignore" })
        // spawn 的 ENOENT 是异步报的：真起不来就补一个默认浏览器
        child.on("error", (e) => {
          console.error("[open-browser] 启动配置的浏览器失败：", e)
          last = {
            used: "default",
            path: configured,
            notice: `设置里指定的浏览器启动失败：<br><code>${configured}</code><br>已经改用系统默认浏览器打开。`
          }
          open_default(url)
        })
        child.unref()
        last = { used: "configured", path: configured }
        console.log(`[open-browser] 用配置的浏览器打开：${configured}`)
        return last
      } catch (e) {
        last.notice = `设置里指定的浏览器启动失败：<br><code>${configured}</code><br>已经改用系统默认浏览器打开。`
        console.warn("[open-browser] 启动配置的浏览器失败：", e)
      }
    }
  }

  open_default(url)
  console.log(`[open-browser] 用系统默认浏览器打开：${url}`)
  return last
}
