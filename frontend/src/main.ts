import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import {CheckAlive} from "@core/check-alive.ts"
import { createModal } from '@kolirt/vue-modal'
import { ShortCuts } from '@core/misc/shortcut.ts'

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

document.title = "unistablegen"

CheckAlive.start()

// 全局快捷键（空格播放/暂停、Ctrl+Z/Y、Q/W/E/R/T 选物件……）
ShortCuts.handle()
