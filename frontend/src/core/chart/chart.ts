import { reactive, ref, toRaw, type Ref } from 'vue'
import type { INotes } from '@type/note-types.ts'
import { EventHub, StopClass } from '@core/misc/eventhub.ts'
import { notify } from '@core/misc/notify.ts'
import { Storage } from '@core/storage.ts'
import { GlobalStat } from '@core/globalStat.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { LoadSong } from '@core/misc/load-song.ts'
import { chart_api } from './chart-api'
import { Chart_audio } from './audio'
import { Chart_song } from './song'
import { Chart_diff } from './diff'

/**
 * 一张正在编辑的谱面。
 *
 * 与 sv 不同：
 * - 数据本体就是 chart.json 的结构（INotes.final），没有额外的转换层；
 * - 难度数组叫 `diff`（是 INotes.diff[]），当前难度由 Chart_diff.diff_index 指定；
 * - 所有轨道的尺寸一致，画布宽度来自设置，不需要 max_lane。
 * */
export class Chart extends StopClass {
  static current: Chart | undefined = undefined

  id: string
  /** 谱面数据本体，类型即 INotes.final */
  data: INotes.final
  song: Chart_song
  audio: Chart_audio
  diff: Chart_diff

  /** 每次数据被修改都会 +1，界面靠它刷新 */
  change_count: Ref<number> = ref(0)
  /** 是否有未保存的改动 */
  dirty: Ref<boolean> = ref(false)

  refs: {
    diff_ref: Ref<number>
  }
  last_save = ref(0)
  private save_timer: number | null = null
  private loop_handle = 0

  constructor(id: string, data: INotes.final, audio_url: string) {
    super()
    this.id = id
    this.data = reactive(data)
    this.song = new Chart_song(this)
    this.audio = new Chart_audio(this, audio_url)
    this.diff = new Chart_diff(this, 0)
    this.refs = { diff_ref: ref(-1) }
    this.add_stop(() => cancelAnimationFrame(this.loop_handle))
    this.add_stop(() => this.song.stop())
    this.add_stop(() => this.audio.stop())
    this.loop_handle = requestAnimationFrame(this.loop)
  }

  static get $current() {
    if (!this.current) throw new Error('还没有打开任何谱面')
    return this.current
  }

  /** 打开一张谱面 */
  static async open_chart(id: string) {
    GlobalStat.route.change('load-song')
    LoadSong.reset()

    const data = await this.fetch_or_init(id)
    LoadSong.status.open_song = true

    const chart = new Chart(id, data, chart_api.audio_url(id))
    await chart.audio.ready()
    LoadSong.status.fetch_audio = true

    chart.diff.update_on_diff_index()
    chart.set_header_name()
    Chart.current = chart
    LoadSong.status.set_data = true

    GlobalStat.route.change('editor')
    return chart
  }

  /**
   * 取谱面数据；没有 chart.json 就初始化一份并存下去。
   *
   * 和 sv 一样，数据的初始化是前端的事：文件夹里可能只有音频
   * （比如刚导入、或者别的工具搬过来的谱面），这时不该打不开，
   * 而是用空白数据补上。
   * */
  static async fetch_or_init(id: string): Promise<INotes.final> {
    try {
      return await chart_api.fetch_chart(id)
    } catch {
      const data = chart_api.create_final(id)
      await chart_api.save_chart(id, data)
      notify.normal('这张谱面还没有数据，已初始化一份空白谱面。')
      return data
    }
  }

  /* ---------------- 基础 ---------------- */

  /** 设置里的谱面偏移（ms） */
  get settings_offset() {
    return Storage.settings.offset
  }

  get diffs(): INotes.diff[] {
    return this.data.diff
  }

  get current_diff(): INotes.diff {
    return this.data.diff[this.diff.diff_index.value]
  }

  /** 谱面最后一个物件的时间，音频缺失时用来兜底 */
  last_object_time() {
    let max = 0
    for (const item of this.diff.all_objects()) {
      const o = item.obj
      const end = 'segment' in o && o.segment.length ? o.segment[o.segment.length - 1][0] : 0
      const hz_end = 'end' in o ? o.end : 0
      max = Math.max(max, o.time, end, hz_end)
    }
    return max
  }

  /** 数据发生变化：触发渲染刷新 + 自动保存 */
  mark_changed() {
    this.change_count.value++
    this.dirty.value = true
    this.diff.force_fuck()
    this.set_header_name()
    EventHub.dispatch('diff-changed')
    if (Storage.settings.auto_save) {
      if (this.save_timer !== null) clearTimeout(this.save_timer)
      this.save_timer = window.setTimeout(() => this.save(), 3000)
    }
  }

  /** 可见区间变化，通知渲染层重建精灵 */
  dispatch_shown() {
    EventHub.dispatch('fuck-shown')
  }

  set_header_name() {
    GlobalStat.refs.header_display.value = `${this.song.name} - ${this.diff.meta.diff_name} ${this.diff.meta.rating}`
  }

  /* ---------------- 难度管理 ---------------- */

  create_diff() {
    const d = chart_api.empty_diff(`Diff ${this.diffs.length + 1}`, this.diffs.length)
    d.timing = this.diffs[this.diff.diff_index.value].timing.map((t) => ({ ...t }))
    this.diffs.push(d)
    this.diff.diff_index.value = this.diffs.length - 1
    this.mark_changed()
  }

  copy_diff() {
    const src = toRaw(this.current_diff)
    const d: INotes.diff = {
      note: src.note.map((x) => ({ ...x })),
      hold: src.hold.map((x) => ({
        ...x,
        segment: x.segment.map((s) => [...s] as [number, number, number])
      })),
      wide: src.wide.map((x) => ({ ...x })),
      hazard: src.hazard.map((x) => ({ ...x })),
      chip: src.chip.map((x) => ({ ...x })),
      flick: src.flick.map((x) => ({ ...x })),
      timing: src.timing.map((x) => ({ ...x })),
      meta: { ...src.meta, diff_name: src.meta.diff_name + ' copy' }
    }
    this.diffs.push(d)
    this.diff.diff_index.value = this.diffs.length - 1
    this.mark_changed()
  }

  delete_diff() {
    if (this.diffs.length === 1) {
      this.current_diff.note = []
      this.current_diff.hold = []
      this.current_diff.wide = []
      this.current_diff.hazard = []
      this.current_diff.chip = []
      this.current_diff.flick = []
      this.diff.diff_index.value = 0
    } else {
      this.diffs.splice(this.diff.diff_index.value, 1)
      this.diff.diff_index.value = 0
    }
    this.diff.update_on_diff_index()
    this.mark_changed()
  }

  /* ---------------- 保存 ---------------- */

  async save(do_notify = false) {
    this.diff.validate_chart()
    await chart_api.save_chart(this.id, toRaw(this.data) as INotes.final)
    this.dirty.value = false
    this.last_save.value = Date.now()
    if (do_notify) notify.success('保存成功！')
  }

  /**
   * 把当前难度导出成 .pcd（对应 sv 的 write_current_vsc）。
   * 文件写到 charts/<id>/ 下，名字是「难度名.pcd」。
   */
  write_current_pcd() {
    const diff = toRaw(this.current_diff)
    const fname = (diff.meta.diff_name || 'diff') + '.pcd'
    return Invoke('write-file', {
      id: this.id,
      data: Chart_diff.to_pcd(diff).join('\n'),
      fname
    })
      .then(() => notify.success('已导出为pcd！'))
      .then(() => Invoke('show-file', { id: this.id, fname }))
  }

  /**
   * 把谱面预览的那张 SVG（#chart-preview-svg，见 chart-preview-modal）导出成 png。
   * 对应 sv 的 Chart.write_png。
   *
   * 1. 先把 SVG 里引用的外部图片（皮肤贴图、曲绘）换成 data URL：序列化之后这张图
   *    是当**图片**加载的，相对路径在那个上下文里解析不出来，不换就是一片空白；
   * 2. 把换好的 SVG 序列化成 blob，用 <img> 载入后画进 canvas；
   * 3. canvas 转成 png，交给 server 落盘（png 是二进制，走 write-file-b64）。
   *
   * 尺寸取 SVG 自己的 width/height 属性（预览图的原始分辨率），不用 getBoundingClientRect：
   * 预览区会用 CSS 把它缩小显示，按显示尺寸导出的图会糊。
   * */
  async write_png() {
    const svg = document.getElementById('chart-preview-svg') as SVGSVGElement | null
    if (!svg) {
      notify.error('没有找到谱面预览，请从「谱面预览」里导出。')
      return
    }
    const rect = svg.getBoundingClientRect()
    const width = Math.ceil(Number(svg.getAttribute('width')) || rect.width)
    const height = Math.ceil(Number(svg.getAttribute('height')) || rect.height)
    if (!width || !height) return

    /*
     * 超长的谱面预览图会非常大（几万像素），浏览器对 canvas 的边长和面积都有硬上限，
     * 超了 toDataURL 会直接给一张空白图。这里按上限折一个缩放比，宁可分辨率低一点，
     * 也不要导出一张空图。
     * */
    const scale = Math.min(
      1,
      MAX_CANVAS_SIDE / width,
      MAX_CANVAS_SIDE / height,
      Math.sqrt(MAX_CANVAS_AREA / (width * height))
    )
    if (scale < 1) {
      console.warn(`[write_png] 预览图 ${width}x${height} 超过 canvas 上限，按 ${scale} 缩小导出`)
    }
    const out_w = Math.max(1, Math.floor(width * scale))
    const out_h = Math.max(1, Math.floor(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = out_w
    canvas.height = out_h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法获取 Canvas 上下文')
    // 预览图自己铺了黑底，这里只是保险
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out_w, out_h)

    const cloned = svg.cloneNode(true) as SVGSVGElement
    await to_data_urls(cloned)

    const svg_text = new XMLSerializer().serializeToString(cloned)
    const svg_url = URL.createObjectURL(
      new Blob([svg_text], { type: 'image/svg+xml;charset=utf-8' })
    )
    try {
      const png = await new Promise<string>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, out_w, out_h)
            resolve(canvas.toDataURL('image/png'))
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)))
          }
        }
        img.onerror = () => reject(new Error('SVG 转成图片失败'))
        img.src = svg_url
      })

      const fname = safe_fname(this.current_diff.meta.diff_name || 'preview') + '.png'
      await Invoke('write-file-b64', { id: this.id, fname, data: png.slice(png.indexOf(',') + 1) })
      notify.success('已导出为png！')
      await Invoke('show-file', { id: this.id, fname })
    } finally {
      URL.revokeObjectURL(svg_url)
    }
  }

  /** 加一张难度（对应 sv 的 Chart.add_diff） */
  add_diff(d: INotes.diff) {
    this.diffs.push(d)
    this.diff.diff_index.value = this.diffs.length - 1
    this.diff.update_on_diff_index()
    this.mark_changed()
  }

  /**
   * 导入 .pcd 文本，作为一张新难度加进来（对应 sv 的 load_vsc）。
   * @returns 是否导入成功
   */
  load_pcd(text: string) {
    const diff = Chart_diff.parse_pcd(text)
    const count =
      diff.note.length +
      diff.hold.length +
      diff.wide.length +
      diff.hazard.length +
      diff.chip.length +
      diff.flick.length
    if (!count) {
      notify.error('这个pcd里没有任何物件……')
      return false
    }
    this.add_diff(diff)
    notify.success(`已导入 ${count} 个物件`)
    return true
  }

  /* ---------------- 主循环 ---------------- */

  private loop = () => {
    if (this.stopped) return
    this.on_update()
    this.loop_handle = requestAnimationFrame(this.loop)
  }

  /**
   * 跳到某个时间点并立刻重算可见区间。
   * 拖动密度图/时间轴、用滚轮滚动时间轴都走这里。
   */
  seek(t: number) {
    this.audio.set_current_time(t)
    this.diff.force_fuck()
    EventHub.dispatch('audio-time-update')
  }

  on_update() {
    const before = this.audio.current_time
    this.audio.update()
    const after = this.audio.current_time
    if (before === after) return
    // 时间一下子跳了很多（拖动时间轴/密度图），就立刻重算可见区间，
    // 否则 pooling 的节流会让画面上的物件不跟着变
    this.diff.fuck_shown(after, Math.abs(after - before) > 300)
    EventHub.dispatch('audio-time-update')
  }
}

/**
 * 导出文件名里不能有的字符（Windows 上写盘会直接失败）。
 * 难度名是用户随便起的，导出前统一替换掉。
 * */
function safe_fname(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'preview'
}

/** canvas 的边长 / 面积上限（保守取值，超了 toDataURL 会给空白图） */
const MAX_CANVAS_SIDE = 12000
const MAX_CANVAS_AREA = 64_000_000

/** 载入一张图片（导出 png 时把 SVG 里的外链换成 data URL 用） */
function load_image(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`图片加载失败：${src}`))
    img.src = src
  })
}

/**
 * 把 SVG 里所有 <image> 的外部链接换成 data URL（对应 sv 的 write_png 里那一段）。
 *
 * 同一张图会被几百个 note 引用（就是那几张皮肤贴图），所以转换结果按 href 缓存，
 * 一张图只走一遍 canvas。转换失败的就原样留着：图里少一张贴图，也总比整个导出失败好。
 * */
async function to_data_urls(svg: SVGSVGElement) {
  const cache = new Map<string, string>()
  const tasks: Promise<void>[] = []
  for (const el of Array.from(svg.querySelectorAll('image'))) {
    const href = el.getAttribute('href') || el.getAttribute('xlink:href')
    if (!href || href.startsWith('data:')) continue
    tasks.push(
      (async () => {
        let url = cache.get(href)
        if (url === undefined) {
          url = ''
          try {
            const img = await load_image(href)
            const c = document.createElement('canvas')
            c.width = img.naturalWidth
            c.height = img.naturalHeight
            const cx = c.getContext('2d')
            if (cx && c.width && c.height) {
              cx.drawImage(img, 0, 0)
              url = c.toDataURL('image/png')
            }
          } catch (e) {
            console.warn('[write_png] 贴图转换失败：', href, e)
          }
          cache.set(href, url)
        }
        if (!url) return
        el.setAttribute('href', url)
        // 有些渲染路径只认 xlink:href，两个都写上
        el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url)
      })()
    )
  }
  await Promise.all(tasks)
}
