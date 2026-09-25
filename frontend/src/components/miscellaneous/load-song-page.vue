<script setup lang="ts">
/**
 * 打开谱面的进度页（对应 sv 的 load-song-page.vue）。
 * 和 sv 一样不接受任何 props。
 * */
import { LoadSong } from '@core/misc/load-song.ts'

const status = LoadSong.status
</script>

<template>
  <div class="preinit-wrapper">
    <div class="preinit">
      <div class="preinit-title">
        <div>loading...</div>
      </div>
      <div class="load-stages">
        <div class="load-header">Load Progress</div>
        <div>Read Chart</div>
        <div>{{ status.open_song }}</div>
        <div>Load Audio</div>
        <div>{{ status.fetch_audio }}</div>
        <div>Set Data</div>
        <div>{{ status.set_data }}</div>
      </div>
      <div class="hint">如果在某个阶段一直卡住说明大概率是出bug了。请检查控制台。</div>
      <div class="hint">如果全都是true但是你卡了，那真没救了。</div>
    </div>
  </div>
</template>

<style scoped>
/* 沿用 sv 的 loading.css */
.preinit-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  left: 0;
  top: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}
.preinit {
  display: flex;
  flex-direction: column;
  text-align: center;
  align-items: center;
  gap: 20px;
}
.preinit-title {
  margin-bottom: 50px;
  font-size: 1.2rem;
}
.load-stages {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: min-content;
  text-wrap: nowrap;
  gap: 0 20px;
}
.load-header {
  font-weight: bold;
  font-size: 1.2rem;
  grid-column: span 2;
  padding-bottom: 25px;
  margin-bottom: 25px;
  border-bottom: 2px solid #b8dcee;
}
.load-stages > div:not(.load-header) {
  text-align: left;
}
.load-stages > div:nth-child(even) {
  text-align: right;
}
.hint {
  color: #8996a4;
  font-size: 0.85rem;
  max-width: 30rem;
}
</style>
