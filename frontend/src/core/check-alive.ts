export const CheckAlive = {
  alive: true,
  last_check: Date.now(),
  
  start() {
    const ws = new WebSocket(`ws://${window.location.host}/api`)
    ws.onopen = () => console.log('Connection opened')
  }
}