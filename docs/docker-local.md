# 로컬 Docker / DB 운영 메모

이 프로젝트에서 Docker의 현재 역할은 앱 전체 실행이 아니라 PostgreSQL 개발 DB 실행이다.
프론트/백엔드는 로컬 Node 프로세스로 실행하고, DB만 Docker 컨테이너로 격리한다.

## 현재 구조

```text
Browser
  -> Fastify backend :3001
  -> PostgreSQL :5432
```

현재 `backend/.env`의 `DATABASE_URL`은 로컬 PostgreSQL을 바라본다.

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interior
```

Docker를 쓰는 경우 `interior-postgres` 컨테이너가 컨테이너 내부 PostgreSQL 5432를 Windows 로컬 5432로 노출한다.

## Docker를 쓰는 이유

- PostgreSQL Windows 설치/서비스 설정 없이 개발 DB를 띄울 수 있다.
- PostgreSQL 버전을 `postgres:16-alpine`처럼 고정할 수 있다.
- 프로젝트별 DB를 분리하고, 망가졌을 때 재생성하기 쉽다.
- 나중에 Mac mini, VPS, NAS로 옮길 때 같은 컨테이너 모델을 재사용하기 쉽다.

## 데이터 위치 감각

현재 `docker run --name interior-postgres ...` 방식은 DB 데이터가 프로젝트 폴더 안의 SQL 파일에 저장되는 것이 아니다.

```text
database/migrations/*.sql
  = DB 구조 변경 이력

Docker container / volume 영역
  = 실제 PostgreSQL 데이터
```

따라서 컨테이너/볼륨 삭제는 데이터 삭제로 이어질 수 있다. 운영 또는 장기 개발로 넘어가면 volume 위치와 백업 정책을 명확히 해야 한다.

## Docker Compose

현재 repo root 에 `docker-compose.yml` 이 있으며, 새 환경에서는 이 경로가 권장 DB 실행 표면이다.

```sh
docker compose up -d db
```

구성 요약:

```yaml
name: interior-v2

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: interior
    ports:
      - "5432:5432"
    volumes:
      - interior_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d interior"]
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  interior_pg_data:
```

`container_name`을 일부러 고정하지 않는다. 이전 수동 컨테이너 `interior-postgres`가 있는 개발 PC에서도 이름 충돌 없이 Compose를 추가할 수 있게 하기 위함이다.

## 전환 시 결정할 것

기존 `interior-postgres` 컨테이너가 이미 데이터를 가지고 있으면 먼저 선택해야 한다. `tools/서버실행.bat`는 데이터 보존을 우선해, 기존 수동 컨테이너가 있으면 그 컨테이너를 먼저 시작하고 새 환경에서만 Compose를 사용한다.

| 선택 | 의미 |
|---|---|
| 기존 데이터 보존 | `pg_dump`로 백업 후 compose DB에 복원 |
| 개발 데이터 초기화 | 기존 컨테이너/볼륨 정리 후 compose로 새 DB 생성 |

데이터가 조금이라도 필요하면 무조건 백업을 먼저 만든다.

## 백업 기본 방향

`tools/db-backup.bat` 가 현재 DB를 `backups/` 아래 SQL dump 로 저장한다.

내부 동작은 Compose service `db`를 먼저 시도하고, 실패하면 기존 수동 컨테이너 `interior-postgres`를 시도한다.

```sh
tools\db-backup.bat
```

복구는 별도 DB에 먼저 검증한 뒤 실제 DB에 적용한다.

## Mac mini / VPS / NAS 이전 감각

Docker Compose로 정리되면 배포 대상은 달라져도 구조는 크게 변하지 않는다.

```text
Caddy/Nginx :80/:443
  -> backend container or local backend
  -> postgres container + volume
```

초기에는 DB만 Docker로 유지하고, 배포가 필요해지면 backend까지 compose에 넣는 순서가 안전하다.

## 당장 유지할 것

- 앱 코드는 로컬 `npm run dev` 중심 유지.
- DB는 Docker로 실행해도 실제 schema 변경은 migration으로 관리.
- `tools/서버종료.bat` 는 backend dev server 만 종료하고 DB 는 유지한다.
- 데이터 삭제 가능성이 있는 Docker 정리 명령은 백업 전 실행 금지.
