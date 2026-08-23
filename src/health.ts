import { createServer, type Server } from "node:http";
import type { Logger } from "./logging.js";

export function startHealthServer(port: number, logger: Logger): Server {
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      logger.info("health.check");
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  server.listen(port, () => logger.info("health.started", { port }));
  return server;
}