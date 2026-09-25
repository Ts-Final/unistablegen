<script lang="ts" setup>
/**
 * 「发现新版本」modal。
 *
 * 两种情况（由 server 的 check-update 判定，见 type/update.ts）：
 *
 * 1. 只有前端页面有更新（can_update_frontend）：
 *    用户点确认之后让 **server** 去下载 Release 里的 page.zip 并替换 page/ 文件夹，
 *    换完 server 通过 websocket 推一条消息，页面自己刷新（check-alive.ts 处理）。
 *
 * 2. 服务端（exe）也有更新：
 *    不给「只更新前端」的按钮 —— 新前端可能要用到新 exe 才有的 api，
 *    只换 page/ 会直接报错。这里只提供一个跳到 GitHub 的按钮，不强求更新。
 * */
import { computed, ref } from 'vue'
import { closeModal } from '@kolirt/vue-modal'
import SimpleModal from '@components/modals/simple-modal.vue'
import AButton2 from '@components/a-elements/a-button2.vue'
import { Update } from '@core/update.ts'
import type { IUpdateCheck, IUpdateResult } from '@type/update.ts'

const props = defineProps<{ info: IUpdateCheck }>()

const installing = ref(false)
const done = ref<IUpdateResult | null>(null)
const error = ref('')

const has_backend = computed(() => props.info.has_backend_update)
/** 能就地更新前端：有前端更新、没有后端更新、而且还没更新过 */
const can_install = computed(() => props.info.can_update_frontend && !done.value)
const latest = computed(() => props.info.latest)

/** 前端版本字面上有没有变化（高亮用） */
const fe_new = computed(() => !!latest.value && latest.value.frontend !== props.info.current.frontend)
const sv_new = computed(() => !!latest.value && latest.value.server !== props.info.current.server)

async function install() {
  if (installing.value) return
  installing.value = true
  error.value = ''
  try {
    const r = await Update.install()
    if (r.ok) done.value = r
    else error.value = r.reason ?? '更新失败'
  } finally {
    installing.value = false
  }
}

function open_release() {
  if (props.info.release_url) window.open(props.info.release_url, '_blank')
}
</script>

<template>
  <SimpleModal size="2" title="发现新版本">
    <div class="update-body">
      <div class="ver-table">
        <div></div>
        <div>当前</div>
        <div>最新</div>

        <div>前端页面</div>
        <div>{{ info.current.frontend }}</div>
        <div :class="{ new: fe_new }">{{ latest?.frontend ?? '—' }}</div>

        <div>服务端</div>
        <div>{{ info.current.server }}</div>
        <div :class="{ new: sv_new }">{{ latest?.server ?? '—' }}</div>
      </div>

      <p v-if="has_backend" class="warn">
        这个版本同时更新了<b>服务端</b>。只换前端页面会因为后端缺少新接口而出错，
        所以这里不提供「只更新前端」——请下载新的 <code>unistablegen.exe</code> 替换掉旧的。
      </p>
      <p v-else-if="can_install" class="tip">
        只有前端页面有更新，可以直接在这里更新。更新完页面会自动刷新。
      </p>

      <p v-if="installing" class="tip">正在下载并替换 page/ ……请不要关闭这个窗口。</p>
      <p v-else-if="done" class="tip">
        <template v-if="done.restart_required">
          前端已更新到 {{ done.version }}。这次启动时没找到旧的 page/ 目录，请关闭并重新打开
          unistablegen 让新页面生效。
        </template>
        <template v-else>前端已更新到 {{ done.version }}，稍后会自动刷新页面。</template>
      </p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <template #footer>
      <a-button2
        v-if="can_install"
        :disabled="installing"
        :msg="installing ? '更新中…' : '更新前端页面'"
        @click="install"
      />
      <a-button2 v-if="has_backend" msg="前往 GitHub 下载" @click="open_release" />
      <a-button2 msg="稍后" @click="closeModal()" />
    </template>
  </SimpleModal>
</template>

<style scoped>
.update-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ver-table {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.25rem 0.5rem;
  text-align: center;
  user-select: none;
}
.ver-table > div {
  padding: 0.15rem 0.3rem;
}
.ver-table > div:nth-child(3n + 2),
.ver-table > div:nth-child(3n) {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 3px;
}
/* 第一行是表头 */
.ver-table > div:nth-child(-n + 3) {
  font-weight: bold;
  background: transparent;
}
.ver-table .new {
  font-weight: bold;
  color: #b6ffce;
}

p {
  margin: 0;
  line-height: 1.5;
  text-align: left;
}
.tip {
  color: #d7e9ff;
}
.warn {
  color: #ffd8a0;
}
.error {
  color: #ff9b9b;
  user-select: text;
  word-break: break-word;
}
code {
  user-select: text;
}
</style>
