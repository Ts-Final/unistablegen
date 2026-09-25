import path from "node:path"
import fs from "node:fs"
import { file_paths, find_audio, find_png, IMG_EXT } from "./file_path.js"
import { show_in_folder } from "./file-dialog.js"
import type {
  IChartSummary,
  IChartsIndex,
  IImportSongResult,
  IImportSpriteResult
} from "../../type/ipc.js"

const INDEX_VERSION = 1

/** id 必须是一个单纯的名字（不能带路径），其余字符不限 */
function is_safe_id(id: string) {
  return (
    id.length > 0 &&
    id !== "." &&
    id !== ".." &&
    path.basename(id) === id &&
    !id.includes("/") &&
    !id.includes("\\")
  )
}

/** 读文本并去掉可能的 BOM（Windows 上用 PowerShell 写的文件常带 BOM） */
function read_json(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8").replace(/^\uFEFF/, ""))
}

/**
 * 谱面文件管理。
 *
 * charts/ 目录下的结构与索引都归它管：
 *   charts/charts.json        谱面索引（第一次启动时自动创建）
 *   charts/<id>/chart.json    谱面数据(INotes.final)
 *   charts/<id>/xxx.mp3       音频
 *   charts/<id>/jacket.png    曲绘
 *
 * 索引不是唯一事实来源：每次 list() 都会对照磁盘自愈
 * （补齐新加的谱面、丢掉已删除的谱面）。
 * */
export class ChartManager {
  readonly charts_folder: string
  readonly index_path: string

  constructor() {
    this.charts_folder = file_paths.charts
    this.index_path = file_paths.charts_index
  }

  /** 目录里所有形如 charts/<id>/chart.json 的谱面 id */
  chart_ids(): string[] {
    if (!fs.existsSync(this.charts_folder)) return []
    return fs
      .readdirSync(this.charts_folder, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(this.charts_folder, d.name, "chart.json")))
      .map((d) => d.name)
  }

  /** 读取单个谱面并生成索引信息；谱面不存在返回 null */
  scan(id: string): IChartSummary | null {
    const json = path.join(this.charts_folder, id, "chart.json")
    if (!fs.existsSync(json)) return null
    let name = id
    let composer = ""
    let diffs: string[] = []
    try {
      const data = read_json(json) as {
        song?: { name?: string; composer?: string }
        diff?: { meta?: { diff_name?: unknown; rating?: unknown } }[]
      }
      name = data?.song?.name ?? id
      composer = data?.song?.composer ?? ""
      diffs = (data?.diff ?? []).map((x) =>
        [x?.meta?.diff_name, x?.meta?.rating].filter((v) => v !== undefined && v !== "").join(" ")
      )
    } catch {
      // 坏掉的 chart.json 不该让整个列表挂掉
    }
    return { id, name, composer, diffs, time: fs.statSync(json).mtimeMs }
  }

  /* ---------------- 索引读写 ---------------- */

  private read_index_file(): IChartSummary[] | null {
    try {
      if (!fs.existsSync(this.index_path)) return null
      const data = read_json(this.index_path)
      if (Array.isArray(data)) return data as IChartSummary[]
      const charts = (data as IChartsIndex)?.charts
      if (Array.isArray(charts)) return charts
      return null
    } catch {
      // 索引坏了就当作不存在，下次会重建
      return null
    }
  }

  write_index(list: IChartSummary[]) {
    fs.mkdirSync(path.dirname(this.index_path), { recursive: true })
    const data: IChartsIndex = { version: INDEX_VERSION, charts: list }
    fs.writeFileSync(this.index_path, JSON.stringify(data, null, 2), "utf-8")
  }

  /**
   * 保证索引存在并保持最新。
   * - 第一次启动（charts.json 不存在）时扫描 charts/ 生成并写盘；
   * - 之后补齐新增的谱面、丢掉已被删除的谱面。
   * @returns 索引内容
   */
  ensure_index(): IChartSummary[] {
    const ids = this.chart_ids()
    const cached = this.read_index_file()

    if (!cached) {
      const fresh = ids.map((id) => this.scan(id)).filter(Boolean) as IChartSummary[]
      this.write_index(fresh)
      console.log(`[chart-manager] 已生成谱面索引 ${this.index_path}（${fresh.length} 张）`)
      return fresh
    }

    const by_id = new Map(cached.map((e) => [e.id, e]))
    const next: IChartSummary[] = []
    let changed = false
    for (const id of ids) {
      const hit = by_id.get(id)
      if (hit) {
        next.push(hit)
      } else {
        const scanned = this.scan(id)
        if (scanned) {
          next.push(scanned)
          changed = true
        }
      }
    }
    if (next.length !== cached.length) changed = true
    if (changed) this.write_index(next)
    return next
  }

  /** 谱面列表（索引形式） */
  list(): IChartSummary[] {
    return this.ensure_index()
  }

  /** 保存谱面之后刷新它自己的索引条目 */
  update_entry(id: string) {
    const entry = this.scan(id)
    if (!entry) return
    const list = this.read_index_file() ?? []
    const ix = list.findIndex((e) => e.id === id)
    if (ix >= 0) list[ix] = entry
    else list.push(entry)
    this.write_index(list)
  }

  /** 删除某个索引条目（谱面被删掉时用） */
  remove_entry(id: string) {
    const list = this.read_index_file()
    if (!list) return
    const next = list.filter((e) => e.id !== id)
    if (next.length !== list.length) this.write_index(next)
  }

  /* ---------------- 谱面文件 ---------------- */

  folder(id: string) {
    return path.join(this.charts_folder, id)
  }

  /** 谱面数据文件路径；不存在返回 null */
  chart_json_path(id: string): string | null {
    // 防目录穿越
    const safe = path.basename(id)
    const json = path.join(this.charts_folder, safe, "chart.json")
    return fs.existsSync(json) ? json : null
  }

  exists(id: string) {
    return this.chart_json_path(id) !== null
  }

  /** 读取谱面数据（已经是 INotes.final 结构） */
  read(id: string): unknown | null {
    const json = this.chart_json_path(id)
    if (!json) return null
    try {
      return read_json(json)
    } catch (e) {
      console.error(`[chart-manager] ${id}/chart.json 解析失败：`, e)
      return null
    }
  }

  /** 写入谱面数据，并同步索引 */
  write(id: string, data: unknown): boolean {
    const folder = this.folder(path.basename(id))
    if (!fs.existsSync(folder)) return false
    fs.writeFileSync(path.join(folder, "chart.json"), JSON.stringify(data, null, 2), "utf-8")
    this.update_entry(path.basename(id))
    return true
  }

  /** 谱面音频（后缀未知，靠 find） */
  audio_path(id: string): string | null {
    const folder = this.folder(path.basename(id))
    if (!this.exists(id)) return null
    const audio = find_audio(folder)
    return audio ? path.join(folder, audio) : null
  }

  /** 曲绘 */
  bg_path(id: string): string | null {
    const folder = this.folder(path.basename(id))
    if (!this.exists(id)) return null
    const png = find_png(folder, "jacket") ?? find_png(folder, "bg")
    return png ? path.join(folder, png) : null
  }

  /**
   * 把文本写到谱面文件夹里（对应 sv 的 ChartManager.write_file）。
   * 导出 pcd 之类的文件走这里。
   */
  write_file(id: string, fname: string, data: string): boolean {
    const safe_id = path.basename(id)
    const safe_fname = path.basename(fname)
    if (!safe_fname || safe_fname === "." || safe_fname === "..") return false
    if (!this.exists(safe_id)) return false
    fs.writeFileSync(path.join(this.charts_folder, safe_id, safe_fname), data, "utf-8")
    return true
  }

  /** 在系统文件管理器里定位到这个文件（对应 sv 的 show_file） */
  show_file(id: string, fname: string) {
    const file = path.join(this.charts_folder, path.basename(id), path.basename(fname))
    show_in_folder(file)
  }

  /**
   * 导入一首歌（对应 sv 的 ChartManager.import_song）。
   *
   * - id 对应的文件夹已存在 -> 直接返回 existed，不做任何事
   * - 否则建文件夹，把音频复制成 charts/<id>/song<原后缀>
   * - 如果被选中的音频旁边有 chart.json，一并复制过去
   *
   * 注意这里**不**会凭空造一份 chart.json：和 sv 一样，主进程只负责搬文件，
   * 谱面数据的初始化是前端的事（见 chart_api.empty_final / Chart.open_chart）。
   * 前端拿到结果后如果没有 json 字段，就自己初始化一份再 POST 回来。
   *
   * @param fp 用户选中的音频文件绝对路径
   * @param id 曲目 id
   */
  import_song(fp: string, id: string): IImportSongResult {
    if (!is_safe_id(id)) return { state: "failed", id, reason: "invalid id" }

    const folder = path.join(this.charts_folder, id)
    if (fs.existsSync(folder)) return { state: "existed", id }

    try {
      if (!fs.existsSync(fp)) throw new Error(`找不到文件：${fp}`)
      fs.mkdirSync(folder, { recursive: true })

      const song_name = "song" + path.extname(fp)
      const song_path = path.join(folder, song_name)
      fs.copyFileSync(fp, song_path)

      // 音频旁边的 chart.json 一起带过来（sv 的行为）
      const sibling = path.join(path.dirname(fp), "chart.json")
      const json_path = path.join(folder, "chart.json")
      const has_json = fs.existsSync(sibling)
      if (has_json) fs.copyFileSync(sibling, json_path)

      if (has_json) this.update_entry(id)
      console.log(`[chart-manager] 导入 ${id}/${song_name}${has_json ? " (+chart.json)" : "（数据交给前端初始化）"}`)
      return {
        state: "success",
        id,
        audio: song_path,
        json: has_json ? json_path : undefined
      }
    } catch (e) {
      // 失败就别留下半个谱面
      try {
        fs.rmSync(folder, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[chart-manager] 导入失败：", msg)
      return { state: "failed", id, reason: msg }
    }
  }

  /**
   * 导入曲绘（对应 sv 的 ChartManager.import_sprite）。
   *
   * 曲绘统一存成 charts/<id>/jacket<原后缀>。
   * 导入前先把文件夹里旧的 jacket / bg 图删掉：bg_path 是 find 出来的，
   * 留着两张图就可能拿到过期的那张。
   *
   * @param fp 用户选中的图片文件绝对路径
   * @param id 曲目 id
   */
  import_sprite(fp: string, id: string): IImportSpriteResult {
    const safe_id = path.basename(id)
    if (!is_safe_id(safe_id)) return { state: "failed", id, reason: "invalid id" }
    if (!this.exists(safe_id)) return { state: "failed", id: safe_id, reason: "no such chart" }

    try {
      if (!fs.existsSync(fp)) throw new Error(`找不到文件：${fp}`)
      const ext = path.extname(fp).toLowerCase()
      if (!IMG_EXT.includes(ext)) throw new Error(`不支持的图片格式：${ext || "（没有后缀）"}`)

      const folder = this.folder(safe_id)
      for (const f of fs.readdirSync(folder)) {
        if (!IMG_EXT.includes(path.extname(f).toLowerCase())) continue
        const stem = path.basename(f, path.extname(f)).toLowerCase()
        if (stem !== "jacket" && stem !== "bg") continue
        fs.rmSync(path.join(folder, f), { force: true })
      }

      const name = `jacket${ext}`
      const target = path.join(folder, name)
      fs.copyFileSync(fp, target)
      console.log(`[chart-manager] 导入曲绘 ${safe_id}/${name}`)
      return { state: "success", id: safe_id, file: target }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[chart-manager] 导入曲绘失败：", msg)
      return { state: "failed", id: safe_id, reason: msg }
    }
  }
}

/** 全局单例 */
export const chart_manager = new ChartManager()
