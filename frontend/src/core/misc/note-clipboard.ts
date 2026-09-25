import { ref, toRaw } from 'vue'
import type { INotes } from '@type/note-types.ts'

/** 谱面里可被编辑的物件类型 */
export type ObjKind = 'note' | 'hold' | 'wide' | 'hazard' | 'chip' | 'flick'

/**
 * 对谱面数组里某个物件的引用。
 * 因为 uni 的谱面把不同类型放在不同的数组里，所以需要 kind 来定位。
 * */
export interface IObjRef {
  kind: ObjKind
  obj: INotes.note | INotes.hold | INotes.wide | INotes.hazard | INotes.chip | INotes.flick
}

/** 剪贴板条目：时间被归一化到 0（最早的那个物件落在 0） */
export interface IClipboardItem {
  kind: ObjKind
  obj: IObjRef['obj']
}

/** 当前选中的物件（引用的是谱面里的同一个对象） */
export const selected = ref<IObjRef[]>([])

/**
 * 两个引用是否指向谱面里的同一个物件。
 * 命中检测每次都会新建一个 { kind, obj } 包装对象，所以不能直接用 === 比较包装对象。
 * */
export function same_ref(a: IObjRef, b: IObjRef) {
  return a.kind === b.kind && toRaw(a.obj) === toRaw(b.obj)
}

export const NoteClipboard = {
  selected,
  clipboard: ref<IClipboardItem[]>([]),

  /**
   * 下面这几个由编辑器（edit-drawer）在挂载时绑定，因为它需要知道鼠标位置。
   * 快捷键系统只调用这些槽位（对应 sv 的 NoteClipboard.copy = () => ...）。
   */
  copy(): void {},
  cut(): void {},
  paste(): void {},
  delete_selected(): void {},

  set_selected(v: IObjRef[]) {
    // 同一个物件只保留一个引用（框选叠加时可能重复命中）
    const out: IObjRef[] = []
    for (const item of v) if (!out.some((x) => same_ref(x, item))) out.push(item)
    selected.value = out
  },
  toggle(v: IObjRef) {
    if (selected.value.some((x) => same_ref(x, v))) {
      selected.value = selected.value.filter((x) => !same_ref(x, v))
    } else {
      selected.value = [...selected.value, v]
    }
  },
  is_selected(v: IObjRef) {
    return selected.value.some((x) => same_ref(x, v))
  },
  clear_selected() {
    selected.value = []
  },
  clear() {
    NoteClipboard.clipboard.value = []
  }
}
