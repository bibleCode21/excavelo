---
status: confirmed
ceremony: standard
---
# WU-6 — eslint.config.mjs를 obsidianmd recommended + typescript-eslint v8로 마이그레이션

## §Why

- **Goal**: `eslint.config.mjs`를 `obsidianmd/no-unsupported-api` 룰 하나만 수동으로 켜둔 현재 상태에서, `eslint-plugin-obsidianmd`의 `configs.recommended` 전체를 스프레드하는 구조로 전환한다. WU-1·3·4·5가 이 recommended 세트의 findings(원래 65건)를 42건까지 줄여왔고, 이번 세션 실측으로 남은 23건(error 2 / warning 21)이 전부 파악·수용 가능함을 확인했다 — recommended 전체를 켜는 것이 이제 안전하다. 동시에 `@typescript-eslint/eslint-plugin`/`@typescript-eslint/parser`(v7, pinned)를 제거하고 `typescript-eslint`(v8.64.0, 이미 devDependency)로 완전히 옮긴다 — `obsidianmd.configs.recommended`가 자체적으로 v8 메타패키지를 내장하고 있어 v7 플러그인과 병존하면 "Cannot redefine plugin '@typescript-eslint'" 충돌이 실측 재현됨(전 세션 그라운딩).
- **Non-goals**: 로직/런타임 동작 변경 없음. 기존에 수용 확정된 잔여 warning 4건(i18n/index.ts:38 `obsidianmd/prefer-get-language`, settings-tab.ts:78 `@typescript-eslint/no-deprecated`, settings-tab.ts:204/268 `obsidianmd/ui/sentence-case`)은 이번 WU의 대상이 아니다 — 손대지 않는다. `eslint-plugin-obsidianmd` 자체의 버전 업(0.4.1 유지)이나 `.github/workflows/ci.yml` 변경도 범위 밖.
- **Success criteria**:
  1. `pnpm lint`(=`eslint src --ext .ts`) 실행 시 error 0건, warning 정확히 4건(위 non-goals에 명시한 기존 수용분과 동일한 4곳).
  2. `pnpm build` 그린.
  3. 기존 프로브 3종(`scripts/probe-git-log.mjs` 60 assertion, `scripts/probe-settings-tab.mjs` 156 assertion, `scripts/probe-templates.mjs` 22 assertion — 이번 세션 실측 재확인된 정확한 값) 어설션 개수 불변으로 전부 green — 이 WU는 런타임 로직을 한 줄도 바꾸지 않으므로 프로브 파일 자체는 무편집.
  4. `package.json`에서 `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`(v7) 항목이 삭제되어 있고, 그 둘이 리포 어디에서도(코드·설정) 더 이상 참조되지 않음.
  5. `git-log.ts`, `claude-code-cli.ts`의 `eslint-disable`/`eslint-enable` 주석이 `@typescript-eslint/no-require-imports` 단독으로 정리되어 있고, 해당 위치에서 "unused eslint-disable directive" 에러가 재현되지 않음.
  6. 뮤테이션 체크: `obsidianmd/no-unsupported-api`가 마이그레이션 후에도 여전히 error로 활성 상태임을, 임시로 manifest.minAppVersion보다 높은 `@since`의 API 호출을 소스에 넣어 `pnpm lint`가 그 위반을 error로 잡아내는지 확인한 뒤 원복하는 방식으로 검증한다(이 뮤테이션은 커밋하지 않는다).
- **Preservation contract**: `Platform.isDesktop` 가드를 포함한 `nodeApis()`의 런타임 동작(WU-2가 만든 것)은 전혀 건드리지 않는다 — 이번 WU가 편집하는 두 파일의 변경 범위는 각각 딱 한 줄의 `eslint-disable`/`eslint-enable` 주석(디렉티브 텍스트 + 그 옆 설명 주석)뿐이며, 함수 본문·guard 조건·require 대상은 무편집. `obsidianmd/no-unsupported-api`가 계속 error 등급으로 켜져 있어야 한다(1.4.1 심사 탈락의 직접 원인이었던 룰 — 이번 마이그레이션으로 로컬이 recommended의 기본값을 그대로 신뢰하게 되지만, recommended 자체가 이미 이 룰을 error로 설정하고 있음을 실측 확인했음 — 위 성공기준 6이 회귀 여부를 검증한다).
- **Refactor rationale**: 로컬 config가 recommended 룰셋의 극히 일부(1개)만 수동으로 복제해 유지하는 현재 구조는, 심사 봇의 룰셋이 바뀔 때마다 로컬이 조용히 뒤처질 위험을 안고 있다(1.4.1 탈락의 근본 원인과 같은 종류의 구멍). `configs.recommended`를 그대로 스프레드하면 로컬과 봇이 같은 소스를 참조하게 되어 이 클래스의 실패가 구조적으로 닫힌다. WU-1~5가 findings를 65→23까지 줄여온 것은 정확히 이 전환을 가능하게 만들기 위한 선행 작업이었다.

## §Spec

**observable behavior**:
- `pnpm lint`가 obsidianmd recommended 전체 룰셋(typescript-eslint v8 typed 룰 포함)을 `src/**/*.ts`에 대해 평가한다.
- `git-log.ts`/`claude-code-cli.ts` 두 파일 안에서만 `require`/`process`/`NodeJS`가 알려진 전역으로 취급되어 `no-undef` 경고가 발생하지 않는다. 다른 파일에서 동일 식별자를 가드 없이 쓰면 `no-undef`가 여전히 발생한다(전역 등록이 파일 스코프로 한정되므로).
- `obsidianmd/no-unsupported-api`는 명시적 로컬 오버라이드 없이 recommended의 기본값(error)을 그대로 상속한다.

**acceptance criteria** (§Why 성공기준 1~6과 동일, 여기서는 구현 대상 파일별 세부):

1. `package.json`: `devDependencies`에서 `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` 두 줄 삭제. `typescript-eslint`(^8.64.0)는 기존 값 유지.
2. `eslint.config.mjs`: 전면 재작성.
   - `import obsidianmd from "eslint-plugin-obsidianmd"` 유지, `tsplugin`/`tsparser`(v7) import 삭제.
   - `export default [...obsidianmd.configs.recommended, <overlay 1>, <overlay 2>]` 형태.
   - overlay 1 — `files: ["src/**/*.ts"]`, `languageOptions.parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname }`, `rules`에 기존 5개 오버라이드(`no-unused-vars: off`, `@typescript-eslint/no-unused-vars: [error, {args: none}]`, `@typescript-eslint/ban-ts-comment: off`, `no-prototype-builtins: off`, `@typescript-eslint/no-empty-function: off`) 보존. `obsidianmd/no-unsupported-api` 명시적 오버라이드는 포함하지 않는다(recommended 기본값 신뢰).
   - overlay 2 — `files: ["src/core/git-log.ts", "src/llm/claude-code-cli.ts"]`, `languageOptions.globals: { require: "readonly", process: "readonly", NodeJS: "readonly" }`.
3. `src/core/git-log.ts:112`: `/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- ... */`에서 `@typescript-eslint/no-var-requires,` 제거, 주석 본문 중 "Both rule names are listed because the locally pinned typescript-eslint (v7) and the community-review bot's ruleset (v8) disagree on which one applies; whichever is inactive in a given environment shows as an 'unused directive' note there — harmless (see WU-3 work contract)." 문장을 삭제(더 이상 사실 아님 — v7이 로컬에 없으므로 두 이름이 갈릴 이유가 없어짐). 대응하는 `eslint-enable` 줄도 동일하게 정리.
4. `src/llm/claude-code-cli.ts:35`: 위와 동일한 편집(대칭 위치).

**invariants**:
- `obsidianmd/no-unsupported-api`는 `src/**/*.ts` 전역에 대해 항상 error 등급으로 평가된다(성공기준 6이 회귀 검증).

- allowed-surface:
  - package.json
  - eslint.config.mjs
  - src/core/git-log.ts
  - src/llm/claude-code-cli.ts
  - pnpm-lock.yaml (의존성 변경에 따른 자동 갱신)
- refactor-scope:
  - (none) — 이번 WU는 lint 설정/의존성/disable-comment만 다루며 다른 코드 리팩터는 라이선스하지 않는다.
