import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { toRaw } from 'vue'
import type { INotes } from '@type/note-types.ts'
import type { ISkinName } from '@type/ipc.ts'
import { Storage } from '@core/storage.ts'
import { GlobalStat } from '@core/globalStat.ts'
import { StopClass } from '@core/misc/eventhub.ts'
import { Skin } from '@core/misc/skin.ts'
import { notify } from '@core/misc/notify.ts'
import { NoteType, variant_to_type, type NoteVariant, type Tool } from '@core/misc/note-type.ts'
import {
  NoteClipboard,
  selected,
  type IClipboardItem,
  type IObjRef,
  type ObjKind
} from '@core/misc/note-clipboard.ts'
import { ease_lerp } from './ease'
import { DiffDrawer, flick_skin, tex_or_white } from './drawer'

interface IRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 拖拽开始时记录的基础值，用来把「鼠标位移」换算成「物件位移」 */
interface IDragState {
  active: boolean
  items: { ref: IObjRef; base: number[] }[]
  base_time: number
  delta_time: number
  delta_x: number
}

/**
 * hold 的放置状态。
 * 左键定头 -> 每次右键加一个节点 -> 最后一次左键收尾。
 * */
interface IHoldPending {
  active: boolean
  time: number
  x_pos: number
  /** 右键添加的中间节点 [time, x_pos] */
  nodes: [number, number][]
}

/**
 * hazard 的四步放置状态。
 * 左键 1: 定 time 与 x1
 * 左键 2: 定 x2（只允许水平移动）
 * 左键 3: 定 end 与 y1
 * 左键 4: 定 y2，然后自动整理顺序并生成
 * */
interface IHazardPending {
  step: 0 | 1 | 2 | 3
  time: number
  x1: number
  x2: number
  end: number
  y1: number
}

/** hazard 的六个原始数值（还没整理顺序） */
interface IHazardRaw {
  time: number
  end: number
  x1: number
  x2: number
  y1: number
  y2: number
}

/** 选中 hold / hazard 之后出现的蓝色控制点 */
interface IHandle {
  kind: 'hold' | 'hazard'
  ref: IObjRef
  /**
   * hold: 节点下标
   * hazard: 0=起点左 1=起点右 2=终点左 3=终点右 4=左边中点 5=右边中点
   * */
  index: number
  x: number
  y: number
}

const HANDLE_RADIUS = 6
const HANDLE_HIT = 10
/** 选 x2 / y2 时 hazard 预览的厚度（px），让位置好辨认 */
const HAZARD_PREVIEW_THICKNESS = 4

/**
 * 谱面编辑器。
 *
 * 交互约定：
 * - 没有选中任何物件类型（fn-note 里再点一次已选类型即可取消）时，左键拖动画布 = 框选
 * - 左键（空白处，有选中类型时）：
 *   - note / wide / chip / flick：单击放置
 *   - hold：左键定头，每次右键加一段，最后一次左键收尾
 *   - hazard：四次左键依次定 x1 / x2 / y1 / y2
 * - 左键（物件上）：拖动物件（时间吸附到当前分音）
 * - Ctrl + 左键点击：选中/取消选中
 * - 右键：删除鼠标下的物件；放在 hold 的蓝色节点上则删除该节点
 * - Delete：删除选中的物件；Ctrl+C/X/V：复制/剪切/粘贴；Ctrl+Z/Y：撤销/重做；Esc：取消当前放置
 * */
export class DiffEditor extends StopClass {
  drawer: DiffDrawer
  chart: DiffDrawer['chart']
  diff: DiffDrawer['diff']
  /** 覆盖层：选中框、框选矩形、控制点、待放置的预览 */
  overlay = new Container({ label: 'editor-overlay' })
  private select_gfx = new Graphics()
  private band_gfx = new Graphics()
  private handle_gfx = new Graphics()
  private ghost = new Container()
  private ghost_sprite = new Sprite({ texture: Texture.WHITE })
  private ghost_gfx = new Graphics()
  /** 剪贴板预览：贴在鼠标上的那一组物件 */
  private clip_ghost = new Container({ label: 'clipboard-ghost' })
  private clip_els: { kind: ObjKind; obj: IObjRef['obj']; el: Container }[] = []
  /** 记住上一次构建预览用的剪贴板数组，换了一份才重建 */
  private clip_src: IClipboardItem[] | null = null

  private pointer = { x: 0, y: 0, inside: false }
  private drag: IDragState = {
    active: false,
    items: [],
    base_time: 0,
    delta_time: 0,
    delta_x: 0
  }
  private handle_drag: { handle: IHandle; base: number[]; start_x: number } | null = null
  private hold_pending: IHoldPending = { active: false, time: 0, x_pos: 0, nodes: [] }
  private hazard_pending: IHazardPending = { step: 0, time: 0, x1: 0, x2: 0, end: 0, y1: 0 }
  private band = { active: false, x: 0, y: 0 }
  private start_raw_time = 0
  private start_raw_x = 0

  constructor(drawer: DiffDrawer) {
    super()
    this.drawer = drawer
    this.chart = drawer.chart
    this.diff = drawer.diff

    this.ghost.addChild(this.ghost_gfx, this.ghost_sprite)
    this.overlay.addChild(
      this.band_gfx,
      this.select_gfx,
      this.clip_ghost,
      this.ghost,
      this.handle_gfx
    )
    this.overlay.eventMode = 'none'
    this.drawer.app.stage.addChild(this.overlay)

    this.add_on('audio-time-update', () => this.redraw_overlay())
    this.add_on('fuck-shown', () => this.redraw_overlay())
    this.watch(selected, () => this.redraw_overlay(), { deep: true })
    this.watch(
      () => NoteType.tool,
      () => this.reset_pending()
    )
    this.add_stop(() => this.overlay.destroy({ children: true }))

    // 剪贴板/删除要按鼠标位置来，所以由编辑器绑定，快捷键系统只调用槽位
    this.bind_clipboard()
  }

  /** 把剪贴板/删除操作接到 NoteClipboard 上（对应 sv 的 bind_clipboard） */
  private bind_clipboard() {
    NoteClipboard.copy = () => this.copy(false)
    NoteClipboard.cut = () => this.copy(true)
    NoteClipboard.paste = () => this.paste()
    NoteClipboard.delete_selected = () => this.delete_selected()
    this.add_stop(() => {
      // 编辑器卸载后别留着一堆指向死对象的回调
      NoteClipboard.copy = () => {}
      NoteClipboard.cut = () => {}
      NoteClipboard.paste = () => {}
      NoteClipboard.delete_selected = () => {}
    })
  }

  /* ---------------- 坐标 ---------------- */

  get m() {
    return Storage.computes.mul.value
  }

  get c() {
    return this.chart.audio.current_ms
  }

  private event_time(y: number) {
    return this.drawer.mouse_time(y, this.c, this.m)
  }

  /** 按当前分音吸附；按住 Alt 时不吸附（和 sv 一样） */
  private snap_time(t: number) {
    if (GlobalStat.func_keys.value.alt) return Math.max(0, t)
    return Math.max(0, this.diff.nearest(t))
  }

  private reset_pending() {
    this.hold_pending = { active: false, time: 0, x_pos: 0, nodes: [] }
    this.hazard_pending = { step: 0, time: 0, x1: 0, x2: 0, end: 0, y1: 0 }
    this.redraw_overlay()
  }

  /* ---------------- 几何 / 命中检测 ---------------- */

  /** 物件在画布上占用的矩形（用于命中检测与选中框） */
  obj_rect(ref: IObjRef): IRect | null {
    const d = this.drawer
    const c = this.c
    const m = this.m
    const nw = Storage.settings.note_width
    const nh = Storage.settings.note_height
    switch (ref.kind) {
      case 'note':
      case 'hold': {
        const o = ref.obj as INotes.note | INotes.hold
        const head: IRect = {
          x1: d.x_of(o.x_pos) - nw / 2,
          y1: d.get_y(o.time, c, m, nh),
          x2: d.x_of(o.x_pos) + nw / 2,
          y2: d.get_y(o.time, c, m, nh) + nh
        }
        if (ref.kind === 'note') return head
        return union_rect(head, hold_body_rect(d, ref.obj as INotes.hold, c, m))
      }
      case 'wide': {
        const o = ref.obj as INotes.wide
        return {
          x1: d.track_left,
          y1: d.get_y(o.time, c, m, nh),
          x2: d.track_right,
          y2: d.get_y(o.time, c, m, nh) + nh
        }
      }
      case 'chip': {
        // chip 是正方形
        const o = ref.obj as INotes.chip
        return {
          x1: d.x_of(o.x_pos) - nh / 2,
          y1: d.get_y_line(o.time, c, m) - nh / 2,
          x2: d.x_of(o.x_pos) + nh / 2,
          y2: d.get_y_line(o.time, c, m) + nh / 2
        }
      }
      case 'flick': {
        // 宽度和贴图一样按原始比例算，选中框才会和画出来的 flick 等宽
        const o = ref.obj as INotes.flick
        const h = Storage.settings.flick_height
        const tex = tex_or_white(flick_skin(o.to))
        const w = tex.height ? h * (tex.width / tex.height) : h
        return {
          x1: d.x_of(o.x_pos) - w / 2,
          y1: d.get_y_line(o.time, c, m) - h / 2,
          x2: d.x_of(o.x_pos) + w / 2,
          y2: d.get_y_line(o.time, c, m) + h / 2
        }
      }
      case 'hazard':
        return hazard_rect(d, ref.obj as INotes.hazard, c, m)
      default:
        return null
    }
  }

  /** 找到鼠标下最靠前的物件（note 优先，方便点中） */
  private pick(): IObjRef | null {
    const order: ObjKind[] = ['note', 'chip', 'flick', 'wide', 'hold', 'hazard']
    const shown = this.diff.shown
    for (const kind of order) {
      const arr = toRaw(shown[kind as 'note']) as { time: number }[]
      for (let i = arr.length - 1; i >= 0; i--) {
        const ref: IObjRef = { kind, obj: arr[i] as IObjRef['obj'] }
        const r = this.obj_rect(ref)
        if (r && this.in_rect(this.pointer.x, this.pointer.y, r)) return ref
      }
    }
    return null
  }

  private in_rect(x: number, y: number, r: IRect, pad = 3) {
    return (
      x >= Math.min(r.x1, r.x2) - pad &&
      x <= Math.max(r.x1, r.x2) + pad &&
      y >= Math.min(r.y1, r.y2) - pad &&
      y <= Math.max(r.y1, r.y2) + pad
    )
  }

  /** 选中的 hold / hazard 上所有可拖拽的蓝色控制点 */
  handles(): IHandle[] {
    const d = this.drawer
    const c = this.c
    const m = this.m
    const nh = Storage.settings.note_height
    const out: IHandle[] = []
    for (const ref of selected.value) {
      if (ref.kind === 'hold') {
        const hold = toRaw(ref.obj) as INotes.hold
        hold_nodes(hold).forEach(([t, x], index) => {
          out.push({
            kind: 'hold',
            ref,
            index,
            x: d.x_of(x),
            y: d.get_y(t, c, m, nh) + nh / 2
          })
        })
      } else if (ref.kind === 'hazard') {
        const hz = toRaw(ref.obj) as INotes.hazard
        hazard_corners(hz).forEach(([t, x], index) => {
          out.push({ kind: 'hazard', ref, index, x: d.x_of(x), y: d.get_y_line(t, c, m) })
        })
        // 左右两条边的中点：拖动时同步平移该边的两个 x
        hazard_mids(hz).forEach(([t, x], i) => {
          out.push({ kind: 'hazard', ref, index: 4 + i, x: d.x_of(x), y: d.get_y_line(t, c, m) })
        })
      }
    }
    return out
  }

  private pick_handle(): IHandle | null {
    for (const h of this.handles()) {
      if (Math.hypot(h.x - this.pointer.x, h.y - this.pointer.y) <= HANDLE_HIT) return h
    }
    return null
  }

  /* ---------------- 放置 ---------------- */

  private place() {
    const tool = NoteType.tool
    if (!tool) return
    const time = this.snap_time(this.event_time(this.pointer.y))
    const x_pos = clamp_pos(this.drawer.pos_of(this.pointer.x))

    if (tool === 'hold') return this.place_hold(time, x_pos)
    if (tool === 'hazard') return this.place_hazard(time, x_pos)

    // 注意：除了 hold / hazard（放置后要立刻显示控制点），其余物件放完不选中
    if (tool === 'note') {
      if (NoteType.note_variant === 'wide') {
        this.diff.add_obj_with_undo('wide', { time } as INotes.wide)
        return
      }
      const note: INotes.note = {
        time,
        type: variant_to_type(NoteType.note_variant),
        x_pos
      }
      this.diff.add_obj_with_undo('note', note)
      return
    }
    if (tool === 'chip') {
      this.diff.add_obj_with_undo('chip', { time, x_pos } as INotes.chip)
      return
    }
    if (tool === 'flick') {
      this.diff.add_obj_with_undo('flick', { time, x_pos, to: NoteType.flick_dir } as INotes.flick)
      return
    }
  }

  /* -------- hold：左键头 / 右键节点 / 左键收尾 -------- */

  private place_hold(time: number, x_pos: number) {
    const p = this.hold_pending
    if (!p.active) {
      this.hold_pending = { active: true, time, x_pos, nodes: [] }
      return
    }
    const all: [number, number][] = [[p.time, p.x_pos], ...p.nodes, [time, x_pos]]
    for (let i = 1; i < all.length; i++) {
      if (all[i][0] <= all[i - 1][0]) {
        notify.error('hold 的节点必须一个比一个晚，先移动鼠标再点。')
        return
      }
    }
    const hold: INotes.hold = {
      time: all[0][0],
      x_pos: all[0][1],
      // 每一段是 [end_time, end_x, ease]，新建时都是 linear
      segment: all.slice(1).map(([t, x]) => [t, x, 0] as [number, number, number])
    }
    this.diff.add_obj_with_undo('hold', hold)
    NoteClipboard.set_selected([{ kind: 'hold', obj: hold }])
    this.hold_pending = { active: false, time: 0, x_pos: 0, nodes: [] }
  }

  private add_hold_node(time: number, x_pos: number) {
    const p = this.hold_pending
    if (!p.active) return
    const last = p.nodes.length ? p.nodes[p.nodes.length - 1][0] : p.time
    if (time <= last) {
      notify.error('新节点必须比上一个节点更晚。')
      return
    }
    p.nodes.push([time, x_pos])
  }

  /* -------- hazard：四次左键 -------- */

  private place_hazard(time: number, x_pos: number) {
    const h = this.hazard_pending
    switch (h.step) {
      case 0:
        this.hazard_pending = { step: 1, time, x1: x_pos, x2: x_pos, end: 0, y1: 0 }
        return
      case 1:
        // 第二步只允许水平移动
        this.hazard_pending = { ...h, step: 2, x2: x_pos }
        return
      case 2:
        this.hazard_pending = { ...h, step: 3, end: time, y1: x_pos }
        return
      case 3: {
        this.hazard_pending = { ...h, step: 0 }
        this.finish_hazard(h, x_pos)
        return
      }
    }
  }

  /** 整理四个点的顺序后生成 hazard（和预览共用 normalize_hazard） */
  private finish_hazard(h: IHazardPending, y2_raw: number) {
    const v = normalize_hazard({
      time: h.time,
      end: h.end,
      x1: h.x1,
      x2: h.x2,
      y1: h.y1,
      y2: y2_raw
    })

    const hazard: INotes.hazard = {
      time: v.time,
      end: v.end,
      x1: clamp_pos(v.x1),
      x2: clamp_pos(v.x2),
      y1: clamp_pos(v.y1),
      y2: clamp_pos(v.y2),
      e1: 0,
      e2: 0
    }
    this.diff.add_obj_with_undo('hazard', hazard)
    NoteClipboard.set_selected([{ kind: 'hazard', obj: hazard }])
  }

  /**
   * hazard 放置过程中「已经点出来的几步 + 鼠标当前位置」补成的完整数值，
   * 已经按落笔时的规则整理过（必要的话整体翻过来）。
   *
   * 这样第三点落在第一点后面（时间更早、屏幕上更靠下）时，预览也会跟着翻，
   * 而不是像以前那样被 max(…, time+1) 钉在起点上。
   * 返回 null 表示还没开始点。
   * */
  private hazard_preview(): IHazardRaw | null {
    const h = this.hazard_pending
    if (h.step === 0) return null
    const x_pos = clamp_pos(this.drawer.pos_of(this.pointer.x))
    const cur_time = this.snap_time(this.event_time(this.pointer.y))
    // 第 2 步（选 x2）时 end 还没定，先给「几个像素厚」的一个占位
    const thin = HAZARD_PREVIEW_THICKNESS / Math.max(this.m, 1e-6)
    const raw: IHazardRaw =
      h.step === 1
        ? { time: h.time, end: h.time + thin, x1: h.x1, x2: x_pos, y1: x_pos, y2: x_pos }
        : h.step === 2
          ? { time: h.time, end: cur_time, x1: h.x1, x2: h.x2, y1: x_pos, y2: x_pos }
          : { time: h.time, end: h.end, x1: h.x1, x2: h.x2, y1: h.y1, y2: x_pos }
    return normalize_hazard(raw)
  }

  /* ---------------- 拖拽物件 ---------------- */

  private start_drag(target: IObjRef) {
    const in_selection = selected.value.some((s) => toRaw(s.obj) === toRaw(target.obj))
    // 单独拖一个 hold / hazard 时把它选中：它们带控制点，选中后可以直接接着调
    const solo = target.kind === 'hold' || target.kind === 'hazard'
    let items: IObjRef[]
    if (in_selection) {
      items = selected.value.slice()
    } else {
      if (solo) NoteClipboard.set_selected([target])
      else NoteClipboard.set_selected([])
      items = [target]
    }
    this.drag = {
      active: true,
      items: items.map((ref) => ({ ref, base: base_values(ref) })),
      /*
       * 吸附的基准取「被拖动的那个物件自己的时间」，**不是**鼠标下的时间。
       * 用鼠标时间当基准的话，算出来的是「物件相对网格的位移」，
       * 结果就是物件和线永远保持原来那个时间差、怎么拖都吸不上去。
       * 用物件自己的时间当基准，它就会正好落在线上；
       * 多选时其余物件仍然是整体位移，相互之间的相对关系不变。
       * */
      base_time: (toRaw(target.obj) as { time: number }).time,
      delta_time: 0,
      delta_x: 0
    }
  }

  private update_drag() {
    if (!this.drag.active) return
    const time_now = this.event_time(this.pointer.y)
    const x_now = this.drawer.pos_of(this.pointer.x)
    // 时间整体吸附，保持选中物件之间的相对关系
    const dt =
      this.snap_time(this.drag.base_time + (time_now - this.start_raw_time)) - this.drag.base_time
    const dx = x_now - this.start_raw_x
    this.drag.delta_time = dt
    this.drag.delta_x = dx
    for (const item of this.drag.items) apply_values(item.ref, item.base, dt, dx)
    this.diff.update_diff_counts()
  }

  private end_drag(commit: boolean) {
    if (!this.drag.active) return
    const items = this.drag.items.slice()
    const dt = this.drag.delta_time
    const dx = this.drag.delta_x
    const refs = items.map((x) => x.ref)
    const bases = items.map((x) => x.base)
    // 先还原，再决定是「撤销回到这里」还是「重新应用一次位移」
    refs.forEach((r, i) => reset_from_base(r, bases[i]))
    if (commit && (dt !== 0 || dx !== 0)) {
      this.diff.push_undo(() => refs.forEach((r, i) => reset_from_base(r, bases[i])))
      refs.forEach((r, i) => apply_values(r, bases[i], dt, dx))
    }
    this.diff.update_diff_counts()
    this.chart.mark_changed()
    this.drag = { active: false, items: [], base_time: 0, delta_time: 0, delta_x: 0 }
  }

  /* ---------------- 拖拽控制点 ---------------- */

  private start_handle_drag(h: IHandle) {
    const raw = toRaw(h.ref.obj)
    const start_x = this.drawer.pos_of(this.pointer.x)
    if (h.kind === 'hold') {
      const hold = raw as INotes.hold
      this.handle_drag = { handle: h, base: [...hold_nodes(hold)[h.index]], start_x }
    } else {
      const hz = raw as INotes.hazard
      // 边中点记的是整条边的两个 x；角点记的是 [时间, x]
      const base =
        h.index >= 4 ? hz_side_values(hz, h.index) : [...hazard_corners(hz)[h.index]]
      this.handle_drag = { handle: h, base, start_x }
    }
  }

  private update_handle_drag() {
    const hd = this.handle_drag
    if (!hd) return
    const time = this.event_time(this.pointer.y)
    const x_pos = clamp_pos(this.drawer.pos_of(this.pointer.x))
    if (hd.handle.kind === 'hold') {
      const hold = toRaw(hd.handle.ref.obj) as INotes.hold
      const nodes = hold_nodes(hold)
      const i = hd.handle.index
      let t = this.snap_time(time)
      if (i > 0) t = Math.max(t, nodes[i - 1][0] + 1)
      if (i < nodes.length - 1) t = Math.min(t, nodes[i + 1][0] - 1)
      set_hold_node(hold, i, t, x_pos)
      // 形状是画死在 Graphics 里的，拖动时要重建才能实时跟着走
      this.drawer.refresh_hold(hold)
    } else {
      const hz = toRaw(hd.handle.ref.obj) as INotes.hazard
      const i = hd.handle.index
      // 边中点：时间不动，只按鼠标横向位移同步平移该边的两个 x
      if (i >= 4) {
        const dx = this.drawer.pos_of(this.pointer.x) - hd.start_x
        set_hazard_side(hz, i, clamp_pos(hd.base[0] + dx), clamp_pos(hd.base[1] + dx))
        this.drawer.refresh_hazard(hz)
        this.diff.update_diff_counts()
        return
      }
      let t = this.snap_time(time)
      if (i < 2) {
        // 起点两个角：只能落在 end 之前
        t = Math.min(t, hz.end - 1)
        hz.time = Math.max(0, t)
        if (i === 0) hz.x1 = x_pos
        else hz.x2 = x_pos
      } else {
        t = Math.max(t, hz.time + 1)
        hz.end = t
        if (i === 2) hz.y1 = x_pos
        else hz.y2 = x_pos
      }
      this.drawer.refresh_hazard(hz)
    }
    this.diff.update_diff_counts()
  }

  private end_handle_drag(commit: boolean) {
    const hd = this.handle_drag
    if (!hd) return
    const raw = toRaw(hd.handle.ref.obj)
    const [bt, bx] = hd.base
    if (commit) {
      const idx = hd.handle.index
      if (hd.handle.kind === 'hold') {
        const hold = raw as INotes.hold
        const before = [...hold_nodes(hold)[idx]]
        this.diff.push_undo(() => set_hold_node(hold, idx, before[0], before[1]))
      } else {
        const hz = raw as INotes.hazard
        if (idx >= 4) {
          const before = hz_side_values(hz, idx)
          this.diff.push_undo(() => set_hazard_side(hz, idx, before[0], before[1]))
        } else {
          const before = hz_corner_values(hz, idx)
          this.diff.push_undo(() => set_hazard_corner(hz, idx, before[0], before[1]))
        }
      }
    } else {
      if (hd.handle.kind === 'hold') set_hold_node(raw as INotes.hold, hd.handle.index, bt, bx)
      else if (hd.handle.index >= 4)
        set_hazard_side(raw as INotes.hazard, hd.handle.index, bt, bx)
      else set_hazard_corner(raw as INotes.hazard, hd.handle.index, bt, bx)
    }
    this.diff.update_diff_counts()
    this.chart.mark_changed()
    this.handle_drag = null
  }

  /* ---------------- 鼠标事件 ---------------- */

  private set_pointer(e: MouseEvent) {
    const r = this.drawer.app.canvas.getBoundingClientRect()
    this.pointer.x = e.clientX - r.left
    this.pointer.y = e.clientY - r.top
  }

  private on_mousemove = (e: MouseEvent) => {
    this.set_pointer(e)
    this.pointer.inside = true

    if (this.band.active) return this.redraw_overlay()
    if (this.handle_drag) {
      this.update_handle_drag()
      return this.redraw_overlay()
    }
    if (this.drag.active) {
      this.update_drag()
      return this.redraw_overlay()
    }
    this.redraw_overlay()
  }

  private on_mousedown = (e: MouseEvent) => {
    this.set_pointer(e)
    if (e.button === 2) return

    // 1. 控制点优先
    const handle = this.pick_handle()
    if (handle && !e.ctrlKey) {
      this.start_handle_drag(handle)
      return
    }

    const target = this.pick()
    if (e.ctrlKey) {
      if (target) NoteClipboard.toggle(target)
      else this.band = { active: true, x: this.pointer.x, y: this.pointer.y }
      this.redraw_overlay()
      return
    }
    if (target) {
      this.start_drag(target)
      this.start_raw_time = this.event_time(this.pointer.y)
      this.start_raw_x = this.drawer.pos_of(this.pointer.x)
      return
    }
    // 2. 空白处：剪贴板里有东西时左键 = 粘贴（和 sv 一样，此时忽略当前工具）
    if (this.has_clipboard) {
      this.paste()
      return
    }
    // 3. 空白处：没有选中物件类型时拖动 = 框选
    if (NoteType.tool === null) {
      this.band = { active: true, x: this.pointer.x, y: this.pointer.y }
      this.redraw_overlay()
      return
    }
    this.place()
    this.redraw_overlay()
  }

  private on_mouseup = (e: MouseEvent) => {
    if (e.button === 2) return
    this.set_pointer(e)

    if (this.band.active) {
      this.finish_band(e.ctrlKey)
      this.band = { active: false, x: 0, y: 0 }
      this.redraw_overlay()
      return
    }
    if (this.handle_drag) {
      this.end_handle_drag(true)
      this.redraw_overlay()
      return
    }
    if (this.drag.active) {
      this.end_drag(true)
      this.redraw_overlay()
    }
  }

  private on_contextmenu = (e: MouseEvent) => {
    e.preventDefault()
    this.set_pointer(e)

    // hold 放置中：右键 = 加一个节点
    if (this.hold_pending.active && NoteType.tool === 'hold') {
      this.add_hold_node(
        this.snap_time(this.event_time(this.pointer.y)),
        clamp_pos(this.drawer.pos_of(this.pointer.x))
      )
      this.redraw_overlay()
      return
    }
    // hazard 放置中：右键 = 取消
    if (this.hazard_pending.step > 0) {
      this.reset_pending()
      return
    }
    // hold 的蓝色节点：右键 = 移除该节点
    const handle = this.pick_handle()
    if (handle && handle.kind === 'hold') {
      const hold = toRaw(handle.ref.obj) as INotes.hold
      const before = hold_nodes(hold).map((n) => [...n] as [number, number])
      if (remove_hold_node(hold, handle.index)) {
        this.diff.push_undo(() => restore_hold_nodes(hold, before))
        this.diff.update_diff_counts()
        this.chart.mark_changed()
        this.redraw_overlay()
      }
      return
    }
    // 普通删除
    const target = this.pick()
    if (!target) return
    const in_sel = selected.value.some((s) => toRaw(s.obj) === toRaw(target.obj))
    if (in_sel) {
      this.diff.remove_obj_with_undo(...selected.value)
      NoteClipboard.clear_selected()
    } else {
      this.diff.remove_obj_with_undo(target)
    }
    this.redraw_overlay()
  }

  private on_mouseleave = () => {
    this.pointer.inside = false
    this.redraw_overlay()
  }

  /* ---------------- 框选 ---------------- */

  private finish_band(add: boolean) {
    const r = this.band_rect()
    // 只是点了一下的话不算框选
    if (r.x2 - r.x1 < 3 && r.y2 - r.y1 < 3) {
      if (!add) NoteClipboard.clear_selected()
      return
    }
    /*
     * 判定用的就是屏幕上画出来的那个框（同一个 band_rect），
     * 再和 obj_rect（物件实际占的矩形）求相交：框住谁就选中谁。
     *
     * 以前是按「时间 ±60ms + 矩形中心 x」来判：比画出来的框多出 120ms，
     * 长条（hold / hazard）又只比 head 时间，视觉和结果对不上。
     * */
    const picked: IObjRef[] = []
    const shown = this.diff.shown
    for (const kind of ['note', 'hold', 'wide', 'chip', 'flick', 'hazard'] as ObjKind[]) {
      for (const obj of toRaw(shown[kind as 'note']) as { time: number }[]) {
        const ref: IObjRef = { kind, obj: obj as IObjRef['obj'] }
        const o = this.obj_rect(ref)
        if (!o || !rect_hit(o, r)) continue
        picked.push(ref)
      }
    }
    NoteClipboard.set_selected(add ? [...selected.value, ...picked] : picked)
  }

  /** 框选框的两个角（像素坐标）。画出来的框和判定用的框都从这儿来，保证一致。 */
  private band_rect(): IRect {
    return {
      x1: Math.min(this.band.x, this.pointer.x),
      y1: Math.min(this.band.y, this.pointer.y),
      x2: Math.max(this.band.x, this.pointer.x),
      y2: Math.max(this.band.y, this.pointer.y)
    }
  }

  /* ---------------- hazard 放置 ---------------- */

  /**
   * hazard 放置时红点的位置。
   *
   * 第 1 步（选 x2）和第 3 步（选 y2）只允许水平移动，时间已经被锁住，
   * 所以红点也跟着固定在对应的时间线上；其余步骤跟随鼠标。
   */
  private hazard_dot(): { x: number; y: number } {
    const d = this.drawer
    const h = this.hazard_pending
    const x = d.x_of(clamp_pos(d.pos_of(this.pointer.x)))
    let time: number
    if (h.step === 1) time = h.time // 选 x2：锁在起点时间
    else if (h.step === 3) time = h.end // 选 y2：锁在终点时间
    else time = this.snap_time(this.event_time(this.pointer.y))
    return { x, y: d.get_y_line(time, this.c, this.m) }
  }

  /* ---------------- 剪贴板 ---------------- */

  /**
   * 复制 / 剪切：把选中的物件时间归一化到 0 后放进剪贴板。
   *
   * 和 sv 一致：
   * - 复制/剪切之后**清空选择**，剪贴板内容变成跟着鼠标的待放置预览
   * - 剪切才真的删除物件
   */
  copy(cut = false) {
    if (!selected.value.length) return
    const items = selected.value.map((s) => ({
      kind: s.kind,
      obj: toRaw(s.obj) as IObjRef['obj']
    }))
    const min = Math.min(...items.map((x) => x.obj.time))
    NoteClipboard.clipboard.value = items.map((x) => ({
      kind: x.kind,
      obj: shift_time(x.kind, x.obj, -min)
    }))
    if (cut) this.diff.remove_obj_with_undo(...selected.value)
    NoteClipboard.clear_selected()
    this.redraw_overlay()
  }

  /**
   * 粘贴：把剪贴板落到鼠标当前的那一帧上。
   *
   * 和 sv 一致：x_pos 保持原样（只有时间平移），落下去之后清空剪贴板，
   * 而且**不**把新物件选起来。
   */
  paste() {
    if (!NoteClipboard.clipboard.value.length) return
    const at = this.snap_time(this.event_time(this.pointer.y))
    const items: IObjRef[] = NoteClipboard.clipboard.value.map((x) => ({
      kind: x.kind,
      obj: shift_time(x.kind, x.obj, at)
    }))
    this.diff.add_objs_with_undo(items)
    NoteClipboard.clear()
    this.redraw_overlay()
  }

  delete_selected() {
    if (!selected.value.length) return
    this.diff.remove_obj_with_undo(...selected.value)
    NoteClipboard.clear_selected()
  }

  /** 剪贴板里有没有东西（面板/预览用） */
  get has_clipboard() {
    return NoteClipboard.clipboard.value.length > 0
  }

  /** 重建剪贴板预览（剪贴板换了内容才重建，之后每帧只改位置） */
  private rebuild_clip_ghost() {
    const items = NoteClipboard.clipboard.value
    if (items === this.clip_src) return
    this.clip_src = items
    for (const g of this.clip_els) g.el.destroy({ children: true })
    this.clip_els = []
    for (const item of items) {
      const el = this.drawer.build_element(item.kind, item.obj)
      if (!el) continue
      el.alpha = 0.6
      this.clip_ghost.addChild(el)
      this.clip_els.push({ kind: item.kind, obj: item.obj, el })
    }
  }

  /** 把预览摆到鼠标当前的那一帧 */
  private update_clip_ghost() {
    const c = this.c
    const m = this.m
    const at = this.snap_time(this.event_time(this.pointer.y))
    for (const g of this.clip_els) {
      this.drawer.place_element(g.kind, g.el, g.obj, at + g.obj.time, c, m)
    }
  }

  /* ---------------- 绘制覆盖层 ---------------- */

  redraw_overlay() {
    const d = this.drawer
    const c = this.c
    const m = this.m
    const nw = Storage.settings.note_width
    const nh = Storage.settings.note_height

    // 选中框
    this.select_gfx.clear()
    for (const s of selected.value) {
      const r = this.obj_rect(s)
      if (!r) continue
      const x = Math.min(r.x1, r.x2) - 3
      const y = Math.min(r.y1, r.y2) - 3
      this.select_gfx
        .rect(x, y, Math.abs(r.x2 - r.x1) + 6, Math.abs(r.y2 - r.y1) + 6)
        .stroke({ width: 2, color: 0xffd700 })
    }

    // 框选矩形
    this.band_gfx.clear()
    if (this.band.active) {
      const r = this.band_rect()
      this.band_gfx
        .rect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1)
        .fill({ color: 0xb8dcee, alpha: 0.25 })
        .stroke({ width: 1, color: 0xb8dcee })
    }

    // 蓝色控制点
    this.handle_gfx.clear()
    for (const h of this.handles()) {
      this.handle_gfx
        .circle(h.x, h.y, HANDLE_RADIUS)
        .fill({ color: 0x2b7fff, alpha: 0.9 })
        .stroke({ width: 2, color: 0xffffff })
    }

    // hazard 模式下用红点确认鼠标位置（位置同样按当前分音吸附，按住 Alt 则不吸附）
    // 剪贴板里有东西时左键是粘贴，不再画这个点
    if (NoteType.tool === 'hazard' && this.pointer.inside && !this.has_clipboard) {
      const dot = this.hazard_dot()
      this.handle_gfx
        .circle(dot.x, dot.y, 6)
        .fill({ color: 0xff0000, alpha: 0.9 })
        .stroke({ width: 2, color: 0xffffff })
    }

    // 剪贴板预览：有内容时它顶掉普通的放置预览（模仿 sv 的 pending）
    this.rebuild_clip_ghost()
    this.clip_ghost.visible =
      this.has_clipboard && this.pointer.inside && !this.drag.active && !this.handle_drag
    if (this.clip_ghost.visible) this.update_clip_ghost()

    // 放置预览
    this.ghost.visible =
      this.pointer.inside && !this.drag.active && !this.handle_drag && !this.has_clipboard
    this.ghost_sprite.visible = false
    this.ghost_gfx.clear()
    if (!this.ghost.visible) return

    const time = this.snap_time(this.event_time(this.pointer.y))
    const x_pos = clamp_pos(d.pos_of(this.pointer.x))
    const tool = NoteType.tool

    // hold 放置中：头部 + 已定节点 + 当前鼠标
    if (this.hold_pending.active) {
      const p = this.hold_pending
      const pts: [number, number][] = [[p.time, p.x_pos], ...p.nodes, [time, x_pos]]
      const to_px = (t: number, x: number): [number, number] => [
        d.x_of(x),
        d.get_y(t, c, m, nh) + nh / 2
      ]
      const [hx, hy] = to_px(p.time, p.x_pos)
      this.ghost_gfx.moveTo(hx, hy)
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = to_px(pts[i][0], pts[i][1])
        this.ghost_gfx.lineTo(px, py)
      }
      this.ghost_gfx.stroke({
        width: Storage.settings.hold_line_width,
        color: 0x000000,
        cap: 'round',
        join: 'round'
      })
      for (const [t, x] of pts) {
        const [px, py] = to_px(t, x)
        this.ghost_gfx.circle(px, py, 4).fill({ color: 0x2b7fff, alpha: 0.9 })
      }
      this.ghost_sprite.visible = true
      this.ghost_sprite.texture = ghost_texture('hold', 'normal')
      this.ghost_sprite.anchor.set(0.5, 0)
      this.ghost_sprite.width = nw
      this.ghost_sprite.height = nh
      this.ghost_sprite.alpha = 0.6
      this.ghost_sprite.x = hx
      this.ghost_sprite.y = hy - nh / 2
      return
    }

    // hazard：只画预览四边形，任何情况下都不显示 note 贴图
    if (tool === 'hazard') {
      // 还没开始点，什么都不画
      const p = this.hazard_preview()
      if (!p) return

      const y_top = d.get_y_line(p.time, c, m)
      const y_bottom = d.get_y_line(p.end, c, m)

      // 两条边的端点各自按 x 排序后再连：
      // 鼠标越过另一条边时预览就不会自交（自交的多边形填充会翻来翻去变成三角形）
      const s_left = d.x_of(Math.min(p.x1, p.x2))
      const s_right = d.x_of(Math.max(p.x1, p.x2))
      const e_left = d.x_of(Math.min(p.y1, p.y2))
      const e_right = d.x_of(Math.max(p.y1, p.y2))

      this.ghost_gfx
        .moveTo(s_left, y_top)
        .lineTo(s_right, y_top)
        .lineTo(e_right, y_bottom)
        .lineTo(e_left, y_bottom)
        .lineTo(s_left, y_top)
        .fill({ color: Storage.settings.hazard_color, alpha: 0.35 })
        .stroke({ width: 1, color: Storage.settings.hazard_color })
      return
    }

    if (!tool) return

    this.ghost_sprite.visible = true
    this.ghost_sprite.alpha = 0.6
    this.ghost_sprite.anchor.set(0.5, 0.5)
    this.ghost_sprite.texture = ghost_texture(tool, NoteType.note_variant)
    if (tool === 'note' && NoteType.note_variant === 'wide') {
      this.ghost_sprite.width = d.track_width
      this.ghost_sprite.height = nh
      this.ghost_sprite.x = d.x_of(50)
      this.ghost_sprite.y = d.get_y_line(time, c, m)
      return
    }
    if (tool === 'chip') {
      // chip 是正方形
      this.ghost_sprite.width = nh
      this.ghost_sprite.height = nh
    } else if (tool === 'flick') {
      const fh = Storage.settings.flick_height
      this.ghost_sprite.height = fh
      this.ghost_sprite.width = fh * 1.5
    } else {
      this.ghost_sprite.width = nw
      this.ghost_sprite.height = nh
    }
    this.ghost_sprite.x = d.x_of(x_pos)
    this.ghost_sprite.y =
      tool === 'note' ? d.get_y(time, c, m, nh) + nh / 2 : d.get_y_line(time, c, m)
  }

  /* ---------------- 绑定 ---------------- */

  listen() {
    const canvas = this.drawer.app.canvas
    canvas.addEventListener('mousemove', this.on_mousemove)
    canvas.addEventListener('mousedown', this.on_mousedown)
    canvas.addEventListener('mouseup', this.on_mouseup)
    canvas.addEventListener('contextmenu', this.on_contextmenu)
    canvas.addEventListener('mouseleave', this.on_mouseleave)

    const key = (e: KeyboardEvent) => this.on_keydown(e)
    window.addEventListener('keydown', key)

    this.add_stop(() => {
      canvas.removeEventListener('mousemove', this.on_mousemove)
      canvas.removeEventListener('mousedown', this.on_mousedown)
      canvas.removeEventListener('mouseup', this.on_mouseup)
      canvas.removeEventListener('contextmenu', this.on_contextmenu)
      canvas.removeEventListener('mouseleave', this.on_mouseleave)
      window.removeEventListener('keydown', key)
    })
  }

  /** 只处理 Esc；其余快捷键都走 core/misc/shortcut.ts */
  private on_keydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    if (e.key === 'Escape') {
      // Esc 也把剪贴板清掉：否则「左键 = 粘贴」的模式出不去
      NoteClipboard.clear_selected()
      NoteClipboard.clear()
      this.reset_pending()
      return
    }
    this.redraw_overlay()
  }
}

/* ---------------- hold 的节点操作 ---------------- */

/** hold 的所有节点：[头, ...每段终点] */
export function hold_nodes(hold: INotes.hold): [number, number][] {
  return [[hold.time, hold.x_pos], ...hold.segment.map((s) => [s[0], s[1]] as [number, number])]
}

function set_hold_node(hold: INotes.hold, i: number, t: number, x: number) {
  if (i === 0) {
    hold.time = t
    hold.x_pos = x
  } else if (hold.segment[i - 1]) {
    hold.segment[i - 1][0] = t
    hold.segment[i - 1][1] = x
  }
}

/** 移除第 i 个节点（头/尾/中间都能删），把相邻两段接起来 */
export function remove_hold_node(hold: INotes.hold, i: number): boolean {
  if (i === 0) {
    if (!hold.segment.length) return false
    hold.time = hold.segment[0][0]
    hold.x_pos = hold.segment[0][1]
    hold.segment.shift()
    return true
  }
  if (i === hold.segment.length) {
    hold.segment.pop()
    return true
  }
  if (i > 0 && i < hold.segment.length) {
    // 前一段直接连到第 i+1 个节点，保留前一段的 ease
    hold.segment[i - 1] = [hold.segment[i][0], hold.segment[i][1], hold.segment[i - 1][2]]
    hold.segment.splice(i, 1)
    return true
  }
  return false
}

/** 撤销「删除节点」用：整体还原节点列表 */
export function restore_hold_nodes(hold: INotes.hold, nodes: [number, number][]) {
  if (!nodes.length) return
  hold.time = nodes[0][0]
  hold.x_pos = nodes[0][1]
  const eases = hold.segment.map((s) => s[2])
  hold.segment = nodes.slice(1).map(([t, x], i) => [t, x, eases[i] ?? 0] as [number, number, number])
}

/* ---------------- hazard 的四个角 ---------------- */

/**
 * 把用户点出来的六个值整理成合法的 hazard（生成和预览共用这一份规则）。
 *
 * 1. 第三点的时间比第一点早（在屏幕上就是画到了下面）→ 整体翻过来，
 *    两条边也跟着对调，这样起点永远在时间轴上更靠前的那一端；
 * 2. 起点左右画反了就交换，并保持左右对应；
 * 3. 终点上下顺序。
 * */
function normalize_hazard(v: IHazardRaw): IHazardRaw {
  let { time, end, x1, x2, y1, y2 } = v
  if (end < time) {
    ;[time, end] = [end, time]
    ;[x1, x2, y1, y2] = [y1, y2, x1, x2]
  }
  if (x1 > x2) {
    ;[x1, x2] = [x2, x1]
    ;[y1, y2] = [y2, y1]
  }
  if (y1 > y2) [y1, y2] = [y2, y1]
  if (end <= time) end = time + 1
  return { time, end, x1, x2, y1, y2 }
}

/** [起点左, 起点右, 终点左, 终点右] 的 [时间, x_pos] */
function hazard_corners(hz: INotes.hazard): [number, number][] {
  return [
    [hz.time, hz.x1],
    [hz.time, hz.x2],
    [hz.end, hz.y1],
    [hz.end, hz.y2]
  ]
}

function hz_corner_values(hz: INotes.hazard, i: number): [number, number] {
  return hazard_corners(hz)[i]
}

/** 左右两条边的中点 [时间, x]，用来同步平移整条边 */
function hazard_mids(hz: INotes.hazard): [number, number][] {
  const t = (hz.time + hz.end) / 2
  return [
    [t, ease_lerp(hz.x1, hz.y1, 0.5, hz.e1)],
    [t, ease_lerp(hz.x2, hz.y2, 0.5, hz.e2)]
  ]
}

/** 4 = 左边 (x1, y1)，5 = 右边 (x2, y2) */
function hz_side_values(hz: INotes.hazard, index: number): [number, number] {
  return index === 4 ? [hz.x1, hz.y1] : [hz.x2, hz.y2]
}

function set_hazard_side(hz: INotes.hazard, index: number, a: number, b: number) {
  if (index === 4) {
    hz.x1 = a
    hz.y1 = b
  } else {
    hz.x2 = a
    hz.y2 = b
  }
}

function set_hazard_corner(hz: INotes.hazard, i: number, t: number, x: number) {
  if (i === 0) {
    hz.time = t
    hz.x1 = x
  } else if (i === 1) {
    hz.time = t
    hz.x2 = x
  } else if (i === 2) {
    hz.end = t
    hz.y1 = x
  } else {
    hz.end = t
    hz.y2 = x
  }
}

/* ---------------- 工具函数 ---------------- */

/**
 * 深拷贝一个物件并把它的时间整体平移 dt。
 * hold 的每一段、hazard 的 end 都要跟着走，所以不能只改 time。
 * */
function shift_time(kind: ObjKind, obj: IObjRef['obj'], dt: number): IObjRef['obj'] {
  switch (kind) {
    case 'hold': {
      const h = obj as INotes.hold
      return {
        ...h,
        time: h.time + dt,
        segment: h.segment.map((s) => [s[0] + dt, s[1], s[2]] as [number, number, number])
      }
    }
    case 'hazard': {
      const hz = obj as INotes.hazard
      return { ...hz, time: hz.time + dt, end: hz.end + dt }
    }
    case 'note':
    case 'wide':
    case 'chip':
    case 'flick':
      return { ...(obj as { time: number }), time: (obj as { time: number }).time + dt } as IObjRef['obj']
  }
}

function clamp_pos(v: number) {
  return Math.max(0, Math.min(100, v))
}

/** 当前要放置的物件应该显示哪张贴图（缺图时用白块兜底） */
function ghost_texture(tool: Tool, variant: NoteVariant): Texture {
  let name: ISkinName = 'note'
  if (tool === 'chip') name = 'chip'
  else if (tool === 'flick') name = flick_skin(NoteType.flick_dir)
  else if (tool === 'note' && variant === 'ex') name = 'exnote'
  else if (tool === 'note' && variant === 'critical') name = 'critical'
  return Skin.getTexture(name) ?? Texture.WHITE
}

/** 读取物件用于拖拽的基础值 */
function base_values(ref: IObjRef): number[] {
  const o = toRaw(ref.obj) as unknown as Record<string, number>
  switch (ref.kind) {
    case 'note':
    case 'chip':
    case 'flick':
      return [o.time, o.x_pos]
    case 'hold': {
      // [time, x_pos, 每段的 (time, x) ...]，段的值也必须记下来，
      // 否则每次 mousemove 都在上一次的结果上再位移一次（会飞出去）
      const hold = toRaw(ref.obj) as INotes.hold
      const r = [hold.time, hold.x_pos]
      for (const seg of hold.segment) r.push(seg[0], seg[1])
      return r
    }
    case 'wide':
      return [o.time]
    case 'hazard':
      return [o.time, o.end, o.x1, o.x2, o.y1, o.y2]
    default:
      return [o.time]
  }
}

/**
 * 整体平移的横向位移量，夹到「所有点都还在 0~100 内」的范围。
 * 如果逐点各自 clamp，形状会被压扁而不是整体移动。
 */
function clamp_dx(dx: number, min_x: number, max_x: number) {
  return Math.max(-min_x, Math.min(dx, 100 - max_x))
}

/** 按基础值 + 位移写回物件 */
function apply_values(ref: IObjRef, base: number[], dt: number, dx: number) {
  const o = toRaw(ref.obj) as unknown as Record<string, number>
  switch (ref.kind) {
    case 'note':
    case 'chip':
    case 'flick': {
      o.time = Math.max(0, base[0] + dt)
      o.x_pos = clamp_pos(base[1] + dx)
      break
    }
    case 'hold': {
      const hold = toRaw(ref.obj) as INotes.hold
      const xs = [base[1]]
      for (let i = 3; i < base.length; i += 2) xs.push(base[i])
      const d = clamp_dx(dx, Math.min(...xs), Math.max(...xs))
      hold.time = Math.max(0, base[0] + dt)
      hold.x_pos = base[1] + d
      hold.segment.forEach((seg, i) => {
        seg[0] = Math.max(0, base[2 + i * 2] + dt)
        seg[1] = base[3 + i * 2] + d
      })
      break
    }
    case 'wide':
      o.time = Math.max(0, base[0] + dt)
      break
    case 'hazard': {
      // 每个角各自夹到 0~100：拖到边界时边界被压住，另一侧继续走（形状被压缩），
      // 而不是整块一起停下
      o.time = Math.max(0, base[0] + dt)
      o.end = Math.max(0, base[1] + dt)
      o.x1 = clamp_pos(base[2] + dx)
      o.x2 = clamp_pos(base[3] + dx)
      o.y1 = clamp_pos(base[4] + dx)
      o.y2 = clamp_pos(base[5] + dx)
      break
    }
  }
}

function reset_from_base(ref: IObjRef, base: number[]) {
  apply_values(ref, base, 0, 0)
}

/** 物件的矩形和框选框是否相交 */
function rect_hit(r: IRect, band: IRect) {
  return !(
    Math.max(r.x1, r.x2) < band.x1 ||
    Math.min(r.x1, r.x2) > band.x2 ||
    Math.max(r.y1, r.y2) < band.y1 ||
    Math.min(r.y1, r.y2) > band.y2
  )
}

function union_rect(a: IRect, b: IRect | null): IRect {
  if (!b) return a
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2)
  }
}

/** hold 身体（黑色折线）的包围盒 */
function hold_body_rect(d: DiffDrawer, hold: INotes.hold, c: number, m: number): IRect | null {
  if (!hold.segment.length) return null
  const nh = Storage.settings.note_height
  const half = Storage.settings.hold_line_width / 2
  let x1 = Infinity
  let x2 = -Infinity
  let y1 = Infinity
  let y2 = -Infinity
  let t0 = hold.time
  let x0 = hold.x_pos
  for (const seg of hold.segment) {
    const steps = 12
    for (let i = 0; i <= steps; i++) {
      const p = i / steps
      const t = t0 + (seg[0] - t0) * p
      const x = d.x_of(ease_lerp(x0, seg[1], p, seg[2]))
      const y = d.get_y(t, c, m, nh) + nh / 2
      x1 = Math.min(x1, x - half)
      x2 = Math.max(x2, x + half)
      y1 = Math.min(y1, y - half)
      y2 = Math.max(y2, y + half)
    }
    t0 = seg[0]
    x0 = seg[1]
  }
  if (!Number.isFinite(x1)) return null
  return { x1, y1, x2, y2 }
}

function hazard_rect(d: DiffDrawer, hz: INotes.hazard, c: number, m: number): IRect {
  const steps = 16
  let x1 = Infinity
  let x2 = -Infinity
  let y1 = Infinity
  let y2 = -Infinity
  for (let i = 0; i <= steps; i++) {
    const p = i / steps
    const t = hz.time + (hz.end - hz.time) * p
    const y = d.get_y_line(t, c, m)
    const lx = d.x_of(ease_lerp(hz.x1, hz.y1, p, hz.e1))
    const rx = d.x_of(ease_lerp(hz.x2, hz.y2, p, hz.e2))
    x1 = Math.min(x1, lx, rx)
    x2 = Math.max(x2, lx, rx)
    y1 = Math.min(y1, y)
    y2 = Math.max(y2, y)
  }
  return { x1, y1, x2, y2 }
}
