import { reactive } from 'vue'

/**
 * 打开谱面的进度（对应 sv 的 core/misc/load-song.ts）。
 * load-song-page.vue 会把这些阶段列出来。
 * */
export const LoadSong = {
  status: reactive({
    /** 读取 chart.json */
    open_song: false,
    /** 音频元数据就绪 */
    fetch_audio: false,
    /** 谱面对象建立完成 */
    set_data: false
  }),

  reset() {
    this.status.open_song = false
    this.status.fetch_audio = false
    this.status.set_data = false
  }
}
