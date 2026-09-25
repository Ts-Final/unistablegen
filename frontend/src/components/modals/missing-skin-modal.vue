<script lang="ts" setup>
/**
 * 缺少皮肤贴图的提示（对应 sv 的 check_skin + MissingSkinModal）。
 * 这里只是提示，不会阻止继续使用 —— 缺图时会用白块兜底。
 * */
import SimpleModal from '@components/modals/simple-modal.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import { Invoke } from '@core/ipc-handler.ts'
import { closeModal } from '@kolirt/vue-modal'

const props = withDefaults(
  defineProps<{ missing: string[]; all?: string[]; skin_path?: string }>(),
  { all: () => [], skin_path: 'skin/' }
)

function open_folder() {
  Invoke('open-skin-folder', {}).catch(() => {})
}
</script>

<template>
  <simple-modal size="1" title="where R U?">
    <div class="wrapper">
      <div>下列 skin 贴图未能加载，请检查 skin 中是否有这个贴图。</div>
      <p></p>
      <div class="skin-names">
        <div
          v-for="sk in props.all"
          :key="sk"
          :class="props.missing.includes(sk) ? 'miss' : ''"
          v-html="props.missing.includes(sk) ? `<b>${sk}</b>` : sk"
        />
      </div>
      <p></p>
      <div class="note">
        缺图不影响编辑：渲染时会用白块代替。<br />
        hold 与 note 共用 <code>note</code>，hazard 用纯红色所以不需要贴图。
      </div>
    </div>
    <template #footer>
      <a-button2 msg="打开skin文件夹" @click="open_folder" />
      <a-button2 msg="好的" @click="closeModal()" />
    </template>
  </simple-modal>
</template>

<style scoped>
.wrapper {
  width: 90%;
  text-align: center;
  margin: 0 auto;
}
.skin-names {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  justify-content: center;
}
.miss {
  color: crimson;
}
.note {
  font-size: 0.9rem;
}
</style>
