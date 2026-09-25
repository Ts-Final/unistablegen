import { reactive } from 'vue'
import type { INotes } from '@type/note-types.ts'

/** fn-note 里可选的物件类型 */
export type Tool = 'note' | 'hold' | 'hazard' | 'chip' | 'flick'
/** note 的细分类型 */
export type NoteVariant = 'normal' | 'ex' | 'critical' | 'wide'

export const TOOLS: { key: Tool; label: string }[] = [
  { key: 'note', label: 'note' },
  { key: 'hold', label: 'hold' },
  { key: 'hazard', label: 'hazard' },
  { key: 'chip', label: 'chip' },
  { key: 'flick', label: 'flick' }
]

export const NOTE_VARIANTS: { key: NoteVariant; label: string }[] = [
  { key: 'normal', label: '普通' },
  { key: 'ex', label: 'ex' },
  { key: 'critical', label: 'critical' },
  { key: 'wide', label: 'wide' }
]

/**
 * 当前编辑器正在放置什么。
 * `tool` 为 null 表示「没有在编辑任何物件类型」——此时画布上拖动就是框选。
 * 再点一次已选中的类型即可取消选择。
 * */
export const NoteType = reactive({
  tool: null as Tool | null,
  note_variant: 'normal' as NoteVariant,
  /** flick 的方向：0 左滑 / 1 右滑 */
  flick_dir: 1 as 0 | 1
})

/** note 变体 -> INotes.note.type */
export function variant_to_type(v: NoteVariant): INotes.note['type'] {
  if (v === 'critical') return 1
  if (v === 'ex') return 2
  return 0
}

/* ---------------- 选类型（面板和快捷键共用同一份逻辑） ---------------- */

/**
 * 选中某个物件类型；**再选一次同一个就取消选择**，回到「选择模式」
 * （此时在画布上拖动就是框选）。
 *
 * 面板和快捷键都走这里，两边的行为才不会跑偏。
 * */
export function pick_tool(key: Tool) {
  const same = NoteType.tool === key
  NoteType.tool = same ? null : key
  // 第一行点 note 就是「普通 note」，细分类型跟着归位（否则选过 ex 就回不到普通了）
  if (!same && key === 'note') NoteType.note_variant = 'normal'
}

/** 选中 note 的某个细分；再选一次已经选中的那个 = 取消选择 */
export function pick_variant(v: NoteVariant) {
  if (NoteType.tool === 'note' && NoteType.note_variant === v) {
    NoteType.tool = null
    return
  }
  NoteType.tool = 'note'
  NoteType.note_variant = v
}

/** 选中 flick 的滑动方向；再选一次已经选中的那个 = 取消选择 */
export function pick_flick(dir: 0 | 1) {
  if (NoteType.tool === 'flick' && NoteType.flick_dir === dir) {
    NoteType.tool = null
    return
  }
  NoteType.tool = 'flick'
  NoteType.flick_dir = dir
}

export function type_to_variant(t: INotes.note['type']): NoteVariant {
  if (t === 1) return 'critical'
  if (t === 2) return 'ex'
  return 'normal'
}
