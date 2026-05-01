// fastify JSON Schema 검증을 위한 공통 fragment + 헬퍼.
// 라우트는 여기 정의된 enum / 패턴을 import 해서 schema 를 빌드.
// fastify-typebox 같은 빌더 없이 plain JSON Schema 객체 — 의존성 최소.

import type { FastifySchema } from "fastify";

export const STATUS_PROJECT = ["planning", "in_progress", "done", "archived"] as const;
export const STATUS_PHASE = ["planned", "in_progress", "done", "as"] as const;
export const STATUS_QUOTE = ["candidate", "negotiating", "contracted", "cancelled"] as const;
export const STATUS_CONTRACT = [
  "planned",
  "contracted",
  "in_progress",
  "done",
  "disputed",
  "cancelled",
] as const;
export const TYPE_CONTRACT = ["standalone", "subcontract"] as const;
export const KIND_PAYMENT = ["deposit", "progress", "final", "extra", "refund"] as const;
export const STATUS_PAYMENT = ["pending", "paid", "overdue", "cancelled"] as const;
export const REASON_CHANGE_ORDER = ["site_change", "additional_request", "defect", "other"] as const;
export const STATUS_CHANGE_ORDER = ["requested", "approved", "rejected", "cancelled"] as const;
export const STATUS_AS_TICKET = ["received", "confirmed", "in_progress", "done", "on_hold"] as const;
export const PRIORITY_AS_TICKET = ["normal", "urgent"] as const;
export const MODE_QUOTE = ["turnkey", "self"] as const;
export const KIND_ATTACHMENT = ["photo", "pdf", "drawing", "document", "other"] as const;
export const PHOTO_KIND = [
  "before",
  "during",
  "after",
  "reference",
  "defect",
  "floorplan",
  "naver_floorplan",
  "fixture",
] as const;
export const OWNER_TYPE_ATTACHMENT = [
  "project",
  "vendor",
  "phase",
  "space",
  "lineItem",
  "quote",
  "contract",
  "payment",
  "changeOrder",
  "asTicket",
] as const;

// ISO date (YYYY-MM-DD) — DB DATE 컬럼이 받는 형식.
export const isoDate = {
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
} as const;

// 빈 문자열도 허용하지만 null 도 허용 — patch body 에서 "지움" 의미.
export const nullableString = { type: ["string", "null"] } as const;
export const nullableNumber = { type: ["number", "null"] } as const;
export const nullableIsoDate = {
  type: ["string", "null"],
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
} as const;

// ISO 8601 date-time. timezone offset 또는 'Z' 필수.
// JS Date.prototype.toISOString() 출력과 호환.
export const nullableIsoDateTime = {
  type: ["string", "null"],
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$",
} as const;

export const nonNegativeInt = { type: "integer", minimum: 0 } as const;

export const orderedIdsBody = {
  type: "object",
  required: ["orderedIds"],
  additionalProperties: false,
  properties: {
    orderedIds: {
      type: "array",
      items: { type: "string", minLength: 1 },
      minItems: 1,
    },
  },
} as const;

/**
 * fastify default schemaErrorFormatter 가 ValidationError(throw) 를 만들지만
 * 우리 setErrorHandler 는 statusCode 가 있으면 그 코드로 응답. 422 대신 400 으로
 * 변환해 ApiError 형식 통일. fieldErrors 는 ajv path → 메시지 매핑.
 */
export function schemaToFieldErrors(
  errors: Array<{ instancePath?: string; params?: Record<string, unknown>; message?: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const err of errors) {
    // body/foo/bar → foo (top-level) 만 사용. 단순화.
    const path = (err.instancePath ?? "").replace(/^\//, "").split("/")[0];
    const key = path || (err.params?.missingProperty as string) || "_";
    if (!out[key]) {
      out[key] = err.message ?? "잘못된 값";
    }
  }
  return out;
}

/** schema 옵션을 라우트 정의에 깔끔하게 끼워넣기 위한 헬퍼. */
export function withSchema<T extends FastifySchema>(schema: T): { schema: T } {
  return { schema };
}
