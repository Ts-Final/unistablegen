/**
 * 把错误打到后端 CLI 上（打包成 exe 之后就是那个控制台窗口）。
 *
 * 为什么需要它：Node 的 fetch 失败时只会给一个 `TypeError: fetch failed`，
 * 真正的原因（ENOTFOUND / ECONNREFUSED / 证书过期……）藏在 `error.cause` 里，
 * 而 `console.error(e)` / `e.message` 都看不到 cause —— CLI 上就只剩一句
 * 没头没脑的 "fetch failed"，排查网络问题基本没法用。
 *
 * 所以这里的 log_error() 会把 cause 链（连错误上的 code / errno / hostname
 * 这些字段）一起打出来；short_error() 则是给前端提示用的一句话版本。
 * */

/** error 上跟网络/系统调用有关的字段（不同错因出现的字段不一样，有哪个打哪个） */
const FIELDS = ["code", "errno", "syscall", "hostname", "host", "address", "port", "path"] as const

/** 把单个错误描述成一行：`Error: connect ECONNREFUSED 127.0.0.1:1 (code=..., port=1)` */
function describe_one(e: unknown): string {
  if (e instanceof Error) {
    const extra: string[] = []
    for (const f of FIELDS) {
      const v = (e as unknown as Record<string, unknown>)[f]
      if (v === undefined || v === null || typeof v === "object") continue
      extra.push(`${f}=${String(v)}`)
    }
    return `${e.name}: ${e.message}${extra.length ? ` (${extra.join(", ")})` : ""}`
  }
  if (typeof e === "string") return e
  try {
    return JSON.stringify(e) ?? String(e)
  } catch {
    return String(e)
  }
}

/**
 * 错误 + 它的 cause 链拼成多行文本。
 * AggregateError（fetch 同时试多个地址时会出现）会把 errors 里的都列出来。
 *
 * @param depth 递归层数（只用来缩进，外部不用传）
 * @param with_stack 是否连 stack 一起写（crash.log 要，CLI 上一般不需要）
 */
export function format_error(e: unknown, depth = 0, with_stack = false): string {
  const pad = "  ".repeat(depth)
  const lines = [`${pad}${describe_one(e)}`]

  if (e instanceof AggregateError) {
    for (const sub of e.errors) lines.push(format_error(sub, depth + 1, with_stack))
  }
  if (with_stack && e instanceof Error && e.stack) {
    lines.push(
      ...e.stack
        .split("\n")
        .slice(1)
        .map((l) => `${pad}  ${l.trim()}`)
    )
  }

  const cause = (e as { cause?: unknown } | null)?.cause
  if (cause !== undefined && cause !== null && cause !== e) {
    lines.push(`${pad}  ↳ cause:`)
    lines.push(format_error(cause, depth + 1, with_stack))
  }
  return lines.join("\n")
}

/**
 * 在 CLI 上打一条错误（带 cause 链）。
 * @param tag 出错的模块，比如 update / check-update
 * @param context 额外信息（url、步骤之类），会打在同一行
 */
export function log_error(tag: string, e: unknown, context?: Record<string, unknown>): void {
  const ctx = context
    ? " " +
      Object.entries(context)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ")
    : ""
  console.error(`❌ [${tag}]${ctx}`)
  // 有 cause 链时错因已经写清楚了（这类错误通常是网络/系统调用，stack 全是 undici 自己内部），
  // 只有孤零零一个错误时才把 stack 也带上，方便定位自己代码里的问题
  const with_stack = e instanceof Error && !!e.stack && !(e as { cause?: unknown }).cause
  console.error(format_error(e, 0, with_stack))
}

/**
 * 给用户看的一行短错误。
 * `fetch failed` 这种本身没信息，就取 cause 的 message。
 */
export function short_error(e: unknown): string {
  const cause = (e as { cause?: unknown } | null)?.cause
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === "string" && cause) return cause
  if (e instanceof Error && e.message) return e.message
  return String(e)
}
