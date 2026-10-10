import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { Storage } from '@core/storage.ts'
import { StopClass } from '@core/misc/eventhub.ts'
import { enable3d } from '@core/misc/enable3d.ts'
import { utils } from '@core/utils.ts'
import type { DiffDrawer } from './drawer'

/** 时间文字的字号 */
const FONT_SIZE = 13
/** 标签底的高度 */
const CHIP_H = 18
/** 标签底的左右内边距 */
const CHIP_PAD_X = 5
/** 标签底离画布左边缘的距离（也就是横线的最左端） */
const CHIP_X = 2

/**
 * 鼠标时间线。
 *
 * 按住 Ctrl 时，在鼠标所在的高度横着画一条线，线的左端（小节号那一块）
 * 挂一个标签，显示这个高度对应的谱面时间（m:ss.xxx）。
 *
 * 刻意做成一个独立的小模块：不碰编辑器在画布上的那套鼠标事件，
 * 自己在 document 上监听 mousemove / keydown / keyup（外加 window 的 blur），
 * 只维护自己这一份状态，然后重画自己的三个 pixi 对象。
 * 时间会随着播放滚动，所以另外订阅了 audio-time-update。
 *
 * 注意它必须在编辑器（DiffEditor）之后创建：pixi 里后加进 stage 的在上层，
 * 这样这条线才会盖在所有物件和编辑器那层 overlay 上面。
 * */
export class MouseTime extends StopClass {
  private drawer: DiffDrawer
  private container = new Container({ label: 'mouse-time' })
  /** 横贯画布的那条线 */
  private line = new Graphics()
  /** 时间文字底下的标签底 */
  private chip = new Graphics()
  private label: Text
  /** 自己的状态：Ctrl 有没有按住、鼠标在不在画布上、在画布坐标系里的位置 */
  private state = { ctrl: false, inside: false, x: 0, y: 0 }

  constructor(drawer: DiffDrawer) {
    super()
    this.drawer = drawer
    this.label = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Arial', fontSize: FONT_SIZE, fill: 0xffffff })
    })
    this.label.anchor.set(0, 0.5)
    this.container.addChild(this.line, this.chip, this.label)
    this.container.visible = false
    drawer.app.stage.addChild(this.container)
  }

  /**
   * 开始监听。
   * 全部挂在自己的 document / window 监听上（不借用编辑器或 GlobalStat 的），
   * stop() 的时候一起摘掉。
   * */
  listen() {
    const move = (e: MouseEvent) => this.on_move(e)
    const key = (e: KeyboardEvent) => this.on_key(e)
    const blur = () => this.set_ctrl(false)

    document.addEventListener('mousemove', move)
    document.addEventListener('keydown', key)
    document.addEventListener('keyup', key)
    // 按着 Ctrl 切走窗口的话 keyup 是收不到的，回来时会一直挂着一条线
    window.addEventListener('blur', blur)

    this.add_stop(() => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('keydown', key)
      document.removeEventListener('keyup', key)
      window.removeEventListener('blur', blur)
      this.container.destroy({ children: true })
    })

    // 播放中鼠标不动、线也不动，但线底下的时间一直在变；改设置（颜色）也要跟着重画
    this.add_on('audio-time-update', () => this.redraw())
    this.add_on('scale-changed', () => this.redraw())
    this.watch(enable3d.enabled, () => this.redraw())
  }

  /* ---------------- 监听 ---------------- */

  /** 鼠标位置换算成画布坐标（和编辑器 set_pointer 用的是同一套算法） */
  private on_move(e: MouseEvent) {
    const r = this.drawer.app.canvas.getBoundingClientRect()
    this.state.x = e.clientX - r.left
    this.state.y = e.clientY - r.top
    this.state.inside =
      this.state.x >= 0 && this.state.y >= 0 && this.state.x <= r.width && this.state.y <= r.height
    /*
     * Ctrl 状态顺便跟着鼠标同步一次（GlobalStat 也是这么做的）：
     * 在窗口外面松开 Ctrl、或者从别的程序切回来时，只有 mousemove 拿得到真实状态。
     * */
    this.state.ctrl = e.ctrlKey
    this.redraw()
  }

  /**
   * 键盘：只关心 Ctrl。
   *
   * keyup 上的 `e.ctrlKey` 已经不表示「刚松开的到底是不是 Ctrl」，所以分开判断：
   * Ctrl 键自己认 e.key，其它键就跟着 e.ctrlKey 走。
   * */
  private on_key(e: KeyboardEvent) {
    this.set_ctrl(e.key === 'Control' ? e.type === 'keydown' : e.ctrlKey)
  }

  /** Ctrl 状态真的变了才重画（按住不放时 keydown 会连发） */
  private set_ctrl(v: boolean) {
    if (this.state.ctrl === v) return
    this.state.ctrl = v
    this.redraw()
  }

  /* ---------------- 画 ---------------- */

  /** 位置 / Ctrl / 时间 / 颜色，任何一个变了都走这里 */
  private redraw() {
    // 3D 视角下画布被 CSS 透视拉过，鼠标坐标和画布坐标对不上，干脆不画
    const show = this.state.ctrl && this.state.inside && !enable3d.enabled.value
    this.container.visible = show
    if (!show) return

    const d = this.drawer
    const y = this.state.y
    const color = Storage.settings.mouse_time_color

    // 横线：横贯整个画布（和判定线、底部条一样）
    this.line.clear()
    this.line.rect(0, y - 0.5, d.sizing.total_width, 1).fill(color)

    // 标签：贴在线的最左端，内容是这个高度对应的时间
    const time = d.mouse_time(y, d.chart.audio.current_ms, Storage.computes.mul.value)
    const str = utils.ms2str(time)
    if (this.label.text !== str) this.label.text = str
    this.label.style.fill = color
    this.label.x = CHIP_X + CHIP_PAD_X
    this.label.y = y

    // 标签底：深色底 + 线的颜色描边，这样在什么底色上都看得清
    this.chip
      .clear()
      .roundRect(CHIP_X, y - CHIP_H / 2, this.label.width + CHIP_PAD_X * 2, CHIP_H, 4)
      .fill({ color: 0x000000, alpha: 0.55 })
      .stroke({ width: 1, color, alpha: 0.9 })
  }
}
