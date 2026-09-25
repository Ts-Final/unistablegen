<script setup lang="ts">
/**
 * 谱面预览 / 导出 png（对应 sv 的 chart-preview-modal.vue）。
 *
 * 打开时把整张难度渲染成一张 SVG（full-notes.vue），上面的勾选框决定画哪些部分；
 * 「导出为png」把它光栅化成 png 存进谱面文件夹并定位到文件（见 Chart.write_png）。
 * */
import { computed } from 'vue'
import SimpleModal from '@components/modals/simple-modal.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import ACheckbox from '@components/a-elements/a-checkbox.vue'
import FullNotes from '@components/chart-v2/full-notes.vue'
import { Chart } from '@core/chart/chart.ts'
import { Storage } from '@core/storage.ts'
import { notify } from '@core/misc/notify.ts'

const chart = Chart.$current
/** 显示哪些部分（存在设置里，下次打开还是上次的选择） */
const parts = computed(() => Storage.settings.svg_shown_parts)

const OPTIONS = [
  { key: 'sprite', label: '曲绘' },
  { key: 'song', label: '曲名' },
  { key: 'diff', label: '谱面信息' },
  { key: 'sv', label: '水印' },
  { key: 'timing', label: 'timing' },
  { key: 'bar', label: '小节线' },
  { key: 'tick', label: '分音' }
] as const

function write_png() {
  chart.write_png().catch((e) => {
    notify.error(`导出png失败：${e instanceof Error ? e.message : String(e)}`)
  })
}
</script>

<template>
  <simple-modal size="4" title="谱面预览">
    <div class="chart-preview-wrapper">
      <div class="chart-preview-top">
        <label v-for="o in OPTIONS" :key="o.key" class="preview-opt">
          <a-checkbox v-model="parts[o.key]" />
          <span>{{ o.label }}</span>
        </label>
        <a-button2 msg="导出为png" @click="write_png" />
      </div>
      <div class="chart-preview-svg">
        <full-notes />
      </div>
    </div>
  </simple-modal>
</template>

<style scoped>
/* 这一段照抄 sv 的 chart-preview-modal.vue：
   wrapper 用固定高度，滚动区靠 max-height: calc(100% - 3rem - 30px) 卡住，
   里面的图按自己的原生尺寸画（不缩放），靠 overflow: scroll 看。 */
.chart-preview-wrapper {
  height: 60vh;
  width: 100%;
}
.chart-preview-top {
  line-height: 3rem;
  border-bottom: 3px solid #b8dcee;
  margin-bottom: 15px;
  display: flex;
  justify-content: center;
  padding-bottom: 5px;
}
.chart-preview-svg {
  max-height: calc(100% - 3rem - 30px);
  overflow: scroll;
}
/* sv 这里用的是 a-label 组件（checkbox 在前、文字在后），uni 没有它，样式照抄过来 */
.preview-opt {
  display: flex;
  align-items: flex-start;
  width: min-content;
  margin-left: 0.5em;
}
.preview-opt > span {
  text-wrap: nowrap;
  text-align: left;
}
</style>
