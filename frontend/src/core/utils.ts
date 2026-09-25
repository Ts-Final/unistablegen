import type { INotes } from '@type/note-types.ts'

/**
 * 通用的工具函数集合（从 sv 的 core/utils.ts 精简而来）。
 *
 * 说明：本项目的 tsconfig 开了 erasableSyntaxOnly，带运行时代码的 namespace 不被允许，
 * 所以这里用普通对象代替。
 * */
export const utils = {
  /** 判断 val 是否落在 [v1, v2] 之间（端点顺序无所谓） */
  between(val: number, vs: [number, number]): boolean {
    let [v1, v2] = vs
    if (v1 > v2) [v1, v2] = [v2, v1]
    return val >= v1 && val <= v2
  },

  remove<T>(arr: T[], v: T) {
    const ix = arr.indexOf(v)
    if (ix >= 0) arr.splice(ix, 1)
  },

  clamp(val: number, min_val: number, max_val: number) {
    return Math.min(Math.max(val, min_val), max_val)
  },

  round(val: number, digit = 0) {
    const p = 10 ** digit
    return Math.round(val * p) / p
  },

  range(...args: number[]) {
    return Math.max(...args) - Math.min(...args)
  },

  deepCopy<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return obj.map((x) => utils.deepCopy(x)) as unknown as T
    const copy: Record<string, unknown> = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) copy[key] = utils.deepCopy(obj[key])
    }
    return copy as T
  },

  /** 只覆盖 target 上已有的键（用于设置/存档的向后兼容） */
  less_assign<T extends object>(target: T, source: Partial<T>): T {
    if (target == null || source == null) return target
    for (const key in source) {
      if (!(key in target)) continue
      const sv = source[key]
      const tv = target[key]
      if (
        typeof sv === 'object' &&
        sv !== null &&
        !Array.isArray(sv) &&
        typeof tv === 'object' &&
        tv !== null &&
        !Array.isArray(tv)
      ) {
        utils.less_assign(tv as object, sv as object)
      } else {
        target[key] = sv as T[Extract<keyof T, string>]
      }
    }
    return target
  },

  clear_arr(arr: unknown[]) {
    while (arr.length) arr.pop()
  },

  is_equal(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a == null || b == null) return false
    if (typeof a !== typeof b) return false
    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false
      const ao = a as Record<string, unknown>
      const bo = b as Record<string, unknown>
      const aKeys = Object.keys(ao)
      if (aKeys.length !== Object.keys(bo).length) return false
      for (const key of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(bo, key)) return false
        if (!utils.is_equal(ao[key], bo[key])) return false
      }
      return true
    }
    return false
  },

  nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve))
  },

  /** 从数组里随机取一个 */
  random<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]
  },

  /** 把秒格式化成 m:ss.xxx */
  toTimeStr(seconds: number, fix = 3) {
    const isNegative = seconds < 0
    const abs = Math.abs(seconds)
    const hours = Math.floor(abs / 3600)
    const minutes = Math.floor((abs % 3600) / 60)
    const secs = (abs % 60).toFixed(fix)
    const ss = parseFloat(secs) < 10 ? '0' + secs : secs
    const sign = isNegative ? '-' : ''
    if (hours > 0)
      return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${ss}`
    if (minutes === 0) return `${sign}0:${ss}`
    return `${sign}${String(minutes).padStart(2, '0')}:${ss}`
  },

  ms2str(ms: number, fix = 3) {
    return utils.toTimeStr(ms / 1000, fix)
  },

  sort_by_time<T extends { time: number }>(arr: T[]) {
    arr.sort((a, b) => a.time - b.time)
  },

  /** 一个物件的结束时间（hold 取最后一段的终点，hazard 取 end） */
  note_end(item: { time: number } & Partial<INotes.hold> & Partial<INotes.hazard>) {
    if ('segment' in item && item.segment?.length) return item.segment[item.segment.length - 1][0]
    if ('end' in item && typeof item.end === 'number') return item.end
    return item.time
  }
}
