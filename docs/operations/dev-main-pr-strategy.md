# dev -> main PR 전략

## 브랜치 역할

| 브랜치 | 역할 |
|---|---|
| `dev` | 통합 브랜치. 기능/수정 작업은 여기로 모은다. |
| `main` | 배포 기준 브랜치. 직접 push 하지 않고 PR 로만 갱신한다. |

## 기본 흐름

초기 1회: 현재 저장소처럼 `dev`만 있고 `main`이 아직 없다면, `main`을 한 번만 생성한 뒤 보호 브랜치를 건다. 예: GitHub UI에서 `dev` 기준으로 `main` 생성 또는 로컬에서 `git push origin dev:main`. 이 작업 이후부터는 `main` 직접 push 금지.

1. 작업 브랜치 또는 로컬 작업을 `dev`에 반영한다.
2. `dev` push 시 `CI` workflow 가 자동 실행된다.
3. 릴리스할 때 GitHub Actions의 `Promote dev to main` workflow 를 수동 실행한다.
4. 생성된 `dev -> main` PR 에서 CI 결과와 변경 내용을 확인한다.
5. PR merge 후 `main`을 배포 기준으로 사용한다.

## GitHub 보호 브랜치 권장값

`main`:

- Require a pull request before merging
- Require status checks to pass before merging
- Required checks:
  - `Backend static checks`
  - `Backend integration tests`
  - `Frontend typecheck`
- Require branches to be up to date before merging
- Do not allow bypassing the above settings
- Restrict who can push directly: enabled

`dev`:

- 가족/개인 단계에서는 직접 push 허용
- 사용자가 늘면 `dev`도 PR 기반으로 전환

## 현재 Actions

- `.github/workflows/ci.yml`
  - `dev` push 때 실행
  - `main` 대상 PR 때 실행
  - backend typecheck/test/build
  - PostgreSQL service 기반 integration test
  - frontend typecheck

- `.github/workflows/promote-dev-to-main.yml`
  - 수동 실행
  - 이미 열린 `dev -> main` PR 이 있으면 새로 만들지 않고 기존 PR 을 출력
  - 없으면 `.github/pull_request_template.md` 기반 PR 생성

## 아직 하지 않는 것

- 자동 배포
- production secret 주입
- DB migration 자동 적용
- `main` merge 후 서버 재시작

위 항목은 맥미니/NAS/VPS 중 실제 운영 위치가 정해진 뒤 별도 workflow 로 추가한다.
