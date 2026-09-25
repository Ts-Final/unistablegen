import { Invoke } from '@core/ipc-handler.ts'
import type { External } from '@type/external.ts'

/**
 * 启动页的 tips（对应 sv 的 core/misc/startup-tips.ts）。
 * 除了下面这些，还会从 external/startup-tips.json 读一份追加进来。
 * */
export const StartUpTips: External.StartUpTips = [
  "大肥鱼正在偷吃你的token。其实每次打开应用我会偷走你的1.79e308 token用于我们的进一步开发，感谢你的支持（何意味？）",
  "这是第二条tips。我不知道写什么了，依旧广告位招租。",
  "呃呃，大coding时代我们还要手写代码吗老大",
  "ai写噗的时代马上就要到来了。但是你的创造力不会被取代的！"
]

/**
 * 读取 external/startup-tips.json 并追加到 tips 里（对应 sv 的 load_external_tips）。
 * 文件不存在就静默跳过。
 */
export async function load_external_tips() {
  let r: string | null = null
  try {
    r = await Invoke('read-external', { fname: 'startup-tips.json' })
  } catch (e) {
    console.warn('Read External: startup-tips failed', e)
    return
  }
  if (!r) {
    console.log('Read External: startup-tips failed')
    return
  }
  try {
    const parsed = JSON.parse(r) as unknown
    if (Array.isArray(parsed)) {
      StartUpTips.push(...parsed.filter((x): x is string => typeof x === 'string'))
    }
    console.log('Read External: startup-tips')
  } catch (e) {
    console.warn('Read External: startup-tips 解析失败', e)
  }
}
