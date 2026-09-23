export interface ipc {
  "write-file": {
    args: {
      id: string
      fname: string
      data: string
    },
    r: void
  }
  "import-song": {
    args: {}
    r: void
  }
  "all-charts": {
    args: {}
    r: {
      name: string
      time: number
      composer: string
      id: string
    }[]
  }
  "get-chart": {
    args: {
      id: string
    }
    r: string
  }
  "alive": {
    args: {
      h?: any
    }
    r: string
  }
  "get-tips": {
    args: {}
    r: string[]
  }
}


type _IpcArgs<T, K extends keyof T> =
  T[K] extends { args: infer A } ? A : never

type _IpcResult<T, K extends keyof T> =
  T[K] extends { r: infer R } ? R : never

// 核心工具类型：调用签名
export type IpcCall<T> = <K extends keyof T>(
  channel: K,
  args: _IpcArgs<T, K>
) => Promise<_IpcResult<T, K>>