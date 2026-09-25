<script lang="ts" setup>
/**
 * 快捷键设置（对应 sv 的 shortcut-modal.vue）。
 * 布局是 <table>，每条由 shortcut-modal-single 渲染成可点击改键的一行。
 * */
import { onUnmounted } from 'vue'
import SimpleModal from '@components/modals/simple-modal.vue'
import ShortcutModalSingle from '@components/modals/shortcut-modal-single.vue'
import ShortcutModalHeader from '@components/modals/shortcut-modal-header.vue'
import { ShortCuts } from '@core/misc/shortcut.ts'
import { Storage } from '@core/storage.ts'

// 关掉快捷键面板时再存一次，避免用户改完立刻退出而没写盘
onUnmounted(() => Storage.save())
</script>

<template>
  <SimpleModal size="1" title="快捷键设置">
    <div style="text-align: center">点击右侧的键位以输入</div>
    <table class="sc-table">
      <tbody>
        <shortcut-modal-header msg="切换物件" />
        <shortcut-modal-single :short="ShortCuts.$fun('tool-note')" msg="note" />
        <shortcut-modal-single :short="ShortCuts.$fun('tool-hold')" msg="hold" />
        <shortcut-modal-single :short="ShortCuts.$fun('tool-hazard')" msg="hazard" />
        <shortcut-modal-single :short="ShortCuts.$fun('tool-chip')" msg="chip" />
        <shortcut-modal-single :short="ShortCuts.$fun('tool-flick')" msg="flick" />
        <shortcut-modal-single :short="ShortCuts.$fun('select')" msg="取消选择" />

        <shortcut-modal-header msg="note 细分" />
        <shortcut-modal-single :short="ShortCuts.$fun('n-ex')" msg="ex" />
        <shortcut-modal-single :short="ShortCuts.$fun('n-critical')" msg="critical" />
        <shortcut-modal-single :short="ShortCuts.$fun('n-wide')" msg="wide" />
        <shortcut-modal-single :short="ShortCuts.$fun('flick-left')" msg="左滑" />
        <shortcut-modal-single :short="ShortCuts.$fun('flick-right')" msg="右滑" />

        <shortcut-modal-header msg="CTRL家族" />
        <shortcut-modal-single :short="ShortCuts.$fun('undo')" msg="撤销" />
        <shortcut-modal-single :short="ShortCuts.$fun('redo')" msg="重做" />
        <shortcut-modal-single :short="ShortCuts.$fun('copy')" msg="复制" />
        <shortcut-modal-single :short="ShortCuts.$fun('cut')" msg="剪切" />
        <shortcut-modal-single :short="ShortCuts.$fun('paste')" msg="粘贴" />
        <shortcut-modal-single :short="ShortCuts.$fun('save')" msg="保存" />
        <shortcut-modal-single :short="ShortCuts.$fun('delete')" msg="删除" />

        <shortcut-modal-header msg="其它" />
        <shortcut-modal-single :short="ShortCuts.$fun('pause')" msg="播放/暂停" />
        <shortcut-modal-single :short="ShortCuts.$fun('settings')" msg="设置" />
        <shortcut-modal-single :short="ShortCuts.$fun('iexport')" msg="导入/导出" />
      </tbody>
    </table>
  </SimpleModal>
</template>

<style scoped>
.sc-table {
  width: 100%;
  text-align: center;
  margin-top: 15px;
}
</style>
