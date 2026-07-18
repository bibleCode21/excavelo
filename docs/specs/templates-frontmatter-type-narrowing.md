---
status: confirmed
ceremony: standard
---
# WU-4 — templates.ts frontmatter 타입 좁히기 (+ 특성화 테스트 신설)

## §Why

- **Goal**: `community-review-remediation-prd.md` §3 WU-4가 지목한 `@typescript-eslint/no-base-to-string` 10건(`src/core/templates.ts:111-136`, `frontmatter.X`가 `[object Object]`로 직렬화될 수 있다는 봇 지적)을 해소한다.
- **재검증 경위(중요 — PRD 진단 정정)**: PRD 원안은 이를 "실버그 클래스"("frontmatter.name 등이 object일 때 [object Object]로 직렬화되는 실제 버그")로 규정하고 "타입 내로잉(string 검증) 도입"을 제안했다. 실측 결과 이 진단은 틀렸다: `splitFrontmatter`/`parseYamlScalar`(`src/core/templates.ts`)는 정식 YAML 파서가 아니라 자체 구현한 "naive" 스칼라 파서(파일 자체 doc 주석: "Good enough for the templates we ship; swap to obsidian's metadataCache for richer needs")이고, 중첩 객체/배열 YAML 문법 자체를 읽지 못한다(한 줄짜리 `key: value` 정규식만 매치). `parseYamlScalar`의 반환 가능값은 정확히 `null | boolean | number | string`뿐이며, block scalar(`key: |`) 경로도 항상 string이다. 즉 `frontmatter.X`가 실제로 object가 되는 경로가 이 구현에는 없다 — no-base-to-string 10건은 `FrontmatterParsed.frontmatter: Record<string, unknown> | null`이라는 타입 선언이 실제 반환 가능 값 집합보다 넓게 선언되어 생긴 정적분석 오탐이다. 방향(타입 내로잉)은 맞았으나 형태는 다르다: 10곳의 개별 `String()` 호출부를 고치는 대신, 파서 함수들의 타입 시그니처 자체를 실제 반환값에 맞게 정직하게 좁힌다 — 더 적은 변경, 더 근본적인 수정(사용자 승인, 2026-07-18).
- **Non-goals**: `splitFrontmatter`/`parseYamlScalar`의 파싱 로직·동작 자체는 바꾸지 않는다(정식 YAML 파서로 교체하는 것은 이 work unit의 범위 밖). `parse()` 메서드 안의 10개 `String(frontmatter.X ?? ...)` 호출부 코드는 무편집.
- **Success criteria**: `pnpm build`(tsc) 그린, `pnpm lint` 그린, 봇 룰셋 재현 프로브(`eslint-plugin-obsidianmd` `configs.recommended` 전체 + `typescript-eslint` 8.64.0)에서 no-base-to-string 10건 findings 0건, 신설 특성화 프로브(`scripts/probe-templates.mjs`) 전부 green.
- **Preservation contract**: `TemplateRegistry.parse()`가 만드는 `Template` 객체의 필드 값은 타입 변경 전후로 100% 동일 — 런타임 로직은 한 글자도 바뀌지 않고 타입 선언만 실제에 맞게 좁아진다. `STARTER_TEMPLATES`(`src/core/starter-templates.ts`, 8개 번들 템플릿) 전부 기존과 동일하게 파싱되어야 한다.
- **Refactor rationale**: 해당 없음 — 리팩터가 아니라 타입 선언을 실제 동작에 맞게 정정하는 것(정적분석 오탐 해소).

`src/core/templates.ts`의 파싱 로직(`TemplateRegistry.parse()`, `splitFrontmatter`, `parseYamlScalar`)은 현재 어떤 자동 테스트로도 커버되지 않는다(`scripts/probe-git-log.mjs`, `scripts/probe-settings-tab.mjs` 둘 다 이 파일의 파싱 로직을 직접 실행하지 않음 — 확인됨). 거버닝 스펙 §9(TDD: seam이 있으면 우선 테스트)와 PRD 자체가 "템플릿 파싱 특성화 테스트 선행"을 명시하므로, 타입을 좁히기 전에 특성화 테스트를 먼저 작성한다.

## §Spec

`splitFrontmatter`/`parseYamlScalar`/`FrontmatterParsed`의 타입 시그니처를 실제 반환 가능 값 집합(`null | boolean | number | string`)에 맞게 좁힌다:
- `type FrontmatterScalar = string | number | boolean | null;` 신설.
- `FrontmatterParsed.frontmatter: Record<string, unknown> | null` → `Record<string, FrontmatterScalar> | null`.
- `splitFrontmatter` 내부 `const frontmatter: Record<string, unknown> = {};` → `Record<string, FrontmatterScalar>`.
- `parseYamlScalar(v: string): unknown` → `parseYamlScalar(v: string): FrontmatterScalar`.

신설 특성화 프로브(`scripts/probe-templates.mjs`, 기존 `scripts/probe-git-log.mjs`/`probe-settings-tab.mjs`와 동일한 esbuild+node:assert 패턴)가 타입 변경 **전에** 이미 green임을 먼저 확인(런타임 로직은 안 바뀌므로 이 프로브는 회귀 방지용이지 지금 fail하는 버그를 잡는 것이 아님), 그 다음 타입 변경 후에도 계속 green임을 확인한다. 최소 커버 표면:
1. 정상 frontmatter 파싱(문자열/숫자/불리언/null 값 각 1개 이상).
2. block scalar(`key: |`, `key: |-`) 파싱.
3. frontmatter 없는 파일 → `splitFrontmatter`가 `{frontmatter: null, body: raw}` 반환, `TemplateRegistry.parse()`가 `null` 반환.
4. `parse()`가 만드는 `Template` 객체의 필드 매핑 전부(10개 `String()` 호출부 각각이 좁혀진 타입에서도 올바른 문자열을 만드는지) — `name`/`description`/`descriptionKo`/`icon`/`model`/`outputFolder`/`outputFilename`/`newNoteFolder`/`newNoteFilename`/`newNoteScaffold`, 값이 없을 때(undefined/null) 각 필드의 fallback(`file.basename`, `""`, `undefined`, `null` 등)도 확인. 같은 좁혀진 `frontmatter` 객체를 `as`/`as never` 캐스팅으로 읽는 `hotkey`/`provider`/`output` 3개 필드도 함께 확인(String() 경유는 아니지만 §Why의 보존 계약이 "Template 객체의 필드 값 전부"를 약속하므로 범위에 포함).
5. `STARTER_TEMPLATES`(8개) 전부를 실제 raw 콘텐츠로 `parse()`에 먹여 전부 정상 파싱되는지(에러 없음, `name`이 빈 문자열이 아님 등 최소 sanity).

- allowed-surface:
  - src/core/templates.ts (타입 시그니처 3곳만 — `String()` 호출부 등 런타임 로직은 무편집)
  - scripts/probe-templates.mjs (신규)
- refactor-scope:
  - (none)
