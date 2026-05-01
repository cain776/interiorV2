import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { projectExistsForOwner } from "../lib/access.js";
import { getContractProjectId } from "../repos/contracts.repo.js";
import {
  createPayment,
  deletePayment,
  getPaymentProjectId,
  listPaymentsByProject,
  updatePayment,
} from "../repos/payments.repo.js";
import type { PaymentKind, PaymentStatus } from "../types/domain.js";
import { KIND_PAYMENT, STATUS_PAYMENT, nullableIsoDate, nullableIsoDateTime } from "../lib/schema.js";

const paymentCreateBody = {
  type: "object",
  required: ["kind", "amount"],
  additionalProperties: false,
  properties: {
    contractId: { type: ["string", "null"] },
    kind: { type: "string", enum: KIND_PAYMENT },
    status: { type: "string", enum: STATUS_PAYMENT },
    amount: { type: "number" },
    dueDate: nullableIsoDate,
    paidAt: nullableIsoDateTime,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

const paymentPatchBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    contractId: { type: ["string", "null"] },
    kind: { type: "string", enum: KIND_PAYMENT },
    status: { type: "string", enum: STATUS_PAYMENT },
    amount: { type: "number" },
    dueDate: nullableIsoDate,
    paidAt: nullableIsoDateTime,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

interface PaymentCreateBody {
  contractId?: string | null;
  kind: PaymentKind;
  status?: PaymentStatus;
  amount: number;
  dueDate?: string | null;
  paidAt?: string | null;
  memo?: string | null;
}

interface PaymentPatchBody {
  contractId?: string | null;
  kind?: PaymentKind;
  status?: PaymentStatus;
  amount?: number;
  dueDate?: string | null;
  paidAt?: string | null;
  memo?: string | null;
}

async function ensurePaymentAccess(
  id: string,
  ownerId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; status: number; message: string }> {
  const projectId = await getPaymentProjectId(id);
  if (!projectId) return { ok: false, status: 404, message: "결제를 찾을 수 없습니다." };
  if (!(await projectExistsForOwner(projectId, ownerId))) {
    return { ok: false, status: 404, message: "결제를 찾을 수 없습니다." };
  }
  return { ok: true, projectId };
}

async function validateContract(projectId: string, contractId?: string | null) {
  if (!contractId) return null;
  const contractProjectId = await getContractProjectId(contractId);
  return contractProjectId === projectId ? null : "계약이 프로젝트에 속하지 않습니다.";
}

export default async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/payments",
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const data = await listPaymentsByProject(req.params.projectId);
      return { ok: true, data };
    },
  );

  app.post<{ Params: { projectId: string }; Body: PaymentCreateBody }>(
    "/api/projects/:projectId/payments",
    { schema: { body: paymentCreateBody } },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const body = req.body;
      const contractError = await validateContract(req.params.projectId, body.contractId);
      if (contractError) {
        return reply.code(400).send({ ok: false, error: contractError });
      }
      const payment = await createPayment(req.params.projectId, {
        ...body,
        amount: Math.round(body.amount),
      });
      return { ok: true, data: payment };
    },
  );

  app.patch<{ Params: { id: string }; Body: PaymentPatchBody }>(
    "/api/payments/:id",
    { schema: { body: paymentPatchBody } },
    async (req, reply) => {
      const access = await ensurePaymentAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const contractError = await validateContract(access.projectId, req.body.contractId);
      if (contractError) {
        return reply.code(400).send({ ok: false, error: contractError });
      }
      const patch = { ...req.body };
      if (patch.amount !== undefined) patch.amount = Math.round(patch.amount);
      const updated = await updatePayment(req.params.id, patch);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "결제를 찾을 수 없습니다." });
      }
      // 결제 상태/금액 변경은 분쟁 시 핵심 증거.
      if (patch.status || patch.amount !== undefined) {
        await audit(req, "payment.update", "payment", req.params.id, {
          status: patch.status,
          amount: patch.amount,
        });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/payments/:id", async (req, reply) => {
    const access = await ensurePaymentAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deletePayment(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "결제를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "payment", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
