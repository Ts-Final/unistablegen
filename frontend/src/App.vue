<script setup lang="ts">
/**
 * uni 的入口（对应 sv 的 App.vue）。
 * 只负责按 GlobalStat.route 切换页面，具体逻辑都在各个页面里。
 * */
import { onMounted } from 'vue'
import { ModalTarget } from '@kolirt/vue-modal'
import ChartV2 from '@components/chart-v2/chart-v2.vue'
import StartUp from '@components/start-up/start-up.vue'
import PreInitPage from '@components/miscellaneous/pre-init-page.vue'
import LoadSongPage from '@components/miscellaneous/load-song-page.vue'
import { GlobalStat } from '@core/globalStat.ts'
import { Storage } from '@core/storage.ts'
import { modal } from '@core/misc/modal.ts'
import { ShortCuts } from '@core/misc/shortcut.ts'
import { Preinit } from '@core/misc/preinit.ts'
import { load_external_tips } from '@core/misc/startup-tips.ts'
import { Skin } from '@core/misc/skin.ts'
import { open_chart_safe } from '@core/misc/open-chart.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { Update } from '@core/update.ts'

const state = GlobalStat.route.route

function open_charts_folder() {
  Invoke('open-charts-folder', {}).catch(() => {})
}

/** 启动流程：先读设置，其余阶段跑完再进曲目选择页 */
async function boot() {
  // 设置存在 server 端的 charts/config.json（对应 sv 的 set_from_storage）
  await Preinit.run('load_settings', async () => {
    await Storage.set_from_storage()
    ShortCuts.fromJson(Storage.data.value.shortcut)
    Storage.init_interval()
  })

  const list_ok = await Preinit.run('all_chart', async () => {
    await GlobalStat.update_all_chart()
  })
  if (!list_ok) {
    modal.ShowInformationModal.show({
      msg:
        `<b>无法读取谱面列表</b><br><br>请确认 server 已经启动（默认 http://localhost:3000），<br>` +
        `并且前端是通过 <code>pnpm dev</code> 访问的。`,
      buttons: [{ msg: '打开charts文件夹', action: open_charts_folder }]
    })
  }

  // 缺图会弹 modal，不算阶段失败
  await Preinit.run('load_skin', async () => {
    await Skin.check_skin()
  })

  await Preinit.run('load_tips', async () => {
    await load_external_tips()
  })

  /*
   * 打包成 exe 后浏览器是 server 打开的：如果设置里指定的浏览器用不了，
   * server 会退回系统默认浏览器并把原因放在 browser-status 里，这里弹提示。
   * （开发模式下 server 不开浏览器，这里自然什么都不会弹。）
   * */
  await Preinit.run('open_browser', async () => {
    const r = await Invoke('browser-status', {})
    if (!r?.notice) return
    modal.ShowInformationModal.show({
      msg: `<b>浏览器</b><br><br>${r.notice}`
    })
  })

  // ?id= 就直接打开
  const wanted = new URLSearchParams(location.search).get('id')
  const target = wanted ? GlobalStat.all_chart.find((c) => c.id === wanted) : undefined
  if (target) {
    await open_chart_safe(target.id, target.name)
    return
  }

  GlobalStat.route.change('start')
}

/**
 * 启动之后悄悄检查一次更新。
 * 有更新才弹 new-version-modal；没更新、检查失败、开发模式都不打扰用户
 * （Update.check(true) 那三种情况都返回 null）。
 * 不放进上面的启动流程里，免得一次网络请求把启动拖慢。
 * */
async function check_update_silently() {
  const info = await Update.check(true)
  if (info) modal.NewVersionModal.show({ info })
}

onMounted(async () => {
  await boot()
  void check_update_silently()
})
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
