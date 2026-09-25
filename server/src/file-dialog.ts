import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export interface IFileDialogOptions {
  title?: string
  /** 形如 [{ name: "音频", patterns: ["*.mp3", "*.ogg"] }]，只有 Windows 用得上 */
  filters?: { name: string; patterns: string[] }[]
}

/** 在系统文件管理器里打开一个目录 */
export function open_folder(p: string) {
  const cmd =
    process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open"
  try {
    // detached + stdio:ignore，避免占用管道
    spawn(cmd, [p], { detached: true, stdio: "ignore" }).unref()
  } catch (e) {
    console.error("打开目录失败：", e)
  }
}

/** 在系统文件管理器里定位到某个文件（对应 sv 的 shell.showItemInFolder） */
export function show_in_folder(file: string) {
  const target = path.normalize(path.resolve(file))
  try {
    if (process.platform === "win32") {
      if (!fs.existsSync(target)) console.warn(`[file-dialog] 要定位的文件不存在：${target}`)
      /*
       * explorer 的写法必须严格是 /select,"路径"（引号只包住路径，逗号后不能有空格）。
       *
       * 以前是把 "/select," + 路径 作为**一个** argv 传进去：路径里没有空格时没事，
       * 一旦带空格（比如谱面 id 叫 "Fixations Toward the Stars"）Node 就会把整个参数
       * 连 /select 一起包成 "...",explorer 解析不了这个开关，于是退回去打开「文档」。
       * 所以这里自己拼好带引号的完整参数，并关掉 Node 的转义（windowsVerbatimArguments）。
       * */
      spawn("explorer.exe", [`/select,"${target}"`], {
        detached: true,
        stdio: "ignore",
        windowsVerbatimArguments: true
      }).unref()
    } else if (process.platform === "darwin") {
      spawn("open", ["-R", target], { detached: true, stdio: "ignore" }).unref()
    } else {
      open_folder(path.dirname(target))
    }
  } catch (e) {
    console.error("定位文件失败：", e)
  }
}

const AUDIO_FILTER = [{ name: "音频", patterns: ["*.mp3", "*.ogg", "*.wav", "*.m4a", "*.flac", "*.aac"] }]

function ps_quote(v: string) {
  return `'${v.replace(/'/g, "''")}'`
}

/**
 * 弹系统原生的文件选择框，返回选中的绝对路径；用户取消则返回 null。
 *
 * 之所以要弹原生框而不是让浏览器上传：这是 sv 的做法
 * （Electron 主进程 dialog.showOpenDialog），而且 server 已经有文件权限，
 * 直接复制比走一遍上传快得多。
 *
 * Windows 用 PowerShell + System.Windows.Forms，macOS 用 osascript，Linux 用 zenity。
 */
export function ask_file(options: IFileDialogOptions = {}): Promise<string | null> {
  const title = options.title ?? "选择文件"
  const filters = options.filters?.length ? options.filters : AUDIO_FILTER

  if (process.platform === "win32") return ask_file_windows(title, filters)
  if (process.platform === "darwin") return ask_file_macos(title, filters)
  return ask_file_linux(title, filters)
}

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      windowsHide: true
    })
    let out = ""
    let err = ""
    child.stdout?.on("data", (d) => (out += d.toString()))
    child.stderr?.on("data", (d) => (err += d.toString()))
    child.on("error", (e) => reject(new Error(`无法启动 ${cmd}：${e.message}`)))
    child.on("close", () => {
      const p = out.trim()
      if (!p) {
        // 取消时退出码通常是非 0，这里不算错误
        if (err.trim()) console.warn(`[file-dialog] ${cmd}: ${err.trim()}`)
        return resolve(null)
      }
      resolve(p)
    })
  })
}

/** Windows：PowerShell + WinForms。标题/过滤通过环境变量传进去，避免转义地狱。 */
function ask_file_windows(
  title: string,
  filters: { name: string; patterns: string[] }[]
): Promise<string | null> {
  const filter = filters.map((f) => `${f.name}|${f.patterns.join(";")}`).join("|") + "|所有文件|*.*"
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
    "$dlg = New-Object System.Windows.Forms.OpenFileDialog",
    "$dlg.Title = $env:UNI_DLG_TITLE",
    "$dlg.Filter = $env:UNI_DLG_FILTER",
    "$dlg.Multiselect = $false",
    // 没有 owner 的话对话框可能被压在别的窗口后面
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.TopMost = $true",
    "$owner.ShowInTaskbar = $false",
    "$owner.WindowState = 'Minimized'",
    "try {",
    "  if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {",
    "    [Console]::Out.Write($dlg.FileName)",
    "  }",
    "} finally { $owner.Dispose() }"
  ].join("\n")

  return run("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
    UNI_DLG_TITLE: title,
    UNI_DLG_FILTER: filter
  })
}

/** macOS：osascript 的 choose file */
function ask_file_macos(
  title: string,
  filters: { name: string; patterns: string[] }[]
): Promise<string | null> {
  const types = filters
    .flatMap((f) => f.patterns)
    .map((p) => p.replace(/^\*\./, ""))
    .map((t) => `"${t}"`)
    .join(", ")
  const script = `POSIX path of (choose file with prompt ${ps_quote(title)} of type {${types}})`
  return run("osascript", ["-e", script])
}

/** Linux：zenity（没装就报错，让用户改用别的） */
function ask_file_linux(
  title: string,
  filters: { name: string; patterns: string[] }[]
): Promise<string | null> {
  const args = ["--file-selection", `--title=${title}`]
  for (const f of filters) {
    args.push(`--file-filter=${f.name} | ${f.patterns.join(" ")}`)
  }
  return run("zenity", args)
}
