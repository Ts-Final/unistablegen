import { ref } from 'vue'
import { Chart } from '@core/chart/chart.ts'
import { GlobalStat } from '@core/globalStat.ts'
import { Storage } from '@core/storage.ts'
import { modal } from './modal'
import { notify } from './notify'
import { NoteClipboard } from './note-clipboard'
import { NoteType, pick_flick, pick_tool, pick_variant } from './note-type'

/** 已注册的快捷键功能名 */
const functions = [
  'undo',
  'redo',
  'save',
  'copy',
  'cut',
  'paste',
  'delete',
  'pause',
  'settings',
  'iexport',

  'select',
  'tool-note',
  'tool-hold',
  'tool-hazard',
  'tool-chip',
  'tool-flick',

  'n-ex',
  'n-critical',
  'n-wide',

  'flick-left',
  'flick-right'
] as const

export type ShortCutName = (typeof functions)[number]

/** 存进 Storage.shortcut 的结构（对应 sv 的 SC_save） */
export interface SC_save {
  name: ShortCutName
  key: string
  alt: boolean
  ctrl: boolean
  shift: boolean
}

/** 只在编辑器里才生效 */
function in_editor() {
  return GlobalStat.route.route.value === 'editor' && !!Chart.current
}

/** 为 true 时暂停响应（比如在等用户按键） */
const on_listening = ref(false)

/**
 * 快捷键（对应 sv 的 core/misc/shortcut.ts）。
 * 用法：new ShortCuts('名字', '按键', 回调, alt, ctrl, shift)
 * */
export class ShortCuts {
  static all: ShortCuts[] = []
  static on_listening = on_listening
  /** 正在从存档恢复：这期间不报「按键重合」（旧存档里可能有重复的绑定） */
  private static restoring = false

  name: ShortCutName
  private _key: string
  private _alt: boolean
  private _ctrl: boolean
  private _shift: boolean
  private readonly cb: (e: KeyboardEvent) => unknown
  private keyup: ((e: KeyboardEvent) => unknown) | null

  constructor(
    name: ShortCutName,
    k: string,
    cb: (e: KeyboardEvent) => unknown,
    alt = false,
    ctrl = false,
    shift = false
  ) {
    this.name = name
    this._key = k
    this._alt = alt
    this._ctrl = ctrl
    this._shift = shift
    this.cb = cb
    this.keyup = null
    ShortCuts.all.push(this)
  }

  get key() {
    return this._key
  }

  get data(): SC_save {
    return {
      name: this.name,
      key: this.key,
      alt: this._alt,
      ctrl: this._ctrl,
      shift: this._shift
    }
  }

  static exists(k: string, alt = false, ctrl = false, shift = false) {
    return ShortCuts.all.find((x) => x.is(k, alt, ctrl, shift))
  }

  /** 全局只调用一次：装上 keydown / keyup 监听 */
  static handle() {
    document.addEventListener(
      'keydown',
      (e) => {
        if (on_listening.value) return
        if (e.target instanceof HTMLInputElement) {
          // 正在输入文字/数字时不响应
          if (e.target.type == 'text' || e.target.type == 'number') return
          else e.target.blur()
        }
        ShortCuts.all.forEach((x) => x.handle(e))
      },
      true
    )
    document.addEventListener('keyup', (e) => ShortCuts.handle_keyup(e), true)
  }

  static handle_keyup(e: KeyboardEvent) {
    if (on_listening.value) return
    if (e.target instanceof HTMLInputElement) {
      if (e.target.type == 'text' || e.target.type == 'number') return
      else e.target.blur()
    }
    ShortCuts.all.forEach((x) => x.handle_keyup(e))
  }

  static fun(fn: ShortCutName) {
    return ShortCuts.all.find((x) => x.name == fn)
  }

  static $fun(fn: ShortCutName) {
    const x = ShortCuts.all.find((y) => y.name == fn)
    if (!x) throw new Error(`快捷键 ${fn} 不存在`)
    return x
  }

  static toJson(): SC_save[] {
    return ShortCuts.all.map((x) => x.data)
  }

  static to_string() {
    return JSON.stringify(ShortCuts.toJson())
  }

  static fromJson(data: string) {
    ShortCuts.restoring = true
    try {
      if (data) {
        let parsed: SC_save[] = []
        try {
          parsed = JSON.parse(data) as SC_save[]
        } catch {
          parsed = []
        }
        for (const p of parsed) {
          const x = ShortCuts.all.find((y) => y.name == p.name)
          // 存档里有已经不存在的功能名时跳过这一条就行，不能整份放弃
          if (!x) continue
          x.set_key(p.key, p.alt, p.ctrl, p.shift)
        }
      }
    } finally {
      ShortCuts.restoring = false
    }
    /*
     * 不管存档里有没有内容，都把「当前完整映射」写回 Storage：
     * 这样 charts/config.json 里永远存着一份可以直接改的快捷键表。
     * （以前只有真的改过键才会写，存档里一直是空的，看起来就像没保存。）
     * */
    Storage._ref.value.shortcut = ShortCuts.to_string()
    Storage.save()
  }

  is(k: string, alt = false, ctrl = false, shift = false) {
    return (
      this.key.toLowerCase() == k.toLowerCase() &&
      this._alt == alt &&
      this._ctrl == ctrl &&
      this._shift == shift
    )
  }

  handle(e: KeyboardEvent) {
    if (this.is(e.key, e.altKey, e.ctrlKey, e.shiftKey)) this.cb(e)
  }

  handle_keyup(e: KeyboardEvent) {
    if (this.keyup == null) return
    if (this.is(e.key, e.altKey, e.ctrlKey, e.shiftKey)) this.keyup(e)
  }

  set_keyup(fn: (e?: KeyboardEvent) => unknown) {
    this.keyup = fn
  }

  /** 改键：有冲突就提示，并存进 Storage.shortcut */
  set_key(k: string, alt = false, ctrl = false, shift = false) {
    const same = ShortCuts.exists(k, alt, ctrl, shift)
    if (same && same !== this && !ShortCuts.restoring) {
      notify.error(`有按键(${same.name})重合了哦！`)
    }
    this._key = k
    this._ctrl = ctrl
    this._alt = alt
    this._shift = shift
    Storage._ref.value.shortcut = ShortCuts.to_string()
  }

  /** 显示用，比如 "Ctrl+Z" */
  parse() {
    const l: string[] = []
    if (this._ctrl) l.push('Ctrl')
    if (this._alt) l.push('Alt')
    if (this._shift) l.push('Shift')
    l.push(this.key.length == 1 ? this.key.toUpperCase() : this.key)
    return l.join('+')
  }

  set_data(data: SC_save) {
    this.name = data.name
    this.set_key(data.key, data.alt, data.ctrl, data.shift)
  }
}

/* ---------------- 注册 ---------------- */

new ShortCuts('undo', 'z', () => in_editor() && Chart.current?.diff.execute_undo(), false, true)
new ShortCuts('redo', 'y', () => in_editor() && Chart.current?.diff.execute_redo(), false, true)
new ShortCuts('save', 's', () => in_editor() && Chart.current?.save(true), false, true)

new ShortCuts('copy', 'c', () => in_editor() && NoteClipboard.copy(), false, true)
new ShortCuts('cut', 'x', () => in_editor() && NoteClipboard.cut(), false, true)
new ShortCuts('paste', 'v', () => in_editor() && NoteClipboard.paste(), false, true)
new ShortCuts('delete', 'Delete', () => in_editor() && NoteClipboard.delete_selected())

/** 播放 / 暂停 */
new ShortCuts('pause', ' ', () => {
  if (!in_editor()) return
  Chart.current?.audio.play_pause()
})

new ShortCuts('settings', 'F2', () => {
  modal.SettingModal.show({})
})

/** 打开导入/导出（对应 sv 的 'iexport'，默认 p）；它在编辑器里才用得到 Chart.current */
new ShortCuts('iexport', 'p', () => in_editor() && modal.IExporterModal.show({}))

/* 放置什么物件。
   和 fn-note 面板一样：再按一次同一个类型 = 取消选择，进入选择模式（此时拖动是框选）。 */
new ShortCuts('select', '0', () => (NoteType.tool = null))
new ShortCuts('tool-note', '1', () => pick_tool('note'))
new ShortCuts('tool-hold', '2', () => pick_tool('hold'))
new ShortCuts('tool-hazard', '3', () => pick_tool('hazard'))
new ShortCuts('tool-chip', '4', () => pick_tool('chip'))
new ShortCuts('tool-flick', '5', () => pick_tool('flick'))


new ShortCuts('n-ex', 'q', () => pick_variant('ex'))
new ShortCuts('n-critical', 'w', () => pick_variant('critical'))
new ShortCuts('n-wide', 'e', () => pick_variant('wide'))

/* flick 的滑动方向（A 在左、D 在右，顺手） */
new ShortCuts('flick-left', 'r', () => pick_flick(0))
new ShortCuts('flick-right', 't', () => pick_flick(1))
