---
status: confirmed
ceremony: standard
---
# Completeness verify chain — 변환→검증→조건부 보수 3단 프롬프트 체인

## §Why

- **Goal**: `prompt.ts` OUTPUT RULES의 completeness 계약("메모의 모든 사실은 출력에 나타나야 한다")을 프롬프트 요청에서 **검증되는 계약**으로 격상한다. 변환 → 검증(원본 대조, 누락 목록) → 조건부 보수의 3단 프롬프트 체인을 `TransformRunner.run()`에 삽입하고, 결과를 프리뷰 배지로 사용자에게 보인다. 이는 prd.md §Out of scope의 v1 유예("runtime verification of the completeness contract — prompt-level enforcement only for v1")를 명시적으로 해제하는 단위다 — 확정 시 prd.md decision-log에 해제를 append한다.
- **Non-goals**: `[!git]` 노트의 검증(스킵 — 선택-기준 예외를 오판한 보수가 날조 항목을 재주입하는 위험이 이득보다 큼, 후속 단위로 확장 가능) · 보수 후 재검증 루프 · 검증 전용 모델/프로바이더 설정 · 스트리밍 · regenerate 특수 처리(재진입으로 체인 자연 재실행) · repair 실패와 검증 실패의 배지 구분(둘 다 `verify-failed`로 병합 — 인지된 단순화).
- **Success criteria**:
  1. 검증 ON + 누락 없음 → 배지 "누락 0건 확인".
  2. 누락 있음 → repair 1회(입력에 원본 메모 포함), 배지 "N건 보수됨", 총 호출 ≤ 3.
  3. 검증 호출 실패·파싱 실패·repair 무효 출력 → 변환 결과 그대로 + 배지 "검증 실패" (repair 없음 또는 원 출력 유지).
  4. gitLog 존재 → 체인 미실행 + 배지 "검증 미적용".
  5. 토글 OFF → 기존과 동일한 단일 호출, 배지 없음.
  6. 프리뷰 메타의 토큰·비용은 체인 전 호출 합산.
- **Preservation contract** (brownfield):
  - 토글 OFF 경로와 gitLog 스킵 경로에서 기존 변환 흐름·출력·프리뷰 동작이 동일하게 유지된다.
  - 검증 단계의 어떤 실패도 변환 결과를 잃게 하지 않는다(**fail-open**) — 예외는 `run()` 밖으로 전파되지 않는다(변환 자체의 실패는 기존대로 전파).
  - `LlmProvider` 인터페이스와 기존 프롬프트 조립(`buildPrompt`)은 불변.
- **Refactor rationale**: 없음 — surgical insertion.

## §Spec

**설정**: `PluginSettings.verifyCompleteness: boolean`, 기본 `true`. 설정 탭에 토글 노출.

**체인 오케스트레이션** (`src/core/verify.ts` 신규, `TransformRunner.run()`에서 `provider.generate` 직후 호출):

- 실행 조건: `verifyCompleteness && !gitLog`. 미충족 시 결과 상태 — gitLog 존재: `skipped-git`, 토글 OFF: 상태 없음(배지 미표시).
- **검증 호출**: 입력 = 원본 메모(`rawBody`) + (`perNoteContext` 존재 시 포함) + (`transcript` 존재 시 전사 전문) + 변환 출력. 프로바이더·모델 = 변환과 동일(`resolveProvider(template)` 결과 재사용).
- **누락 판정 대상** (검증 프롬프트가 핀): 원본 메모의 모든 사실 + (`transcript` 존재 시) 전사의 **수치·이름·날짜·결정에 한정** — 잡담·손상 구간·전사 전용 부연은 누락 대상이 아니다(기존 메모-우선·잡담-제외·비추측 규칙 상속). *(spec-review는 메모-한정을 권했으나, 전사 핵심 사실 포함은 사용자 결정 — 범주 한정으로 잡담-재주입 위험을 막는다.)*
- **검증 응답 계약**: JSON 단일 객체 `{"missing": string[]}`. 각 항목은 **출처 사실을 그대로 담은 자체-완결 진술**(원문 인용 수준)이어야 한다 — repair가 이 목록만으로 날조 없이 보수할 수 있는 수준. 파싱 = 코드펜스 스트립 후 `JSON.parse`; `missing`이 문자열 배열이 아니면 파싱 실패.
- 분기:
  - `missing.length === 0` → 상태 `verified`.
  - `missing.length > 0` → **repair 1회**: 입력 = 원본 메모(`rawBody`) + 변환 출력 + 누락 목록, 출력 = 수정본 전체. 유효(코드펜스 스트립 후 비어있지 않음) → 출력 교체, 상태 `repaired`(건수 포함). repair 호출 실패 또는 무효 출력 → 원 출력 유지, 상태 `verify-failed`.
  - 검증 호출 실패·파싱 실패 → 상태 `verify-failed`, repair 없음.

**UI**: 프리뷰 모달에 상태별 i18n 배지(en/ko). 토큰·비용 메타는 체인 전 호출 합산. 상태바 busy는 기존 위치 그대로 체인 전체를 덮는다.

**Invariants**:
- 변환 1건당 LLM 호출 ≤ 3 (변환 + 검증 + repair).
- 검증·보수 경로의 실패는 `run()` 밖으로 예외를 전파하지 않는다.
- 검증·보수는 변환과 동일 프로바이더·모델을 쓴다.

**검증 수단**: `scripts/probe-verify-chain.mjs` — verify 응답 파싱(정상/펜스/비JSON/형 불일치), 체인 분기(verified/repaired/verify-failed/skip), repair 무효-출력 가드, 검증·repair 프롬프트 조립(누락 판정 대상 한정 문구, repair 입력에 rawBody 포함)을 단언하는 프로브(기존 `probe-git-log.mjs` 관례).

- allowed-surface:
  - src/core/verify.ts
  - src/core/transform.ts
  - src/types.ts
  - src/settings/settings.ts
  - src/settings/settings-tab.ts
  - src/ui/preview-modal.ts
  - src/main.ts
  - src/i18n/en.ts
  - src/i18n/ko.ts
  - styles.css
  - scripts/probe-verify-chain.mjs
  - docs/prd.md
  - docs/specs/completeness-verify-chain.md
- refactor-scope:
  - (none)
