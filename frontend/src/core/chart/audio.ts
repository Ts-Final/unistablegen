import { computed, ref, type Ref, type WritableComputedRef } from 'vue'
import { StopClass } from '@core/misc/eventhub.ts'
import type { Chart } from './chart'

/**
 * 音频播放。
 *
 * 谱面时间与音频时间的换算（poly 的时间模型）：
 *   chart_time = audio_time - song.offset - settings.offset
 * 也就是说这首歌的 offset 与用户的校准 offset 都会整体平移谱面。
 * */
export class Chart_audio extends StopClass {
  chart: Chart
  ele: HTMLAudioElement
  /** 音频总长度(ms) */
  length = 0
  /** 音频加载失败（比如文件夹里没放音频） */
  audio_error = ref(false)
  private loaded: Promise<void>
  private end_cbs: (() => void)[] = []

  refs: {
    current_ms: Ref<number>
    paused: Ref<boolean>
    play_rate: Ref<number>
    writable_current_second: WritableComputedRef<number>
    writable_play_rate: WritableComputedRef<number>
  }

  constructor(chart: Chart, url: string) {
    super()
    this.chart = chart
    this.ele = new Audio(url)
    this.ele.preload = 'auto'

    const current_ms = ref(0)
    const paused = ref(true)
    const play_rate = ref(1)

    this.refs = {
      current_ms,
      paused,
      play_rate,
      writable_current_second: computed({
        get: () => this.current_time / 1000,
        set: (v: number) => this.set_current_time(v * 1000)
      }),
      writable_play_rate: computed({
        get: () => play_rate.value,
        set: (v: number) => {
          play_rate.value = v
          this.ele.playbackRate = v
        }
      })
    }

    this.loaded = new Promise<void>((resolve) => {
      const done = () => resolve()
      this.ele.addEventListener('loadedmetadata', () => {
        this.length = (this.ele.duration || 0) * 1000
        done()
      })
      this.ele.addEventListener('error', () => {
        this.audio_error.value = true
        done()
      })
      // 万一浏览器一直不给事件，别把整个打开流程卡死
      window.setTimeout(done, 8000)
    })
    this.ele.addEventListener('ended', () => {
      paused.value = true
      this.end_cbs.forEach((fn) => fn())
    })
    this.ele.addEventListener('play', () => (paused.value = false))
    this.ele.addEventListener('pause', () => (paused.value = true))
  }

  /** 等待音频元数据 */
  async ready() {
    await this.loaded
    if (this.length <= 0) {
      // 没有音频时用谱面最后一个物件的时间兜底
      const last = this.chart.last_object_time()
      this.length = last > 0 ? last + 5000 : 60000
    }
  }

  /** 当前的谱面时间(ms) */
  get current_time() {
    return this.refs.current_ms.value
  }

  /** current_time 的别名（渲染层用得多） */
  get current_ms() {
    return this.refs.current_ms.value
  }

  get paused() {
    return this.refs.paused.value
  }

  get play_rate() {
    return this.refs.play_rate.value
  }

  /** 音频时间 -> 谱面时间 */
  audio_to_chart(sec: number) {
    return sec * 1000 - this.chart.data.song.offset - this.chart.settings_offset
  }

  /** 谱面时间 -> 音频时间 */
  chart_to_audio(ms: number) {
    return (ms + this.chart.data.song.offset + this.chart.settings_offset) / 1000
  }

  set_current_time(ms: number) {
    const t = Math.max(0, Math.min(ms, this.length))
    this.ele.currentTime = this.chart_to_audio(t)
    this.refs.current_ms.value = t
  }

  play() {
    this.ele.playbackRate = this.refs.play_rate.value
    this.ele.play().catch(() => {
      this.refs.paused.value = true
    })
  }

  pause() {
    this.ele.pause()
  }

  play_pause() {
    if (this.paused) this.play()
    else this.pause()
  }

  set_play_rate(v: number) {
    this.refs.writable_play_rate.value = v
  }

  /** 由 chart 的主循环每帧调用 */
  update() {
    if (!this.audio_error.value) this.refs.current_ms.value = this.audio_to_chart(this.ele.currentTime)
  }

  on_end(fn: () => void) {
    this.end_cbs.push(fn)
  }

  override stop() {
    this.pause()
    this.ele.src = ''
    super.stop()
  }
}
