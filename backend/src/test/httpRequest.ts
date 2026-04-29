import http from "http";
import type { Express } from "express";
import type { AddressInfo } from "net";

/** POST JSON to an Express app without supertest (zero extra deps). */
export function postJson(
  app: Express,
  path: string,
  jsonBody: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      try {
        const addr = server.address() as AddressInfo;
        const payload = JSON.stringify(jsonBody);
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port: addr.port,
            path,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
              const raw = Buffer.concat(chunks).toString("utf8");
              let parsed: unknown = null;
              try {
                parsed = raw ? JSON.parse(raw) : null;
              } catch {
                parsed = raw;
              }
              server.close(() => resolve({ status: res.statusCode ?? 0, body: parsed }));
            });
          },
        );
        req.on("error", (e) => {
          server.close(() => reject(e));
        });
        req.write(payload);
        req.end();
      } catch (e) {
        server.close(() => reject(e));
      }
    });
  });
}
