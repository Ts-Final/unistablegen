<script setup lang="ts">
/** 谱面统计（样式沿用 sv fn-counter） */
import { Chart } from '@core/chart/chart.ts'

const chart = Chart.$current
const counts = chart.diff.counts
</script>

<template>
  <div style="user-select: none">
    <div class="counter-title">统计</div>
    <div class="counter-inner">
      <div>note</div>
      <div>{{ counts.note }}</div>
      <div>critical</div>
      <div>{{ counts.critical }}</div>
      <div>ex</div>
      <div>{{ counts.ex }}</div>
      <div>面</div>
      <div>{{ counts.hold }}</div>
      <div>宽键</div>
      <div>{{ counts.wide }}</div>
      <div>chip</div>
      <div>{{ counts.chip }}</div>
      <div>flick</div>
      <div>{{ counts.flick }}</div>
      <div>hazard</div>
      <div>{{ counts.hazard }}</div>
      <div>总计</div>
      <div>{{ counts.total }}</div>
      <div>平均密度</div>
      <div>{{ counts.avg_density.toFixed(2) }}</div>
      <div>BPM</div>
      <div>{{ counts.min_bpm.toFixed(0) }} ~ {{ counts.max_bpm.toFixed(0) }}</div>
      <div>(Mainly</div>
      <div>{{ counts.main_bpm.toFixed(0) }})</div>
    </div>
  </div>
</template>

<style scoped>
.counter-title {
  text-align: center;
}

.counter-inner {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 0 15px;
  text-wrap: nowrap;
}

.counter-inner div:nth-child(2n + 1) {
  text-align: right;
}

.counter-inner div:nth-child(2n) {
  text-align: left;
}
</style>
