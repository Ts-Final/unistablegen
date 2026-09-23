import {Axios} from 'axios'
import type {ipc, IpcCall} from "@type/ipc.ts"

export const api = new Axios()
export const Invoke: IpcCall<ipc> = async (channel, args) => {
  const r = await api.post(`/api/${channel}`, args )
  return r.data
}