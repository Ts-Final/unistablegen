import { watch } from 'vue'
import type { INotes } from '@type/note-types.ts'
import type { Chart } from './chart'

/**
 * 曲目信息。
 * 直接代理 chart.data.song，这样 song-info 里的 v-model 可以写到真正的数据上。
 * */
export class Chart_song {
  chart: Chart
  private stop_bpm: () => void

  constructor(chart: Chart) {
    this.chart = chart
    // bpm 字符串与 bpm_number 保持同步
    this.stop_bpm = watch(
      () => this.refs.bpm,
      (v) => {
        const n = parseFloat(v)
        if (!isNaN(n)) this.refs.bpm_number = n
      }
    )
  }

  get refs(): INotes.song {
    return this.chart.data.song
  }

  get name() {
    return this.refs.name
  }
  set name(v: string) {
    this.refs.name = v
  }
  get composer() {
    return this.refs.composer
  }
  set composer(v: string) {
    this.refs.composer = v
  }
  get bpm() {
    return this.refs.bpm
  }
  set bpm(v: string) {
    this.refs.bpm = v
  }

  set_song(v: Partial<INotes.song>) {
    Object.assign(this.refs, v)
  }

  save(): INotes.song {
    return this.refs
  }

  stop() {
    this.stop_bpm()
  }
}
