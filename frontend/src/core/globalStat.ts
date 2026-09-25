import { ref } from 'vue'
import type { IChartSummary } from '@type/ipc.ts'
import { chart_api } from '@core/chart/chart-api.ts'

export type GlobalRoutes = 'preinit' | 'start' | 'editor' | 'load-song'

/**
 * 全局状态。
 * 用普通对象而不是 namespace（tsconfig 的 erasableSyntaxOnly 不允许带运行时代码的 namespace）。
 * */
export const GlobalStat = {
  route: {
    route: ref<GlobalRoutes>('preinit'),
    change(p: GlobalRoutes) {
      this.route.value = p
    }
  },

  /* ---------------- 谱面列表 ---------------- */

  /** 全部谱面（普通变量，给非响应式的地方用） */
  all_chart: [] as IChartSummary[],
  /** 响应式的那一份，界面绑定它 */
  all_chart_ref: ref<IChartSummary[]>([]),
  /** 重新读取谱面列表 */
  async update_all_chart() {
    GlobalStat.all_chart = await chart_api.all_charts()
    GlobalStat.all_chart_ref.value = GlobalStat.all_chart
  },

  /* ---------------- 界面 ---------------- */

  /** 编辑器的当前标签页: 1 谱面信息 / 2 谱面编辑 / 3 变奏(timing) */
  refs: {
    chart_tab: ref(2),
    header_display: ref(''),
    window: {
      height: ref(window.innerHeight),
      width: ref(window.innerWidth)
    }
  },

  /** ctrl / alt 的按下状态，编辑器里靠它区分操作 */
  func_keys: ref({ ctrl: false, alt: false }),

  rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,

  audioContext: new AudioContext()
}

document.addEventListener('mousemove', (e) => {
  GlobalStat.func_keys.value.ctrl = e.ctrlKey
  GlobalStat.func_keys.value.alt = e.altKey
})
document.addEventListener('keydown', (e) => {
  GlobalStat.func_keys.value.ctrl = e.ctrlKey
  GlobalStat.func_keys.value.alt = e.altKey
})
window.addEventListener('resize', () => {
  GlobalStat.refs.window.height.value = window.innerHeight
  GlobalStat.refs.window.width.value = window.innerWidth
})
