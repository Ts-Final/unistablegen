<script setup lang="ts">
/**
 * chart-main：谱面编辑主界面。
 * 左侧是物件选择与统计，中间是 pixi 画布，右侧是密度/ease/设置/时间。
 * 两侧沿用 sv 的 .fn-wrapper。
 * */
import FnNote from '@components/chart-v2/chart-tabs/small/fn-note.vue'
import FnCounter from '@components/chart-v2/chart-tabs/small/fn-counter.vue'
import FnDensity from '@components/chart-v2/chart-tabs/small/fn-density.vue'
import FnEditor from '@components/chart-v2/chart-tabs/small/fn-editor.vue'
import FnTime from '@components/chart-v2/chart-tabs/small/fn-time.vue'
import FnEase from '@components/chart-v2/chart-tabs/small/fn-ease.vue'
import PixiEditor from '@components/chart-v2/svg-lane/pixi-editor.vue'
</script>

<template>
  <div class="chart-main">
    <div class="chart-fn fn-wrapper">
      <fn-note />
      <fn-counter />
      <fn-density />
    </div>
    <pixi-editor />
    <div class="chart-fn fn-wrapper">
      <fn-editor />
      <fn-time />
      <fn-ease />
    </div>
  </div>
</template>

<style scoped>
.chart-main {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  flex-grow: 1;
  justify-content: space-around;
  position: relative;
  contain: strict;
  gap: 5px;
}

.chart-main-left {
  display: none;
  flex-direction: row;
  width: 100%;
  height: 100%;
  flex-grow: 1;
  justify-content: space-around;
  position: relative;
}

.svg-lane {
  z-index: 2;
}

.chart-fn {
  z-index: 1;
}
</style>
