import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createModal } from '@kolirt/vue-modal'
import { CheckAlive } from '@core/check-alive.ts'
import { GlobalStat } from '@core/globalStat.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { ShortCuts } from '@core/misc/shortcut.ts'
import { modal } from '@core/misc/modal.ts'
import { Preinit } from '@core/misc/preinit.ts'
import { load_external_tips } from '@core/misc/startup-tips.ts'
import { Skin } from '@core/misc/skin.ts'
import { open_chart_safe } from '@core/misc/open-chart.ts'
import { Storage, Version } from '@core/storage.ts'
import { Update } from '@core/update.ts'

const app = createApp(App)

/**
 * modal 的配置完全照搬 sv（@kolirt/vue-modal v1 的插件选项）：
 * v1 自带 CSS（由 JS 注入），slideUp / 200ms / 蒙版 rgba(0,0,0,.3) 都在这里配。
 * */
app.use(
  createModal({
    transitionTime: 200,
    animationType: 'slideUp',
    modalStyle: {
      padding: '2rem 1rem'
    },
    overlayStyle: {
      'background-color': 'rgba(0,0,0,.3)'
    }
  })
)
app.mount('#app')

document.title = 'unistablegen'

CheckAlive.start()

// 全局快捷键（空格播放/暂停、Ctrl+Z/Y、Q/W/E/R/T 选物件……）
ShortCuts.handle()

function open_charts_folder() {
  Invoke('open-charts-folder', {}).catch(() => {})
}

/**
 * 版本变化提示（对应 sv main.ts 里 `set_from_storage()` 返回值的那段判断）。
 *
 * 存档里的版本号就是「上次打开时用的是哪一版」：
 * - 比当前低 → 这次是更新之后第一次打开，弹版本更新日志；
 * - 比当前高 → 用户换回了旧版本，提示一下；
 * - 没有存档（第一次打开）→ set_from_storage 返回 undefined，什么都不弹。
 * 存档里的版本号由 set_from_storage 改写成当前版本，所以同一次更新只会弹一次。
 * */
function version_notice(stored: number | undefined) {
  if (!stored) return
  if (stored < Version.val) {
    modal.VersionsModal.show({})
    return
  }
  if (stored > Version.val) {
    modal.ShowInformationModal.show({
      msg: `已从更新的版本（版本号${stored}）回退至${Version.val}。`
    })
  }
}

/** 启动流程：先读设置，其余阶段跑完再进曲目选择页 */
async function boot() {
  /** 存档里记的版本号，用来判断这次是不是更新后的第一次打开（见 version_notice） */
  let stored_version: number | undefined
  // 设置存在 server 端的 charts/config.json（对应 sv 的 set_from_storage）
  await Preinit.run('load_settings', async () => {
    stored_version = await Storage.set_from_storage()
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

  // 版本变化提示：更新之后第一次打开就把更新日志弹出来（和 sv 一样，放在启动流程的末尾）
  version_notice(stored_version)

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

/**
 * 入口。
 * 页面先挂上去（要显示 preinit 的进度、modal 也需要 <modal-target> 在），
 * 再跑启动流程 —— 顺序和 sv 的 main.ts 一致。
 * */
async function main() {
  await boot()
  void check_update_silently()
}

main()
