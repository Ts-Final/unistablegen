import { reactive } from 'vue'

export type StageKey = 'load_settings' | 'all_chart' | 'load_skin' | 'load_tips' | 'open_browser'

export type StageState = 'pending' | 'loading' | 'done' | 'failed'

const stages = reactive<Record<StageKey, StageState>>({
  load_settings: 'pending',
  all_chart: 'pending',
  load_skin: 'pending',
  load_tips: 'pending',
  open_browser: 'pending'
})

const labels: Record<StageKey, string> = {
  load_settings: 'Load Settings',
  all_chart: 'Load All Chart',
  load_skin: 'Load Skin',
  load_tips: 'Load Tips',
  open_browser: 'Check Browser'
}

const text: Record<StageState, string> = {
  pending: '待机…',
  loading: '进行中…',
  done: '✔',
  failed: '✖'
}

/**
 * 启动阶段的进度（对应 sv 的 core/misc/preinit.ts）。
 * pre-init-page.vue 会把这些阶段列出来。
 * */
export const Preinit = {
  stages,
  labels,
  text,

  set(key: StageKey, state: StageState) {
    stages[key] = state
  },
  begin(key: StageKey) {
    stages[key] = 'loading'
  },
  done(key: StageKey) {
    stages[key] = 'done'
  },
  fail(key: StageKey) {
    stages[key] = 'failed'
  },

  /** 按顺序跑一遍，自动维护阶段状态；fn 抛异常就记为 failed */
  async run(key: StageKey, fn: () => Promise<void> | void) {
    this.begin(key)
    try {
      await fn()
      this.done(key)
      return true
    } catch (e) {
      console.error(`[preinit] ${key} 失败：`, e)
      this.fail(key)
      return false
    }
  },

  /** 列表形式，方便模板里 v-for */
  list() {
    return (Object.keys(stages) as StageKey[]).map((k) => ({
      key: k,
      label: labels[k],
      state: stages[k]
    }))
  }
}
