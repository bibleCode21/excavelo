---
status: confirmed
ceremony: trivial
approved-commit: 99cd5108b010177d60aade80e69c07f568a01a50
---
# WU-3 — 소규모 API 정합 8건 + no-require-imports 주석 정정

## §Why

`community-review-remediation-prd.md` §3 WU-3의 커뮤니티 심사 봇 룰셋(`eslint-plugin-obsidianmd` recommended + typed 룰) 위반 8건을 국소 수정으로 해소한다 — `obsidianmd/prefer-get-language`(i18n/index.ts:34), `obsidianmd/prefer-window-timers`(git-log.ts:150,153 + claude-code-cli.ts:126,129), `@typescript-eslint/prefer-promise-reject-errors`(git-log.ts:141), `@typescript-eslint/only-throw-error`(git-log.ts:174), `@typescript-eslint/no-unnecessary-type-assertion`(git-log.ts:616), `@typescript-eslint/restrict-template-expressions`(main.ts:160). 전부 규칙 준수형 수정이며 기존 동작을 바꾸지 않는다 — assertion 제거는 정의상 no-op, `window.setTimeout`은 Electron 렌더러에서 `setTimeout`과 동일 참조, reject/throw 래핑은 `e`가 이미 `Error`가 아닐 때만 관여하는 방어적 코드, `getLanguage()` 전환은 언어 감지 순서의 2번째 단계를 같은 값을 반환하는 Obsidian 공식 API로 대체할 뿐 우선순위·폴백 체인은 그대로다. 여기에 WU-2 범위였던 `@typescript-eslint/no-require-imports`(git-log.ts:112,118 + claude-code-cli.ts:35,41의 `eslint-disable` 주석이 존재하지 않는 v7 이름 `no-var-requires`를 가리켜 무효 — 봇이 실제 쓰는 v8 이름 `no-require-imports`로 rename, 사용자 승인)를 같은 파일·같은 종류(주석 1줄)라 편입한다. 성공 기준: 기존 프로브 2종(`scripts/probe-git-log.mjs`, `scripts/probe-settings-tab.mjs`) 불변 통과, `pnpm lint`/`pnpm build` 그린, 위 9개 findings가 봇 룰셋 재현 프로브(`eslint-plugin-obsidianmd` `configs.recommended` 전체 배열 + `typescript-eslint` 8.64.0)에서 0건.

## §Spec

- allowed-surface:
  - src/i18n/index.ts
  - src/core/git-log.ts
  - src/llm/claude-code-cli.ts
  - src/main.ts
  - scripts/probe-git-log.mjs (스텁/폴리필만 — 위 변경으로 깨진 esbuild 번들·window 참조 보정)
  - scripts/probe-settings-tab.mjs (스텁만 — 동일 이유)
- refactor-scope:
  - (none)

acceptance criteria:
1. `src/i18n/index.ts`: `detectLocale()`이 `requireApiVersion("1.8.7")` 가드로 `getLanguage()`(≥1.8.7)와 기존 `window.localStorage.getItem("language")`(<1.8.7, minAppVersion 1.5.0 유지) 사이를 dual-path 분기. (최초 계획은 무조건 전환이었으나 구현 중 `obsidianmd/no-unsupported-api`가 minAppVersion 위반으로 실측 차단 — settings-tab.ts의 기존 dual-path 선례와 동일 패턴으로 수정, 사용자 승인.)
2. `src/core/git-log.ts:150,153` / `src/llm/claude-code-cli.ts:126,129`: `setTimeout`/`clearTimeout` → `window.setTimeout`/`window.clearTimeout`. (probe-git-log.mjs는 Node 단독 실행이라 `window`가 없어 `globalThis.window ??= { setTimeout, clearTimeout }` 폴리필 추가 — 실제 런타임인 Electron 렌더러에는 영향 없음.)
3. `src/core/git-log.ts:141`: `reject(e)` → `e instanceof Error ? e : new Error(String(e))`로 래핑.
4. `src/core/git-log.ts:174`: `throw lastError ?? new Error(...)` → `err instanceof Error ? err : new Error(JSON.stringify(err))`로 래핑(`String()`은 `no-base-to-string`에 걸려 `JSON.stringify`로 대체).
5. `src/core/git-log.ts:616`: `hit!(l.branch)`의 불필요한 `!` 제거.
6. `src/main.ts:160`: `` `Unknown auth method: ${method}` `` → `` `Unknown auth method: ${String(method)}` ``.
7. `src/core/git-log.ts:112,118` / `src/llm/claude-code-cli.ts:35,41`: `eslint-disable`/`eslint-enable` 주석에 `@typescript-eslint/no-var-requires`와 `@typescript-eslint/no-require-imports`를 함께 명시(쉼표 구분) — 로컬(v7)과 봇(v8)이 서로 다른 이름으로 이 룰을 활성화하기 때문에 하나만 남기면 어느 한쪽에서 항상 에러. 부수 변경(allowed-surface에 추가): `scripts/probe-git-log.mjs`, `scripts/probe-settings-tab.mjs`에 `getLanguage`/`requireApiVersion` 스텁 추가(새 import를 esbuild가 해석하지 못해 실패하던 것을 해소).
8. `pnpm lint`, `pnpm build`, `node scripts/probe-git-log.mjs`, `node scripts/probe-settings-tab.mjs` 전부 그린 (실측 완료).
9. 봇 룰셋 재현 프로브(`eslint-plugin-obsidianmd` `configs.recommended` 전체 + `typescript-eslint` 8.64.0)에서 원래 8개 rule 중 7개(prefer-window-timers×4, prefer-promise-reject-errors, only-throw-error, no-unnecessary-type-assertion, restrict-template-expressions) findings 0건, no-require-imports도 0건(에러 기준). **잔여 3건, 전부 warning이지 error 아님, 수용됨(신규 error 없음이 실패 기준)**:
   - `obsidianmd/prefer-get-language`(i18n/index.ts) — <1.8.7 폴백 코드 자체가 룰 패턴에 걸림. `eslint-comments/no-restricted-disable`가 `obsidianmd/*` 룰의 disable-comment 자체를 금지해서 억제 불가능(실측 확인) — 코드 주석으로 사유만 명시.
   - `no-var-requires`/`no-require-imports` unused-directive 각 1건(git-log.ts, claude-code-cli.ts) — 위 7번의 구조적 귀결, 로컬·봇 어느 쪽에서 실행해도 두 이름 중 하나는 "미등록"이라 unused로 표시됨. warning 등급이라 `pnpm lint`도, 봇의 error 채점도 이 건에서는 통과.
