// 통합 테스트용 데이터 시드.
// 1b 단계에서 vendor/phase/space/lineItem/quote 추가.
// repo 의 정식 create 함수를 그대로 사용해 실제 SQL 동작도 함께 회귀 검증.

import { createUser } from "../../../repos/users.repo.js";
import { createProject } from "../../../repos/projects.repo.js";
import { createVendor } from "../../../repos/vendors.repo.js";
import { createPhase } from "../../../repos/phases.repo.js";
import { createSpace } from "../../../repos/spaces.repo.js";
import { createLineItem } from "../../../repos/line-items.repo.js";
import { createQuote } from "../../../repos/quotes.repo.js";
import type { QuoteMode, QuoteStatus } from "../../../types/domain.js";

let counter = 0;
const uniq = (prefix = ""): string => `${prefix}${Date.now()}-${++counter}`;

export async function makeUser(overrides: { email?: string; name?: string } = {}) {
  return createUser({
    email: overrides.email ?? `${uniq("u-")}@test.local`,
    name: overrides.name ?? "테스트 사용자",
    // bcrypt 해시 형식만 흉내. 통합 테스트는 password verify 까지 가지 않는다.
    passwordHash: "$2b$10$" + "x".repeat(53),
  });
}

export async function makeProject(
  ownerId: string,
  overrides: { name?: string } = {},
) {
  return createProject(ownerId, { name: overrides.name ?? `프로젝트-${uniq()}` });
}

export async function makeVendor(
  ownerId: string,
  overrides: { name?: string } = {},
) {
  return createVendor(ownerId, { name: overrides.name ?? `업체-${uniq()}` });
}

export async function makePhase(
  projectId: string,
  overrides: { name?: string } = {},
) {
  return createPhase(projectId, { name: overrides.name ?? `공정-${uniq()}` });
}

export async function makeSpace(
  projectId: string,
  overrides: { name?: string } = {},
) {
  return createSpace(projectId, { name: overrides.name ?? `공간-${uniq()}` });
}

export async function makeLineItem(
  phaseId: string,
  overrides: { label?: string } = {},
) {
  return createLineItem(phaseId, { label: overrides.label ?? `항목-${uniq()}` });
}

export async function makeQuote(
  lineItemId: string,
  vendorId: string,
  overrides: { price?: number; mode?: QuoteMode; status?: QuoteStatus } = {},
) {
  return createQuote(lineItemId, {
    vendorId,
    mode: overrides.mode ?? "turnkey",
    price: overrides.price ?? 1_000_000,
    status: overrides.status,
  });
}
