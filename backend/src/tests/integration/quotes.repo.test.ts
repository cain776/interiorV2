// selectQuote 트랜잭션 의미론 회귀 테스트.
//
// 정책 (docs/architecture.md "견적 채택"):
//   - quotes.selected_at: 같은 line_item 의 다른 견적은 NULL, 채택 견적은 NOW
//   - line_items.selected_quote_id: 채택 견적의 FK 로 갱신
//   - quotes.status: select API 가 자동 전이하지 않음 (수동 관리)
//
// 한 번 깨지면 채택 견적이 두 개 보이거나, line_items 와 quotes 의 채택 상태가
// 어긋나 워크스페이스 화면이 모순된 데이터를 보여준다 → 데이터 손상.

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { selectQuote } from "../../repos/quotes.repo.js";
import { getLineItemById } from "../../repos/line-items.repo.js";
import { query } from "../../lib/db.js";
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

async function setupLineItemWithQuotes(quoteCount: number) {
  const user = await makeUser();
  const project = await makeProject(user.id);
  const phase = await makePhase(project.id);
  const lineItem = await makeLineItem(phase.id);
  const vendor = await makeVendor(user.id);
  const quotes = [];
  for (let i = 0; i < quoteCount; i++) {
    quotes.push(await makeQuote(lineItem.id, vendor.id, { price: 1000 + i }));
  }
  return { user, project, phase, lineItem, vendor, quotes };
}

async function fetchQuoteSelectedAt(id: string): Promise<Date | null> {
  const r = await query<{ selected_at: Date | null }>(
    `SELECT selected_at FROM quotes WHERE id = $1`,
    [id],
  );
  return r.rows[0]?.selected_at ?? null;
}

async function fetchQuoteStatus(id: string): Promise<string | null> {
  const r = await query<{ status: string }>(
    `SELECT status FROM quotes WHERE id = $1`,
    [id],
  );
  return r.rows[0]?.status ?? null;
}

describe("selectQuote", () => {
  test("존재하지 않는 quote 는 null 반환", async () => {
    expect(await selectQuote("nonexistent-id")).toBe(null);
  });

  test("첫 채택: selected_at 채워지고 line_items.selected_quote_id 갱신", async () => {
    const { lineItem, quotes } = await setupLineItemWithQuotes(1);

    const result = await selectQuote(quotes[0]!.id);

    expect(result).toEqual({ lineItemId: lineItem.id });
    expect(await fetchQuoteSelectedAt(quotes[0]!.id)).not.toBeNull();
    const li = await getLineItemById(lineItem.id);
    expect(li?.selectedQuoteId).toBe(quotes[0]!.id);
  });

  test("다른 견적 채택: 이전 견적 selected_at = NULL, 새 견적 selected_at = NOW", async () => {
    const { lineItem, quotes } = await setupLineItemWithQuotes(2);

    await selectQuote(quotes[0]!.id);
    expect(await fetchQuoteSelectedAt(quotes[0]!.id)).not.toBeNull();

    await selectQuote(quotes[1]!.id);

    expect(await fetchQuoteSelectedAt(quotes[0]!.id)).toBeNull();
    expect(await fetchQuoteSelectedAt(quotes[1]!.id)).not.toBeNull();

    const li = await getLineItemById(lineItem.id);
    expect(li?.selectedQuoteId).toBe(quotes[1]!.id);
  });

  test("status 는 자동 전이하지 않음 (수동 관리 정책)", async () => {
    // 채택 직전 status 가 'candidate' 였다면 채택 후에도 그대로.
    const { quotes } = await setupLineItemWithQuotes(1);

    expect(await fetchQuoteStatus(quotes[0]!.id)).toBe("candidate");

    await selectQuote(quotes[0]!.id);

    // 채택해도 'contracted' 로 자동 전이되지 않음 — architecture.md 정책.
    expect(await fetchQuoteStatus(quotes[0]!.id)).toBe("candidate");
  });

  test("다른 line_item 의 견적은 영향 받지 않음", async () => {
    const user = await makeUser();
    const project = await makeProject(user.id);
    const phase = await makePhase(project.id);
    const li1 = await makeLineItem(phase.id);
    const li2 = await makeLineItem(phase.id);
    const vendor = await makeVendor(user.id);
    const q1 = await makeQuote(li1.id, vendor.id);
    const q2 = await makeQuote(li2.id, vendor.id);

    await selectQuote(q1.id);
    await selectQuote(q2.id);

    // 둘 다 자기 line_item 의 채택. 서로 영향 안 줌.
    expect(await fetchQuoteSelectedAt(q1.id)).not.toBeNull();
    expect(await fetchQuoteSelectedAt(q2.id)).not.toBeNull();

    const li1After = await getLineItemById(li1.id);
    const li2After = await getLineItemById(li2.id);
    expect(li1After?.selectedQuoteId).toBe(q1.id);
    expect(li2After?.selectedQuoteId).toBe(q2.id);
  });
});
