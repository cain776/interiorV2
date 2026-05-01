import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import {
  createVendor,
  deleteVendor,
  getVendorById,
  listVendors,
  updateVendor,
} from "../repos/vendors.repo.js";

const vendorBodyProps = {
  name: { type: "string", minLength: 1, maxLength: 200 },
  ceo: { type: ["string", "null"], maxLength: 100 },
  phone: { type: ["string", "null"], maxLength: 50 },
  email: { type: ["string", "null"], maxLength: 200 },
  specialty: { type: ["string", "null"], maxLength: 200 },
  rating: { type: ["integer", "null"], minimum: 0, maximum: 5 },
  memo: { type: ["string", "null"], maxLength: 5000 },
} as const;

const createVendorSchema = {
  body: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: vendorBodyProps,
  },
} as const;

const updateVendorSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: vendorBodyProps,
  },
} as const;

interface VendorBody {
  name?: string;
  ceo?: string | null;
  phone?: string | null;
  email?: string | null;
  specialty?: string | null;
  rating?: number | null;
  memo?: string | null;
}

export default async function vendorsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/vendors", async (req) => {
    const data = await listVendors(userId(req));
    return { ok: true, data };
  });

  app.post<{ Body: VendorBody }>(
    "/api/vendors",
    { schema: createVendorSchema },
    async (req) => {
      const body = req.body;
      const vendor = await createVendor(userId(req), {
        name: body.name!.trim(),
        ceo: body.ceo ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        specialty: body.specialty ?? null,
        rating: body.rating ?? null,
        memo: body.memo ?? null,
      });
      return { ok: true, data: vendor };
    },
  );

  app.patch<{ Params: { id: string }; Body: VendorBody }>(
    "/api/vendors/:id",
    { schema: updateVendorSchema },
    async (req, reply) => {
      const existing = await getVendorById(req.params.id, userId(req));
      if (!existing) {
        return reply.code(404).send({ ok: false, error: "업체를 찾을 수 없습니다." });
      }
      const updated = await updateVendor(req.params.id, userId(req), req.body);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "업체를 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/vendors/:id", async (req, reply) => {
    const ok = await deleteVendor(req.params.id, userId(req));
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "업체를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "vendor", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
