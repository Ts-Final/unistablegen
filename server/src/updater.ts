import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { file_paths, IS_DEV } from "./file_path.js"
import { SERVER_VERSION } from "./version.js"
import { log_error, short_error } from "./log.js"
import type { IUpdateCheck, IUpdateResult, IVersionPair } from "../../type/update.js"

/**
 * 检查更新 / 更新前端页面。
 *
 * 版本信息全在 Release 里（见 .github/workflows/release.yml）：
 *   tag     v<前端>-<服务端>   例如 v0.1.0-1.0.0
 *   标题    v<前端>/<服务端>   例如 v0.1.0/1.0.0
 *   产物    page.zip / unistablegen.exe
 *
 * 「更新前端」是**在 server 这边**做的：下载 page.zip -> 解压 -> 整目录替换 page/。
 * 之所以不让浏览器下载再上传：这个 server 本来就有文件权限，直接落盘最省事，
 * 而且换完可以让 server 自己给所有开着的页面推一条刷新通知。
 * */

/** 从哪个仓库拿 Release（fork 出去的话设 UNI_UPDATE_REPO=owner/repo 就行） */
const REPO = process.env.UNI_UPDATE_REPO || "Ts-Final/unistablegen"
/** GitHub 的地址。留了个口子方便本地起个假接口测整条更新流程 */
const API_BASE = (process.env.UNI_UPDATE_API || "https://api.github.com").replace(/\/+$/, "")
const LATEST_API = `${API_BASE}/repos/${REPO}/releases/latest`

/** 查一次的超时(ms) */
const CHECK_TIMEOUT = 20_000
/** 下载 page.zip 的超时(ms) */
const DOWNLOAD_TIMEOUT = 120_000
/** 检查结果的缓存时间(ms)：GitHub 未登录只有 60 次/小时的额度 */
const CACHE_MS = 5 * 60_000

/** 临时文件都带这个前缀，出事了也好认 */
const TMP_PREFIX = ".uni-update-"

const PAGE_ZIP = "page.zip"
const EXE_NAME = "unistablegen.exe"

/** GitHub release 里我们用到的字段 */
interface IGithubAsset {
  name: string
  browser_download_url: string
}

interface IGithubRelease {
  tag_name?: string
  name?: string
  html_url?: string
  assets?: IGithubAsset[]
}

let cache: { at: number; frontend: string; data: IUpdateCheck } | null = null
/** 同一时间只允许跑一个更新 */
let installing = false

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 版本号切成 3 段数字。
 *
 * 只取前 3 段是有意的：版本号没变时 Release 的 tag 会补一个构建号后缀
 * （v0.1.0-1.0.0.42），那个后缀不该被当成「服务端 1.0.0.42 > 本地 1.0.0」。
 * */
function version_parts(v: string): number[] {
  const parts = String(v)
    .split(".")
    .map((s) => Number(s) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** a > b 返回 1，a < b 返回 -1，相等返回 0 */
function compare_version(a: string, b: string): number {
  const pa = version_parts(a)
  const pb = version_parts(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1
  }
  return 0
}

/** 统一成 x.y.z 三段，方便显示 */
function normalize_version(v: string): string {
  return version_parts(v).join(".")
}

/**
 * 从标题 / tag 里解析出前后端两个版本号。
 * 标题（0.1.0/1.0.0）优先，认不出来再看 tag（0.1.0-1.0.0）。
 */
function parse_versions(...texts: (string | undefined)[]): IVersionPair | null {
  const num = "\\d+(?:\\.\\d+)*"
  for (const text of texts) {
    if (!text) continue
    const t = text.trim().replace(/^v/i, "")
    const slash = new RegExp(`^(${num})\\s*/\\s*(${num})`).exec(t)
    if (slash) return { frontend: normalize_version(slash[1]), server: normalize_version(slash[2]) }
    const dash = new RegExp(`^(${num})-(${num})`).exec(t)
    if (dash) return { frontend: normalize_version(dash[1]), server: normalize_version(dash[2]) }
  }
  return null
}

/**
 * 查最新 Release 并和本地版本比对。
 * @param frontend_version 页面自己报上来的版本（前端源码里的 Version.str）
 */
export async function check_update(frontend_version: string): Promise<IUpdateCheck> {
  const now = Date.now()
  if (cache && cache.frontend === frontend_version && now - cache.at < CACHE_MS) return cache.data
  const data = await fetch_latest(frontend_version)
  // 只缓存成功的结果：网络抖一下不该让用户五分钟内都看不到更新
  if (data.ok) cache = { at: now, frontend: frontend_version, data }
  return data
}

async function fetch_latest(frontend_version: string): Promise<IUpdateCheck> {
  const current: IVersionPair = {
    frontend: frontend_version || "0.0.0",
    server: SERVER_VERSION
  }

  const fail = (reason: string): IUpdateCheck => ({
    ok: false,
    reason,
    dev: IS_DEV,
    current,
    latest: null,
    has_frontend_update: false,
    has_backend_update: false,
    can_update_frontend: false,
    checked_at: Date.now()
  })

  let res: Response
  try {
    res = await fetch(LATEST_API, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "unistablegen",
        "x-github-api-version": "2022-11-28"
      },
      signal: AbortSignal.timeout(CHECK_TIMEOUT)
    })
  } catch (e) {
    // fetch 失败只有一句 "fetch failed"，真正的原因在 cause 里，别丢了
    log_error("update", e, { step: "check-update", url: LATEST_API })
    return fail(`连不上 GitHub：${short_error(e)}`)
  }

  if (res.status === 404) return fail("仓库里还没有发布任何 Release")
  if (!res.ok) {
    const hint = res.status === 403 ? "（可能是未登录调用次数用完了）" : ""
    return fail(`GitHub 接口返回 ${res.status}${hint}，稍后再试`)
  }

  let release: IGithubRelease
  try {
    release = (await res.json()) as IGithubRelease
  } catch (e) {
    return fail(`解析 GitHub 返回的内容失败：${msg(e)}`)
  }

  const latest = parse_versions(release.name, release.tag_name)
  if (!latest) return fail(`认不出这个 Release 的版本号（tag: ${release.tag_name ?? "?"}）`)

  const assets = release.assets ?? []
  const pick = (exact: string, ext: string) =>
    assets.find((a) => a.name.toLowerCase() === exact) ?? assets.find((a) => a.name.toLowerCase().endsWith(ext))
  const page = pick(PAGE_ZIP, ".zip")
  const exe = pick(EXE_NAME, ".exe")

  // 「有更新」= Release 里带了这个产物 + 发布时的版本比本地新
  const has_frontend_update = !!page && compare_version(latest.frontend, current.frontend) > 0
  const has_backend_update = !!exe && compare_version(latest.server, current.server) > 0

  console.log(
    `[update] 最新 ${latest.frontend}/${latest.server}，本地 ${current.frontend}/${current.server}` +
      `（前端可更新=${has_frontend_update} 后端可更新=${has_backend_update}）`
  )

  return {
    ok: true,
    dev: IS_DEV,
    current,
    latest,
    tag: release.tag_name,
    release_url: release.html_url,
    has_frontend_update,
    has_backend_update,
    // 后端也新的时候不允许只换 page/：新前端可能用到新 exe 才有的 api
    can_update_frontend: has_frontend_update && !has_backend_update,
    page_url: page?.browser_download_url,
    checked_at: Date.now()
  }
}

/**
 * 下载 Release 里的 page.zip 并就地替换 page/ 文件夹。
 *
 * 步骤：下载到 page 旁边的临时文件 -> 解压到临时目录 -> 目录改名换上去 -> 清理。
 * 全程都在同一个父目录里改名，失败时把旧目录换回去，不会出现「page/ 没了」的中间态。
 */
export async function install_frontend_update(frontend_version: string): Promise<IUpdateResult> {
  if (installing) return { ok: false, reason: "已经有一个更新在进行中了" }
  installing = true
  try {
    const from = frontend_version || "0.0.0"
    const info = await check_update(from)
    if (!info.ok) return { ok: false, reason: info.reason }
    if (info.has_backend_update) {
      return {
        ok: false,
        reason: "这个版本同时更新了服务端，只换 page/ 会因为缺少新接口而出错：请去 GitHub 下载新的 unistablegen.exe"
      }
    }
    if (!info.has_frontend_update || !info.page_url) return { ok: false, reason: "现在没有可以更新的前端页面" }

    // 更新前就找不到 index.html 的话，index.ts 的静态服务根本没挂上，换完也得重启才生效
    const had_page = fs.existsSync(path.join(file_paths.page, "index.html"))

    const parent = path.dirname(file_paths.page)
    const stamp = Date.now()
    const zip = path.join(parent, `${TMP_PREFIX}${stamp}.zip`)
    const work = path.join(parent, `${TMP_PREFIX}${stamp}`)
    const backup = path.join(parent, `page.old-${stamp}`)

    try {
      await fsp.mkdir(work, { recursive: true })
      console.log(`[update] 下载 ${info.page_url}`)
      await download(info.page_url, zip)
      await expand_zip(zip, work)

      const src = find_page_root(work)
      if (!src) throw new Error("解压之后没找到 index.html，这个压缩包不对")

      await swap_dir(src, file_paths.page, backup)
      console.log(`[update] page/ 已更新：${info.latest?.frontend}（旧目录 ${backup}）`)

      // 旧的备份删不掉也无所谓，下次更新会再生成一个
      await fsp.rm(backup, { recursive: true, force: true }).catch((e) => {
        console.warn(`[update] 删不掉旧页面目录 ${backup}：`, e)
      })

      return {
        ok: true,
        version: info.latest?.frontend,
        from,
        restart_required: !had_page
      }
    } finally {
      await fsp.rm(work, { recursive: true, force: true }).catch(() => {})
      await fsp.rm(zip, { force: true }).catch(() => {})
    }
  } catch (e) {
    // 解压 / 换目录 / 落盘出错都走这里，cause 链一起打到 CLI 上
    log_error("update", e, { step: "install-frontend", page: file_paths.page })
    return { ok: false, reason: `更新失败：${short_error(e)}` }
  } finally {
    installing = false
  }
}

/** 下载到文件（先落到临时文件，成功了才改名，避免半截文件被当成 zip） */
async function download(url: string, dest: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "unistablegen" },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT)
    })
  } catch (e) {
    // 这里抛出去会被 install 那边再记一次（信息更全），所以这里只把错因带进 message
    log_error("update", e, { step: "download", url })
    throw new Error(`下载 page.zip 失败：${short_error(e)}`)
  }
  if (!res.ok || !res.body) throw new Error(`下载 page.zip 失败：HTTP ${res.status}`)

  const part = `${dest}.part`
  try {
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(part))
    const size = (await fsp.stat(part)).size
    // 空 zip 也有 22 字节，比这个还小肯定不是压缩包
    if (size < 64) throw new Error(`下载下来的文件只有 ${size} 字节`)
    const head = await read_head(part, 2)
    // "PK"：确认拿到的是 zip，而不是 GitHub 的错误页
    if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error("下载下来的不是 zip")
    await fsp.rename(part, dest)
  } catch (e) {
    await fsp.rm(part, { force: true }).catch(() => {})
    throw e
  }
}

async function read_head(file: string, length: number): Promise<Buffer> {
  const fd = await fsp.open(file, "r")
  try {
    const buf = Buffer.alloc(length)
    await fd.read(buf, 0, length, 0)
    return buf
  } finally {
    await fd.close()
  }
}

/**
 * 解压 zip。
 *
 * Windows 用系统自带的 PowerShell Expand-Archive（file-dialog.ts 也是这么弹原生框的）：
 * 为一个解压引第三方包不划算，打包成 exe 之后还多一份「快照里找不到包」的风险。
 */
function expand_zip(zip: string, dest: string): Promise<void> {
  if (process.platform === "win32") {
    // 路径通过环境变量传，避免引号/转义问题
    return run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:UNI_ZIP -DestinationPath $env:UNI_DEST -Force"
    ], { UNI_ZIP: zip, UNI_DEST: dest })
  }
  // 非 Windows 只是给开发用，有 unzip 就行
  return run("unzip", ["-o", "-q", zip, "-d", dest])
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true })
    let err = ""
    child.stderr?.on("data", (d) => (err += d.toString()))
    child.on("error", (e) => reject(new Error(`无法启动 ${cmd}：${e.message}`)))
    child.on("close", (code) => {
      if (code === 0) return resolve()
      reject(new Error(`${cmd} 退出码 ${code}${err.trim() ? `：${err.trim()}` : ""}`))
    })
  })
}

/**
 * 找解压出来的页面根目录（含 index.html 的那一层）。
 * page.zip 是 `Compress-Archive -Path build/page` 打的，所以正常是 <work>/page。
 */
function find_page_root(dir: string): string | null {
  const direct = [dir, path.join(dir, "page")]
  for (const c of direct) {
    if (fs.existsSync(path.join(c, "index.html"))) return c
  }
  // 换个打包方式也能认出来：往下找一层
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const c = path.join(dir, entry.name)
    if (fs.existsSync(path.join(c, "index.html"))) return c
  }
  return null
}

/** 把 src 换成 target，旧的先挪到 backup；失败就把旧的换回去 */
async function swap_dir(src: string, target: string, backup: string): Promise<void> {
  const had_target = fs.existsSync(target)
  if (had_target) await fsp.rename(target, backup)
  try {
    await fsp.rename(src, target)
  } catch (e) {
    if (had_target && !fs.existsSync(target)) {
      await fsp.rename(backup, target).catch((e2) => {
        console.error(`[update] 换回去也失败了，page/ 现在是缺的（备份在 ${backup}）：`, e2)
      })
    }
    throw e
  }
}
