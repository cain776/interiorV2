import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { getLineItemProjectId, projectExistsForOwner } from "../lib/access.js";
import { getContractProjectId } from "../repos/contracts.repo.js";
import { getPhaseProjectId } from "../repos/phases.repo.js";
import {
  createAsTicket,
  deleteAsTicket,
  getAsTicketProjectId,
  listAsTicketsByProject,
  updateAsTicket,
} from "../repos/as-tickets.repo.js";
import type { AsTicketPriority, AsTicketStatus } from "../types/domain.js";
import {
  PRIORITY_AS_TICKET,
  STATUS_AS_TICKET,
  nullableIsoDate,
} from "../lib/schema.js";

const asTicketCreateBody = {
  type: "object",
  required: ["title"],
  additionalProperties: false,
  properties: {
    contractId: { type: ["string", "null"] },
    phaseId: { type: ["string", "null"] },
    lineItemId: { type: ["string", "null"] },
    status: { type: "string", enum: STATUS_AS_TICKET },
    priority: { type: "string", enum: PRIORITY_AS_TICKET },
    title: { type: "string", minLength: 1, maxLength: 200 },
    content: { type: ["string", "null"], maxLength: 10000 },
    occurredAt: nullableIsoDate,
    resolvedAt: nullableIsoDate,
    warrantyExpiresAt: nullableIsoDate,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

const asTicketPatchBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    contractId: { type: ["string", "null"] },
    phaseId: { type: ["string", "null"] },
    lineItemId: { type: ["string", "null"] },
    status: { type: "string", enum: STATUS_AS_TICKET },
    priority: { type: "string", enum: PRIORITY_AS_TICKET },
    title: { type: "string", minLength: 1, maxLength: 200 },
    content: { type: ["string", "null"], maxLength: 10000 },
    occurredAt: nullableIsoDate,
    resolvedAt: nullableIsoDate,
    warrantyExpiresAt: nullableIsoDate,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

interface AsTicketBody {
  contractId?: string | null;
  phaseId?: string | null;
  lineItemId?: string | null;
  status?: AsTicketStatus;
  priority?: AsTicketPriority;
  title?: string;
  content?: string | null;
  occurredAt?: string | null;
  resolvedAt?: string | null;
  warrantyExpiresAt?: string | null;
  memo?: string | null;
}

async function ensureAsTicketAccess(
  id: string,
  ownerId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; status: number; message: string }> {
  const projectId = await getAsTicketProjectId(id);
  if (!projectId) return { ok: false, status: 404, message: "AS를 찾을 수 없습니다." };
  if (!(await projectExistsForOwner(projectId, ownerId))) {
    return { ok: false, status: 404, message: "AS를 찾을 수 없습니다." };
  }
  return { ok: true, projectId };
}

async function validateRefs(projectId: string, body: AsTicketBody) {
  if (body.contractId && (await getContractProjectId(body.contractId)) !== projectId) {
    return "계약이 프로젝트에 속하지 않습니다.";
  }
  if (body.phaseId && (await getPhaseProjectId(body.phaseId)) !== projectId) {
    return "공정이 프로젝트에 속하지 않습니다.";
  }
  if (body.lineItemId && (await getLineItemProjectId(body.lineItemId)) !== projectId) {
    return "항목이 프로젝트에 속하지 않습니다.";
  }
  return null;
}

export default async function asTicketsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/as-tickets",
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const data = await listAsTicketsByProject(req.params.projectId);
      return { ok: true, data };
    },
  );

  app.post<{ Params: { projectId: string }; Body: AsTicketBody }>(
    "/api/projects/:projectId/as-tickets",
    { schema: { body: asTicketCreateBody } },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const refError = await validateRefs(req.params.projectId, req.body);
      if (refError) {
        return reply.code(400).send({ ok: false, error: refError });
      }
      const ticket = await createAsTicket(req.params.projectId, {
        ...req.body,
        title: req.body.title!.trim(),
      });
      return { ok: true, data: ticket };
    },
  );

  app.patch<{ Params: { id: string }; Body: AsTicketBody }>(
    "/api/as-tickets/:id",
    { schema: { body: asTicketPatchBody } },
    async (req, reply) => {
      const access = await ensureAsTicketAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const refError = await validateRefs(access.projectId, req.body);
      if (refError) {
        return reply.code(400).send({ ok: false, error: refError });
      }
      const patch = { ...req.body };
      if (patch.title) patch.title = patch.title.trim();
      const updated = await updateAsTicket(req.params.id, patch);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "AS를 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/as-tickets/:id", async (req, reply) => {
    const access = await ensureAsTicketAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deleteAsTicket(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "AS를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "asTicket", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
