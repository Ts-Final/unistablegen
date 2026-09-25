import { Chart } from '@core/chart/chart.ts'
import { GlobalStat } from '@core/globalStat.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { modal } from './modal'

/**
 * 打开一张谱面，出错就退回曲目选择页并弹提示。
 * 单独放一个文件是为了不让 chart.ts 反过来依赖 modal（那会绕成循环）。
 */
export async function open_chart_safe(id: string, name?: string) {
  try {
    await Chart.open_chart(id)
    document.title = `${name ?? id} - unistablegen`
    return true
  } catch (e) {
    GlobalStat.route.change('start')
    const msg = e instanceof Error ? e.message : String(e)
    modal.ShowInformationModal.show({
      msg: `<b>打开谱面失败</b><br>${id}<br><br>${msg}`,
      buttons: [
        {
          msg: '打开charts文件夹',
          action: () => {
            Invoke('open-charts-folder', {}).catch(() => {})
          }
        }
      ]
    })
    return false
  }
}
