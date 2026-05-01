// 라우트들이 반복하던 권한/소유권 체크 헬퍼.
// "내 프로젝트 내 자식 리소스인지" 를 빠르게 확인하기 위한 얕은 SQL 조회 모음.
// 모든 함수는 매핑된 객체를 가져오지 않고 boolean / projectId 정도만 반환해 부하 최소화.
//
// SQL 자체는 repos/* 에 위치. 이 파일은 cross-table 접근 헬퍼만 조립.

import { projectExistsForOwner } from "../repos/projects.repo.js";
import { getPhaseProjectId } from "../repos/phases.repo.js";
import { getLineItemPhaseId } from "../repos/line-items.repo.js";
import { getQuoteLineItemId } from "../repos/quotes.repo.js";

export { projectExistsForOwner };

/** line item → 소속 project id (사용자 소유 검증 없음). */
export async function getLineItemProjectId(lineItemId: string): Promise<string | null> {
  const phaseId = await getLineItemPhaseId(lineItemId);
  return phaseId ? getPhaseProjectId(phaseId) : null;
}

/** quote → 소속 project id. */
export async function getQuoteProjectId(quoteId: string): Promise<string | null> {
  const lineItemId = await getQuoteLineItemId(quoteId);
  return lineItemId ? getLineItemProjectId(lineItemId) : null;
}

/**
 * 표준 access 체크 결과. 라우트에서 그대로 reply 에 사용.
 * success 시 projectId 까지 반환 — 후속 cross-table 검증 (vendorBelongsToOwner, validateContractRefs 등) 에 활용.
 */
export type AccessResult =
  | { ok: true; projectId: string }
  | { ok: false; status: number; message: string };

/**
 * "이 자식 리소스가 내 프로젝트에 속하는가" 를 phase/space/lineItem/quote 등에 대해 통일.
 * 각 라우트가 반복하던 ensureXxxAccess 보일러플레이트를 한 줄 호출로 대체.
 *
 * @param resolveProjectId 자식 id → project id 변환기 (반환 null = not found)
 * @param childId 자식 리소스 id
 * @param ownerId 현재 로그인 사용자
 * @param notFoundMsg 자식이 없거나 권한 밖일 때 메시지
 */
export async function ensureChildAccess(
  resolveProjectId: (id: string) => Promise<string | null>,
  childId: string,
  ownerId: string,
  notFoundMsg: string,
): Promise<AccessResult> {
  const projectId = await resolveProjectId(childId);
  if (!projectId) return { ok: false, status: 404, message: notFoundMsg };
  if (!(await projectExistsForOwner(projectId, ownerId))) {
    return { ok: false, status: 404, message: notFoundMsg };
  }
  return { ok: true, projectId };
}
