---
status: confirmed
ceremony: trivial
---
# WU-5 — sentence-case UI 텍스트 4건

## §Why

`community-review-remediation-prd.md` §3 WU-5의 `obsidianmd/ui/sentence-case` 4건(`src/settings/settings-tab.ts`)을 처리한다. PRD 원안("명시적 disable 주석 + 사유로 처리")은 WU-3에서 실측 확인된 `eslint-comments/no-restricted-disable`(봇 메타룰이 `obsidianmd/*` 룰 전체의 disable-comment 자체를 금지) 때문에 그대로는 실행 불가 — 재검증 후 처리를 항목별로 나눈다. (1) `permissionMode` 드롭다운의 `addOption("default", "default")`/`addOption("bypassPermissions", "bypassPermissions")` 2건은 실측 결과 진짜 버그였다: 다른 모든 드롭다운(auth-method, cli.model 등)은 `t()` i18n 키로 라벨을 넣는데 이 두 옵션만 실제 API 값(첫 인자)과 표시 라벨(둘째 인자)에 같은 리터럴을 재사용하고 있었다 — `t()` i18n 키로 전환(기존 컨벤션을 따름)하면 값은 그대로 두고 라벨만 정상적인 문장 케이스가 되어 완전히 해소된다(실측: 0건). (2) `setPlaceholder("claude-sonnet-4-6")`/`setPlaceholder("sk-ant-...")` 2건은 진짜 오탐이다 — placeholder 자체가 실제 모델 id/API 키 접두사의 예시 값이라 라벨/값 분리가 불가능하고, 문구를 sentence-case로 바꾸면 예시 값이 왜곡된다(PRD의 우려와 동일). disable 주석이 막혀 있으므로 일반 코드 주석(disable 지시자 아님)으로 사유만 남기고 warning으로 수용한다 — PRD §2 성공기준 3도 애초에 "sentence-case 오탐의 명시적 disable 주석 제외"라고 sentence-case를 findings-0건 목표에서 이미 제외해뒀다.

성공 기준: `pnpm lint`/`pnpm build` 그린, 기존 `scripts/probe-settings-tab.mjs` 불변 통과(드롭다운 실제 값은 안 바뀜 — 라벨만 변경), 봇 룰셋 재현 프로브에서 sentence-case가 4건→2건으로 감소(나머지 2건은 문서화된 수용 잔여, warning이지 error 아님).

## §Spec

- allowed-surface:
  - src/settings/settings-tab.ts
  - src/i18n/en.ts
  - src/i18n/ko.ts

acceptance criteria:
1. `settings-tab.ts`의 `addOption("default", "default")` / `addOption("bypassPermissions", "bypassPermissions")` → `addOption("default", t("settings.cli.permission.option.default"))` / `addOption("bypassPermissions", t("settings.cli.permission.option.bypass"))`로 전환. 실제 드롭다운 값(`"default"`/`"bypassPermissions"`, 첫 인자)은 무편집.
2. `en.ts`/`ko.ts`에 `settings.cli.permission.option.default`/`settings.cli.permission.option.bypass` 키 추가.
3. `setPlaceholder("claude-sonnet-4-6")`, `setPlaceholder("sk-ant-...")` 두 곳에 사유를 설명하는 코드 주석 추가(eslint-disable 지시자 아님). 값 자체는 무편집.
4. 봇 룰셋 재현 프로브에서 sentence-case가 정확히 2건(두 setPlaceholder 지점)만 남고 addOption 2건은 사라짐 — 실측 확인됨.
5. `pnpm lint`/`pnpm build` 그린, `node scripts/probe-settings-tab.mjs` 전부 그린.

- refactor-scope:
  - (none)
