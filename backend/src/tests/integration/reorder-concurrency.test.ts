// reorder 동시성 회귀 테스트.
//
// reorder 는 두 단계 UPDATE (음수 임시값 → 최종 sort_order) 트랜잭션. 두 사용자가
// 같은 부모(project/phase) 의 정렬을 동시에 시도하면 두 트랜잭션이 같은 음수 임시값
// 자리를 두고 경쟁 → 한 쪽은 23505 (UNIQUE 위반) 으로 fail 가능.
//
// 검증 핵심:
//   1) 둘 다 성공하든 한 쪽이 throw 하든, **DB 가 일관 상태**여야 한다 (UNIQUE 유지, 누락/중복 없음).
//   2) 데이터 손상 (sort_order 음수 잔재 / 중복 / 빠진 row) 이 발생하지 않는다.
//
// 가족 공유 단계에서 두 명이 같은 프로젝트 정렬을 동시 만지는 시나리오는 드물지만,
// 0 이 아닌 빈도이고 발생 시 화면 표시가 깨지므로 회귀 보호.

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  listPhasesByProject,
  reorderPhases,
} from "../../repos/phases.repo.js";
import {
  listLineItemsByPhase,
  reorderLineItems,
} from "../../repos/line-items.repo.js";
import { closeDatabase, resetDatabase } from "./helpers/db.js";
import {
  makeLineItem,
  makePhase,
  makeProject,
  makeUser,
} from "./helpers/factories.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("reorderPhases 동시성", () => {
  test("두 reorder 동시 실행 — 한 쪽이 실패해도 DB 는 일관 상태", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const phases = [];
    for (let i = 0; i < 3; i++) {
      phases.push(await makePhase(project.id, { name: `공정-${i}` }));
    }

    const order1 = [phases[2]!.id, phases[1]!.id, phases[0]!.id];
    const order2 = [phases[0]!.id, phases[2]!.id, phases[1]!.id];

    // 동시 실행. 한 쪽이 throw 해도 다른 쪽은 정상 처리.
    const results = await Promise.allSettled([
      reorderPhases(project.id, order1),
      reorderPhases(project.id, order2),
    ]);

    // 최소 하나는 성공해야 한다.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // 최종 상태 검증 — UNIQUE/누락/음수 잔재 없음.
    const finalList = await listPhasesByProject(project.id);

    // 모든 phase 가 한 번씩 존재.
    expect(finalList.length).toBe(3);
    const ids = new Set(finalList.map((p) => p.id));
    expect(ids.size).toBe(3);
    expect(ids.has(phases[0]!.id)).toBe(true);
    expect(ids.has(phases[1]!.id)).toBe(true);
    expect(ids.has(phases[2]!.id)).toBe(true);

    // sort_order 0..n-1 연속, 음수 임시값 잔재 없음.
    const sortOrders = finalList.map((p) => p.sortOrder).sort((a, b) => a - b);
    expect(sortOrders).toEqual([0, 1, 2]);
  });
});

describe("reorderLineItems 동시성", () => {
  test("같은 phase 의 reorder 두 개 동시 — 일관 상태 유지", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const phase = await makePhase(project.id);
    const items = [];
    for (let i = 0; i < 4; i++) {
      items.push(await makeLineItem(phase.id, { label: `항목-${i}` }));
    }

    const order1 = [items[3]!.id, items[2]!.id, items[1]!.id, items[0]!.id];
    const order2 = [items[1]!.id, items[0]!.id, items[3]!.id, items[2]!.id];

    const results = await Promise.allSettled([
      reorderLineItems(phase.id, order1),
      reorderLineItems(phase.id, order2),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const finalList = await listLineItemsByPhase(phase.id);
    expect(finalList.length).toBe(4);
    expect(new Set(finalList.map((li) => li.id)).size).toBe(4);
    expect(finalList.map((li) => li.sortOrder).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  test("다른 phase 끼리 동시 reorder — 서로 영향 없음", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const phase1 = await makePhase(project.id, { name: "p1" });
    const phase2 = await makePhase(project.id, { name: "p2" });
    const a1 = await makeLineItem(phase1.id);
    const a2 = await makeLineItem(phase1.id);
    const b1 = await makeLineItem(phase2.id);
    const b2 = await makeLineItem(phase2.id);

    // phase1, phase2 각자 독립 — UNIQUE 키가 phase_id 별이라 동시 실행 OK.
    const results = await Promise.all([
      reorderLineItems(phase1.id, [a2.id, a1.id]),
      reorderLineItems(phase2.id, [b2.id, b1.id]),
    ]);

    expect(results[0]).not.toBeNull();
    expect(results[1]).not.toBeNull();

    const list1 = await listLineItemsByPhase(phase1.id);
    const list2 = await listLineItemsByPhase(phase2.id);
    expect(list1.map((li) => li.id)).toEqual([a2.id, a1.id]);
    expect(list2.map((li) => li.id)).toEqual([b2.id, b1.id]);
  });
});
