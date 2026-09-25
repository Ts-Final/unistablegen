<script setup lang="ts">
/**
 * 编辑器外壳：顶端是 sv 风格的菜单栏（三个标签页），下面是内容区。
 * */
import { onMounted, onUnmounted } from 'vue'
import SongInfo from '@components/chart-v2/chart-tabs/song-info.vue'
import ChartTiming from '@components/chart-v2/chart-tabs/chart-timing.vue'
import ChartMain from '@components/chart-v2/chart-tabs/chart-main.vue'
import { GlobalStat } from '@core/globalStat.ts'
import { Chart } from '@core/chart/chart.ts'
import { Storage } from '@core/storage.ts'
import { EventHub } from '@core/misc/eventhub.ts'
import { modal } from '@core/misc/modal.ts'
import { notify } from '@core/misc/notify.ts'
import { Invoke } from '@core/ipc-handler.ts'
import '@components/miscellaneous/header.css'

const chart = Chart.$current
const active = GlobalStat.refs.chart_tab
active.value = 2

const song_name = GlobalStat.refs.header_display

const TABS = [
  { v: 1, label: '曲目' },
  { v: 2, label: '编排' },
  { v: 3, label: '时轴' }
]

function is_active(i: number) {
  return active.value == i ? 'header-active' : ''
}

/** Tab 切换标签页（和 sv 一致） */
function on_keydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey) return
  e.preventDefault()
  active.value = active.value >= 3 ? 1 : active.value + 1
}

/**
 * Ctrl+滚轮 改流速，Alt+滚轮 改分音（按 sv 的档位走，不是 ±1）。
 * 改完必须把事件发出去，否则 pixi 画布不会重画（之前就是漏了这一步，
 * 所以停下播放时滚轮「没有视觉响应」）。
 * */
const METERS = [1, 4, 8, 12, 16, 24, 32, 48, 64]

function on_wheel(e: WheelEvent) {
  if (e.ctrlKey) {
    Storage.settings.scale = Number(
      Math.max(
        0.1,
        Math.min(Storage.settings.scale - 0.001 * e.deltaY, Storage.settings.max_scale)
      ).toFixed(1)
    )
    EventHub.dispatch('scale-changed')
  } else if (e.altKey) {
    // sv：在固定档位表里往上/下一格，1 是最小档
    const ix = METERS.findIndex((v) => v >= Storage.settings.meter)
    if (ix === -1) return
    Storage.settings.meter = METERS[Math.max(ix - (e.deltaY > 0 ? 1 : -1), 0)] ?? 64
    chart.diff.update_meter()
    EventHub.dispatch('meter-changed')
  }
}

onMounted(() => document.addEventListener('keydown', on_keydown))
onUnmounted(() => document.removeEventListener('keydown', on_keydown))

function save() {
  chart.save(true)
}

function open_folder() {
  Invoke('open-charts-folder', {}).catch(() => {})
}

/** 刷新：重算统计 / 小节线 / 密度，并重画画布 */
function refresh() {
  chart.diff.update_on_diff_index()
  notify.normal('已刷新')
}

/** 关闭当前文件，回到曲目选择页（对应 sv 的 close_chart） */
async function close_chart() {
  const c = Chart.current
  if (c) {
    try {
      await c.save()
    } catch (e) {
      notify.error(`保存失败：${e instanceof Error ? e.message : String(e)}`)
    }
    c.audio.pause()
    c.diff.stop()
    c.stop()
    Chart.current = undefined
  }
  try {
    await GlobalStat.update_all_chart()
  } catch {
    /* 列表刷新失败不影响关闭 */
  }
  document.title = 'unistablegen'
  GlobalStat.route.change('start')
}
</script>

<template>
  <div class="chart-v2-wrapper" @wheel.ctrl.prevent="on_wheel" @wheel.alt.prevent="on_wheel">
    <div class="header-wrapper">
      <div class="header-top">
        <img alt="unistablegen" class="header-yq" src="/icon.png" />
        <div class="header-menu-ul">
          <div class="h-menu-btn-text">工具</div>
          <div class="h-menu-btn-i">
            <div class="h-menu-btn-text" @click="modal.IExporterModal.show({})">导入/导出</div>
            <div class="h-menu-btn-text" @click="save()">保存</div>
            <div class="h-menu-btn-text" @click="open_folder()">打开谱面文件夹</div>
            <div class="h-menu-btn-text" @click="modal.SettingModal.show({})">设置</div>
            <div class="h-menu-btn-text" @click="refresh()">刷新</div>
            <div class="h-menu-btn-text h-menu-btn-i-sep" @click="close_chart()">关闭文件</div>
          </div>
        </div>
        <div
          v-for="t in TABS"
          :key="t.v"
          :class="is_active(t.v)"
          class="header-menu-ul"
          @click="active = t.v"
        >
          <div class="h-menu-btn-text">{{ t.label }}</div>
        </div>
        <div class="chart-name">{{ song_name }}</div>
      </div>
    </div>
    <div class="chart-body">
      <song-info v-if="active === 1" />
      <chart-main v-else-if="active === 2" />
      <chart-timing v-else />
    </div>
  </div>
</template>

<style scoped>
.chart-v2-wrapper {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.chart-body {
  flex-grow: 1;
  position: relative;
  overflow: hidden;
  height: calc(100vh - 2rem);
}
</style>
