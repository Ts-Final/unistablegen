import type { Component } from 'vue'
import { closeAllModals, openModal } from '@kolirt/vue-modal'
import MissingSkinModal from '@components/modals/missing-skin-modal.vue'
import ShowInformation from '@components/modals/show-information.vue'
import AskIdModal from '@components/modals/ask-id-modal.vue'
import SettingsModal from '@components/modals/settings-modal.vue'
import ShortcutModal from '@components/modals/shortcut-modal.vue'
import VersionsModal from '@components/modals/versions-modal.vue'
import CreditsModal from '@components/modals/credits-modal.vue'
import IExporterModal from '@components/modals/iexporter-modal.vue'

/**
 * modal 管理器 —— 用法与 sv 的 `modal.XxxModal.show({ ... })` 一致。
 *
 * 用的是 @kolirt/vue-modal v1（和 sv 同一个大版本）：
 * v1 没有 group/ModalRoot/ModalContent 那一套，弹窗组件自己就是内容，
 * 库负责把它塞进自带的 `.vue-modal` 层里并做进出场。
 * */
export class modal<T extends Component> {
  static MissingSkinModal = new modal(MissingSkinModal)
  static ShowInformationModal = new modal(ShowInformation)
  static AskIdModal = new modal(AskIdModal)
  static SettingModal = new modal(SettingsModal)
  static ShortcutModal = new modal(ShortcutModal)
  static VersionsModal = new modal(VersionsModal)
  static CreditsModal = new modal(CreditsModal)
  static IExporterModal = new modal(IExporterModal)

  component: T
  props: Record<string, unknown> | undefined
  /** 为 true 时把「用户点了 no」的 reject 吞掉（对应 sv 的 should_catch） */
  should_catch: boolean
  opened: boolean

  constructor(component: T, should_catch = true) {
    this.component = component
    this.props = undefined
    this.should_catch = should_catch
    this.opened = false
  }

  static close_all() {
    closeAllModals(true)
  }

  show(props: Record<string, unknown> = {}): Promise<unknown> {
    if (this.opened) return Promise.reject('opened')
    this.props = Object.assign({}, props)
    this.opened = true
    if (this.should_catch) {
      return openModal(this.component as Component, this.props as never)
        .catch(() => {})
        .finally(() => {
          this.opened = false
        })
    }
    return openModal(this.component as Component, this.props as never).finally(() => {
      this.opened = false
    })
  }
}
