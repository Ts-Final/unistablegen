import {ref} from "vue"

export const enable3d = {
  enabled: ref(false),
  change() {
    this.enabled.value = !this.enabled.value
  }
}