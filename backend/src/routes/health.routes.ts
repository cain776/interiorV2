import type { FastifyInstance } from "fastify";

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    return { ok: true, data: { status: "up", time: new Date().toISOString() } };
  });
}
