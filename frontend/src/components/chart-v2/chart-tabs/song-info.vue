<script setup lang="ts">
import { computed, ref } from 'vue'
import { Chart } from '@core/chart/chart.ts'
import { chart_api } from '@core/chart/chart-api.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { notify } from '@core/misc/notify.ts'
import AButton2 from '@components/a-elements/a-button2.vue'
import AImg from '@components/a-elements/a-img.vue'
import ANumberInput from '@components/a-elements/a-number-input.vue'
import ATextInput from '@components/a-elements/a-text-input.vue'
import ASelect from '@components/a-elements/a-select.vue'
import SongInfoSingle from '@components/chart-v2/chart-tabs/small/song-info-single.vue'

const chart = Chart.$current
const song = chart.song
const diff = chart.diff

/** 没有曲绘时用它顶上（就是顶栏那个图标） */
const APP_ICON = '/icon.png'

const cover_key = ref(0)
const cover_url = computed(() => `${chart_api.bg_url(chart.id)}?v=${cover_key.value}`)

const diff_options = computed(() =>
  chart.diffs.map((d, i) => ({
    val: i,
    display: `${d.meta.diff_name || '???'} ${d.meta.rating}`
  }))
)

const diff_index = computed({
  get: () => diff.diff_index.value,
  set: (v: number) => {
    diff.diff_index.value = v
  }
})

const meta = computed(() => diff.meta)

/** 选图片由 server 弹系统文件框（和导入曲目一样，浏览器不参与上传） */
async function import_sprite() {
  try {
    const path = await Invoke('ask-file', { file: ['曲绘', 'png', 'jpg', 'jpeg', 'gif', 'webp'] })
    if (!path) return
    const r = await Invoke('import-sprite', { id: chart.id, path })
    if (r.state !== 'success') {
      notify.error(`导入曲绘失败：${r.reason ?? '未知错误'}`)
      return
    }
    cover_key.value++
    notify.normal('已导入曲绘')
  } catch (e) {
    notify.error(`导入曲绘失败：${e instanceof Error ? e.message : String(e)}`)
  }
}
</script>

<template>
  <div class="info-wrapper">
    <div class="info-inner">
      <song-info-single v-model="song.refs.name" name="曲名" />
      <song-info-single v-model="song.refs.composer" name="编曲" />
      <song-info-single v-model="song.refs.bpm" name="BPM" />
      <!-- 视角和敌人在同一行，是两个独立的框 -->
      <div class="info-row">
        <div class="song-info-single">
          <div>视角</div>
          <a-number-input v-model="song.refs.perspective" :step="1" />
        </div>
        <song-info-single v-model="song.refs.enemy" name="敌人" />
      </div>
      <div class="song-info-single">
        <div>画师 / 偏移</div>
        <div class="num-row">
          <a-number-input v-model="song.refs.sprite" :step="1" />
          <a-number-input v-model="song.refs.offset" :step="1" />
        </div>
      </div>
      <div class="song-info-single">
        <div>预览区间</div>
        <div class="num-row">
          <a-number-input v-model="song.refs.preview[0]" :step="1" />
          <span class="tilde">~</span>
          <a-number-input v-model="song.refs.preview[1]" :step="1" />
        </div>
      </div>
      <div class="song-info-single">
        <div>
          <div>曲绘</div>
          <a-button2 msg="导入曲绘" @click="import_sprite" />
        </div>
        <!-- 没有曲绘（或者图坏了）时显示项目图标，不留一块空白 -->
        <a-img :src="cover_url" class="song-sprite">
          <img :src="APP_ICON" alt="" class="song-sprite" />
        </a-img>
      </div>
    </div>

    <div class="info-inner">
      <div class="song-info-single diff-choose">
        <div>
          <div>选择难度：</div>
          <a-select v-model="diff_index" :options="diff_options" />
        </div>
        <div>
          <a-button2 msg="新建难度" @click="chart.create_diff()" />
          <a-button2 msg="删除该难度" @click="chart.delete_diff()" />
          <a-button2 msg="复制该难度" @click="chart.copy_diff()" />
        </div>
      </div>
      <!-- 难度名和等级写在同一个框里 -->
      <div class="song-info-single">
        <div>难度名 / 等级</div>
        <div class="num-row">
          <a-text-input v-model="meta.diff_name" class="input-line" />
          <a-number-input v-model="meta.diff_num" :step="1" class="input-line" />
        </div>
      </div>
      <!-- 定数单独一个框 -->
      <div class="song-info-single">
        <div>定数</div>
        <a-number-input v-model="meta.rating" :step="0.1" />
      </div>
      <song-info-single v-model="meta.charter" name="谱师" />
    </div>
  </div>
</template>

<style scoped>
.info-wrapper {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px;
  box-sizing: border-box;
  border: 50px solid transparent;
}
.song-sprite {
  left: 50%;
  position: relative;
  transform: translateX(-50%);
  height: 15vh;
  background: white;
  padding: 5px;
}
.info-inner {
  display: flex;
  flex-direction: column;
  padding: 15px;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
}
.song-info-single {
  position: relative;
  border-radius: 10px;
  padding: 15px;
  background: var(--darker-bgi);
}
.info-inner > :last-child {
  margin-bottom: 10vh;
}
.song-info-single > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
/* 同一行里的两个框 */
.info-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
}
.info-row > * {
  flex: 1 1 0;
  min-width: 0;
}
.diff-choose {
  display: flex;
  flex-direction: column;
  gap: 10px 0;
  align-items: center;
}
.diff-choose > div {
  flex-direction: row;
  display: flex;
  gap: 25px;
}
.num-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  gap: 10px;
}
/* 只有难度名 / 等级这两个输入框带蓝色下划线 */
.input-line {
  border-bottom: 1px solid #b8dcee77;
}
.tilde {
  opacity: 0.7;
  user-select: none;
}
</style>
