import axios from 'axios'
import type {ipc, IpcCall} from "@type/ipc.ts"

export const Invoke: IpcCall<ipc> = async (channel, args) => {
  const r = await axios.post(`/api/${channel}`, args )
  return r.data
}

