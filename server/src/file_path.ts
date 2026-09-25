import { dirname, join } from 'path'
import fsp from 'fs/promises'
import path, {basename, extname} from 'node:path'
import fs from 'fs'
import { createRequire } from 'node:module'

/*
 * 这里刻意**不写 import.meta.url**：
 * 打包用的是 esbuild --format=cjs，那个模式下 import.meta 会被置空（esbuild 会警告并给 undefined），
 * 而直接写 __dirname/__filename 在开发时的 ESM（tsx 跑源码）里又会 ReferenceError，
 * 所以用 typeof 探测 —— 两种运行方式都能拿到，拿不到就走兜底。
 * */
const HERE_FILE = typeof __filename === 'string' ? __filename : ''
const HERE_DIR = typeof __dirname === 'string' ? __dirname : process.cwd()

/** 需要一个「当前文件」的 URL 才能 createRequire 时用（ESM 下 __filename 为空） */
function here_url() {
  return HERE_FILE
    ? new URL(`file://${HERE_FILE.replace(/\\/g, '/')}`).href
    : `file:///${process.cwd().replace(/\\/g, '/')}/noop.js`
}

/**
 * 是否在开发模式下。
 *
 * 开发时源码是被 tsx 直接执行的（.ts），打包后跑的是产物（.js / 单文件 bundle），
 * 所以看自己的后缀就够了；需要强制指定时用 UNI_DEV=1 / UNI_DEV=0。
 * */
export const IS_DEV =
  process.env.UNI_DEV !== undefined
    ? process.env.UNI_DEV === '1'
    : HERE_FILE
      ? extname(HERE_FILE) === '.ts'
      : true

/**
 * 从 start 往上找，直到找到含 server/package.json 的目录（即项目根）。
 * 开发时 start 是 server/src，打包后层级不一样，靠找标记比数 `../` 稳。
 */
function find_project_root(start: string): string {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(join(dir, 'server', 'package.json'))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  console.warn('[file_path] 没找到项目根，退回起点：', start)
  return start
}

export const PROJECT_ROOT = find_project_root(HERE_DIR)

/**
 * 是不是「打包出来的可执行文件」在跑（而不是开发时的 node + tsx）。
 *
 * 三种信号任意一个命中就算：
 * - 传统 pkg 模式会在 process 上挂 pkg；
 * - Node 官方 SEA（pkg 的 --sea 模式走这条）用 sea.isSea()；
 * - 兜底：可执行文件不叫 node —— 开发时是 node.exe 跑 tsx，打包后是 unistablegen.exe。
 * */
function detect_packaged(): boolean {
  if ((process as unknown as { pkg?: unknown }).pkg) return true
  try {
    // 用 createRequire 拿 node:sea，老版本 Node 上拿不到就跳过
    const req = createRequire(here_url())
    const sea = req("node:sea") as { isSea?: () => boolean }
    if (sea?.isSea?.()) return true
  } catch {
    /* 没有 node:sea 模块就算了 */
  }
  const exe = basename(process.execPath).toLowerCase()
  return exe !== "node" && exe !== "node.exe"
}

export const IS_PACKAGED = detect_packaged()

/**
 * 运行时的根目录。
 * - 开发时：项目根（靠 server/package.json 找出来的那个）
 * - 打包后：exe 所在目录 —— charts / skin / external / page 都在 exe 旁边
 * */
const RUN_ROOT = IS_PACKAGED ? dirname(process.execPath) : PROJECT_ROOT

function get_base_path(to_be_join: string) {
  if (process.env.UNI_BASE) return join(process.env.UNI_BASE, to_be_join)
  return join(RUN_ROOT, to_be_join)
}

/** 图片后缀（贴图的后缀不确定，需要靠 find 找出来） */
export const IMG_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
/** 音频后缀 */
export const AUDIO_EXT = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac']

/**
 * @param p base path of the dir
 * @param name img name
 * @returns string the basename "xx.png" of the file, remember to join the P
 */
export function find_png(p: string, name: string) {
  return fs.readdirSync(p).find((f) => {
    return basename(f).includes(name) && IMG_EXT.includes(extname(f).toLowerCase())
  })
}

/**
 * 找一个资源文件（后缀未知）。
 * 优先精确匹配 `name.ext`，其次 `name.xxx.ext`（如 note@2x.png），
 * 最后才退化成包含匹配 —— 这样 "note" 不会被 "exnote.png" 抢走。
 * @param p 目录
 * @param name 不带后缀的资源名
 * @param exts 允许的后缀
 * @returns 命中文件的 basename，没有则 undefined
 */
export function find_asset(p: string, name: string, exts: string[] = IMG_EXT) {
  if (!fs.existsSync(p)) return undefined
  const files = fs.readdirSync(p).filter((f) => exts.includes(extname(f).toLowerCase()))
  const lower = name.toLowerCase()
  const stem = (f: string) => basename(f, extname(f)).toLowerCase()
  return (
    files.find((f) => stem(f) === lower) ??
    files.find((f) => stem(f).startsWith(lower)) ??
    files.find((f) => stem(f).includes(lower))
  )
}

/**
 * 在目录里找任意后缀的音频文件。
 * 谱面文件夹里通常只有一个音频，所以优先直接取第一个音频；
 * 若有多个则优先包含 audio/song 的名字。
 */
export function find_audio(p: string) {
  if (!fs.existsSync(p)) return undefined
  const files = fs.readdirSync(p).filter((f) => AUDIO_EXT.includes(extname(f).toLowerCase()))
  if (files.length <= 1) return files[0]
  return (
    files.find((f) => /audio|song|music/i.test(f)) ??
    files.find((f) => !/instr|off?voc/i.test(f)) ??
    files[0]
  )
}

export const file_paths = {
  skin: get_base_path('skin'),
  config: get_base_path('charts/config.json'),
  charts: get_base_path('charts'),
  /** 谱面索引，第一次启动时自动创建 */
  charts_index: get_base_path('charts/charts.json'),
  /** 前端打包产物（index.html + assets），打包后由 server 直接返回 */
  page: get_base_path('page'),
  module: get_base_path(''),
  external: get_base_path('external')
}

export async function folder_size(folderPath: string): Promise<number> {
  const entries = await fsp.readdir(folderPath, { withFileTypes: true })

  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(folderPath, entry.name)

      // 跳过符号链接
      if (entry.isSymbolicLink()) return 0

      if (entry.isDirectory()) {
        return folder_size(fullPath)
      }

      if (entry.isFile()) {
        const stats = await fsp.stat(fullPath)
        return stats.size
      }

      // 忽略其他类型（如 socket、FIFO 等）
      return 0
    })
  )

  return sizes.reduce((sum, size) => sum + size, 0)
}

function ensure_path(p: string) {
  const resolvedPath = path.resolve(p)
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true })
  }
}

ensure_path(file_paths.skin)
ensure_path(file_paths.charts)
ensure_path(file_paths.external)
