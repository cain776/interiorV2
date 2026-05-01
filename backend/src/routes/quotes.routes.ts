import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { projectExistsForOwner } from "../lib/access.js";
import { getPhaseProjectId } from "../repos/phases.repo.js";
import { getLineItemById, getLineItemPhaseId } from "../repos/line-items.repo.js";
import { vendorBelongsToOwner } from "../repos/vendors.repo.js";
import {
  createQuote,
  deleteQuote,
  getQuoteLineItemId,
  selectQuote,
  updateQuote,
} from "../repos/quotes.repo.js";
import type { QuoteMode, QuoteStatus } from "../types/domain.js";
import { MODE_QUOTE, STATUS_QUOTE } from "../lib/schema.js";

const quoteCreateBody = {
  type: "object",
  required: ["vendorId", "mode", "price"],
  additionalProperties: false,
  properties: {
    vendorId: { type: "string", minLength: 1 },
    mode: { type: "string", enum: MODE_QUOTE },
    price: { type: "number" },
    status: { type: "string", enum: STATUS_QUOTE },
    meta: { type: "object", additionalProperties: true },
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

const quotePatchBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    vendorId: { type: "string", minLength: 1 },
    mode: { type: "string", enum: MODE_QUOTE },
    price: { type: "number" },
    status: { type: "string", enum: STATUS_QUOTE },
    meta: { type: "object", additionalProperties: true },
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

interface QuoteCreateBody {
  vendorId: string;
  mode: QuoteMode;
  price: number;
  status?: QuoteStatus;
  meta?: Record<string, unknown>;
  memo?: string | null;
}

interface QuotePatchBody {
  vendorId?: string;
  mode?: QuoteMode;
  price?: number;
  status?: QuoteStatus;
  meta?: Record<string, unknown>;
  memo?: string | null;
}

async function ensureLineItemAccess(
  lineItemId: string,
  ownerId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const phaseId = await getLineItemPhaseId(lineItemId);
  if (!phaseId) return { ok: false, status: 404, message: "항목을 찾을 수 없습니다." };
  const projectId = await getPhaseProjectId(phaseId);
  if (!projectId) return { ok: false, status: 404, message: "항목을 찾을 수 없습니다." };
  if (!(await projectExistsForOwner(projectId, ownerId))) {
    return { ok: false, status: 404, message: "항목을 찾을 수 없습니다." };
  }
  return { ok: true };
}

async function ensureQuoteAccess(
  quoteId: string,
  ownerId: string,
): Promise<{ ok: true; lineItemId: string } | { ok: false; status: number; message: string }> {
  const lineItemId = await getQuoteLineItemId(quoteId);
  if (!lineItemId) return { ok: false, status: 404, message: "견적을 찾을 수 없습니다." };
  const access = await ensureLineItemAccess(lineItemId, ownerId);
  if (!access.ok) return access;
  return { ok: true, lineItemId };
}

export default async function quotesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post<{ Params: { lineItemId: string }; Body: QuoteCreateBody }>(
    "/api/line-items/:lineItemId/quotes",
    { schema: { body: quoteCreateBody } },
    async (req, reply) => {
      const access = await ensureLineItemAccess(req.params.lineItemId, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const vendorOk = await vendorBelongsToOwner(req.body.vendorId, userId(req));
      if (!vendorOk) {
        return reply.code(400).send({
          ok: false,
          error: "잘못된 업체입니다.",
          fieldErrors: { vendorId: "업체를 찾을 수 없음" },
        });
      }
      const quote = await createQuote(req.params.lineItemId, {
        vendorId: req.body.vendorId,
        mode: req.body.mode,
        price: Math.round(req.body.price),
        status: req.body.status,
        meta: req.body.meta,
        memo: req.body.memo ?? null,
      });
      return { ok: true, data: quote };
    },
  );

  app.patch<{ Params: { id: string }; Body: QuotePatchBody }>(
    "/api/quotes/:id",
    { schema: { body: quotePatchBody } },
    async (req, reply) => {
      const access = await ensureQuoteAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      if (req.body.vendorId) {
        const vendorOk = await vendorBelongsToOwner(req.body.vendorId, userId(req));
        if (!vendorOk) {
          return reply.code(400).send({ ok: false, error: "잘못된 업체입니다." });
        }
      }
      const patch = { ...req.body };
      if (patch.price !== undefined) patch.price = Math.round(patch.price);
      const updated = await updateQuote(req.params.id, patch);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "견적을 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/quotes/:id", async (req, reply) => {
    const access = await ensureQuoteAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    // selected_quote_id 가 이 견적이면 자동으로 NULL 로 떨어짐 (FK ON DELETE SET NULL)
    const ok = await deleteQuote(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "견적을 찾을 수 없습니다." });
    }
    await audit(req, "delete", "quote", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });

  app.post<{ Params: { id: string } }>("/api/quotes/:id/select", async (req, reply) => {
    const access = await ensureQuoteAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const result = await selectQuote(req.params.id);
    if (!result) {
      return reply.code(404).send({ ok: false, error: "견적을 찾을 수 없습니다." });
    }
    const li = await getLineItemById(result.lineItemId);
    if (!li) {
      return reply.code(404).send({ ok: false, error: "견적을 찾을 수 없습니다." });
    }
    // 채택은 금액·법적 효력 가지는 변경 — 누가/언제 했는지 추적.
    await audit(req, "quote.select", "quote", req.params.id, { lineItemId: result.lineItemId });
    return { ok: true, data: li };
  });
}
