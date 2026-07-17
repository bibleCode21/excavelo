---
status: approved
type: umbrella-prd
date: 2026-07-18
approved: 2026-07-18 (사용자 승인 — 1.12.7 정렬 방침 확정)
---
# 긴급 호환성 PRD — minAppVersion 1.13.0 (미공개 버전) 해소

라이브 1.4.3의 `minAppVersion: 1.13.0`은 **아직 공개되지 않은 Obsidian 버전**을
요구한다. 공개 채널의 어떤 데스크톱 사용자도 1.4.2+ 를 설치·업데이트할 수 없고,
설령 minAppVersion만 내려도 1.12.7에서 설정 화면이 통째로 빈 화면이 된다(실기기
재현됨). 이 문서는 이 이슈 전용 PRD다 — 상위 우산 문서는
`community-review-remediation-prd.md`이며, 그 WU-3 이하는 본 PRD 완료 후 재개한다.

각 작업 단위(CWU)는 착수 시 `/brownfield`로 진입해 개별 work contract를 받는다 —
이 문서는 우산 문서이지 work contract가 아니다.

## 1. 진단 (전부 실측, 2026-07-18)

### 1.1 공개 최신은 1.12.7, manifest는 1.13.0을 요구

- `obsidianmd/obsidian-releases` GitHub releases "Latest" = **v1.12.7**
  (2026-03-23 릴리즈, 2026-07-18 재확인). 1.13.x 릴리즈 없음.
- `manifest.json` minAppVersion = **1.13.0** (1.4.2에서 상향, 커밋 `ba9b301` —
  1.4.1 봇 반려 "`setDestructive` requires v1.13.0, but minAppVersion is 1.5.0"
  대응). `versions.json`: 1.4.2/1.4.3 → 1.13.0, 1.4.1 이하 → 1.5.0.
- 결과: 공개 채널 사용자는 1.4.1에 묶여 있고, 1.4.2+ 의 수정 전부(다국어 개선,
  선언형 설정, WU-1 성과 포함)가 전달 불가.

### 1.2 1.13.0 의존은 정확히 두 겹

1. **`getSettingDefinitions()`** (WU-1 채택, 1.4.3 포함) — `display()`
   오버라이드가 없어 **1.12.7에서 설정 화면이 빈 화면**. 테스트 vault +
   사용자 실기기(1.12.7)에서 재현 확인됨.
2. **`setDestructive()`** — `settings-tab.ts:458` 한 곳 (`@since 1.13.0`).

### 1.3 봇 판정은 로컬에서 그대로 재현 가능 — 내리면 걸리는 곳은 5곳뿐

로컬 lint에 봇과 동일한 `obsidianmd/no-unsupported-api`(수신자 타입의 `@since` ↔
manifest minAppVersion 비교)가 이미 켜져 있다. **manifest를 1.5.0으로 임시
하향 후 실측**한 전체 인벤토리:

| 사이트 | API | 건수 |
|---|---|---|
| settings-tab.ts:55,85,137,327 | `SettingTab.update` (@since 1.13.0) | 4 |
| settings-tab.ts:456 | `ButtonComponent.setDestructive` (@since 1.13.0) | 1 |

그 외 0건 — `getSettingDefinitions()` **오버라이드 정의 자체는 룰이 잡지 않는다**
(호출이 아니므로). 즉 blast radius는 위 5곳이 전부다.

### 1.4 공식 탈출구 2개가 존재한다 — 딜레마는 실존하지 않았다

체크포인트가 제기한 딜레마(봇은 1.13.x 기준 ↔ 공개 채널은 1.12.7 — 내리면 봇
반려, 유지하면 전원 설치 불가)는 **양쪽을 동시에 만족하는 공식 경로가 있다**:

1. **display() 폴백은 타입 정의가 명시하는 공식 패턴이다** (obsidian.d.ts:6633):
   > "Not called when getSettingDefinitions returns a non-empty array; …
   > Only implement display() as a fallback for plugins that need to support
   > Obsidian versions older than 1.13.0."

   1.13+에서는 선언형 렌더러가 쓰이고 display()는 호출되지 않는다. <1.13에서는
   앱이 getSettingDefinitions를 모르므로 display()가 렌더한다. 충돌 없음.
2. **`requireApiVersion()` 가드는 no-unsupported-api 룰의 공식 인식 대상이다**
   (룰 소스 `noUnsupportedApi.js:149` `isGuardedByRequireApiVersion`).
   `requireApiVersion`은 `@since` 태그가 없어 그 자체는 걸리지 않는다
   (0.13.11부터 존재 — 1.5.0 하한에서 안전).

**실증**: minAppVersion 1.5.0 + `if (requireApiVersion("1.13.0")) this.update();`
가드 4곳 + setDestructive 치환 상태에서 `pnpm lint` **0건** (2026-07-18 프로브).

### 1.5 폴백 구현이 소형인 구조적 이유

WU-1의 정의 배열은 순수 선언이 아니라 전 항목이 `render(setting)` 콜백 기반이다.
따라서 display() 폴백은 옛 display 코드 부활(이중 유지보수)이 아니라 **같은
정의 배열을 순회하는 소형 인터프리터**로 충분하다: group이면 heading 렌더 후
items 재귀, item이면 `visible?.()` 평가 → `new Setting(containerEl)`에
name/desc 세팅 → `item.render(setting)` 위임. 설정 UI의 단일 소스
(정의 배열)가 유지된다. 예상 규모 ~40줄.

## 2. 결정

**dual-path 채택. 1.13.0 공개 대기 안 함, WU-1 되돌리기 안 함.**

- `getSettingDefinitions()` 유지 (1.13+ 선언형 + 설정 검색 노출 — WU-1 성과 보존).
- `display()` 폴백 인터프리터 추가 (<1.13 렌더).
- `this.update()` 4곳 → `refresh()` 헬퍼로 치환:
  `requireApiVersion("1.13.0") ? this.update() : this.display()` 형태
  (else 분기 필수 — <1.13에서 재렌더가 없으면 authMethod 전환 등이 반영 안 됨).
- `setDestructive()` → `requireApiVersion` 가드 + <1.13 폴백. 폴백 후보는
  `setWarning()`(deprecated, @since 0.11.0 — 사유 명시 disable) 또는
  `buttonEl.addClass("mod-warning")`. 선택은 CWU-1 work contract에서 확정.
- `manifest.json` minAppVersion → **1.5.0** (1.4.1까지 검증된 하한 — 봇이 1.4.1을
  setDestructive 단 1건으로 반려했다는 것 자체가 그 외 전부 1.5.0 이하라는 봇
  측 확인이다), `versions.json`에 1.4.4 → 1.5.0.

기각한 대안:
- **1.13.0 공개 대기**: 공개 시점 미상. 그동안 전 사용자가 1.4.1에 묶임. 기각.
- **WU-1 되돌리기(display만 유지)**: 1.13+ 사용자의 설정 검색 미노출 문제(원래
  WU-1의 §Why)가 재발하고, 1.13 공개 시 재작업 필요. 기각.
- **옛 display() 코드 부활을 폴백으로**: 설정 UI 소스가 둘로 갈라져 이후 모든
  설정 변경이 이중 작업. §1.5 인터프리터가 더 작고 단일 소스. 기각.

## 3. 목표와 성공 기준

**목표**: 공개 채널(1.12.7) 사용자가 다음 릴리즈를 설치하면 설정 UI를 포함한
전 기능이 동작하고, 동시에 봇 no-unsupported-api Error 0건.

1. `pnpm lint` 0건 — minAppVersion 1.5.0 상태에서 (§1.4에서 달성 가능성 실증됨).
2. `pnpm build` 그린.
3. `scripts/probe-settings-tab.mjs` 전 단언 통과 — 1.13 선언형 경로 보존 증명.
4. 실기기 1.12.7 (테스트 vault `excavelo-test-vault` 재사용): 설정 화면 렌더,
   값 변경·저장, authMethod 전환 시 항목 전환, Test Connection 동작.
5. 위 4와 함께 이월 QA 소화: WU-2 성공기준 7(Obsidian UI 경유 Test Connection),
   WU-1 잔여 QA(Test Connection/Open templates folder 라벨 표시).
6. `versions.json` 1.4.4 → 1.5.0 등재.

## 4. 작업 단위

### CWU-1 — dual-path 구현 (P0, brownfield)
`settings-tab.ts`: display() 인터프리터 + refresh() 헬퍼 + setDestructive 가드,
`manifest.json`/`versions.json` 하향. **보존 계약**: 1.13+ 선언형 경로의 동작
동일성(프로브가 안전망), 정의 배열 무변경 원칙(가드 치환 제외).

### CWU-2 — 실기기 QA (P0, CWU-1 직후)
성공 기준 4·5. 사용자 실기기 1.12.7 + 테스트 vault. 코드 무변경 예상 —
발견 시 CWU-1 브랜치에서 수정.

### 릴리즈 — 기존 WU-7(1.4.4)에 합류
사용자 결정("WU-2까지 끝내고 같이 내기") 유지하되, **본 PRD 산출물이 1.4.4의
선행 조건이 된다** — CWU-1 없이 1.4.4를 내면 minAppVersion 1.13.0이 그대로
릴리즈 라인에 남는다. 순서: CWU-1 → CWU-2 → (WU-2 브랜치 머지 포함) → 1.4.4.

## 5. Out of scope

- attestation Error 출처 규명 — 사용자 제공 정보(정확한 URL/스크린샷) 선행
  필요. 본 PRD와 독립적으로 진행 가능(우산 PRD §1.1 참조, 단 그 진단 중 케이싱
  가설은 재검증에서 흔들렸음 — 체크포인트 참조).
- WU-3~6 (본 PRD 완료 후 재개), WU-0(사용자 보류).
- 설정 UI 외 리팩터링 일체.

## 6. 리스크

- **봇의 deprecated 계열 Recommendation**: display() 오버라이드 정의나
  setWarning() 폴백 호출을 `no-deprecated`가 잡을 수 있다. 이는 1.4.1을 반려시킨
  버전 Error와 달리 **Recommendation 급**이며, 타입 정의 자신이 폴백 구현을
  지시하므로(§1.4) 사유 명시 disable로 정당화 가능. CWU-1에서 봇 룰셋 재현
  lint로 사전 실측할 것.
- **1.13 런타임 미검증**: 1.13.x 빌드를 구할 수 없어 선언형 경로는 런타임
  검증 불가. 단 해당 경로는 코드 무변경(가드 치환 제외)이고 프로브가 정적
  안전망. `refresh()`의 1.13 분기(`update()` 호출)는 기존 동작과 동일 코드.
- **requireApiVersion의 런타임 신뢰성**: 봇 룰이 공식 인식하는 가드이므로 심사
  리스크는 낮으나, <1.13 실기기에서 폴백 분기가 실제로 타는지는 CWU-2 QA로 확증.
- **<1.13 재렌더 UX**: refresh()의 display() 폴백은 전체 재렌더 — 포커스가
  풀린다. 이는 1.4.1까지의 기존 display() 동작과 동일(회귀 아님, 1.13+ 미해당).
