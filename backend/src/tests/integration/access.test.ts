// lib/access.ts 권한/소속 추적 헬퍼 통합 테스트.
// projectExistsForOwner: 소유자 매칭 + 격리
// getLineItemProjectId: phase → project 체인 추적
// getQuoteProjectId: quote → lineItem → phase → project 체인 추적

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  getLineItemProjectId,
  getQuoteProjectId,
  projectExistsForOwner,
} from "../../lib/access.js";
import { closeDatabase, resetDatabase } from "./helpers/db.js";
import {
  makeLineItem,
  makePhase,
  makeProject,
  makeQuote,
  makeUser,
  makeVendor,
} from "./helpers/factories.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("projectExistsForOwner", () => {
  test("소유자가 일치하면 true", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);

    expect(await projectExistsForOwner(project.id, user.id)).toBe(true);
  });

  test("다른 사용자의 프로젝트는 false (권한 격리)", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const project = await makeProject(owner.id);

    expect(await projectExistsForOwner(project.id, stranger.id)).toBe(false);
  });

  test("존재하지 않는 project id 는 false", async () => {
    const user = await makeUser();
    expect(await projectExistsForOwner("nonexistent-id", user.id)).toBe(false);
  });
});

describe("getLineItemProjectId", () => {
  test("phase → project 체인을 정확히 따라간다", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const phase = await makePhase(project.id);
    const lineItem = await makeLineItem(phase.id);

    expect(await getLineItemProjectId(lineItem.id)).toBe(project.id);
  });

  test("존재하지 않는 lineItem 은 null", async () => {
    expect(await getLineItemProjectId("nonexistent-id")).toBe(null);
  });
});

describe("getQuoteProjectId", () => {
  test("quote → lineItem → phase → project 다단계 체인 추적", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const phase = await makePhase(project.id);
    const lineItem = await makeLineItem(phase.id);
    const vendor = await makeVendor(user.id);
    const quote = await makeQuote(lineItem.id, vendor.id);

    expect(await getQuoteProjectId(quote.id)).toBe(project.id);
  });

  test("존재하지 않는 quote 는 null", async () => {
    expect(await getQuoteProjectId("nonexistent-id")).toBe(null);
  });
});
