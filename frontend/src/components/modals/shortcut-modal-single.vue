<script lang="ts" setup>
/**
 * 单条快捷键（对应 sv 的 shortcut-modal-single.vue）。
 * 点右边的键位按钮，然后按下想要的新键即可改键。
 * */
import { onUnmounted, ref, watch } from 'vue'
import { ShortCuts, type SC_save } from '@core/misc/shortcut.ts'
import { Storage } from '@core/storage.ts'

const { short, msg } = defineProps<{
  msg: string
  short: ShortCuts
}>()

const data = ref<SC_save>({ ...short.data })
const parsed = ref(short.parse())

watch(data, (v) => {
  short.set_data(v)
  parsed.value = short.parse()
  Storage.save()
})

const is_listen = ref(false)

/** 开始监听下一个按键：期间全局快捷键暂停响应 */
function listen_keyboard() {
  if (is_listen.value) return
  is_listen.value = true
  ShortCuts.on_listening.value = true
  document.addEventListener(
    'keyup',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      data.value = {
        key: e.key.toLowerCase(),
        alt: e.altKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        name: data.value.name
      }
      is_listen.value = false
      ShortCuts.on_listening.value = false
    },
    { once: true }
  )
}

// 万一还没按键就把 modal 关了，也要把监听状态放掉，否则所有快捷键都不响应了
onUnmounted(() => {
  is_listen.value = false
  ShortCuts.on_listening.value = false
})
</script>

<template>
  <tr class="shortcut-single-line">
    <td style="width: 40%; text-align: right">{{ msg }}</td>
    <td style="width: 10%"></td>
    <td v-if="is_listen" class="shortcut-single-btn">请输入快捷键</td>
    <td v-else class="shortcut-single-btn" @click="listen_keyboard">{{ parsed }}</td>
    <td></td>
  </tr>
</template>

<style scoped>
td {
  user-select: none;
}
.shortcut-single-btn {
  cursor: pointer;
  user-select: none;
  background-color: #00000066;
  width: 8rem;
  text-align: center;
}
</style>
