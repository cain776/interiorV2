-- connect-pg-simple 기본 스키마. 세션을 PostgreSQL 에 저장해 재시작에도 유지.
CREATE TABLE IF NOT EXISTS "session" (
  sid    TEXT NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS session_expire_idx ON "session" (expire);
