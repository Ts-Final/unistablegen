<script lang="ts" setup>
/**
 * 导入 / 导出（对应 sv 的 iexporter-modal.vue，这里只保留 pcd 的两项）。
 * 布局照 sv：.vsc-loader-wrapper + .iexports。
 * 文件选择与读取都走 server。
 * */
import SimpleModal from '@components/modals/simple-modal.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import {Chart} from '@core/chart/chart.ts'
import {Invoke} from '@core/ipc-handler.ts'
import {notify} from '@core/misc/notify.ts'
import {modal} from '@core/misc/modal.ts'
import Hide from "@components/a-elements/hide.vue"
import {ref} from "vue"
import ATextarea from "@components/a-elements/a-textarea.vue"

const chart = Chart.$current

/** 打开谱面预览（里面可以导出 png），对应 sv 的「导出svg」 */
function open_preview() {
  modal.ChartPreviewModal.show({})
}

/** 导入 pcd：ask-file 拿路径 -> open-file-utf 拿文本 -> 作为新难度加进来 */
async function read_pcd() {
  const fp = await Invoke('ask-file', {file: ['pcd文件', 'pcd']})
  if (!fp) return
  const text = await Invoke('open-file-utf', {path: fp})
  if (!text) return notify.error('读取pcd失败……')
  chart.load_pcd(text)
}

/** 导出当前难度为 pcd */
function write_pcd() {
  chart.write_current_pcd().catch((e) => {
    notify.error(`导出失败：${e instanceof Error ? e.message : String(e)}`)
  })
}

const info = ref(`{
  "name": "${chart.song.name}",
  "artist": "${chart.song.composer}",
  "chart_id": "${chart.id}",
  "perspective": ${chart.song.refs.perspective},
  "chapter_sort": 0,
  "jacket_designer": "${chart.song.refs.sprite}",
  "bpm": "${chart.song.bpm}",
  "version": 9999,
  "original": false,
  "loop_region": [${chart.song.refs.preview.join(",")}],
  "enemy_character": "${chart.song.refs.enemy}",
  "offset": ${chart.song.refs.offset},
  "charts": [
    {"level": ${chart.diff.meta.diff_num}, "note_designer": "${chart.diff.meta.charter}"}
  ]
}`)

function write_info() {
  Invoke("write-file", {
    id: chart.id,
    fname: "info.json",
    data: info.value
  }).then(() => Invoke("show-file", {id:chart.id, fname: "info.json"}))
}
</script>

<template>
  <simple-modal size="1" title="导入/导出">
    <div class="vsc-loader-wrapper">
      <Hide :def="true" title="导入">
        <div class="iexports">
          <a-button2 msg="导入pcd" @click="read_pcd"/>
        </div>
      </Hide>
      <Hide :def="true" title="导出">
        <div class="iexports">
          <a-button2 msg="导出pcd" @click="write_pcd"/>
          <a-button2 msg="导出png" @click="open_preview"/>
        </div>
      </Hide>
      <Hide title="JSON">
        <div class="iexports">
          <a-button2 msg="导出json" @click="write_info" class="wide"/>
          <a-textarea v-model="info" class="wide" style="min-height: 15rem"/>
        </div>
      </Hide>
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

/* 谱面预览一个人占一行 */
.iexports > .wide {
  grid-column: span 4;
}
</style>
