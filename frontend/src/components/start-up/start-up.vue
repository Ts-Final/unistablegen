<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { IChartSummary } from '@type/ipc.ts'
import AButton2 from '@components/a-elements/a-button2.vue'
import ATextInput from '@components/a-elements/a-text-input.vue'
import { GlobalStat } from '@core/globalStat.ts'
import { Storage } from '@core/storage.ts'
import { chart_api } from '@core/chart/chart-api.ts'
import { StartUpTips } from '@core/misc/startup-tips.ts'
import { modal } from '@core/misc/modal.ts'
import { open_chart_safe } from '@core/misc/open-chart.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { utils } from '@core/utils.ts'

/** 正在打开谱面时锁住，避免连点 */
let busy = false

/**
 * 搜索框过滤后的列表（对应 sv chart-list 的 shown）。
 * sv 的做法就是直接拿整个摘要的 JSON 做包含匹配，所以 id / 曲名 / 谱师 / 难度都能搜到。
 * */
const search = ref('')
const shown = ref<IChartSummary[]>(GlobalStat.all_chart)

watch(search, (c) => {
  shown.value = GlobalStat.all_chart.filter((v) => JSON.stringify(v).includes(c))
})

// 列表刷新（导入/删除/重开）之后清空搜索词并显示全部，和 sv 一样
watch(GlobalStat.all_chart_ref, () => {
  search.value = ''
  shown.value = GlobalStat.all_chart
})

const display_id = ref<string>()
const display_data = ref<IChartSummary>()

const username = Storage.username
const greeting_days = computed(() => Storage.used_days.toFixed(0))
const running = computed(() => utils.toTimeStr(Storage.running_time.value / 1000, 0))

const tip = ref(utils.random(StartUpTips) ?? '')
function random_tip() {
  tip.value = utils.random(StartUpTips) ?? ''
}

/** 导入曲目：选音频 -> 问 id -> 让 server 复制到 charts/<id>/ */
async function import_chart() {
  if (busy) return

  let song: { path: string; name: string } | null = null
  try {
    song = (await Invoke('ask-song', {})) as { path: string; name: string } | null
  } catch (e) {
    modal.ShowInformationModal.show({
      msg: `<b>后端炸了？</b><br><br>${e instanceof Error ? e.message : String(e)}`
    })
    return
  }
  if (!song?.path) return

  const ext_ix = song.name.lastIndexOf('.')
  const def = ext_ix < 0 ? song.name : song.name.slice(0, ext_ix)

  const id = (await modal.AskIdModal.show({
    all: GlobalStat.all_chart.map((x) => x.id),
    def
  })) as string | undefined
  if (!id) return

  const r = await Invoke('import-song', { id, path: song.path })

  if (r.state === 'existed') {
    modal.ShowInformationModal.show({
      msg: `你不应该看到这个，否则ask-id白干了`
    })
    return
  }
  if (r.state === 'failed') {
    modal.ShowInformationModal.show({
      msg: `喜报：炸了。我也不知道为什么，可以提供后端日志截图给开发组看看哦。`
    })
    return
  }

  /*
   * server 只负责把音频搬过去（和 sv 一样），谱面数据的初始化由前端做：
   * 没有自带 chart.json 时，这里生成一份空白数据存回去，
   * 谱面才会出现在列表里（uni 的索引是以 chart.json 为准的）。
   * */
  let inited = false
  if (!r.json) {
    try {
      const data = chart_api.empty_final(def)
      await chart_api.save_chart(id, data)
      inited = true
    } catch (e) {
      modal.ShowInformationModal.show({
        msg: `<b>初始化谱面数据失败</b><br>charts/${id}/<br><br>${
          e instanceof Error ? e.message : String(e)
        }`
      })
      return
    }
  }

  await GlobalStat.update_all_chart()
  modal.ShowInformationModal.show({
    msg: inited
      ? `已导入到 charts/${id}/，并初始化了一份空白谱面。<br>直接点进去就能开始写啦。`
      : `已导入到 charts/${id}/（含自带的 chart.json）。`
  })
}

function open_proj(id: string) {
  if (busy) return
  busy = true
  open_chart_safe(id, GlobalStat.all_chart.find((v) => v.id === id)?.name).finally(() => {
    busy = false
  })
}

function detail(c: IChartSummary) {
  if (busy) return
  display_id.value = c.id
  display_data.value = c
}
</script>

<template>
  <div class="chart-list-wrapper">
    <div class="chart-list-left">
      <div class="su-title" @click="random_tip">unistablegen</div>
      <div class="su-tip" v-html="tip" @click="random_tip"></div>
      <div class="su-greeting">
        欢迎，{{ username }}<br />
        这是你使用unistablegen的第{{ greeting_days }}天！ <br />
        已运行：{{ running }}
      </div>
      <div v-if="!display_id" class="su-desc">
        广告位招租，依旧
      </div>
      <div v-if="display_data" class="su-display">
        <div class="sd-title">{{ display_data.name }}</div>
        <div class="sd-composer">by {{ display_data.composer }}</div>
        <div class="sd-info">
          <span>id: {{ display_data.id }}</span>
          <span>{{ display_data.diffs.length }} diff</span>
        </div>
        <br />
        <div class="sd-diff">
          <div>Diffs:</div>
          <div v-for="(d, i) in display_data.diffs" :key="i">- {{ d }}</div>
        </div>
      </div>
    </div>

    <div class="chart-list-right">
      <div class="charts-func">
        <div class="search-wrapper">
          <a-text-input v-model="search" class="charts-input" placeholder="点击输入文字！" />
          <div>{{ shown.length }} 结果</div>
        </div>
        <div class="importer">
          <a-button2 msg="导入曲目" @click="import_chart" />
          <a-button2 msg="设置" @click="modal.SettingModal.show({})" />
          <a-button2 msg="使用说明" @click="modal.H2PModal.show({})" />
        </div>
      </div>
      <div class="charts-wrapper">
        <div
          v-for="chart in shown"
          :key="chart.id"
          class="chart-unit"
          @click="open_proj(chart.id)"
          @mouseenter="detail(chart)"
        >
          <div class="chart-unit-name">{{ chart.name }}</div>
          <div class="chart-unit-cid">
            <div class="chart-unit-composer">{{ chart.composer }}</div>
            <div class="chart-unit-id">{{ chart.id }}</div>
          </div>
        </div>
        <div v-if="shown.length == 0">这里没有歌哦。试试导入，或者换个搜索词吧！</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- 选择谱面：sv chart-list ---- */
.chart-list-wrapper {
  display: grid;
  grid-template-columns: 45vw 55vw;
  justify-content: space-between;
  height: 100vh;
  width: 100vw;
}
.chart-list-left {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr auto 6rem 10fr;
  justify-items: center;
  gap: 20px;
}
.su-title {
  font-size: 2.5rem;
  text-align: center;
  position: relative;
  padding-top: 10%;
  cursor: pointer;
}
.su-tip {
  position: relative;
  color: gold;
  z-index: 15;
  line-height: 1.5rem;
  max-width: 85%;
  text-align: center;
  cursor: pointer;
  overflow: hidden auto;
  max-height: 12rem;
}
.su-greeting {
  text-align: center;
}
.su-desc {
  font-size: 1.5rem;
  width: 100%;
  text-align: center;
}
.su-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  text-wrap: nowrap;
  text-overflow: ellipsis;
}
.sd-title {
  font-size: 1.5rem;
  height: 1.8rem;
  max-width: 35vw;
  text-overflow: ellipsis;
  overflow: hidden;
}
.sd-info {
  width: 50%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px;
  align-content: space-evenly;
  margin-top: 15px;
  max-width: 90%;
}
.sd-info > span:first-child {
  text-align: left;
}
.sd-info > span:last-child {
  text-align: right;
  text-wrap: nowrap;
  text-overflow: ellipsis;
}
.sd-diff {
  width: 50%;
  text-overflow: ellipsis;
  text-align: left;
}

.chart-list-right {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-x: hidden;
}
.charts-func {
  height: 5rem;
  border-bottom: 2px solid #b8dcee;
  margin-bottom: 15px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding-right: 10%;
}
.search-wrapper {
  flex-grow: 1;
  padding-left: 25px;
}
.search-wrapper > * {
  width: 90%;
}
/* 搜索框（照 sv：左边留白、占满剩余宽度） */
.charts-input {
  width: calc(100% - 50px);
  text-align: left;
}
.importer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-evenly;
  height: 100%;
  gap: 15px;
}
.charts-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 7rem - 20px);
  overflow: hidden auto;
  transform: translateX(calc(0 - var(--ch-transform-len)));
  border: 4px solid transparent;
  width: calc(100% - 10px);
  padding-top: 5px;
  --ch-transform-len: 0.5rem;
}
.chart-unit {
  display: flex;
  flex-direction: column;
  transition: 0.2s ease all;
  cursor: pointer;
  transform: translateX(var(--ch-transform-len));
  padding: 5px;
  border-radius: 5px;
  min-height: 2.2rem;
  position: relative;
  max-width: calc(100% - 5px);
}
.chart-unit:last-child {
  margin-bottom: 120px;
}
.chart-unit:hover {
  transform: translateX(2px);
}
.chart-unit > div {
  user-select: none;
}
.chart-unit:hover .chart-unit-name {
  box-shadow: 0 0 2px black;
  background-color: rgba(0, 0, 0, 0.4);
  color: #e2f2ff;
}
.chart-unit-name {
  text-align: left;
  text-wrap: nowrap;
  line-height: 1.2rem;
  font-size: 1.2rem;
  font-weight: bold;
  width: min-content;
  transition: all 0.2s ease;
  height: 1.2rem;
  max-width: 50vw;
}
.chart-unit-cid {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
}
.chart-unit-composer {
  text-align: left;
}
.chart-unit-id {
  text-align: right;
  opacity: 0.7;
  flex-grow: 1;
  padding-right: 10px;
}
</style>
