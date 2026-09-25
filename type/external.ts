/**
 * external/ 目录下那些「可以外挂替换」的文件格式。
 *
 * 对应 sv 的 preload/external.d.ts：server 负责读，前端负责用，
 * 所以类型放在 type/ 下两边共用。
 * */
export namespace External {
  /**
   * external/startup-tips.json
   *
   * 启动页随机显示的提示，就是一个字符串数组。
   * 文件不存在或格式不对时按「没有外挂 tips」处理（内置的那些不受影响）。
   * */
  export type StartUpTips = string[]
}
