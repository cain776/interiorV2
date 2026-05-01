import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { ensureChildAccess, projectExistsForOwner } from "../lib/access.js";
import {
  createPhase,
  deletePhase,
  getPhaseProjectId,
  reorderPhases,
  updatePhase,
} from "../repos/phases.repo.js";
import type { Consideration, PhaseStatus } from "../types/domain.js";
import { STATUS_PHASE, nullableIsoDate, orderedIdsBody } from "../lib/schema.js";

const considerationSchema = {
  type: "object",
  required: ["id", "label", "source", "checked"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1, maxLength: 200 },
    source: { type: "string", enum: ["template", "custom"] },
    checked: { type: "boolean" },
    note: { type: ["string", "null"], maxLength: 2000 },
    spaceId: { type: ["string", "null"], maxLength: 100 },
    lineItemId: { type: ["string", "null"], maxLength: 100 },
    priority: { type: "string", enum: ["normal", "important", "critical"] },
  },
} as const;

const phaseBodyProps = {
  name: { type: "string", minLength: 1, maxLength: 100 },
  templateKey: { type: ["string", "null"], maxLength: 100 },
  scheduledStart: nullableIsoDate,
  scheduledEnd: nullableIsoDate,
  status: { type: "string", enum: STATUS_PHASE },
  considerations: { type: "array", items: considerationSchema },
} as const;

const createPhaseSchema = {
  body: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: phaseBodyProps,
  },
} as const;

const updatePhaseSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: phaseBodyProps,
  },
} as const;

const reorderSchema = { body: orderedIdsBody } as const;

interface PhaseBody {
  name?: string;
  templateKey?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  status?: PhaseStatus;
  considerations?: Consideration[];
}

interface ReorderBody {
  orderedIds: string[];
}

const phaseAccess = (id: string, ownerId: string) =>
  ensureChildAccess(getPhaseProjectId, id, ownerId, "공정을 찾을 수 없습니다.");

export default async function phasesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.post<{ Params: { projectId: string }; Body: PhaseBody }>(
    "/api/projects/:projectId/phases",
    { schema: createPhaseSchema },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const body = req.body;
      const phase = await createPhase(req.params.projectId, {
        name: body.name!.trim(),
        templateKey: body.templateKey ?? null,
        scheduledStart: body.scheduledStart ?? null,
        scheduledEnd: body.scheduledEnd ?? null,
        status: body.status,
        considerations: body.considerations,
      });
      return { ok: true, data: phase };
    },
  );

  app.patch<{ Params: { projectId: string }; Body: ReorderBody }>(
    "/api/projects/:projectId/phases/reorder",
    { schema: reorderSchema },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const phases = await reorderPhases(req.params.projectId, req.body.orderedIds);
      if (!phases) {
        return reply.code(400).send({ ok: false, error: "공정 순서가 현재 목록과 일치하지 않습니다." });
      }
      return { ok: true, data: phases };
    },
  );

  app.patch<{ Params: { id: string }; Body: PhaseBody }>(
    "/api/phases/:id",
    { schema: updatePhaseSchema },
    async (req, reply) => {
      const access = await phaseAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const updated = await updatePhase(req.params.id, req.body);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "공정을 찾을 수 없습니다." });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/phases/:id", async (req, reply) => {
    const access = await phaseAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deletePhase(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "공정을 찾을 수 없습니다." });
    }
    await audit(req, "delete", "phase", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
