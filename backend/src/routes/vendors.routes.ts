import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import {
  removeVendorPhoto,
  saveVendorPhotoDataUrl,
} from "../lib/vendor-photo.js";
import {
  createVendor,
  deleteVendor,
  getVendorById,
  listVendors,
  reorderVendors,
  updateVendor,
} from "../repos/vendors.repo.js";
import { orderedIdsBody } from "../lib/schema.js";

const vendorBodyProps = {
  name: { type: "string", minLength: 1, maxLength: 200 },
  ceo: { type: ["string", "null"], maxLength: 100 },
  phone: { type: ["string", "null"], maxLength: 50 },
  officeAddress: { type: ["string", "null"], maxLength: 500 },
  companyPhone: { type: ["string", "null"], maxLength: 50 },
  mobilePhone: { type: ["string", "null"], maxLength: 50 },
  photoDataUrl: {
    type: ["string", "null"],
    maxLength: 3_000_000,
    pattern: "^data:image/(png|jpeg|webp|gif);base64,",
  },
  email: { type: ["string", "null"], maxLength: 200 },
  specialty: { type: ["string", "null"], maxLength: 200 },
  rating: { type: ["integer", "null"], minimum: 0, maximum: 5 },
  isActive: { type: "boolean" },
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

const reorderSchema = { body: orderedIdsBody } as const;

interface VendorBody {
  name?: string;
  ceo?: string | null;
  phone?: string | null;
  officeAddress?: string | null;
  companyPhone?: string | null;
  mobilePhone?: string | null;
  photoDataUrl?: string | null;
  email?: string | null;
  specialty?: string | null;
  rating?: number | null;
  isActive?: boolean;
  memo?: string | null;
}

type VendorPatch = Omit<VendorBody, "photoDataUrl"> & {
  photoUrl?: string | null;
};

interface ReorderBody {
  orderedIds: string[];
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
      let vendor = await createVendor(userId(req), {
        name: body.name!.trim(),
        ceo: body.ceo ?? null,
        phone: body.phone ?? null,
        officeAddress: body.officeAddress ?? null,
        companyPhone: body.companyPhone ?? null,
        mobilePhone: body.mobilePhone ?? null,
        email: body.email ?? null,
        specialty: body.specialty ?? null,
        rating: body.rating ?? null,
        isActive: body.isActive ?? true,
        memo: body.memo ?? null,
      });
      if (body.photoDataUrl) {
        const photoUrl = await saveVendorPhotoDataUrl(vendor.id, body.photoDataUrl, null);
        vendor = (await updateVendor(vendor.id, userId(req), { photoUrl })) ?? vendor;
      }
      return { ok: true, data: vendor };
    },
  );

  app.patch<{ Body: ReorderBody }>(
    "/api/vendors/reorder",
    { schema: reorderSchema },
    async (req, reply) => {
      const vendors = await reorderVendors(userId(req), req.body.orderedIds);
      if (!vendors) {
        return reply.code(400).send({ ok: false, error: "업체 순서가 현재 목록과 일치하지 않습니다." });
      }
      return { ok: true, data: vendors };
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
      const patchInput = { ...req.body };
      delete patchInput.photoDataUrl;
      const patch: VendorPatch = patchInput;
      if (req.body.photoDataUrl === null) {
        await removeVendorPhoto(existing.photoUrl);
        patch.photoUrl = null;
      } else if (req.body.photoDataUrl) {
        patch.photoUrl = await saveVendorPhotoDataUrl(req.params.id, req.body.photoDataUrl, existing.photoUrl);
      }
      const updated = await updateVendor(req.params.id, userId(req), patch);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "업체를 찾을 수 없습니다." });
      }
      if (patch.photoUrl && existing.photoUrl && existing.photoUrl !== patch.photoUrl) {
        await removeVendorPhoto(existing.photoUrl);
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/vendors/:id", async (req, reply) => {
    const existing = await getVendorById(req.params.id, userId(req));
    if (!existing) {
      return reply.code(404).send({ ok: false, error: "업체를 찾을 수 없습니다." });
    }
    const ok = await deleteVendor(req.params.id, userId(req));
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "업체를 찾을 수 없습니다." });
    }
    await removeVendorPhoto(existing.photoUrl);
    await audit(req, "delete", "vendor", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
