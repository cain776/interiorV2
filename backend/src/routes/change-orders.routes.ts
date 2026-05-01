import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { projectExistsForOwner } from "../lib/access.js";
import { getContractProjectId } from "../repos/contracts.repo.js";
import {
  createChangeOrder,
  deleteChangeOrder,
  getChangeOrderProjectId,
  listChangeOrdersByProject,
  updateChangeOrder,
} from "../repos/change-orders.repo.js";
import type { ChangeOrderReason, ChangeOrderStatus } from "../types/domain.js";
import { REASON_CHANGE_ORDER, STATUS_CHANGE_ORDER, nullableIsoDateTime } from "../lib/schema.js";

const changeOrderCreateBody = {
  type: "object",
  required: ["title"],
  additionalProperties: false,
  properties: {
    contractId: { type: ["string", "null"] },
    reason: { type: "string", enum: REASON_CHANGE_ORDER },
    status: { type: "string", enum: STATUS_CHANGE_ORDER },
    title: { type: "string", minLength: 1, maxLength: 200 },
    amountDelta: { type: "number" },
    approvedAt: nullableIsoDateTime,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

const changeOrderPatchBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    contractId: { type: ["string", "null"] },
    reason: { type: "string", enum: REASON_CHANGE_ORDER },
    status: { type: "string", enum: STATUS_CHANGE_ORDER },
    title: { type: "string", minLength: 1, maxLength: 200 },
    amountDelta: { type: "number" },
    approvedAt: nullableIsoDateTime,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

interface ChangeOrderBody {
  contractId?: string | null;
  reason?: ChangeOrderReason;
  status?: ChangeOrderStatus;
  title?: string;
  amountDelta?: number;
  approvedAt?: string | null;
  memo?: string | null;
}

async function ensureChangeOrderAccess(
  id: string,
  ownerId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; status: number; message: string }> {
  const projectId = await getChangeOrderProjectId(id);
  if (!projectId) return { ok: false, status: 404, message: "변경오더를 찾을 수 없습니다." };
  if (!(await projectExistsForOwner(projectId, ownerId))) {
    return { ok: false, status: 404, message: "변경오더를 찾을 수 없습니다." };
  }
  return { ok: true, projectId };
}

async function validateContract(projectId: string, contractId?: string | null) {
  if (!contractId) return null;
  const contractProjectId = await getContractProjectId(contractId);
  return contractProjectId === projectId ? null : "계약이 프로젝트에 속하지 않습니다.";
}

export default async function changeOrdersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/change-orders",
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const data = await listChangeOrdersByProject(req.params.projectId);
      return { ok: true, data };
    },
  );

  app.post<{ Params: { projectId: string }; Body: ChangeOrderBody }>(
    "/api/projects/:projectId/change-orders",
    { schema: { body: changeOrderCreateBody } },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const body = req.body;
      const contractError = await validateContract(req.params.projectId, body.contractId);
      if (contractError) {
        return reply.code(400).send({ ok: false, error: contractError });
      }
      const order = await createChangeOrder(req.params.projectId, {
        ...body,
        title: body.title!.trim(),
        amountDelta: Math.round(body.amountDelta ?? 0),
      });
      return { ok: true, data: order };
    },
  );

  app.patch<{ Params: { id: string }; Body: ChangeOrderBody }>(
    "/api/change-orders/:id",
    { schema: { body: changeOrderPatchBody } },
    async (req, reply) => {
      const access = await ensureChangeOrderAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const contractError = await validateContract(access.projectId, req.body.contractId);
      if (contractError) {
        return reply.code(400).send({ ok: false, error: contractError });
      }
      const patch = { ...req.body };
      if (patch.title) patch.title = patch.title.trim();
      if (patch.amountDelta !== undefined) patch.amountDelta = Math.round(patch.amountDelta);
      const updated = await updateChangeOrder(req.params.id, patch);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "변경오더를 찾을 수 없습니다." });
      }
      // 승인/거부는 비용에 직결. 모든 status 변경 + amount_delta 변경 추적.
      if (patch.status || patch.amountDelta !== undefined) {
        await audit(req, "change_order.update", "changeOrder", req.params.id, {
          status: patch.status,
          amountDelta: patch.amountDelta,
        });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/change-orders/:id", async (req, reply) => {
    const access = await ensureChangeOrderAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deleteChangeOrder(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "변경오더를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "changeOrder", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
