import express, {NextFunction, Request, Response} from "express"
import { Server } from "http";
import path from "node:path";
import fs from "node:fs";
import {initAliveWS} from "./alive.js"
import api_router from "./api/api.js"
import {chart_manager} from "./chart-manager.js"
import {read_port} from "./conf.js"
import {file_paths, IS_DEV, IS_PACKAGED} from "./file_path.js"
import {open_browser, should_open_browser} from "./open-browser.js"
import {crash, install_crash_handlers} from "./crash.js"

// 一进来就挂上兜底：后面任何地方崩了都不会让控制台窗口秒退
install_crash_handlers()

/**
 * 真实环境变量里的 PORT。
 * 在 load_env() 之前抓，这样「shell 里显式设置的 PORT」和「.env 里写的」能区分开：
 * 前者是临时覆盖（优先），后者不参与端口判定（端口以设置里的为准）。
 * */
const PORT_FROM_ENV = process.env.PORT ? Number(process.env.PORT) : null

/**
 * 极简 .env 读取（用来替代 dotenv 依赖）。
 *
 * 打包成 exe 之后多一个第三方依赖就多一个「快照里找不到包」的风险，
 * 而我们只用到「把 KEY=VALUE 塞进 process.env」这一点功能，自己写十行就够了。
 * 已经存在的环境变量优先，不会被 .env 覆盖。
 * */
function load_env(): void {
  const files = IS_PACKAGED
    ? [path.join(path.dirname(process.execPath), ".env")]
    : [path.join(process.cwd(), ".env")]
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue
      for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(line)
        if (!m) continue
        const key = m[1]
        let val = m[2]
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (process.env[key] === undefined) process.env[key] = val
      }
      console.log(`⚙️  已读取 ${file}`);
    } catch (e) {
      console.warn(`[env] 读取 ${file} 失败：`, e);
    }
  }
}

load_env()

const app = express();

// 谱面可能很大，放宽 body 限制
app.use(express.json({ limit: "64mb" }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next(); // 必须调用 next()，否则请求会卡在这里
});

/* 所有 /api 接口（ipc 风格 + 谱面数据 + 皮肤贴图）都在 api/api.ts 里 */
app.use("/api", api_router);

/**
 * 前端页面：打包后就是 exe 同目录下的 page/（index.html + assets/）。
 * 开发时一般没有这个目录，走 vite dev server，这里的静态服务会被跳过。
 */
const PAGE_INDEX = path.join(file_paths.page, "index.html");
const HAS_PAGE = fs.existsSync(PAGE_INDEX);

if (HAS_PAGE) {
  app.use(express.static(file_paths.page));
  // 没有匹配到静态文件的 GET 一律回 index.html（只认 /api 之外的路由）
  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(PAGE_INDEX);
  });
  console.log(`📄 前端页面目录：${file_paths.page}`);
} else {
  console.warn(`⚠️  没有找到前端页面（${PAGE_INDEX}）——如果是打包运行，请把 page/ 放在 exe 旁边。`);
}

/**
 * Root endpoint returning a welcome message.
 * 只有在没有前端页面时才有意义（打包后 / 会被 page/index.html 接管）。
 */
app.get("/", (_request: Request, response: Response): void => {
  response.json({ message: "Welcome to your Express + TypeScript API!" });
});

/** 端口被占用时的重试间隔(ms) */
const RETRY_MS = 2000

/**
 * 起始端口（优先级从高到低）：
 * 1. shell 里显式设置的 PORT（临时覆盖用）
 * 2. 设置里的 port（charts/config.json → settings.port）
 * 3. 3000
 * */
function resolve_port(): number {
  if (PORT_FROM_ENV && Number.isInteger(PORT_FROM_ENV)) return PORT_FROM_ENV
  return read_port() ?? 3000
}

/** 上一次的起始端口：用它判断用户有没有去设置里改端口 */
let last_base = resolve_port()

/** 正在跑的 server；还没起来时是 null（退出信号要用） */
let server: Server | null = null

/**
 * 监听端口。
 *
 * 端口被占用时**不退出**：**换一个端口（+1）接着试**，每 RETRY_MS 一次，
 * 一直试到成功为止；期间提示可以把它固定在设置里。
 * 如果用户在这期间改了设置里的端口，下一次重试就直接跳到那个端口。
 * */
function start_server(port: number, attempt = 1) {
  const s = app.listen(port)

  s.once("listening", () => {
    server = s
    console.log(`🚀 Server running at http://localhost:${port}`);
    const base = resolve_port()
    if (port !== base) {
      console.log(`ℹ️  起始端口 ${base} 被占用，现在跑在 ${port}；想固定下来就改设置里的「端口」。`);
    }
    // 第一次启动时自动生成 charts/charts.json 索引
    try {
      const list = chart_manager.ensure_index();
    } catch (e) {
      console.error("索引炸了。谢谢。", e);
    }
    // keep-alive：没有前端连着就自己退出。开发模式下关掉（断线不再退进程）。
    initAliveWS(s, !IS_DEV)
    // 打包成 exe 时自己把页面用浏览器打开（开发模式下跳过）
    if (should_open_browser()) {
      open_browser(`http://localhost:${port}/`);
    }
  })

  s.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE") return void crash("server-error", error)

    const base = resolve_port()
    const changed = base !== last_base
    last_base = base
    // 正常情况下往后挪一个端口；用户改了设置就跳回新的起始端口
    const next = changed ? base : port >= 65535 ? base : port + 1

    if (attempt === 1) {
      console.warn("");
      console.warn(`⚠️  端口 ${port} 被占用：换成 ${next} 继续试（每 ${RETRY_MS / 1000} 秒一次，不会退出）。`);
      console.warn(`   想固定端口：改 charts/config.json 里的 settings.port，或启动后在设置面板改「端口」。`);
    } else {
      console.warn(`⚠️  端口 ${port} 被占用（第 ${attempt} 次），换 ${next} 再试……`);
    }
    if (changed) console.warn(`   检测到起始端口改成了 ${base}，跳回它。`);

    setTimeout(() => start_server(next, attempt + 1), RETRY_MS);
  })
}

if (IS_DEV) console.log("🛠  开发模式：keep-alive 已关闭（进程不会自己退出）")
start_server(resolve_port())

/**
 * Gracefully shuts down the server when receiving termination signals.
 * @param {string} signal - The termination signal received
 */
function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  if (!server) {
    // 还在等端口，直接退
    process.exit(0);
  }
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
