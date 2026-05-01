import type { FastifyInstance } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { projectExistsForOwner } from "../lib/access.js";
import { getPhaseProjectId } from "../repos/phases.repo.js";
import { vendorBelongsToOwner } from "../repos/vendors.repo.js";
import {
  createContract,
  deleteContract,
  getContractProjectId,
  listContractsByProject,
  updateContract,
} from "../repos/contracts.repo.js";
import type { ContractStatus, ContractType } from "../types/domain.js";
import { STATUS_CONTRACT, TYPE_CONTRACT, nullableIsoDate } from "../lib/schema.js";

const contractCreateBody = {
  type: "object",
  required: ["title"],
  additionalProperties: false,
  properties: {
    phaseId: { type: ["string", "null"] },
    vendorId: { type: ["string", "null"] },
    parentContractId: { type: ["string", "null"] },
    type: { type: "string", enum: TYPE_CONTRACT },
    status: { type: "string", enum: STATUS_CONTRACT },
    title: { type: "string", minLength: 1, maxLength: 200 },
    amount: { type: "number" },
    scheduledStart: nullableIsoDate,
    scheduledEnd: nullableIsoDate,
    actualStart: nullableIsoDate,
    actualEnd: nullableIsoDate,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

const contractPatchBody = {
  type: "object",
  additionalProperties: false,
  properties: {
    phaseId: { type: ["string", "null"] },
    vendorId: { type: ["string", "null"] },
    parentContractId: { type: ["string", "null"] },
    type: { type: "string", enum: TYPE_CONTRACT },
    status: { type: "string", enum: STATUS_CONTRACT },
    title: { type: "string", minLength: 1, maxLength: 200 },
    amount: { type: "number" },
    scheduledStart: nullableIsoDate,
    scheduledEnd: nullableIsoDate,
    actualStart: nullableIsoDate,
    actualEnd: nullableIsoDate,
    memo: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

interface ContractBody {
  phaseId?: string | null;
  vendorId?: string | null;
  parentContractId?: string | null;
  type?: ContractType;
  status?: ContractStatus;
  title?: string;
  amount?: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  memo?: string | null;
}

async function ensureContractAccess(
  id: string,
  ownerId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; status: number; message: string }> {
  const projectId = await getContractProjectId(id);
  if (!projectId) return { ok: false, status: 404, message: "계약을 찾을 수 없습니다." };
  if (!(await projectExistsForOwner(projectId, ownerId))) {
    return { ok: false, status: 404, message: "계약을 찾을 수 없습니다." };
  }
  return { ok: true, projectId };
}

async function validateContractRefs(
  projectId: string,
  ownerId: string,
  body: ContractBody,
  id?: string,
): Promise<string | null> {
  if (body.phaseId) {
    const phaseProjectId = await getPhaseProjectId(body.phaseId);
    if (phaseProjectId !== projectId) return "공정이 프로젝트에 속하지 않습니다.";
  }
  if (body.vendorId) {
    const vendorOk = await vendorBelongsToOwner(body.vendorId, ownerId);
    if (!vendorOk) return "업체를 찾을 수 없습니다.";
  }
  if (body.parentContractId) {
    if (body.parentContractId === id) return "상위 계약을 자기 자신으로 지정할 수 없습니다.";
    const parentProjectId = await getContractProjectId(body.parentContractId);
    if (parentProjectId !== projectId) return "상위 계약이 프로젝트에 속하지 않습니다.";
  }
  return null;
}

export default async function contractsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/contracts",
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const data = await listContractsByProject(req.params.projectId);
      return { ok: true, data };
    },
  );

  app.post<{ Params: { projectId: string }; Body: ContractBody }>(
    "/api/projects/:projectId/contracts",
    { schema: { body: contractCreateBody } },
    async (req, reply) => {
      if (!(await projectExistsForOwner(req.params.projectId, userId(req)))) {
        return reply.code(404).send({ ok: false, error: "프로젝트를 찾을 수 없습니다." });
      }
      const body = req.body;
      const refError = await validateContractRefs(req.params.projectId, userId(req), body);
      if (refError) {
        return reply.code(400).send({ ok: false, error: refError });
      }
      const contract = await createContract(req.params.projectId, {
        ...body,
        title: body.title!.trim(),
        amount: Math.round(body.amount ?? 0),
      });
      return { ok: true, data: contract };
    },
  );

  app.patch<{ Params: { id: string }; Body: ContractBody }>(
    "/api/contracts/:id",
    { schema: { body: contractPatchBody } },
    async (req, reply) => {
      const access = await ensureContractAccess(req.params.id, userId(req));
      if (!access.ok) {
        return reply.code(access.status).send({ ok: false, error: access.message });
      }
      const refError = await validateContractRefs(
        access.projectId,
        userId(req),
        req.body,
        req.params.id,
      );
      if (refError) {
        return reply.code(400).send({ ok: false, error: refError });
      }
      const patch = { ...req.body };
      if (patch.title) patch.title = patch.title.trim();
      if (patch.amount !== undefined) patch.amount = Math.round(patch.amount);
      const updated = await updateContract(req.params.id, patch);
      if (!updated) {
        return reply.code(404).send({ ok: false, error: "계약을 찾을 수 없습니다." });
      }
      // 계약 상태 변경은 법적 효력 — 별도 audit. (전 상태 비교는 비용 ↑이라 새 상태만 기록)
      if (patch.status) {
        await audit(req, "contract.status_change", "contract", req.params.id, {
          status: patch.status,
        });
      }
      return { ok: true, data: updated };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/contracts/:id", async (req, reply) => {
    const access = await ensureContractAccess(req.params.id, userId(req));
    if (!access.ok) {
      return reply.code(access.status).send({ ok: false, error: access.message });
    }
    const ok = await deleteContract(req.params.id);
    if (!ok) {
      return reply.code(404).send({ ok: false, error: "계약을 찾을 수 없습니다." });
    }
    await audit(req, "delete", "contract", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
