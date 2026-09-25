<script lang="ts" setup>
/**
 * 设置 modal。
 * 结构、排版与 .ds 说明文字都沿用 sv 的 settings-modal.vue，
 * 内容换成 uni 实际拥有的设置项。
 * */
import { defineComponent, h, onUnmounted } from 'vue'
import SimpleModal from '@components/modals/simple-modal.vue'
import SettingHeader from '@components/modals/setting-header.vue'
import ANumberInput from '@components/a-elements/a-number-input.vue'
import ATextInput from '@components/a-elements/a-text-input.vue'
import ACheckbox2 from '@components/a-elements/a-checkbox2.vue'
import AColorInput from '@components/a-elements/a-color-input.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import { Storage } from '@core/storage.ts'
import { EventHub } from '@core/misc/eventhub.ts'
import { modal } from '@core/misc/modal.ts'
import { Invoke } from '@core/ipc-handler.ts'
import { Chart } from '@core/chart/chart.ts'

const r = Storage._ref

function open_charts() {
  Invoke('open-charts-folder', {}).catch(() => {})
}
function open_skin() {
  Invoke('open-skin-folder', {}).catch(() => {})
}

/** 选一个浏览器可执行文件填进设置里 */
async function pick_browser() {
  const fp = await Invoke('ask-file', { file: ['浏览器程序', 'exe'] }).catch(() => null)
  if (fp) r.value.settings.browser_path = fp
}

/** sv 里的 ds：跨两列的小字说明 */
const ds = defineComponent({
  name: 'ds',
  setup(_, { slots }) {
    return () => h('div', { class: 'ds' }, slots.default?.())
  }
})

// 关掉设置后立刻存一次（sv 只有 10 秒的定时保存，这里顺手补上），并让画布按新设置重画
onUnmounted(() => {
  Storage.save()
  EventHub.dispatch('scale-changed')
  Chart.current?.diff.force_fuck()
})
</script>

<template>
  <SimpleModal size="2" title="设置">
    <div class="settings-wrapper">
      <div class="contain">
        <div style="width: 100%; text-align: center; grid-column: span 2">
          编辑数字可以使用键盘上下和滚轮哦。
        </div>

        <setting-header msg="！？你好？！" />
        <div>设定一个名字吧！</div>
        <a-text-input v-model="r.username" />
        <ds>会帮你自动填到谱师栏</ds>

        <setting-header msg="启动" />
        <div>端口</div>
        <a-number-input v-model="r.settings.port" class="in" min="1" max="65535" step="1" />
        <ds>
          server 监听的端口。如果启动没问题就不要调。
        </ds>
        <div>浏览器路径</div>
        <div class="browser-row">
          <a-text-input v-model.trim="r.settings.browser_path" placeholder="留空 = 系统默认" />
          <a-button2 msg="选择" @click="pick_browser()" />
        </div>
        <ds>
          启动时 server 用它打开页面；留空就用系统默认浏览器（Edge？我要开始大声嘲笑了）
        </ds>

        <setting-header msg="界面与显示" />
        <ds>轨道分为外面一圈和中间的轨道板。</ds>
        <div>外框色</div>
        <a-color-input v-model="r.settings.background_color" />
        <div>轨道板色</div>
        <a-color-input v-model="r.settings.track_color" />
        <ds>轨道板颜色，</ds>
        <div>判定线颜色</div>
        <a-color-input v-model="r.settings.judge_line_color" />
        <div>判定线宽度 (px)</div>
        <a-number-input v-model="r.settings.judge_line_width" class="in" min="0" />
        <ds>横贯整个画布的判定线，0 表示不画。</ds>
        <div>底部条颜色</div>
        <a-color-input v-model="r.settings.bottom_bar_color" />
        <div>底部条透明度</div>
        <a-number-input v-model="r.settings.bottom_bar_alpha" class="in" min="0" max="100" step="1" />
        <ds>最下面先铺背景色，再叠上这一层。纯挡note这一块</ds>
        <div>最高流速</div>
        <a-number-input v-model="r.settings.max_scale" class="in" min="1" />
        <div>最高分度</div>
        <a-number-input v-model="r.settings.max_meter" class="in" min="1" />
        <div>右侧分音</div>
        <a-checkbox2 v-model="r.settings.show_ticks" />
        <div>底部显示BPM</div>
        <a-checkbox2 v-model="r.settings.show_bpm_bottom" />

        <setting-header msg="轨道" />
        <div>轨道宽度 (px)</div>
        <a-number-input v-model="r.settings.track_width" class="in" max="1920" min="200" step="10" />
        <ds>轨道的宽度。你不会以为这个还会变吧？</ds>
        <div>note宽度 (px)</div>
        <a-number-input v-model="r.settings.note_width" class="in" min="10" />
        <ds>note 贴图在轨道上的绘制宽度。（不过我真不知道他有多大，所以留设置给你们自己条吧）</ds>
        <div>note高度 (px)</div>
        <a-number-input v-model="r.settings.note_height" class="in" min="1" />
        <ds>note的高度（纵向），chip 的边长。</ds>
        <div>flick高度 (px)</div>
        <a-number-input v-model="r.settings.flick_height" class="in" min="1" />
        <ds>flick 的绘制高度，宽度按贴图比例走。</ds>
        <div>判定线偏移 (px)</div>
        <a-number-input v-model="r.settings.judge_offset" class="in" min="0" />
        <ds>判定线距离画布底部的距离。</ds>
        <div>谱面偏移 (ms)</div>
        <a-number-input v-model="r.settings.offset" class="in" step="1" />
        <ds>正值表示谱面整体延后。</ds>

        <setting-header msg="hazard / hold" />
        <div>hazard颜色</div>
        <a-color-input v-model="r.settings.hazard_color" />
        <div>hazard透明度</div>
        <a-number-input v-model="r.settings.hazard_alpha" class="in" max="100" min="0" step="1" />
        <div>hold线宽 (px)</div>
        <a-number-input v-model="r.settings.hold_line_width" class="in" min="0" />
        <ds>hold 中间那条按 ease 走的黑色连线。</ds>

        <setting-header msg="编辑功能" />
        <div>note时间容差</div>
        <a-number-input v-model="r.settings.nearest" />
        <ds>摆放物件时会吸附到当前分音；该值用于判定同一个时间点。</ds>
        <div>Beat容差</div>
        <a-number-input v-model="r.settings.beat_tolerance" />
        <ds>计算 beat 时，在每个 bpm 结束前多少 ms 不认为有 beat。</ds>
        <div>小节号或拍号</div>
        <a-checkbox2 v-model="r.settings.bar_or_section" />
        <div>Beat从0开始</div>
        <a-checkbox2 v-model="r.settings.bar_from_0" />
        <div class="rainbow-text-flow" style="font-size: 2rem; font-weight: bold">自动保存</div>
        <a-checkbox2 v-model="r.settings.auto_save" />
        <ds>没想到吧我又来了</ds>

        <setting-header msg="Note分组" />
        <ds>
          按一段时间（最小触发间隔为 interval）把 [current - 时间范围, current + 可见长度 +
          时间范围] 内的物件加载到渲染缓存里。
        </ds>
        <div>时间范围</div>
        <a-number-input v-model="r.settings.pooling.ahead" class="in" />
        <div>最小pooling间隔</div>
        <a-number-input v-model="r.settings.pooling.interval" min="16" />
        <ds v-if="r.settings.pooling.interval >= r.settings.pooling.ahead" class="warn">
          pooling间隔不应该大于时间范围设置。
        </ds>

        <setting-header msg="小节线" />
        <div>小节线颜色 1</div>
        <a-color-input v-model="r.settings.sprites.bar_color1" />
        <div>小节线颜色 4</div>
        <a-color-input v-model="r.settings.sprites.bar_color2" />
        <div>小节线颜色 8</div>
        <a-color-input v-model="r.settings.sprites.bar_color3" />
        <div>小节线颜色 16</div>
        <a-color-input v-model="r.settings.sprites.bar_color4" />
        <div>小节线宽度</div>
        <a-number-input v-model="r.settings.sprites.bar_length" min="0" />
        <div>小节线偏移</div>
        <a-number-input
          v-model="r.settings.sprites.bar_dy"
          @update:model-value="EventHub.dispatch('audio-time-update')"
        />
        <ds>调节小节线的位置。正值为向上移。</ds>
      </div>
    </div>
    <template #footer>
      <a-button2 msg="快捷键" @click="modal.ShortcutModal.show({})" />
      <a-button2 msg="查看Version" @click="modal.VersionsModal.show({})" />
      <a-button2 msg="Credits" @click="modal.CreditsModal.show({})" />
      <a-button2 msg="打开charts文件夹" @click="open_charts()" />
      <a-button2 msg="打开skin文件夹" @click="open_skin()" />
    </template>
  </SimpleModal>
</template>

<style scoped>
.settings-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-height: 60vh;
  min-width: 0;
  overflow: hidden;
}

.contain {
  flex: 1;
  width: 100%;
  min-width: 0;
  display: grid;
  /* minmax(0, ...) 让两列都能被压缩，否则长内容会撑出横向滚动条 */
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: 5px 10px;
  overflow-y: auto;
  overflow-x: hidden;
  text-align: center;
  align-items: center;
}
.contain > div:not(.settings-header),
span,
s {
  text-align: left;
  padding-left: 15px;
  min-width: 0;
}
.ds {
  grid-column: span 2;
  opacity: 0.8;
  padding-top: 0;
  margin-bottom: 10px;
  text-indent: 2rem;
  min-width: 0;
  white-space: normal;
  word-break: break-word;
}

input {
  max-width: 60%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}
input[type='text'] {
  padding: 2px 0;
}
input[type='number'] {
  max-width: 30%;
  padding: 2px 0;
}

input:focus {
  border-bottom: transparent 1px solid !important;
}
:deep(.a-color-input) {
  justify-items: flex-start;
  width: min-content;
  gap: 0 20px;
  max-width: 100%;
}
input[type='checkbox'] {
  width: min-content;
}

.in ::-webkit-inner-spin-button,
.in ::-webkit-outer-spin-button {
  appearance: none;
}
/* 浏览器路径：输入框 + 选择按钮并排 */
.browser-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.browser-row > input {
  flex: 1;
  min-width: 0;
  max-width: none;
}
.warn::before {
  content: '⚠';
  color: gold;
}
</style>
