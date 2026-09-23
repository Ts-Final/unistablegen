import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import {CheckAlive} from "@core/check-alive.ts"

createApp(App).mount('#app')

document.title = "unistablegen"

CheckAlive.start()