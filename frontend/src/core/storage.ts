import { computed, ref, toRaw, watch } from 'vue'
import type { ISettings, IStorageScheme } from '@type/settings.ts'
import { Invoke } from './ipc-handler'
import { utils } from './utils'

// 设置与存档的结构定义在 type/settings.ts（前后端共用），这里只是转出去方便引用
export type { ISettings, IStorageScheme }

/** 版本号（对应 sv 的 Version） */
export const Version = {
  val: 4,
  str: '0.1.3'
}

function default_settings(): ISettings {
  return {
    scale: 10,
    max_scale: 20,
    meter: 4,
    max_meter: 64,

    track_width: 800,
    /** 浅橙色（外框 / 底部条底色） */
    background_color: '#ffd8a0',
    /** 轨道（note 区域）比外框稍深一点 */
    track_color: '#eebd82',
    bottom_bar_color: '#000000',
    bottom_bar_alpha: 50,
    judge_line_color: '#ffffff',
    judge_line_width: 2,
    note_width: 130,
    note_height: 40,
    flick_height: 20,
    judge_offset: 80,
    offset: 0,

    hazard_color: '#ff0000',
    hazard_alpha: 100,

    hold_line_width: 8,

    /** 竖直分列：0 = 不吸附、不画网格 */
    column: 0,
    /** 分列上限（设置里可改） */
    max_column: 100,
    column_color: '#7afbff',

    /** 谱面预览里默认全开（和 sv 的默认一致） */
    svg_shown_parts: {
      sprite: true,
      song: true,
      diff: true,
      sv: true,
      timing: true,
      bar: true,
      tick: true
    },

    bar_or_section: false,
    bar_from_0: true,
    show_ticks: true,
    show_bpm_bottom: true,
    sprites: {
      bar_color1: '#ffffff',
      bar_color2: '#7afbff',
      bar_color3: '#8bff66',
      bar_color4: '#4a5dff',
      bar_length: 6,
      bar_dy: 0
    },

    nearest: 2,
    beat_tolerance: 0,
    pooling: {
      ahead: 5000,
      interval: 2000
    },
    auto_save: true,
    /** server 监听的端口（被占用时会一直重试） */
    port: 3000,
    /** 留空 = 系统默认浏览器 */
    browser_path: ''
  }
}

function default_scheme(): IStorageScheme {
  return {
    settings: default_settings(),
    version: Version.val,
    shortcut: '',
    username: 'newcomer',
    statistics: {
      used_time: 0,
      first_open: Date.now()
    }
  }
}

const storage = ref<IStorageScheme>(default_scheme())

// 与 sv 一致：建立依赖但不在 watch 里保存（保存交给 init_interval / 显式调用）
watch(storage, () => {}, { deep: true })

const computes = {
  /** 每秒像素数：sv 的 mul */
  mul: computed(() => (storage.value.settings.scale * 200 + 100) / 1000)
}

/** 本次会话的运行时长(ms)，每秒刷新（放在响应式存档之外，避免频繁写盘） */
const running_time = ref(0)
const __start_time = Date.now()
let __update_last = Date.now()
window.setInterval(() => {
  running_time.value = Date.now() - __start_time
}, 1000)

export const Storage = {
  /** 响应式的存档本体（对应 sv 的 Storage.data） */
  data: storage,
  _ref: storage,

  get settings(): ISettings {
    return storage.value.settings
  },
  get version() {
    return storage.value.version
  },
  get username(): string {
    return storage.value.username
  },
  /** 使用这个工具的第几天 */
  get used_days(): number {
    return Math.ceil((Date.now() - storage.value.statistics.first_open) / (24 * 60 * 60 * 1000))
  },
  /** 本次会话已运行的毫秒数（响应式） */
  running_time,
  /** 累计使用时长（含本次会话，ms） */
  get total_used_time(): number {
    return storage.value.statistics.used_time + running_time.value
  },

  computes,

  /**
   * 从 server 读设置（对应 sv 的 set_from_storage）。
   * 存档放在 charts/config.json。
   * @returns 存档里的版本号，没有存档则返回 undefined
   */
  async set_from_storage() {
    const data = await Invoke('get-conf', {})
    if (!data) return
    const parsed = JSON.parse(data) as IStorageScheme
    utils.less_assign(this.data.value, parsed)
    // 版本号总是写成当前的
    this.data.value.version = Version.val
    return parsed.version
  },

  /** 把设置写回 server */
  save() {
    Invoke('save-conf', { data: JSON.stringify(toRaw(this.data.value)) }).catch((e) => {
      console.warn('[storage] 设置保存失败：', e)
    })
  },

  /** 每 10 秒自动存一次（对应 sv 的 init_interval） */
  init_interval() {
    setInterval(() => {
      this.update_used_time()
      this.save()
    }, 10000)
  },

  /** 累加本次会话的使用时长 */
  update_used_time() {
    const now = Date.now()
    storage.value.statistics.used_time += now - __update_last
    __update_last = now
  },

  reset() {
    utils.less_assign(storage.value, default_scheme())
  }
}
