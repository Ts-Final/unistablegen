import {ref} from "vue"

export const clock = {
  now: ref(Date.now()),
  // start counting time
  start() {
    const x = this.now
    
    function update() {
      x.value = Date.now()
      requestAnimationFrame(update)
    }
    
    requestAnimationFrame(update)
  }
}