import pg from "pg";
import { env } from "./env.js";

// pg 는 NUMERIC(1700) / BIGINT(20) 을 기본적으로 string 으로 반환해 정밀도 손실을 막는다.
// 이 프로젝트는 BIGINT 가 amount/price (수백억 미만) 라 number 로 다뤄도 안전 →
// 매퍼마다 Number(row.x) 반복하지 않도록 한 번에 등록.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // BIGINT → number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // NUMERIC → number

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}

export async function shutdownDb(): Promise<void> {
  await pool.end();
}
