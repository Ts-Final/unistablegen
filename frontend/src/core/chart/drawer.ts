import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture
} from 'pixi.js'
import { toRaw } from 'vue'
import type { INotes } from '@type/note-types.ts'
import { Storage } from '@core/storage.ts'
import { StopClass } from '@core/misc/eventhub.ts'
import { Skin } from '@core/misc/skin.ts'
import type { IObjRef, ObjKind } from '@core/misc/note-clipboard.ts'
import { ease_lerp } from './ease'
import type { Chart_diff } from './diff'
import type { Chart } from './chart'

/** 画布高度恒为显示屏高度 */
export const SCREEN_HEIGHT = window.screen.height

/** 轨道左右各留出的固定空白（px）：小节号 / bpm 在空白里渲染 */
export const SIDE_MARGIN = 50

/** 分隔空白与轨道的白线宽度（px） */
const SEP_LINE = 6

/**
 * 一堆同类型元素的容器。
 * 每次重算可见区间时，只对「新出现/已消失」的元素做创建/销毁，避免全量重建。
 * */
export class DrawerExtension<T extends Container, K> extends StopClass {
  elements = new Map<K, T>()
  create_el: (key: K) => T | null
  container: Container
  visible = true

  constructor(create_el: (key: K) => T | null, label = '') {
    super()
    this.container = new Container({ label })
    this.create_el = create_el
  }

  recreate(...keys: K[]) {
    const old = new Set(this.elements.keys())
    const next = new Set(keys)
    for (const k of old) {
      if (next.has(k)) continue
      const el = this.elements.get(k)!
      this.container.removeChild(el)
      el.destroy()
      this.elements.delete(k)
    }
    for (const k of next) {
      if (old.has(k)) continue
      const el = this.create_el(k)
      if (el) {
        this.elements.set(k, el)
        this.container.addChild(el)
      }
    }
  }

  /**
   * 单独重建一个元素。
   *
   * 有些元素的几何是画死在图形对象里的（比如 hold 的黑线、hazard 的填充），
   * 改了数据但对象身份没变时，recreate() 是看不出区别的，必须这样强制重建。
   */
  recreate_one(key: K) {
    const old = this.elements.get(key)
    if (old) {
      this.container.removeChild(old)
      old.destroy()
      this.elements.delete(key)
    }
    const el = this.create_el(key)
    if (el) {
      this.elements.set(key, el)
      this.container.addChild(el)
    }
  }

  /** 全部推倒重建（用现有的 key 列表） */
  recreate_all(...keys: K[]) {
    this.remove()
    this.recreate(...keys)
  }

  update(fn: (el: T, key: K) => void) {
    if (!this.visible) return
    this.elements.forEach(fn)
  }

  remove() {
    this.elements.forEach((el) => el.destroy())
    this.elements.clear()
    this.container.removeChildren()
  }
}

/** 贴图缺失时的兜底：白块 + 染色，保证没有皮肤也能编辑 */
export function tex_or_white(name: Parameters<typeof Skin.getTexture>[0]) {
  return Skin.getTexture(name) ?? Texture.WHITE
}

function note_texture(note: INotes.note) {
  if (note.type === 1) return tex_or_white('critical')
  if (note.type === 2) return tex_or_white('exnote')
  return tex_or_white('note')
}

/** flick 的贴图按滑动方向区分：0 = 左滑，1 = 右滑 */
export function flick_skin(to: 0 | 1): 'flickL' | 'flickR' {
  return to === 0 ? 'flickL' : 'flickR'
}

function note_tint(note: INotes.note) {
  // 缺图时用染色区分类型
  if (Skin.getTexture('note')) return 0xffffff
  if (note.type === 1) return 0xff5555
  if (note.type === 2) return 0x66ccff
  return 0xffffff
}

/** hold 的中间段：一段段采样出来 */
function hold_points(
  segment: [number, number, number],
  from_time: number,
  from_x: number
): [number, number][] {
  const [end_time, end_x, ease] = segment
  const dur = end_time - from_time
  // 按持续时间决定采样数，短段少采几个点就够
  const steps = Math.max(2, Math.min(48, Math.round(Math.abs(dur) / 16)))
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push([from_time + dur * t, ease_lerp(from_x, end_x, t, ease)])
  }
  return pts
}

/** 去掉连续重复的点（相邻两段在连接处会出现重复点） */
function dedupe(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue
    out.push(p)
  }
  return out
}

/**
 * 用三次贝塞尔把一串采样点连成**平滑曲线**。
 *
 * 直接 lineTo 的话 ease 就变成折线了，所以这里用 Catmull-Rom 样条转成三次贝塞尔
 * （pixi 的 Graphics 原生就有 bezierCurveTo，所以不需要额外的库）。
 * 曲线会精确穿过每一个采样点，采样点越密就越贴近真正的缓动函数。
 *
 * @param move 是否先 moveTo 到第一个点（hazard 的右边要接着左边的终点继续画）
 */
function path_through(g: Graphics, pts: [number, number][], move = true) {
  const p = dedupe(pts)
  if (p.length === 0) return
  if (move) g.moveTo(p[0][0], p[0][1])
  if (p.length === 1) return
  if (p.length === 2) {
    g.lineTo(p[1][0], p[1][1])
    return
  }
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    // Catmull-Rom -> 三次贝塞尔
    g.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1]
    )
  }
}

export class DiffDrawer extends StopClass {
  diff: Chart_diff
  chart: Chart
  app: Application
  sizing: { total_width: number }
  /** 判定线（note 落点）距离画布底部的距离 */
  judge_offset = Storage.settings.judge_offset

  drawers!: {
    beat: DrawerExtension<Graphics, [number, number]>
    beat_text: DrawerExtension<Text, [number, number]>
    bpm_text: DrawerExtension<Text, INotes.timing>
    tick_text: DrawerExtension<Text, [number, number]>
    hazard: DrawerExtension<Graphics, INotes.hazard>
    hold_body: DrawerExtension<Graphics, INotes.hold>
    hold_head: DrawerExtension<Sprite, INotes.hold>
    wide: DrawerExtension<Sprite, INotes.wide>
    note: DrawerExtension<Sprite, INotes.note>
    chip: DrawerExtension<Sprite, INotes.chip>
    flick: DrawerExtension<Sprite, INotes.flick>
    bottom_bpm: Text
  }
  decoration: Container
  /** 轨道底色（在所有物件下面，所以单独一层） */
  background: Container
  /** 竖直分列网格（编辑模式下用，垫在物件下面） */
  grid: Container

  constructor(diff: Chart_diff, sizing: { total_width: number }) {
    super()
    this.diff = diff
    this.chart = diff.chart
    this.app = new Application()
    this.sizing = sizing
    this.decoration = new Container({ label: 'decoration' })
    this.background = new Container({ label: 'background' })
    this.grid = new Container({ label: 'column-grid' })

    const tstyle = (size: number, fill: string | number) =>
      new TextStyle({ fontFamily: 'Arial', fontSize: size, fill, align: 'center' })

    const note_drawer = new DrawerExtension<Sprite, INotes.note>(
      (note) => this.build_note(note),
      'note'
    )

    // wide：铺满整条轨道（不越到左右空白里），高度和其它 note 一致
    const wide_drawer = new DrawerExtension<Sprite, INotes.wide>(
      (w) => this.build_wide(w),
      'wide'
    )

    const hold_head_drawer = new DrawerExtension<Sprite, INotes.hold>(
      (h) => this.build_hold_head(h),
      'hold-head'
    )

    // hold 的中间段：按 ease 采样 + 三次贝塞尔拟合成曲线
    // （几何只画一次，之后每帧只改 g.y；见 build_hold_body / time_offset）
    const hold_body_drawer = new DrawerExtension<Graphics, INotes.hold>((h) => {
      return this.build_hold_body(h)
    }, 'hold-body')

    const hazard_drawer = new DrawerExtension<Graphics, INotes.hazard>((h) => {
      return this.build_hazard(h)
    }, 'hazard')

    // chip：正方形
    const chip_drawer = new DrawerExtension<Sprite, INotes.chip>((c) => this.build_chip(c), 'chip')

    // flick：高度固定，宽度按贴图原始比例
    const flick_drawer = new DrawerExtension<Sprite, INotes.flick>(
      (f) => this.build_flick(f),
      'flick'
    )

    const beat_drawer = new DrawerExtension<Graphics, [number, number]>(([, lvl]) => {
      const color = Storage.settings.sprites[`bar_color${Math.min(lvl, 4)}` as 'bar_color1']
      const g = new Graphics()
      // 只铺满轨道，左右空白留出来
      g.rect(0, 0, this.track_width, Storage.settings.sprites.bar_length).fill(color)
      g.alpha = 0.5
      g.x = this.track_left
      return g
    }, 'beat')

    // 小节号：左边空白里，右对齐贴着分隔线
    const beat_text_drawer = new DrawerExtension<Text, [number, number]>(([, ix]) => {
      const index = Storage.settings.bar_from_0 ? ix : ix + 1
      const t = new Text({ text: String(index), style: tstyle(16, "#000000") })
      t.anchor.set(1, 0.5)
      t.x = this.track_left - SEP_LINE - 6
      return t
    }, 'beat-text')

    // bpm：右边空白里，左对齐贴着分隔线
    const bpm_text_drawer = new DrawerExtension<Text, INotes.timing>((timing) => {
      const t = new Text({
        text: String(Number(timing.bpm.toFixed(2))),
        style: tstyle(14, "#000000")
      })
      t.anchor.set(0, 0)
      t.x = this.track_right + SEP_LINE + 6
      return t
    }, 'bpm-text')

    // 分音数：也在右边空白里，和 bpm 错开一点
    const tick_text_drawer = new DrawerExtension<Text, [number, number]>(([, tick]) => {
      const t = new Text({ text: `.${tick}`, style: tstyle(13, "#3b3b3b") })
      t.alpha = 0.7
      t.anchor.set(0, 0.5)
      t.x = this.track_right + SEP_LINE + 6
      return t
    }, 'tick-text')

    this.drawers = {
      beat: beat_drawer,
      beat_text: beat_text_drawer,
      bpm_text: bpm_text_drawer,
      tick_text: tick_text_drawer,
      hazard: hazard_drawer,
      hold_body: hold_body_drawer,
      hold_head: hold_head_drawer,
      wide: wide_drawer,
      note: note_drawer,
      chip: chip_drawer,
      flick: flick_drawer,
      bottom_bpm: new Text({ text: '', style: tstyle(16, 0xffffff) })
    }
    this.drawers.bottom_bpm.anchor.set(0.5, 0.5)
    this.drawers.bottom_bpm.x = this.sizing.total_width / 2
    this.drawers.bottom_bpm.y = SCREEN_HEIGHT - 30

    // 注意顺序：轨道底色在最下面，然后 hazard、hold 身体、所有音符类；
    // 底部 bpm 区域（decoration）要盖住所有物件，bpm 文字再盖在它上面
    this.app.stage.addChild(
      this.background,
      this.grid,
      this.drawers.beat.container,
      this.drawers.beat_text.container,
      this.drawers.bpm_text.container,
      this.drawers.tick_text.container,
      this.drawers.hazard.container,
      this.drawers.hold_body.container,
      this.drawers.wide.container,
      this.drawers.hold_head.container,
      this.drawers.note.container,
      this.drawers.chip.container,
      this.drawers.flick.container,
      this.decoration,
      this.drawers.bottom_bpm
    )

    this.add_on('audio-time-update', () => this.update())
    this.add_on('scale-changed', () => this.rebuild_all())
    this.add_on('fuck-shown', () => this.recreate())
    // 数据改了（比如在 ease 面板里调曲线），把形状重建一遍
    this.add_on('diff-changed', () => this.refresh_shapes())
    // 竖直分列改了：只重画网格
    this.add_on('column-changed', () => this.create_grid())
    this.add_on('meter-changed', () => {
      this.drawers.beat.recreate(...this.diff.shown_timing_list.beat_list)
      this.update()
    })
  }

  /* ---------------- 形状刷新 ---------------- */

  /**
   * hold 的黑线与 hazard 的填充形状是画死在 Graphics 里的，
   * 数据变了必须重建，否则画面不会跟着动。
   */
  refresh_shapes() {
    this.drawers.hold_body.recreate_all(...toRaw(this.diff.shown.hold))
    this.drawers.hazard.recreate_all(...toRaw(this.diff.shown.hazard))
    this.update()
  }

  /** 只重建某一个 hold / hazard（拖控制点时用，避免整屏重建） */
  refresh_hold(hold: INotes.hold) {
    this.drawers.hold_body.recreate_one(toRaw(hold))
    this.update()
  }
  refresh_hazard(hz: INotes.hazard) {
    this.drawers.hazard.recreate_one(toRaw(hz))
    this.update()
  }

  /* ---------------- 元素构建（池化渲染与预览共用） ---------------- */

  /**
   * 按物件类型创建渲染元素。
   * 剪贴板预览用的就是这一套画法，所以预览和真正落下去的样子完全一致。
   */
  build_element(kind: ObjKind, obj: IObjRef['obj']): Container | null {
    switch (kind) {
      case 'note':
        return this.build_note(obj as INotes.note)
      case 'wide':
        return this.build_wide(obj as INotes.wide)
      case 'hold':
        return this.build_hold(obj as INotes.hold)
      case 'chip':
        return this.build_chip(obj as INotes.chip)
      case 'flick':
        return this.build_flick(obj as INotes.flick)
      case 'hazard':
        return this.build_hazard(obj as INotes.hazard)
      default:
        return null
    }
  }

  /**
   * 把元素摆到时间 t（剪贴板预览用）。
   *
   * 形状本身是按物件自带的时间画的（原点在物件起点上），
   * 所以这里只需要给出「物件起点应该落在哪一帧」的 y 偏移。
   */
  place_element(kind: ObjKind, el: Container, obj: IObjRef['obj'], t: number, c: number, m: number) {
    const nh = Storage.settings.note_height
    switch (kind) {
      case 'note': {
        const s = el as Sprite
        s.x = this.x_of((obj as INotes.note).x_pos)
        s.y = this.get_y(t, c, m, nh)
        break
      }
      case 'wide':
        (el as Sprite).y = this.get_y(t, c, m, nh)
        break
      case 'chip': {
        const s = el as Sprite
        s.x = this.x_of((obj as INotes.chip).x_pos)
        s.y = this.get_y_line(t, c, m)
        break
      }
      case 'flick': {
        const s = el as Sprite
        s.x = this.x_of((obj as INotes.flick).x_pos)
        s.y = this.get_y_line(t, c, m)
        break
      }
      case 'hold': {
        // build_hold 装的顺序固定是 [身体, 头]
        const body = el.children[0] as Graphics
        const head = el.children[1] as Sprite
        body.y = this.time_offset(t, c, m)
        head.x = this.x_of((obj as INotes.hold).x_pos)
        head.y = this.get_y(t, c, m, nh)
        break
      }
      case 'hazard':
        (el as Graphics).y = this.time_offset(t, c, m)
        break
    }
  }

  private build_note(note: INotes.note) {
    const s = new Sprite({ texture: note_texture(note), label: `note-${note.time}` })
    s.anchor.set(0.5, 0)
    s.tint = note_tint(note)
    s.width = Storage.settings.note_width
    s.height = Storage.settings.note_height
    s.x = this.x_of(note.x_pos)
    return s
  }

  private build_wide(w: INotes.wide) {
    const s = new Sprite({ texture: tex_or_white('note'), label: `wide-${w.time}` })
    s.anchor.set(0.5, 0)
    s.x = this.x_of(50)
    s.width = this.track_width
    s.height = Storage.settings.note_height
    return s
  }

  private build_hold_head(h: INotes.hold) {
    const s = new Sprite({ texture: tex_or_white('note'), label: `hold-${h.time}` })
    s.anchor.set(0.5, 0)
    s.width = Storage.settings.note_width
    s.height = Storage.settings.note_height
    s.x = this.x_of(h.x_pos)
    return s
  }

  /** hold 的预览：黑线 + 头，装成一个容器（顺序固定为 [身体, 头]） */
  private build_hold(h: INotes.hold) {
    const c = new Container({ label: `hold-${h.time}` })
    c.addChild(this.build_hold_body(h), this.build_hold_head(h))
    return c
  }

  private build_chip(k: INotes.chip) {
    const s = new Sprite({ texture: tex_or_white('chip'), label: `chip-${k.time}` })
    s.anchor.set(0.5, 0.5)
    s.width = Storage.settings.note_height
    s.height = Storage.settings.note_height
    s.x = this.x_of(k.x_pos)
    return s
  }

  private build_flick(f: INotes.flick) {
    const tex = tex_or_white(flick_skin(f.to))
    const s = new Sprite({ texture: tex, label: `flick-${f.time}` })
    s.anchor.set(0.5, 0.5)
    s.height = Storage.settings.flick_height
    s.width = tex.height
      ? Storage.settings.flick_height * (tex.width / tex.height)
      : Storage.settings.flick_height
    s.x = this.x_of(f.x_pos)
    return s
  }

  /* ---------------- 坐标换算 ---------------- */

  /** 判定线的 y：note 的中心在这一天线上 */
  get judge_y() {
    return SCREEN_HEIGHT - this.judge_offset
  }

  /** 底部 bpm 区域的顶边。取判定线下方半个 note 的高度，这样 t=c 的 note 正好落在它上面。 */
  get bar_top() {
    const half = Storage.settings.note_height / 2
    return Math.min(this.judge_y + half, SCREEN_HEIGHT - 40)
  }

  /** 轨道的左右边界（左右各留 SIDE_MARGIN 的空白） */
  get track_left() {
    return SIDE_MARGIN
  }
  get track_right() {
    return this.sizing.total_width - SIDE_MARGIN
  }
  get track_width() {
    return Math.max(1, this.track_right - this.track_left)
  }

  /** x_pos(0~100) -> 像素 x。note 时它是中心，hazard 时它是边界。 */
  x_of(x_pos: number) {
    return this.track_left + (x_pos / 100) * this.track_width
  }

  /** 像素 x -> x_pos(0~100)（轨道外会被夹到 0/100） */
  pos_of(x: number) {
    return Math.max(0, Math.min(100, ((x - this.track_left) / this.track_width) * 100))
  }

  /** note 顶部的 y：贴图**中心**落在该时间的线上（小节线从 note 中间穿过） */
  get_y(t: number, c: number, m: number, height = Storage.settings.note_height) {
    return this.get_y_line(t, c, m) - height / 2
  }

  /** 判定线所在位置的 y */
  get_y_line(t: number, c: number, m: number) {
    return this.judge_y - (t - c - Storage.settings.offset) * m
  }

  /** 画布 y -> 谱面时间 */
  mouse_time(eY: number, c: number, m: number) {
    return (this.judge_y - eY) / m + c + Storage.settings.offset
  }

  /* ---------------- 生命周期 ---------------- */

  async init() {
    // 至少 2 倍超采样：曲线和文字会明显更平滑（上限 3 防止显存爆掉）
    const resolution = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3)
    await this.app.init({
      width: this.sizing.total_width,
      height: SCREEN_HEIGHT,
      background: Storage.settings.background_color,
      // 开 MSAA，Graphic 画的曲线边缘才不会有锯齿
      antialias: true,
      resolution,
      autoDensity: true
    })
    this.create_background()
    this.create_grid()
    this.create_decoration()
  }

  /** 背景色（设置里可改） */
  set_background() {
    if (!this.app.renderer) return
    this.app.renderer.background.color = Storage.settings.background_color
  }

  /**
   * 轨道底色：note 落点所在的那一条。
   * 它必须垫在所有物件下面，所以单独放一个 container 摆在 stage 最前面。
   * */
  create_background() {
    this.background.removeChildren()
    const g = new Graphics()
    g.rect(this.track_left, 0, this.track_width, SCREEN_HEIGHT).fill(Storage.settings.track_color)
    this.background.addChild(g)
  }

  /**
   * 竖直分列网格：把轨道平均分成 column 栏。
   *
   * - 栏边界画成细实线（用来区分栏）；
   * - 每栏的中心画成虚线 —— pending 的**中心**就吸附在这里（共 column 个吸附点）；
   * - column 为 0 时什么都不画，也不吸附（见 edit-drawer 的 snap_x）。
   *
   * 栏太窄时自动省线：宽度不到 3px 连边界都不画，不到 10px 就不画中心虚线，
   * 免得 100 栏把画布糊成一片。
   */
  create_grid() {
    this.grid.removeChildren()
    const n = Math.floor(Storage.settings.column)
    if (n <= 0) return
    const w = this.track_width / n
    const color = Storage.settings.column_color

    // 每栏中心的虚线（真正的吸附位置）
    if (w >= 10) {
      const centers = new Graphics()
      const dash = 8
      for (let i = 0; i < n; i++) {
        const x = this.track_left + (i + 0.5) * w
        for (let y = 0; y < SCREEN_HEIGHT; y += dash * 2) centers.rect(x - 0.5, y, 1, dash)
      }
      centers.fill({ color, alpha: 0.5 })
      this.grid.addChild(centers)
    }

    // 栏边界（含最左最右）
    if (w >= 3) {
      const bounds = new Graphics()
      for (let i = 0; i <= n; i++) bounds.rect(this.track_left + i * w - 0.5, 0, 1, SCREEN_HEIGHT)
      bounds.fill({ color, alpha: 0.22 })
      this.grid.addChild(bounds)
    }
  }

  /**
   * 绘制那些不随可见区间变化的装饰（盖在物件上面）：
   * - 底部条：左右铺满整个画布，底色就是背景色（外框色），
   *   上面再叠一层可调颜色/透明度的 rect；
   * - 判定线：横贯整个画布的一条线，就是底部条的上边缘。
   *
   * （与 sv 不同：sv 只在轨道范围内画底部条、没有单独的判定线，
   * 还画了两条左右白线；uni 把白线去掉了，靠轨道底色区分区域。）
   * */
  create_decoration() {
    this.decoration.removeChildren()
    const g = new Graphics()

    const bar_top = this.bar_top
    const width = this.sizing.total_width
    const bar_height = SCREEN_HEIGHT - bar_top

    // 底部条：整宽，先铺背景色，再叠一层叠加色
    g.rect(0, bar_top, width, bar_height).fill(Storage.settings.background_color)
    g.rect(0, bar_top, width, bar_height).fill({
      color: Storage.settings.bottom_bar_color,
      alpha: Storage.settings.bottom_bar_alpha / 100
    })

    // 判定线：全宽
    const line_w = Storage.settings.judge_line_width
    if (line_w > 0) {
      g.rect(0, bar_top - line_w, width, line_w).fill(Storage.settings.judge_line_color)
    }

    this.decoration.addChild(g)
  }

  /* ---------------- 每帧更新 ---------------- */

  update() {
    const c = this.chart.audio.current_ms
    const m = Storage.computes.mul.value
    const nh = Storage.settings.note_height

    this.drawers.note.update((s, n) => {
      s.x = this.x_of(n.x_pos)
      s.y = this.get_y(n.time, c, m, nh)
    })
    this.drawers.wide.update((s, n) => {
      s.y = this.get_y(n.time, c, m, nh)
    })
    this.drawers.hold_head.update((s, h) => {
      s.x = this.x_of(h.x_pos)
      s.y = this.get_y(h.time, c, m, nh)
    })
    this.drawers.chip.update((s, k) => {
      s.x = this.x_of(k.x_pos)
      s.y = this.get_y_line(k.time, c, m)
    })
    this.drawers.flick.update((s, k) => {
      s.x = this.x_of(k.x_pos)
      s.y = this.get_y_line(k.time, c, m)
    })

    this.drawers.hold_body.update((g, h) => (g.y = this.time_offset(h.time, c, m)))
    this.drawers.hazard.update((g, h) => (g.y = this.time_offset(h.time, c, m)))

    // 小节线以时间点为中线，正好从 note 中间穿过
    this.drawers.beat.update(
      (g, [t]) => (g.y = this.get_y_line(t, c, m) - Storage.settings.sprites.bar_length / 2)
    )
    this.drawers.beat_text.update((t, [ms]) => (t.y = this.get_y_line(ms, c, m)))
    this.drawers.bpm_text.update(
      (t, timing) => (t.y = this.get_y_line(timing.time, c, m) - 9)
    )
    // tick 要对齐小节线的中心（小节线自己是以时间点为中线画的）
    this.drawers.tick_text.update((t, [ms]) => (t.y = this.get_y_line(ms, c, m)))

    const { ix, timing } = this.diff.timing_of_time(c)
    const str = `Timing #${ix} ${timing.bpm.toFixed(2)}bpm ${timing.num}/${timing.den}`
    if (this.drawers.bottom_bpm.text !== str) this.drawers.bottom_bpm.text = str
  }

  /**
   * 以物件起点为原点的基准 y（= note 中心线）。
   * 把原点放在物件自己的起点上，坐标数值就不会随谱面时间变得很大。
   */
  private base_y(t: number, t0: number, m: number) {
    return this.judge_y - (t - t0) * m
  }

  /** 整条曲线随播放时间平移的量：实际 y = base_y + time_offset */
  time_offset(t0: number, c: number, m: number) {
    return (c + Storage.settings.offset - t0) * m
  }

  /**
   * hold 的黑色中轴：按 ease 采样后拟合成平滑曲线。
   *
   * 几何只在这里画一次，之后每帧只改 g.y（见 update），
   * 所以画布不会被反复重建，边缘的抗锯齿也交给 renderer 的 antialias。
   */
  build_hold_body(hold: INotes.hold): Graphics {
    const g = new Graphics({ label: `hold-body-${hold.time}` })
    const m = Storage.computes.mul.value
    const pts: [number, number][] = []
    let t0 = hold.time
    let x0 = hold.x_pos
    for (const seg of hold.segment) {
      for (const [t, x] of hold_points(seg, t0, x0)) {
        pts.push([this.x_of(x), this.base_y(t, hold.time, m)])
      }
      t0 = seg[0]
      x0 = seg[1]
    }
    if (pts.length < 2) return g
    path_through(g, pts, true)
    g.stroke({
      width: Storage.settings.hold_line_width,
      color: 0x000000,
      cap: 'round',
      join: 'round'
    })
    return g
  }

  /**
   * hazard：上下底平整、左右两边按各自 ease 弯曲的梯形。
   * 左右两边同样用三次贝塞尔拟合，而不是折线。
   */
  build_hazard(hz: INotes.hazard): Graphics {
    const g = new Graphics({ label: `hazard-${hz.time}` })
    const m = Storage.computes.mul.value
    const dur = hz.end - hz.time
    const steps = Math.max(2, Math.min(64, Math.round(Math.abs(dur) / 16)))
    const left: [number, number][] = []
    const right: [number, number][] = []
    for (let i = 0; i <= steps; i++) {
      const p = i / steps
      const y = this.base_y(hz.time + dur * p, hz.time, m)
      left.push([this.x_of(ease_lerp(hz.x1, hz.y1, p, hz.e1)), y])
      right.push([this.x_of(ease_lerp(hz.x2, hz.y2, p, hz.e2)), y])
    }
    // 左边正向 -> 下底 -> 右边反向 -> 上底闭合
    path_through(g, left, true)
    const r = dedupe(right)
    if (r.length) {
      g.lineTo(r[r.length - 1][0], r[r.length - 1][1])
      path_through(g, [...r].reverse(), false)
      g.lineTo(left[0][0], left[0][1])
    }
    g.fill({
      color: Storage.settings.hazard_color,
      alpha: Storage.settings.hazard_alpha / 100
    })
    return g
  }

  /* ---------------- 可见区间变化 ---------------- */

  recreate() {
    const shown = this.diff.shown
    const raw = <T,>(arr: T[]) => toRaw(arr)
    this.drawers.note.recreate(...raw(shown.note))
    this.drawers.wide.recreate(...raw(shown.wide))
    this.drawers.hold_head.recreate(...raw(shown.hold))
    this.drawers.hold_body.recreate(...raw(shown.hold))
    this.drawers.chip.recreate(...raw(shown.chip))
    this.drawers.flick.recreate(...raw(shown.flick))
    this.drawers.hazard.recreate(...raw(shown.hazard))
    this.drawers.beat.recreate(...this.diff.shown_timing_list.beat_list)
    this.drawers.beat_text.recreate(...this.diff.shown_timing_list.bar_list)
    this.drawers.bpm_text.recreate(...this.diff.shown_timing)
    this.drawers.tick_text.recreate(...this.diff.shown_timing_list.ticks)
    this.update()
  }

  /** 清空所有元素后重建（贴图尺寸/画布宽度变化时用） */
  force_recreate() {
    for (const key of Object.keys(this.drawers) as (keyof typeof this.drawers)[]) {
      if (key === 'bottom_bpm') continue
      ;(this.drawers[key] as DrawerExtension<Container, unknown>).remove()
    }
    this.recreate()
  }

  /**
   * 设置里改了流速/贴图尺寸/轨道宽度/背景色时全部重来：
   * 背景 -> 装饰 -> 按新的可见长度重新池化 -> 清空重建（贴图尺寸可能也变了）
   */
  rebuild_all() {
    this.set_background()
    this.create_background()
    this.create_grid()
    this.create_decoration()
    this.diff.force_fuck()
    this.force_recreate()
  }

  /** 画布宽度变化（设置里改了轨道宽度） */
  resize(total_width: number) {
    this.sizing.total_width = total_width
    this.app.renderer.resize(total_width, SCREEN_HEIGHT)
    this.drawers.bottom_bpm.x = total_width / 2
    this.rebuild_all()
  }
}
