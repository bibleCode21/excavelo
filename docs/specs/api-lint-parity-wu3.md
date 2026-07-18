---
status: confirmed
ceremony: trivial
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
- refactor-scope:
  - (none)

acceptance criteria:
1. `src/i18n/index.ts`: `detectLocale()`이 `window.localStorage.getItem("language")` 대신 `obsidian`의 `getLanguage()`를 사용. 상단 doc 주석의 2단계 설명을 갱신.
2. `src/core/git-log.ts:150,153` / `src/llm/claude-code-cli.ts:126,129`: `setTimeout`/`clearTimeout` → `window.setTimeout`/`window.clearTimeout`.
3. `src/core/git-log.ts:141`: `reject(e)` → `e instanceof Error ? e : new Error(String(e))`로 래핑.
4. `src/core/git-log.ts:174`: `throw lastError ?? new Error(...)`의 `lastError`도 동일 패턴으로 래핑.
5. `src/core/git-log.ts:616`: `hit!(l.branch)`의 불필요한 `!` 제거.
6. `src/main.ts:160`: `` `Unknown auth method: ${method}` `` → `` `Unknown auth method: ${String(method)}` ``.
7. `src/core/git-log.ts:112,118` / `src/llm/claude-code-cli.ts:35,41`: `eslint-disable`/`eslint-enable` 주석의 룰 이름을 `@typescript-eslint/no-var-requires` → `@typescript-eslint/no-require-imports`로 rename (사유 문구는 유지).
8. `pnpm lint`, `pnpm build`, `node scripts/probe-git-log.mjs`, `node scripts/probe-settings-tab.mjs` 전부 그린.
9. 봇 룰셋 재현 프로브에서 위 9개 finding 지점 findings 0건 (신규 findings 발생 시 실패).
