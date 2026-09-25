import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { IS_PACKAGED } from "./file_path.js"

/**
 * 崩溃兜底。
 *
 * 打包成 exe 之后是双击运行的：进程一退出，控制台窗口就跟着关掉，
 * 错误信息根本来不及看。所以这里统一处理「未捕获异常 / 未处理的 Promise 拒绝」，
 * 做法是：打印 -> 追加写一份 crash.log -> 等用户按回车 -> 再退出。
 *
 * 开发时（终端是 IDE/命令行开着的那种）不做等待，stack 直接就在终端里。
 * */

/** 等按键的最长时间，避免没有 stdin 时卡死 */
const HOLD_MS = 5 * 60_000

function format_error(e: unknown): string {
  if (e instanceof Error) return e.stack ?? `${e.name}: ${e.message}`
  if (typeof e === "string") return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/** 把崩溃信息追加到 exe 同目录的 crash.log，返回文件路径（写不了就返回 null） */
function write_crash_log(text: string): string | null {
  try {
    const file = path.join(path.dirname(process.execPath), "crash.log")
    fs.appendFileSync(file, `\n===== ${new Date().toISOString()} =====\n${text}\n`, "utf-8")
    return file
  } catch (e) {
    console.error("[crash] 写 crash.log 失败：", e)
    return null
  }
}

/** 等用户按一下回车（只有打包运行、而且真的挂着控制台时才等） */
async function hold_console() {
  if (!IS_PACKAGED) return
  if (!process.stdin.isTTY) return
  console.error("\n按回车键退出…")
  await new Promise<void>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin })
    const done = () => {
      rl.close()
      resolve()
    }
    rl.once("line", done)
    // 兜底：一直没人按键也别真的挂住
    setTimeout(done, HOLD_MS).unref()
  })
}

/**
 * 崩溃处理：打印 + 记日志 + 等按键 + 退出。
 * 启动时出错（比如端口被占）也可以直接调它。
 * @param kind 出错来源，比如 uncaughtException / EADDRINUSE
 */
export async function crash(kind: string, e: unknown): Promise<never> {
  const text = `[${kind}] ${format_error(e)}`
  console.error(`\n💥 ${text}`)
  if (IS_PACKAGED) {
    const log = write_crash_log(text)
    if (log) console.error(`（已写入 ${log}）`)
  }
  await hold_console()
  process.exit(1)
}

/** 挂上全局兜底（未捕获异常 / 未处理的 Promise 拒绝） */
export function install_crash_handlers() {
  process.on("uncaughtException", (e) => {
    void crash("uncaughtException", e)
  })
  process.on("unhandledRejection", (e) => {
    void crash("unhandledRejection", e)
  })
}
