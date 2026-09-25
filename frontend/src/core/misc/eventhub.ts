import {
  onMounted,
  onUnmounted,
  watch as VueWatch,
  type WatchCallback,
  type WatchHandle,
  type WatchOptions,
  type WatchSource
} from 'vue'

/** 全局事件总线里可用的事件名 */
const events = [
  'audio-time-update',
  'fuck-shown',
  'scale-changed',
  'meter-changed',
  'diff-changed',
  /** 竖直分列（column）改了：编辑画布要重画网格 */
  'column-changed'
] as const

export type eventNames = (typeof events)[number]

class EventHubClass {
  handlers: Partial<Record<eventNames, (() => void)[]>> = {}
  paused = false

  on(event: eventNames, fn: () => void) {
    if (this.handlers[event]) this.handlers[event]!.push(fn)
    else this.handlers[event] = [fn]
    return () => this.off(event, fn)
  }
  dispatch(event: eventNames) {
    if (this.paused) return
    this.handlers[event]?.forEach((x) => x())
  }
  off(event: eventNames, fn: () => void) {
    if (this.handlers[event]) this.handlers[event] = this.handlers[event]!.filter((x) => x !== fn)
  }
  use(event: eventNames, fn: () => void) {
    onMounted(() => this.on(event, fn))
    onUnmounted(() => this.off(event, fn))
  }
  pause() {
    this.paused = true
  }
  resume() {
    this.paused = false
  }
}

export const EventHub = new EventHubClass()

/** 带自动解绑能力的基类：所有监听/定时器都可以通过 stop() 一次性清掉 */
export class StopClass {
  private stop_functions: (() => void)[] = []
  stopped = false

  stop() {
    if (this.stopped) return
    this.stopped = true
    this.stop_functions.forEach((x) => x())
    this.stop_functions = []
  }
  add_stop(fn: () => void) {
    if (this.stopped) fn()
    else this.stop_functions.push(fn)
  }
  add_watch(wr: WatchHandle) {
    this.add_stop(() => wr.stop())
  }
  watch<T>(source: WatchSource<T>, cb: WatchCallback<T>, options?: WatchOptions) {
    this.add_watch(VueWatch(source, cb, options))
  }
  add_on(event: eventNames, fn: () => void) {
    EventHub.on(event, fn)
    this.add_stop(() => EventHub.off(event, fn))
  }
}
