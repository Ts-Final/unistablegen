import { computed, ref, toRaw, type ComputedRef, type Ref } from 'vue'
import type { INotes } from '@type/note-types.ts'
import type { Chart } from './chart'
import { Storage } from '@core/storage.ts'
import { GlobalStat } from '@core/globalStat.ts'
import { StopClass } from '@core/misc/eventhub.ts'
import { utils } from '@core/utils.ts'
import { notify } from '@core/misc/notify.ts'
import type { IObjRef, ObjKind } from '@core/misc/note-clipboard.ts'

/** 当前可见（会被渲染）的一批物件 */
export interface IShown {
  note: INotes.note[]
  hold: INotes.hold[]
  wide: INotes.wide[]
  hazard: INotes.hazard[]
  chip: INotes.chip[]
  flick: INotes.flick[]
}

export interface IDiffCounts {
  note: number
  ex: number
  critical: number
  hold: number
  wide: number
  hazard: number
  chip: number
  flick: number
  total: number
  avg_density: number
  min_bpm: number
  max_bpm: number
  main_bpm: number
}

/** 谱面里所有物件按时间排序后的统一表示，编辑器/统计用 */
export interface IAnyObject {
  kind: ObjKind
  obj: INotes.note | INotes.hold | INotes.wide | INotes.hazard | INotes.chip | INotes.flick
}

function empty_shown(): IShown {
  return { note: [], hold: [], wide: [], hazard: [], chip: [], flick: [] }
}

/** pcd 的数字输出：最多保留 3 位小数，去掉多余的 0 */
function pcd_num(v: number): string {
  return String(Math.round(v * 1000) / 1000)
}

function empty_counts(): IDiffCounts {
  return {
    note: 0,
    ex: 0,
    critical: 0,
    hold: 0,
    wide: 0,
    hazard: 0,
    chip: 0,
    flick: 0,
    total: 0,
    avg_density: 0,
    min_bpm: 0,
    max_bpm: 0,
    main_bpm: 0
  }
}

/**
 * 一张难度的所有数据与操作。
 * 物件分成 note / hold / wide / hazard / chip / flick / timing 七个数组，
 * 与 type/note-types.ts 里的 INotes.diff 一一对应。
 * */
export class Chart_diff extends StopClass {
  chart: Chart
  diff_index: Ref<number>
  counts: Ref<IDiffCounts> = ref(empty_counts())
  density_data: Ref<number[]> = ref([0])
  density_path: Ref<string> = ref('')

  /** 小节线（时间点） */
  bar_list: number[] = []
  /** 分音线 [时间, 层级] */
  beat_list: [number, number][] = []
  /** 每拍的起点 */
  section_list: number[] = []
  /** 音符间隔分音 [时间, 分音数] */
  ticks: [number, number][] = []

  shown_timing_list: {
    bar_list: [number, number][]
    beat_list: [number, number][]
    section_list: [number, number][]
    ticks: [number, number][]
  } = { bar_list: [], beat_list: [], section_list: [], ticks: [] }

  shown: IShown = empty_shown()
  shown_timing: INotes.timing[] = []
  last_update = 0

  undo: (() => void)[][] = []
  redo: (() => void)[][] = []
  on_operating = false
  operating_fns: (() => void)[] = []

  current_timing: ComputedRef<number>

  constructor(chart: Chart, index = 0) {
    super()
    this.chart = chart
    this.diff_index = ref(index)
    this.current_timing = computed(() =>
      Math.max(
        0,
        this.timing.findLastIndex((v) => v.time <= this.chart.audio.current_ms)
      )
    )
    this.watch(this.diff_index, () => this.update_on_diff_index())
  }

  /* ---------------- 数据访问 ---------------- */

  get diff(): INotes.diff {
    return this.chart.data.diff[this.diff_index.value]
  }

  get meta(): INotes.meta {
    return this.diff.meta
  }

  get note() {
    return this.diff.note
  }
  get hold() {
    return this.diff.hold
  }
  get wide() {
    return this.diff.wide
  }
  get hazard() {
    return this.diff.hazard
  }
  get chip() {
    return this.diff.chip
  }
  get flick() {
    return this.diff.flick
  }
  get timing() {
    return this.diff.timing
  }
  set timing(v: INotes.timing[]) {
    this.diff.timing = v.slice().sort((a, b) => a.time - b.time)
  }

  /** 原始（非响应式）的某个物件数组 */
  raw_arr(kind: ObjKind): unknown[] {
    const d = toRaw(this.diff)
    return d[kind] as unknown[]
  }

  /** 所有物件（按时间排序） */
  all_objects(): IAnyObject[] {
    const d = toRaw(this.diff)
    const r: IAnyObject[] = []
    const push = (kind: ObjKind, arr: { time: number }[]) => {
      for (const o of arr) r.push({ kind, obj: o as IAnyObject['obj'] })
    }
    push('note', d.note)
    push('hold', d.hold)
    push('wide', d.wide)
    push('hazard', d.hazard)
    push('chip', d.chip)
    push('flick', d.flick)
    r.sort((a, b) => a.obj.time - b.obj.time)
    return r
  }

  /* ---------------- 难度切换 ---------------- */

  update_on_diff_index() {
    this.update_diff_counts()
    this.update_timing_list()
    this.calc_density()
    this.sort_all()
    this.force_fuck()
  }

  /* ---------------- 统计 ---------------- */

  update_diff_counts() {
    const d = toRaw(this.diff)
    const c = empty_counts()
    for (const n of d.note) {
      c.note++
      if (n.type === 1) c.critical++
      else if (n.type === 2) c.ex++
    }
    c.hold = d.hold.length
    c.wide = d.wide.length
    c.hazard = d.hazard.length
    c.chip = d.chip.length
    c.flick = d.flick.length
    c.total = c.note + c.hold + c.wide + c.chip + c.flick
    const sec = Math.max(1, this.chart.audio.length / 1000)
    c.avg_density = c.total / sec
    const bpms = d.timing.map((t) => t.bpm)
    c.min_bpm = bpms.length ? Math.min(...bpms) : 0
    c.max_bpm = bpms.length ? Math.max(...bpms) : 0
    // 占比最长的那个 timing 的 bpm
    let main = 0
    let best = -1
    d.timing.forEach((t, i) => {
      const end = this.timing_end_time(t, d.timing, this.chart.audio.length)
      if (end - t.time > best) {
        best = end - t.time
        main = t.bpm
      }
      void i
    })
    c.main_bpm = main
    this.counts.value = c
  }

  /* ---------------- 小节线 / 分音线 ---------------- */

  timing_end_time(t: INotes.timing, timing: INotes.timing[], max = Infinity) {
    const idx = timing.indexOf(t)
    if (idx === -1) return max
    if (idx === timing.length - 1) return max
    return timing[idx + 1].time
  }

  timing_end(t: INotes.timing) {
    return this.timing_end_time(t, this.timing, this.chart.audio.length)
  }

  update_bar_section_list() {
    this.bar_list = []
    this.section_list = []
    const tol = Storage.settings.beat_tolerance
    const v = this.timing
    for (const part of v) {
      // 四分音符的毫秒数
      const quarter = 60000 / part.bpm
      // 一个 1/den 音符的时长
      const one_note = quarter * (4 / part.den)
      // 一小节 = num 个 1/den 音符
      const time_per_bar = one_note * part.num
      // 一拍(section) = 一个 1/den 音符，与 get_beat_info 里的 beatMs 保持一致
      const time_per_section = one_note
      const end = this.timing_end_time(part, v, this.chart.audio.length)
      for (let t = part.time; t < end - tol; t += time_per_bar) this.bar_list.push(t)
      for (let t = part.time; t < end - tol; t += time_per_section) this.section_list.push(t)
    }
  }

  update_beat_line_list() {
    this.beat_list = []
    const v = this.timing
    const den = Storage.settings.meter
    const mod = [1, 4, 8, 16, 32, 48, 64].filter((s) => s <= den)
    const to_level = (beat_index: number) => {
      for (let i = 0; i < mod.length; i++) {
        if (beat_index % (den / mod[i]) === 0) return i + 1
      }
      return mod.length + 1
    }
    for (const timing of v) {
      const end = this.timing_end_time(timing, v, this.chart.audio.length)
      const time_per_beat = (240 / (timing.bpm * den)) * 1000
      let beat_index = 0
      for (let t = timing.time; t < end; t += time_per_beat) {
        this.beat_list.push([t, to_level(beat_index)])
        beat_index++
      }
    }
  }

  /** 音符之间的间隔是几分音（显示在小节线右侧） */
  update_tick_list() {
    this.ticks = []
    const v = this.timing
    const all_times = [...new Set(this.all_objects().map((o) => o.obj.time))].sort((a, b) => a - b)
    if (all_times.length < 2) return
    for (const part of v) {
      const part_end = this.timing_end_time(part, v)
      const times = all_times.filter((t) => t >= part.time && t < part_end)
      for (let j = 0; j < times.length - 1; j++) {
        let tick = (24e4 / (times[j + 1] - times[j])) / part.bpm
        if (tick > 128) continue
        if (tick < 3) tick = 0
        this.ticks.push([times[j], Math.round(tick)])
      }
    }
  }

  update_timing_list() {
    this.update_bar_section_list()
    this.update_beat_line_list()
    this.update_tick_list()
  }

  /** 分音(每拍几分音符)改变 */
  update_meter() {
    this.update_beat_line_list()
    this.update_t(this.visible)
  }

  /* ---------------- bpm / 吸附 ---------------- */

  bpm_of_time(time: number): INotes.timing {
    const t = Math.max(0, time)
    return this.timing.findLast((v) => v.time <= t) ?? this.timing[0]
  }

  timing_of_time(time: number) {
    const t = Math.max(0, time)
    const ix = Math.max(
      this.timing.findLastIndex((v) => v.time <= t),
      0
    )
    return { timing: this.timing[ix], ix }
  }

  /** 按当前分音吸附到最近的时间点 */
  nearest(t: number): number {
    const bpm = this.bpm_of_time(t)
    if (!bpm) return t
    const per_beat = (240 / (bpm.bpm * Storage.settings.meter)) * 1000
    const passed = t - bpm.time
    return Math.round(Math.round(passed / per_beat) * per_beat + bpm.time)
  }

  nearest_threshold(t: number, threshold: number) {
    const n = this.nearest(t)
    return Math.abs(t - n) <= threshold ? n : t
  }

  /* ---------------- timing 编辑 ---------------- */

  add_timing(timing: INotes.timing) {
    const same = this.timing.findIndex((tp) => Math.abs(tp.time - timing.time) < 50)
    if (same !== -1) {
      notify.error('已有相同时间点的 timing。')
      return same
    }
    this.timing.push(timing)
    this.timing.sort((a, b) => a.time - b.time)
    this.update_timing_list()
    this.chart.mark_changed()
    return this.timing.indexOf(timing)
  }

  del_timing(idx: number) {
    if (idx === 0 && this.timing.length === 1) return
    this.timing.splice(idx, 1)
    this.update_timing_list()
    this.chart.mark_changed()
  }

  /** 把该 timing 区间内的所有物件一起平移 */
  push_timing(idx: number, delta: number) {
    const end = this.timing_end(this.timing[idx])
    const from = this.timing[idx].time
    for (const item of this.all_objects()) {
      if (utils.between(item.obj.time, [from, end])) item.obj.time += delta
    }
    this.timing[idx].time += delta
    this.update_timing_list()
  }

  /** 把该 timing 之后的所有物件与 timing 一起平移 */
  push_timing_all(idx: number, delta: number) {
    const from = this.timing[idx].time
    for (const item of this.all_objects()) if (item.obj.time > from) item.obj.time += delta
    for (let i = 0; i < this.timing.length; i++) if (this.timing[i].time > from) this.timing[i].time += delta
    this.timing[idx].time += delta
    this.update_timing_list()
  }

  sort_timing() {
    this.timing.sort((a, b) => a.time - b.time)
  }

  /* ---------------- 物件的增删 ---------------- */

  private insert_sorted(kind: ObjKind, obj: { time: number }) {
    const arr = this.raw_arr(kind) as { time: number }[]
    let ix = arr.findIndex((x) => x.time > obj.time)
    if (ix < 0) ix = arr.length
    arr.splice(ix, 0, obj)
  }

  add_obj(kind: ObjKind, obj: IObjRef['obj']): boolean {
    if (kind === 'hazard') {
      const h = obj as INotes.hazard
      if (h.end <= h.time) return false
    }
    this.insert_sorted(kind, obj as { time: number })
    this.update_diff_counts()
    this.chart.mark_changed()
    return true
  }

  remove_obj(ref: IObjRef): boolean {
    const arr = this.raw_arr(ref.kind)
    const raw = toRaw(ref.obj)
    const ix = arr.findIndex((x) => toRaw(x) === raw)
    if (ix < 0) return false
    arr.splice(ix, 1)
    this.update_diff_counts()
    this.chart.mark_changed()
    return true
  }

  add_obj_with_undo(kind: ObjKind, obj: IObjRef['obj']): boolean {
    const r = this.add_obj(kind, obj)
    if (r) this.push_undo(() => this.remove_obj({ kind, obj }))
    return r
  }

  add_objs_with_undo(items: IObjRef[]): boolean {
    const undos: (() => void)[] = []
    let ok = true
    for (const it of items) {
      const r = this.add_obj(it.kind, it.obj)
      if (!r) ok = false
      else undos.push(() => this.remove_obj(it))
    }
    this.push_undo(() => undos.forEach((fn) => fn()))
    this.force_fuck()
    return ok
  }

  remove_obj_with_undo(...refs: IObjRef[]): boolean {
    const undos: (() => void)[] = []
    let ok = true
    for (const it of refs) {
      const r = this.remove_obj(it)
      if (!r) ok = false
      else undos.push(() => this.add_obj(it.kind, it.obj))
    }
    this.push_undo(() => undos.forEach((fn) => fn()))
    this.force_fuck()
    return ok
  }

  push_undo(fn: () => void) {
    if (this.on_operating) this.operating_fns.push(fn)
    else this.undo.push([fn])
    while (this.undo.length > 40) this.undo.shift()
  }

  execute_undo() {
    const fns = this.undo.pop()
    if (fns) {
      this.on_operating = true
      fns.forEach((fn) => fn())
      this.on_operating = false
      this.force_fuck()
    }
  }

  push_redo(fn: () => void) {
    if (this.on_operating) this.operating_fns.push(fn)
    else this.redo.push([fn])
    while (this.redo.length > 40) this.redo.shift()
  }

  execute_redo() {
    const fns = this.redo.pop()
    if (fns) {
      this.on_operating = true
      fns.forEach((fn) => fn())
      this.on_operating = false
      this.force_fuck()
    }
  }

  /* ---------------- 可见区间 ---------------- */

  get visible(): [number, number] {
    const c = this.chart.audio.current_ms
    const ahead = Storage.settings.pooling.ahead
    return [c - ahead, c + this.visible_length + ahead]
  }

  /** 一屏能显示多少毫秒 */
  get visible_length() {
    return GlobalStat.refs.window.height.value / Storage.computes.mul.value
  }

  fuck_shown(t: number, force = false) {
    if (!force && Math.abs(t - this.last_update) < Storage.settings.pooling.interval) return
    const ahead = Storage.settings.pooling.ahead
    const visible: [number, number] = [t - ahead, t + this.visible_length + ahead]
    const d = toRaw(this.diff)
    this.shown = {
      note: d.note.filter((n) => utils.between(n.time, visible)),
      wide: d.wide.filter((n) => utils.between(n.time, visible)),
      chip: d.chip.filter((n) => utils.between(n.time, visible)),
      flick: d.flick.filter((n) => utils.between(n.time, visible)),
      hold: d.hold.filter((n) => n.time <= visible[1] && this.obj_end(n) >= visible[0]),
      hazard: d.hazard.filter((n) => n.time <= visible[1] && n.end >= visible[0])
    }
    this.last_update = t
    this.update_t(visible)
    this.chart.dispatch_shown()
  }

  private obj_end(h: INotes.hold) {
    return h.segment.length ? h.segment[h.segment.length - 1][0] : h.time
  }

  update_t(visible: [number, number]) {
    this.shown_timing_list = {
      bar_list: this.bar_list
        .map((x, ix) => [x, ix] as [number, number])
        .filter((x) => utils.between(x[0], visible)),
      beat_list: this.beat_list.filter((x) => utils.between(x[0], visible)),
      section_list: this.section_list
        .map((x, ix) => [x, ix] as [number, number])
        .filter((x) => utils.between(x[0], visible)),
      ticks: this.ticks.filter((x) => utils.between(x[0], visible))
    }
    this.shown_timing = this.timing.filter((x) => utils.between(x.time, visible))
  }

  force_fuck() {
    this.fuck_shown(this.chart.audio.current_ms, true)
  }

  update() {
    this.fuck_shown(this.chart.audio.current_ms)
  }

  sort_all() {
    const d = this.diff
    d.note.sort((a, b) => a.time - b.time)
    d.hold.sort((a, b) => a.time - b.time)
    d.wide.sort((a, b) => a.time - b.time)
    d.hazard.sort((a, b) => a.time - b.time)
    d.chip.sort((a, b) => a.time - b.time)
    d.flick.sort((a, b) => a.time - b.time)
    d.timing.sort((a, b) => a.time - b.time)
  }

  /* ---------------- 密度曲线 ---------------- */

  calc_density() {
    const count = 200
    const length = Math.max(1, this.chart.audio.length)
    const per = length / count
    const d = new Array<number>(count).fill(0)
    for (const item of this.all_objects()) {
      const ix = Math.min(count - 1, Math.max(0, Math.floor(item.obj.time / per)))
      d[ix]++
    }
    for (let i = 0; i < d.length; i++) d[i] = (d[i] / per) * 1000
    this.density_data.value = d
    this.density_path.value = Chart_diff.density_to_path(d)
  }

  /** 把密度数组转成 SVG path（宽 320，高 240） */
  static density_to_path(data: number[]) {
    const max = Math.max(...data, 1)
    const dx = 300 / Math.max(1, data.length - 1)
    let path = `M 20 240`
    for (let i = 0; i < data.length; i++) {
      const y = 240 - (data[i] / max) * 230
      path += ` L ${(20 + dx * i).toFixed(2)} ${y.toFixed(2)}`
    }
    return path
  }

  /**
   * 把一张难度转成 polymorphite 的 .pcd 行（对应 sv 的 `Chart_diff.to_vsc`）。
   *
   * 每行一个物件，行首字母区分类型，格式见 poly_chart_format.md：
   *
   *   n,timing,color,type,x_pos[,end_timing,end_x,ease]
   *   h,start_timing,end_timing,start_x_left,end_x_left,ease_left,start_x_right,end_x_right,ease_right
   *   c,timing,x_pos
   *   f,timing,dir,x_pos
   *   t,timing,tempo
   *
   * 注意：
   * - color 0 = colorless / 1 = wide；wide 的 x_pos 固定写 50。
   * - note 的 type 0 normal / 1 critical / 2 ex / 3 hold，和 uni 的 INotes.note.type 一致。
   * - 多段 hold 要写成一首尾相接的 type=3 音符链：
   *   上一段的 end_timing / end_x 必须精确等于下一段的 timing / x_pos。
   */
  static to_pcd(diff: INotes.diff): string[] {
    const rows: { time: number; line: string }[] = []
    const push = (time: number, line: string) => rows.push({ time, line })
    const n = pcd_num

    // timing
    for (const t of diff.timing) push(t.time, `t,${n(t.time)},${n(t.bpm)}`)

    // note
    for (const note of diff.note) push(note.time, `n,${n(note.time)},0,${note.type},${n(note.x_pos)}`)

    // wide：color=1，x_pos 固定 50（uni 的 wide 没有细分类型，按 normal 导出）
    for (const w of diff.wide) push(w.time, `n,${n(w.time)},1,0,50`)

    // hold：展开成 type=3 的链
    for (const h of diff.hold) {
      let time = h.time
      let x = h.x_pos
      for (const [end_time, end_x, ease] of h.segment) {
        push(time, `n,${n(time)},0,3,${n(x)},${n(end_time)},${n(end_x)},${ease}`)
        time = end_time
        x = end_x
      }
    }

    // hazard
    for (const z of diff.hazard) {
      push(
        z.time,
        `h,${n(z.time)},${n(z.end)},${n(z.x1)},${n(z.y1)},${z.e1},${n(z.x2)},${n(z.y2)},${z.e2}`
      )
    }

    // chip
    for (const c of diff.chip) push(c.time, `c,${n(c.time)},${n(c.x_pos)}`)

    // flick
    for (const k of diff.flick) push(k.time, `f,${n(k.time)},${k.to},${n(k.x_pos)}`)

    // sort 是稳定的，同一时间会保持上面的登记顺序（timing 在前）
    return rows.sort((a, b) => a.time - b.time).map((r) => r.line)
  }

  /**
   * 解析 polymorphite 的 .pcd 文本（`to_pcd` 的逆运算）。
   *
   * 多段 hold 在 pcd 里是一串首尾相接的 type=3 音符，这里按
   * 「上一段的终点 == 这一段的起点」把它们接回一条 hold。
   * 用一个 Map 记住每条链当前的末端，这样即使中间夹着别的物件也能接上。
   */
  static parse_pcd(text: string): INotes.diff {
    const note: INotes.note[] = []
    const hold: INotes.hold[] = []
    const wide: INotes.wide[] = []
    const hazard: INotes.hazard[] = []
    const chip: INotes.chip[] = []
    const flick: INotes.flick[] = []
    const timing: INotes.timing[] = []

    /** 链末端 -> 那条 hold */
    const open_holds = new Map<string, INotes.hold>()
    const node_key = (t: number, x: number) => `${Math.round(t * 1000)}|${Math.round(x * 1000)}`

    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('//')) continue
      const p = line.split(',').map((s) => s.trim())
      const kind = p[0].toLowerCase()

      switch (kind) {
        case 'n': {
          const time = Number(p[1])
          const color = Number(p[2])
          const type = Number(p[3])
          const x_pos = Number(p[4])
          if (!Number.isFinite(time)) break

          // wide：color=1
          if (color === 1) {
            wide.push({ time })
            break
          }
          // hold：type=3
          if (type === 3) {
            const end_time = Number(p[5] ?? 0)
            const end_x = Number(p[6] ?? x_pos)
            const ease = Number(p[7] ?? 0)
            const key = node_key(time, x_pos)
            const current = open_holds.get(key)
            if (current) {
              current.segment.push([end_time, end_x, ease])
              open_holds.delete(key)
              open_holds.set(node_key(end_time, end_x), current)
            } else {
              const h: INotes.hold = { time, x_pos, segment: [[end_time, end_x, ease]] }
              hold.push(h)
              open_holds.set(node_key(end_time, end_x), h)
            }
            break
          }
          const t: INotes.note['type'] = type === 1 ? 1 : type === 2 ? 2 : 0
          note.push({ time, type: t, x_pos })
          break
        }
        case 'h': {
          const time = Number(p[1])
          if (!Number.isFinite(time)) break
          hazard.push({
            time,
            end: Number(p[2]),
            x1: Number(p[3]),
            y1: Number(p[4]),
            e1: Number(p[5] ?? 0),
            x2: Number(p[6]),
            y2: Number(p[7]),
            e2: Number(p[8] ?? 0)
          })
          break
        }
        case 'c': {
          const time = Number(p[1])
          if (!Number.isFinite(time)) break
          chip.push({ time, x_pos: Number(p[2]) })
          break
        }
        case 'f': {
          const time = Number(p[1])
          if (!Number.isFinite(time)) break
          flick.push({ time, to: Number(p[2]) === 0 ? 0 : 1, x_pos: Number(p[3]) })
          break
        }
        case 't': {
          const time = Number(p[1])
          const bpm = Number(p[2])
          if (!Number.isFinite(time) || !Number.isFinite(bpm) || bpm <= 0) break
          timing.push({ time, bpm, num: 4, den: 4 })
          break
        }
        default:
          // 'l'（lock，demo 里没用）以及未知行直接忽略
          break
      }
    }

    if (!timing.length) timing.push({ time: 0, bpm: 120, num: 4, den: 4 })
    const by_time = (a: { time: number }, b: { time: number }) => a.time - b.time
    note.sort(by_time)
    hold.sort(by_time)
    wide.sort(by_time)
    hazard.sort(by_time)
    chip.sort(by_time)
    flick.sort(by_time)
    timing.sort(by_time)

    return {
      note,
      hold,
      wide,
      hazard,
      chip,
      flick,
      timing,
      meta: {
        charter: Storage.username,
        diff_name: 'imported',
        diff_num: 0,
        rating: 1
      }
    }
  }

  /* ---------------- 拍号信息 ---------------- */
  get_beat_info(time: number) {    const t = Math.max(this.timing[0]?.time ?? 0, time)
    const { bpm, den } = this.bpm_of_time(t)
    const last_section = Math.max(
      0,
      this.section_list.findLastIndex((x) => x <= t)
    )
    const beat_ms = (60000 / bpm) * (4 / den)
    const offset = Math.abs(t - (this.section_list[last_section] ?? 0))
    return { beat_at: offset / beat_ms + last_section, den }
  }

  get_beat_string(time: number) {
    const { beat_at, den } = this.get_beat_info(time)
    const base = Storage.settings.bar_from_0 ? beat_at : beat_at + 1
    return `${base.toFixed(2)}${den !== 4 ? `/${den}` : ''}`
  }

  /* ---------------- 校验 ---------------- */

  validate_chart() {
    const d = toRaw(this.diff)
    d.note = d.note.filter((n) => Number.isFinite(n.time))
    d.hold = d.hold.filter((h) => Number.isFinite(h.time) && h.segment.length > 0)
    d.timing = d.timing.filter((t) => t.bpm > 0)
    if (!d.timing.length) d.timing = [{ time: 0, bpm: 120, num: 4, den: 4 }]
    if (!d.wide) d.wide = []
    this.sort_all()
  }
}
