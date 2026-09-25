<script setup lang="ts">
/**
 * 音符/物件选择面板（沿用 sv fn-note 的样式）。
 *
 * 第一行是物件类型：note / hold / hazard / chip / flick；
 * 第二行**固定**显示细分项：ex / critical / wide / 左滑 / 右滑
 * （sv 里细分是跟着类型变的，这里按 uni 的用法铺成固定一行）。
 * 再点一次第一行里已选中的类型就会取消选择 —— 此时在画布上拖动就是框选。
 *
 * 下面那块是当前选中类型对应的贴图预览（对应 sv 的 .note-pending），
 * hazard 没有贴图所以用文字，区域高度固定，切换类型时面板不会跳。
 * */
import { computed, ref, watch } from 'vue'
import type { ISkinName } from '@type/ipc.ts'
import {
  NoteType,
  TOOLS,
  pick_flick,
  pick_tool,
  pick_variant,
  type NoteVariant
} from '@core/misc/note-type.ts'
import { NoteClipboard } from '@core/misc/note-clipboard.ts'
import { chart_api } from '@core/chart/chart-api.ts'
import { flick_skin } from '@core/chart/drawer.ts'
import { utils } from '@core/utils.ts'

const selected = NoteClipboard.selected

/** 第二行里 note 的三个细分（normal 由第一行的 note 负责） */
const variants: { key: NoteVariant; label: string }[] = [
  { key: 'ex', label: 'ex' },
  { key: 'critical', label: 'critical' },
  { key: 'wide', label: 'wide' }
]

const flick_dirs: { dir: 0 | 1; label: string }[] = [
  { dir: 0, label: '左滑' },
  { dir: 1, label: '右滑' }
]

/** 当前选中类型要显示哪张贴图；hazard 用文字 */
const preview = computed<{ name: ISkinName } | { text: string } | null>(() => {
  const tool = NoteType.tool
  if (!tool) return null
  if (tool === 'hazard') return { text: 'hazard' }
  if (tool === 'chip') return { name: 'chip' }
  if (tool === 'flick') return { name: flick_skin(NoteType.flick_dir) }
  // hold 的头和普通 note 共用 note 贴图
  if (tool === 'hold') return { name: 'note' }
  const v = NoteType.note_variant
  if (v === 'ex') return { name: 'exnote' }
  if (v === 'critical') return { name: 'critical' }
  return { name: 'note' }
})

const preview_src = computed(() => {
  const p = preview.value
  return p && 'name' in p ? chart_api.skin_url(p.name) : ''
})

/** 换贴图 / 换类型时重新给 <img> 一次机会 */
const img_err = ref(false)
watch(preview_src, () => (img_err.value = false))

function selected_range() {
  if (!selected.value.length) return ''
  const times = selected.value.map((s) => s.obj.time)
  return `${utils.toTimeStr(Math.min(...times) / 1000)} ~ ${utils.toTimeStr(Math.max(...times) / 1000)}`
}
</script>

<template>
  <div class="notes">
    <div class="note-width">
      <span>类型</span>
      <div
        v-for="t in TOOLS"
        :key="t.key"
        :class="NoteType.tool === t.key ? 'chosen' : ''"
        class="note-width-btn"
        @click="pick_tool(t.key)"
      >
        {{ t.label }}
      </div>
    </div>

    <!-- 固定显示的一行：note 的细分 + flick 的方向 -->
    <div class="note-snb">
      <span>细分</span>
      <div
        v-for="v in variants"
        :key="v.key"
        :class="NoteType.tool === 'note' && NoteType.note_variant === v.key ? 'chosen' : ''"
        class="note-snb-btn"
        @click="pick_variant(v.key)"
      >
        {{ v.label }}
      </div>
      <div
        v-for="d in flick_dirs"
        :key="d.dir"
        :class="NoteType.tool === 'flick' && NoteType.flick_dir === d.dir ? 'chosen' : ''"
        class="note-snb-btn"
        @click="pick_flick(d.dir)"
      >
        {{ d.label }}
      </div>
    </div>

    <!-- 对应贴图（高度固定） -->
    <div class="note-preview">
      <img
        v-if="preview_src && !img_err"
        :src="preview_src"
        :alt="preview_src"
        @error="img_err = true"
      />
      <div v-else-if="preview && 'text' in preview" class="note-preview-text">
        {{ preview.text }}
      </div>
      <div v-else-if="preview_src" class="note-preview-text">缺少贴图</div>
      <div v-else class="note-preview-text">__类型</div>
    </div>


    <div class="note-select-wrapper">
      <div v-if="selected.length == 0" class="note-select"/>
      <div v-else>
        <div>已选中 {{ selected.length }}</div>
        <div>{{ selected_range() }}</div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* 结构与取值照 sv 的 fn-note.vue，只按 uni 的控件数量调了栅格列数 */
.notes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
  padding-top: 10px;
}

.note-title {
  text-align: center;
}

.mode {
  color: #2b7fff;
  font-size: 0.8rem;
}

.note-width {
  display: grid;
  /* sv: 2fr repeat(4, 1fr)；uni 有 5 个物件类型 */
  grid-template-columns: 2fr repeat(5, 1fr);
  gap: 5px;
}

.note-width > div,
.note-width > span,
.note-snb > div,
.note-snb > span,
.note-snb > s {
  text-align: center;
  line-height: 1.5rem;
  height: 1.5rem;
}

.note-width > div {
  cursor: pointer;
  transition: background-color 0.2s;
}

.note-width > div:hover,
.chosen {
  background: var(--button-hover);
}

.note-snb {
  display: grid;
  /* 标签 + ex / critical / wide / 左滑 / 右滑 */
  grid-template-columns: 2fr repeat(5, 1fr);
  gap: 5px;
  text-align: center;
}

.note-snb > div {
  cursor: pointer;
  transition: background-color 0.2s;
}

.note-snb > div:hover {
  background: var(--button-hover);
}

.note-tip {
  color: #8996a4;
  font-size: 0.75rem;
  text-align: center;
}

.note-select-wrapper {
  width: 100%;
  text-align: center;
}

.note-select {
  color: gray;
  font-style: italic;
}

/* 贴图预览：高度写死，切换类型时下面的东西不会跟着跳 */
.note-preview {
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.note-preview > img {
  max-width: 90%;
  max-height: 100%;
  object-fit: contain;
}

.note-preview-text {
  color: gray;
  font-style: italic;
}
</style>
