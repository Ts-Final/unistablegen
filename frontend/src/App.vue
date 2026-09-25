<script setup lang="ts">
/**
 * uni 的入口（对应 sv 的 App.vue）。
 * 只负责按 GlobalStat.route 切换页面 —— 启动流程（读设置、列谱面、检查皮肤、
 * 版本变化提示……）都在 main.ts 的 main() 里，和 sv 一致。
 * */
import { ModalTarget } from '@kolirt/vue-modal'
import ChartV2 from '@components/chart-v2/chart-v2.vue'
import StartUp from '@components/start-up/start-up.vue'
import PreInitPage from '@components/miscellaneous/pre-init-page.vue'
import LoadSongPage from '@components/miscellaneous/load-song-page.vue'
import { GlobalStat } from '@core/globalStat.ts'

const state = GlobalStat.route.route
</script>

<template>
  <template v-if="state == 'start'">
    <start-up />
  </template>
  <template v-else-if="state == 'editor'">
    <chart-v2 />
  </template>
  <pre-init-page v-else-if="state == 'preinit'" />
  <load-song-page v-else-if="state == 'load-song'" />

  <!-- 通知容器（sv 的 #n-c）：notify.ts 会直接往里塞元素 -->
  <div id="n-c" class="notify-container"></div>

  <!-- modal 挂载点（v1 自带蒙版，点外面不关闭） -->
  <modal-target />
</template>

<style scoped>
#n-c {
  display: flex;
  flex-direction: column;
}
</style>
