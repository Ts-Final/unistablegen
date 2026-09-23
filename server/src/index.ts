import "dotenv/config";
import express, {NextFunction, Request, Response} from "express"
import { Server } from "http";
import {initAliveWS} from "./alive.js"

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next(); // 必须调用 next()，否则请求会卡在这里
});

/**
 * Health check endpoint for monitoring and load balancer probes.
 * @param {Request} _request - Express request object (unused)
 * @param {Response} response - Express response object
 * @returns {void}
 */
app.post("/api/alive", (_request: Request, response: Response): void => {
  response.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Root endpoint returning a welcome message.
 * @param {Request} _request - Express request object (unused)
 * @param {Response} response - Express response object
 * @returns {void}
 */
app.get("/", (_request: Request, response: Response): void => {
  response.json({ message: "Welcome to your Express + TypeScript API!" });
});

const server: Server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use. Try a different port with PORT=<number> npm run dev`);
    process.exit(1);
  }
  throw error;
});

initAliveWS(server)

/**
 * Gracefully shuts down the server when receiving termination signals.
 * @param {string} signal - The termination signal received
 */
function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down gracefully...`);
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
