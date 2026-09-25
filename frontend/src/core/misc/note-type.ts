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

export function type_to_variant(t: INotes.note['type']): NoteVariant {
  if (t === 1) return 'critical'
  if (t === 2) return 'ex'
  return 'normal'
}
