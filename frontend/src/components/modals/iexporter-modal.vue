<script lang="ts" setup>
/**
 * 导入 / 导出（对应 sv 的 iexporter-modal.vue，这里只保留 pcd 的两项）。
 * 布局照 sv：.vsc-loader-wrapper + .iexports。
 * 文件选择与读取都走 server。
 * */
import SimpleModal from '@components/modals/simple-modal.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import { Chart } from '@core/chart/chart.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { notify } from '@core/misc/notify.ts'
import { modal } from '@core/misc/modal.ts'

const chart = Chart.$current

/** 打开谱面预览（里面可以导出 png），对应 sv 的「导出svg」 */
function open_preview() {
  modal.ChartPreviewModal.show({})
}

/** 导入 pcd：ask-file 拿路径 -> open-file-utf 拿文本 -> 作为新难度加进来 */
async function read_pcd() {
  const fp = await Invoke('ask-file', { file: ['pcd文件', 'pcd'] })
  if (!fp) return
  const text = await Invoke('open-file-utf', { path: fp })
  if (!text) return notify.error('读取pcd失败……')
  chart.load_pcd(text)
}

/** 导出当前难度为 pcd */
function write_pcd() {
  chart.write_current_pcd().catch((e) => {
    notify.error(`导出失败：${e instanceof Error ? e.message : String(e)}`)
  })
}
</script>

<template>
  <simple-modal size="1" title="导入/导出">
    <div class="vsc-loader-wrapper">
      <div class="iexports">
        <a-button2 msg="导入pcd" @click="read_pcd" />
        <a-button2 msg="导出pcd" @click="write_pcd" />
        <a-button2 class="wide" msg="谱面预览 / 导出png" @click="open_preview" />
      </div>
    </div>
  </simple-modal>
</template>

<style scoped>
.vsc-loader-wrapper {
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  max-height: 55vh;
  /*
   * 这个 div 是滚动容器（overflow-y: auto），高度是内容撑的，
   * 内容只有两个按钮时会紧贴着按钮 —— 而 a-button2:hover 会 scale(1.1)，
   * 放大出来的那一两个像素就成了「可滚动溢出」，于是 hover 一下就冒出滚动条。
   * 给它一点最小高度，flex 居中的内容四周就有余量，放大也放得下。
   * */
  min-height: 5rem;
  width: 100%;
  overflow-y: auto;
}
.iexports {
  display: grid;
  /* sv 的栅格设定：1fr 1fr 1fr 1fr（那边一行是 3~4 个按钮） */
  grid-template-columns: 1fr 1fr 1fr 1fr;
  width: 100%;
  justify-items: center;
  gap: 5px;
}
/* uni 只留了导入/导出两个按钮，各占两格，铺开的宽度才和 sv 的四列一致 */
.iexports > * {
  grid-column: span 2;
}
/* 谱面预览一个人占一行 */
.iexports > .wide {
  grid-column: span 4;
}
</style>
