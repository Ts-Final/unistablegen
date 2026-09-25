import fs from "node:fs"
import { file_paths } from "./file_path.js"
import type { IStorageScheme } from "../../type/settings.js"

/**
 * 读 charts/config.json（也就是前端 Storage 存的那份设置）。
 *
 * server 只有几处需要「启动前就知道」的设置（端口、浏览器路径），
 * 而这时候前端还没跑起来，所以这里直接读文件。
 * 每次调用都重新读，改完不用重启。
 * */

export function read_conf(): IStorageScheme | null {
  try {
    if (!fs.existsSync(file_paths.config)) return null
    // 去掉可能的 BOM
    const raw = fs.readFileSync(file_paths.config, "utf-8").replace(/^\uFEFF/, "")
    return JSON.parse(raw) as IStorageScheme
  } catch (e) {
    console.warn("[conf] 读取 charts/config.json 失败：", e)
    return null
  }
}

/** 设置里写的端口；没写或不合法的返回 null */
export function read_port(): number | null {
  const p = Number(read_conf()?.settings?.port)
  if (!Number.isInteger(p) || p < 1 || p > 65535) return null
  return p
}

/** 设置里写的浏览器路径；没写返回空串 */
export function read_browser_path(): string {
  const p = read_conf()?.settings?.browser_path
  return typeof p === "string" ? p.trim() : ""
}
