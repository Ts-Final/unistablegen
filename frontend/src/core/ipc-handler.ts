import axios from 'axios'
import type { ipc, IpcCall } from '@type/ipc.ts'

/**
 * 与 server 通信用的 axios 实例。
 *
 * 注意：必须用 axios.create()，不能用 `new Axios()`。
 * `new Axios()` 不会带上默认的 defaults，于是 transformResponse / validateStatus 都没了：
 * 响应体会原样返回字符串（r.data 变成 string），非 2xx 也不会抛错。
 * */
export const api = axios.create({
  timeout: 120000,
  // 让 4xx/5xx 正常抛出，交给调用方 catch
  validateStatus: (status) => status >= 200 && status < 300
})

export const Invoke: IpcCall<ipc> = async (channel, args) => {
  const r = await api.post(`/api/${channel}`, args)
  return r.data
}
