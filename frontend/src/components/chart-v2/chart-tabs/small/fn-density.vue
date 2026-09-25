<script setup lang="ts">
/** 密度曲线：点击/拖拽可以跳转时间（样式沿用 sv fn-density） */
import { computed, ref } from 'vue'
import { Chart } from '@core/chart/chart.ts'
import { utils } from '@core/utils.ts'

const chart = Chart.$current
const data = chart.diff.density_data
const path = chart.diff.density_path

const width = 300 + 20

const dy = computed(() => {
  const max = Math.max(...data.value, 1)
  return [0, 0.25, 0.5, 0.75, 1].map((v) => [240 - Math.floor(v * 230), v * max] as [number, number])
})

const seeker = ref({ time: 0, display: false, x: 0 })
let flag = false

function mousemove(e: MouseEvent) {
  const x = e.offsetX - 20
  if (x < 0 || x > width) {
    seeker.value.display = false
    return
  }
  seeker.value.time = Math.floor((x / (width - 20)) * chart.audio.length)
  seeker.value.display = true
  seeker.value.x = e.offsetX
  if (flag) chart.seek(seeker.value.time)
}
const current_x = computed(() => (chart.audio.current_ms / chart.audio.length) * (width - 20) + 20)

function mouseout() {
  seeker.value.display = false
  flag = false
}
function mousedown() {
  flag = true
}
function mouseup() {
  flag = false
}
function click() {
  chart.seek(seeker.value.time)
}
</script>

<template>
  <div class="density-wrapper" style="user-select: none">
    <div class="density-title" @click="chart.diff.calc_density()">线密度</div>
    <svg
      width="320"
      height="256"
      preserveAspectRatio="none"
      style="contain: strict"
      @click="click"
      @mousedown="mousedown"
      @mousemove="mousemove"
      @mouseout="mouseout"
      @mouseup="mouseup"
    >
      <path :d="path" class="no-event" fill="none" stroke="white" stroke-width="1" />
      <g class="no-event">
        <text v-for="(y, i) in dy" :key="'y' + i" :x="15" :y="y[0]" dy="5" fill="white" font-size="10" text-anchor="end">
          {{ y[1].toFixed(0) }}
        </text>
        <line
          v-for="(y, i) in dy"
          :key="'l' + i"
          :x1="20"
          :x2="width"
          :y1="y[0]"
          :y2="y[0]"
          stroke="white"
          stroke-dasharray="2,2"
          stroke-width="1"
        />
      </g>
      <line
        v-if="seeker.display"
        :x1="seeker.x"
        :x2="seeker.x"
        class="no-event"
        stroke="white"
        stroke-width="1"
        y1="10"
        y2="240"
      />
      <text
        v-if="seeker.display"
        :x="seeker.x"
        class="no-event"
        fill="white"
        font-size="10"
        text-anchor="middle"
        y="252"
      >
        {{ utils.toTimeStr(seeker.time / 1000, 0) }}
      </text>
      <line
        :x1="current_x"
        :x2="current_x"
        class="no-event"
        stroke="white"
        stroke-opacity="0.3"
        stroke-width="2"
        y1="10"
        y2="240"
      />
    </svg>
  </div>
</template>

<style scoped>
.density-title {
  text-align: center;
  cursor: pointer;
  max-height: calc(3rem + 250px);
  overflow: hidden;
}
.density-wrapper {
  columns: 1;
  text-align: center;
  min-width: 320px;
}
</style>
