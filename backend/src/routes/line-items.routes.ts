import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { ensureChildAccess, getLineItemProjectId } from "../lib/access.js";
import { getPhaseProjectId } from "../repos/phases.repo.js";
import {
  createLineItem,
  deleteLineItem,
  reorderLineItems,
  updateLineItem,
} from "../repos/line-items.repo.js";
import { orderedIdsBody } from "../lib/schema.js";

const lineItemBodyProps = {
  phaseId: { type: "string", minLength: 1 },
  label: { type: "string", minLength: 1, maxLength: 200 },
  spaceId: { type: ["string", "null"] },
  locationLabel: { type: ["string", "null"], maxLength: 100 },
  workItemLabel: { type: ["string", "null"], maxLength: 100 },
  memo: { type: ["string", "null"], maxLength: 5000 },
  selectedQuoteId: { type: ["string", "null"] },
} as const;

const createLineItemSchema = {
  body: {
    type: "object",
    required: ["label"],
    additionalProperties: false,
    properties: lineItemBodyProps,
  },
} as const;

const updateLineItemSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: lineItemBodyProps,
  },
} as const;

const reorderSchema = { body: orderedIdsBody } as const;

interface LineItemBody {
  phaseId?: string;
  label?: string;
  spaceId?: string | null;
  locationLabel?: string | null;
  workItemLabel?: string | null;
  memo?: string | null;
  selectedQuoteId?: string | null;
}

interface ReorderBody {
  orderedIds: string[];
}

const lineItemAccess = (id: string, ownerId: string) =>
  ensureChildAccess(getLineItemProjectId, id, ownerId, "항목을 찾을 수 없습니다.");
const phaseAccess = (id: string, ownerId: string) =>
  ensureChildAccess(getPhaseProjectId, id, ownerId, "공정을 찾을 수 없습니다.");

function cleanOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanLineItemBody(body: LineItemBody): LineItemBody {
  const cleaned: LineItemBody = {};
  if ("phaseId" in body) cleaned.phaseId = body.phaseId;
  if ("label" in body) cleaned.label = body.label?.trim();
  if ("spaceId" in body) cleaned.spaceId = body.spaceId ?? null;
  if ("locationLabel" in body) cleaned.locationLabel = cleanOptional(body.locationLabel);
  if ("workItemLabel" in body) cleaned.workItemLabel = cleanOptional(body.workItemLabel);
  if ("memo" in body) cleaned.memo = cleanOptional(body.memo);
  if ("selectedQuoteId" in body) cleaned.selectedQuoteId = body.selectedQuoteId ?? null;
  return cleaned;
}

export default async function lineItemsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post<{ Params: { phaseId: string }; Body: LineItemBody }>(
    "/api/phases/:phaseId/line-items",
    { schema: createLineItemSchema },
    async (req, reply) => {
      const access = await phaseAccess(req.params.phaseId, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const body = cleanLineItemBody(req.body);
      const lineItem = await createLineItem(req.params.phaseId, {
        label: body.label!,
        spaceId: body.spaceId ?? null,
        locationLabel: body.locationLabel ?? null,
        workItemLabel: body.workItemLabel ?? null,
        memo: body.memo ?? null,
      });
      return { ok: true, data: lineItem };
    },
  );

  app.patch<{ Params: { phaseId: string }; Body: ReorderBody }>(
    "/api/phases/:phaseId/line-items/reorder",
    { schema: reorderSchema },
    async (req, reply) => {
      const access = await phaseAccess(req.params.phaseId, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const lineItems = await reorderLineItems(req.params.phaseId, req.body.orderedIds);
      if (!lineItems) {
        return reply.code(404).send({ ok: false, error: "항목을 찾을 수 없습니다." });
      }
      return { ok: true, data: lineItems };
    },
  );

  app.patch<{ Params: { id: string }; Body: LineItemBody }>(
    "/api/line-items/:id",
    { schema: updateLineItemSchema },
    async (req, reply) => {
      const access = await lineItemAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const body = cleanLineItemBody(req.body);
      if (body.phaseId) {
        const targetPhase = await phaseAccess(body.phaseId, userId(req));
        if (!targetPhase.ok) {
          return reply.code(targetPhase.status).send({ ok: false, error: targetPhase.message });
        }
        if (targetPhase.projectId !== access.projectId) {
          return reply.code(400).send({ ok: false, error: "같은 프로젝트의 공정으로만 이동할 수 있습니다." });
        }
      }
      const updated = await updateLineItem(req.params.id, body);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "항목을 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/line-items/:id", async (req, reply) => {
    const access = await lineItemAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deleteLineItem(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "항목을 찾을 수 없습니다." });
    }
    await audit(req, "delete", "lineItem", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
