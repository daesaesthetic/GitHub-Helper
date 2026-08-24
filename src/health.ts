import { createServer, type Server } from "node:http";
import type { Logger } from "./logging.js";

export interface CallbackHandler {
  handle(request: URL): Promise<{ status: number; body: string }>;
}

export function startHealthServer(port: number, logger: Logger, callback?: CallbackHandler): Server {
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      logger.info("health.check");
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/github/callback") && callback) {
      try {
        const result = await callback.handle(new URL(request.url, "http://localhost"));
        response.writeHead(result.status, { "content-type": "text/plain; charset=utf-8" });
        response.end(result.body);
      } catch {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("GitHub authorization could not be completed. Return to Discord and try again.");
      }
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  server.listen(port, () => logger.info("health.started", { port }));
  return server;
}