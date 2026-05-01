import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import {
  getLineItemProjectId,
  getQuoteProjectId,
  projectExistsForOwner,
} from "../lib/access.js";
import { vendorBelongsToOwner } from "../repos/vendors.repo.js";
import { getPhaseProjectId } from "../repos/phases.repo.js";
import { getSpaceProjectId } from "../repos/spaces.repo.js";
import { getContractProjectId } from "../repos/contracts.repo.js";
import { getPaymentProjectId } from "../repos/payments.repo.js";
import { getChangeOrderProjectId } from "../repos/change-orders.repo.js";
import { getAsTicketProjectId } from "../repos/as-tickets.repo.js";
import {
  createAttachment,
  deleteAttachment,
  getAttachmentProjectId,
  listAttachmentsByProject,
  reorderAttachments,
  updateAttachment,
} from "../repos/attachments.repo.js";
import type {
  AttachmentKind,
  AttachmentOwnerType,
  PhotoKind,
} from "../types/domain.js";
import {
  KIND_ATTACHMENT,
  OWNER_TYPE_ATTACHMENT,
  PHOTO_KIND,
  nullableIsoDate,
} from "../lib/schema.js";

// 단일 첨부 최대 크기. base64 data URL 기준이라 실제 파일은 ~3.7MB.
// 크면 DB row + 응답 페이로드가 커져 단일 사용자라도 운영 부담.
const MAX_BLOB_URL_BYTES = 5_000_000;

const attachmentCreateBody = {
  type: "object",
  required: ["ownerType", "ownerId", "filename", "blobUrl"],
  additionalProperties: false,
  properties: {
    ownerType: { type: "string", enum: OWNER_TYPE_ATTACHMENT },
    ownerId: { type: "string", minLength: 1 },
    kind: { type: "string", enum: KIND_ATTACHMENT },
    photoKind: {
      anyOf: [{ type: "null" }, { type: "string", enum: PHOTO_KIND }],
    },
    filename: { type: "string", minLength: 1, maxLength: 500 },
    contentType: { type: ["string", "null"], maxLength: 200 },
    byteSize: { type: ["number", "null"] },
    blobUrl: { type: "string", minLength: 1, maxLength: MAX_BLOB_URL_BYTES },
    blobPathname: { type: ["string", "null"], maxLength: 500 },
    caption: { type: ["string", "null"], maxLength: 1000 },
    takenAt: nullableIsoDate,
    linkUrl: { type: ["string", "null"], maxLength: 1000 },
  },
} as const;

const attachmentPatchBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: KIND_ATTACHMENT },
    photoKind: {
      anyOf: [{ type: "null" }, { type: "string", enum: PHOTO_KIND }],
    },
    filename: { type: "string", minLength: 1, maxLength: 500 },
    contentType: { type: ["string", "null"], maxLength: 200 },
    byteSize: { type: ["number", "null"] },
    blobUrl: { type: "string", minLength: 1, maxLength: MAX_BLOB_URL_BYTES },
    blobPathname: { type: ["string", "null"], maxLength: 500 },
    caption: { type: ["string", "null"], maxLength: 1000 },
    takenAt: nullableIsoDate,
    linkUrl: { type: ["string", "null"], maxLength: 1000 },
  },
} as const;

const attachmentReorderBody = {
  type: "object",
  required: ["orderedIds"],
  additionalProperties: false,
  properties: {
    orderedIds: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

interface AttachmentCreateBody {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  kind?: AttachmentKind;
  photoKind?: PhotoKind | null;
  filename: string;
  contentType?: string | null;
  byteSize?: number | null;
  blobUrl: string;
  blobPathname?: string | null;
  caption?: string | null;
  takenAt?: string | null;
  linkUrl?: string | null;
}

interface AttachmentPatchBody {
  kind?: AttachmentKind;
  photoKind?: PhotoKind | null;
  filename?: string;
  contentType?: string | null;
  byteSize?: number | null;
  blobUrl?: string;
  blobPathname?: string | null;
  caption?: string | null;
  takenAt?: string | null;
  linkUrl?: string | null;
}

interface AttachmentReorderBody {
  orderedIds: string[];
}

function normalizeLinkUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

async function ensureAttachmentAccess(
  id: string,
  ownerId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; status: number; message: string }> {
  const projectId = await getAttachmentProjectId(id);
  if (!projectId) return { ok: false, status: 404, message: "첨부를 찾을 수 없습니다." };
  if (!(await projectExistsForOwner(projectId, ownerId))) {
    return { ok: false, status: 404, message: "첨부를 찾을 수 없습니다." };
  }
  return { ok: true, projectId };
}

async function ownerBelongsToProject(
  projectId: string,
  ownerId: string,
  ownerType: AttachmentOwnerType,
  currentUserId: string,
) {
  if (ownerType === "project") return ownerId === projectId;
  if (ownerType === "vendor") return vendorBelongsToOwner(ownerId, currentUserId);
  if (ownerType === "phase") return (await getPhaseProjectId(ownerId)) === projectId;
  if (ownerType === "space") return (await getSpaceProjectId(ownerId)) === projectId;
  if (ownerType === "lineItem") return (await getLineItemProjectId(ownerId)) === projectId;
  if (ownerType === "quote") return (await getQuoteProjectId(ownerId)) === projectId;
  if (ownerType === "contract") return (await getContractProjectId(ownerId)) === projectId;
  if (ownerType === "payment") return (await getPaymentProjectId(ownerId)) === projectId;
  if (ownerType === "changeOrder") return (await getChangeOrderProjectId(ownerId)) === projectId;
  return (await getAsTicketProjectId(ownerId)) === projectId;
}

export default async function attachmentsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/attachments",
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const data = await listAttachmentsByProject(req.params.projectId);
      return { ok: true, data };
    },
  );

  app.post<{ Params: { projectId: string }; Body: AttachmentCreateBody }>(
    "/api/projects/:projectId/attachments",
    { schema: { body: attachmentCreateBody } },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const ownerOk = await ownerBelongsToProject(
        req.params.projectId,
        req.body.ownerId,
        req.body.ownerType,
        userId(req),
      );
      if (!ownerOk) {
        return reply.code(400).send({ ok: false, error: "잘못된 업체입니다." });
      }
      const attachment = await createAttachment(req.params.projectId, {
        ...req.body,
        filename: req.body.filename.trim(),
        blobUrl: req.body.blobUrl.trim(),
        linkUrl: normalizeLinkUrl(req.body.linkUrl),
        uploadedById: userId(req),
      });
      return { ok: true, data: attachment };
    },
  );

  app.patch<{ Params: { id: string }; Body: AttachmentPatchBody }>(
    "/api/attachments/:id",
    { schema: { body: attachmentPatchBody } },
    async (req, reply) => {
      const access = await ensureAttachmentAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const patch = { ...req.body };
      if (patch.filename) patch.filename = patch.filename.trim();
      if (patch.blobUrl) patch.blobUrl = patch.blobUrl.trim();
      if ("linkUrl" in patch) patch.linkUrl = normalizeLinkUrl(patch.linkUrl);
      const updated = await updateAttachment(req.params.id, patch);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "첨부를 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.patch<{ Params: { projectId: string }; Body: AttachmentReorderBody }>(
    "/api/projects/:projectId/attachments/reorder",
    { schema: { body: attachmentReorderBody } },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const updated = await reorderAttachments(req.params.projectId, req.body.orderedIds);
      if (!updated) {
        return reply.code(400).send({ ok: false, error: "정렬할 사진을 확인할 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/attachments/:id", async (req, reply) => {
    const access = await ensureAttachmentAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deleteAttachment(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "첨부를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "attachment", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
