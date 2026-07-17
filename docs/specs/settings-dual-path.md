---
status: confirmed
ceremony: standard
---
# `ExcaveloSettingTab`: dual-path 렌더링 — display() 폴백 + minAppVersion 1.5.0 복귀

상위 결정 기록: `docs/specs/urgent-compat-minappversion-prd.md` (approved, 2026-07-18).
실측 근거(공개 최신 1.12.7, no-unsupported-api 5개 사이트, requireApiVersion 가드
인식, display-deprecated 계열 룰의 minAppVersion 게이팅)는 전부 그 PRD §1이 소유하며
여기 재기술하지 않는다.

## §Why

- **Goal** — 공개 채널(Obsidian ≤1.12.7) 사용자가 이 플러그인을 설치·사용할 수 있게
  `minAppVersion`을 1.5.0으로 복귀시키면서, 1.13+ 사용자의 선언형 렌더링과 설정 검색
  노출(이전 계약의 성과)을 그대로 유지한다. 방법 = dual-path: 앱이 1.13+면 기존
  `getSettingDefinitions()` 선언형 경로, 미만이면 같은 정의 배열을 해석하는
  `display()` 폴백 — obsidian.d.ts:6633이 명시하는 공식 폴백 패턴이며, 봇 룰
  `settings-tab/require-display`가 minAppVersion<1.13에서 능동적으로 요구하는 형태다.

- **이전 계약 supersede** — 본 계약은 `settings-tab-declarative-definitions.md`
  (confirmed, `81510f9`)의 다음 조항을 명시적으로 대체한다. 그 계약 파일 자체는
  편집하지 않는다(편집은 confirmation을 무효화함 — 포맷 규범 §Frontmatter):
  - **SC2** ("display() 완전 제거") → 폐지. display()는 <1.13 폴백으로 재추가된다.
    SC2의 전제("모든 사용자가 1.13+")는 1.13.0이 미공개임이 실측되며 무너졌다.
  - **SC3** ("4곳 전부 `this.update()`") → `this.refresh()` (버전 분기 헬퍼)로 대체.
  - **SC4** 중 deprecated-display 계열 룰 0건 조항 → 해당 룰들은 minAppVersion<1.13
    에서 자체 비활성(룰 소스의 semver 게이트)이므로 기준 자체가 소멸. 잔여 조항
    (`prefer-setting-definitions` 0건)은 getSettingDefinitions 유지로 계속 충족.
  - 그 외 전 조항 — 특히 **Preservation contract 항목 1~13과 불변식 I1~I3 — 은
    전부 효력 유지**하며 본 계약이 참조로 상속한다(재기술하지 않음).

- **Non-goals** — `getSettingDefinitions()` 정의 트리의 구조 변경 없음(행 추가·삭제·
  재배열·i18n 키 변경 일체 없음 — 가드 치환은 기존 render/onChange 본문 내부에만);
  `versions.json` 수동 편집 없음(릴리즈 시 `version-bump.mjs`가 manifest에서 자동
  복사); 릴리즈(1.4.4)는 WU-7 소관; WU-3~6 findings 불가침; CI 변경 없음; 실기기
  QA는 CWU-2 소관(아래 잔여).

- **Success criteria**
  1. `manifest.json` `minAppVersion` == `"1.5.0"` (`version`은 1.4.3 유지).
  2. `pnpm lint` 0건 — 특히 `obsidianmd/no-unsupported-api`가 minAppVersion 1.5.0
     기준으로 0건 (PRD 실측의 5개 사이트가 전부 가드/치환으로 해소).
  3. `pnpm build` 그린.
  4. `node scripts/probe-settings-tab.mjs` 전 단언 통과 — §Spec의 프로브 개정 반영:
     기존 단언 매트릭스가 **두 렌더 경로 모두**에서 실행되고, 경로 간 스냅샷
     동등성 단언 포함.
  5. 봇 룰셋 재현 lint — SC1으로 manifest가 1.5.0이 된 상태에서, throwaway
     flat-config(커밋 안 함)로 `eslint-plugin-obsidianmd`의 아래 4개 룰만
     settings-tab.ts에 대해 error로 켜고 1회 실행한다. 4개 룰 모두 manifest의
     minAppVersion을 읽으므로(`resolveMinAppVersion` — 룰 소스 실측)
     **커뮤니티 봇이 제출된 1.5.0 매니페스트로 내리는 판정과 동일**하다:
     - (a) `settings-tab/require-display` 0건 — 룰 소스가 minAppVersion<1.13에서
       display() 부재를 발화(`requireDisplay.js` semverLt 게이트). 폴백 display()
       존재로 0. **판별적 단언**(폴백 누락 시 발화 → 진짜 검사).
     - (b) `settings-tab/no-deprecated-display` 0건·(c)
       `settings-tab/prefer-update-over-display` 0건 — 두 룰은 minAppVersion>=1.13
       에서만 발화(semverGte 게이트 — 룰 소스 실측)하므로 1.5.0에서 no-op.
       재추가한 display()/폴백 재렌더가 deprecated-family Recommendation을
       **유발하지 않는 탈출 경로의 재현**이다. no-op이라 코드와 무관하게 0인
       **비판별 단언**임을 명시 — 값의 의미는 "봇이 이 매니페스트에서 침묵함"의
       기록이지 코드 품질 판정이 아니다.
     - (d) `obsidianmd/no-unsupported-api` 0건 — SC2와 동일 근거(가드).
     그 외 recommended finding(sentence-case 등)은 이전 계약 Non-goals의 기존 64건
     이월분으로 **판정 제외**(config에 미포함).
  6. **잔여(이 계약이 검증하지 않는 것)**: 실제 Obsidian 1.12.7에서의 렌더·조작
     QA는 CWU-2(PRD §4)가 소유. 1.13.x 실기기는 미공개라 확보 불가 — 그 경로는
     "코드 무변경 + 프로브"가 근거이며 이는 수용된 잔여 리스크다(PRD §6).

- **Preservation contract** (brownfield)
  1. **1.13+ 경로 동작 동일**: `getSettingDefinitions()`가 반환하는 트리(행 구성·
     순서·name/desc·visible 조건·핸들러 효과)는 이전 계약 Preservation 항목 1~13
     그대로. 재렌더는 1.13+에서 여전히 `update()` 경유. `setDestructive()`는
     1.13+에서 여전히 적용됨(가드 안으로 이동할 뿐).
  2. **경로 간 동등성**: <1.13 폴백이 렌더하는 행 시퀀스(이름/desc/heading/컨트롤
     종류·상태)는 선언형 트리 해석 결과와 동일하다 — 프로브의 스냅샷 deepEqual로
     검증.
  3. 이전 계약 불변식 I1(필드 간 결합 없음)·I2(렌더는 무변이)·I3(세션 필드
     비영속) 계속 적용 — 프로브의 해당 단언은 무변경으로 계속 통과해야 한다.

- **Refactor rationale** — 없음. 순수 추가(display/refresh) + 기존 호출 지점의
  국소 치환. `refactor-scope` 비움(surgical 기본).

## §Spec

### display() 폴백 인터프리터

`ExcaveloSettingTab.display(): void` 재정의:
1. `this.containerEl.empty()`.
2. `this.getSettingDefinitions()` 반환 트리를 순회:
   - group/list 항목: `visible` 평가(함수면 호출, 기본 true) — false면 스킵;
     `heading`이 있으면 `new Setting(containerEl).setName(heading).setHeading()`;
     `items` 재귀.
   - leaf 항목: `visible` 평가 — false면 스킵; `new Setting(containerEl)`에
     `name`/`desc`가 정의된 경우만 각각 setName/setDesc 적용 후
     `item.render(setting)` 위임 (`group` 인자는 현 정의들이 사용하지 않음 —
     이전 계약 §Spec 참조).
   - `page` 항목: 미사용(이전 계약 §Non-goals) — 처리 없음.

의미론은 프로브의 기존 `walkDefinitions`(선언형 경로의 독립 오라클)와 동일해야
한다 — 단 프로브 쪽 코드를 공유하지는 않는다(프로브는 프로덕션과 독립된 오라클로
남는다).

### refresh() 헬퍼

`private refresh(): void { if (requireApiVersion("1.13.0")) { this.update(); } else { this.display(); } }`
— 기존 `this.update()` 4개 호출 지점(언어 변경·auth-method 변경·CLI 모델 드롭다운·
모델 목록 로드 성공)을 전부 `this.refresh()`로 치환. 가드 형태는 if-문 —
`no-unsupported-api`가 인식함이 실측된 형태(PRD §1.4). `requireApiVersion`은 현재
import(`App, Notice, PluginSettingTab`)에 없으므로 `"obsidian"`에서 추가한다(1행 —
allowed-surface 내, `setDestructive` 가드도 동일 심볼 사용).

### setDestructive 가드

`settings-tab.ts`의 update-starter 버튼(유일 사용처):
`if (requireApiVersion("1.13.0")) { b.setDestructive(); } else { b.buttonEl.addClass("mod-warning"); }`
— 1.13+는 기존 destructive 스타일 유지(보존), <1.13은 deprecated `setWarning()`이
적용하는 클래스(`mod-warning`)를 직접 부여해 deprecated API 호출 없이 동일한
시각 효과를 얻는다.

### manifest

`minAppVersion`: `"1.13.0"` → `"1.5.0"`. 다른 필드 무변경.

### 프로브 개정 (`scripts/probe-settings-tab.mjs`)

1. **스텁 확장**: `requireApiVersion(v)` export 추가 — 프로브가 토글하는 플래그
   (`__setApiVersionSupported(bool)`, 기본 true) 기반; `makeComponent`에
   `buttonEl` 기록 페이크(`addClass` 호출 기록) 추가.
2. **이중 경로 실행**: 기존 fixture 매트릭스(auth method ×3 · cliModelCustom ·
   modelLists 조합)와 구조 단언을 (a) 기존 선언형 walk 경로, (b) 플래그 false +
   `tab.display()` 직접 호출 경로 **양쪽에서** 실행. 각 fixture에 대해 두 경로의
   `snapshot()`이 deepEqual임을 단언(Preservation 2 — 단, `setDestructive`/
   `mod-warning`처럼 버전 분기가 의도된 필드는 명시적 예외로 각 경로의 기대값을
   따로 단언).
3. **SC2-recall 단언 반전**: "display 부재" 단언(`probe-settings-tab.mjs:542`)을
   "『display()가 함수로 존재』 + 플래그 false에서 폴백 렌더가 행을 생성"으로 교체.
4. **refresh 분기 단언**: 플래그 true에서 update()-site 핸들러가 `tab.update()`를
   호출(기존 SC3 단언 유지); 플래그 false에서 동일 핸들러가 display() 경로
   재렌더를 유발함을 최소 1개 사이트(auth-method 변경)에서 단언.
5. **destructive 분기 단언**: 플래그 true → `destructive === true`(기존 단언 유지);
   플래그 false → `buttonEl`에 `mod-warning` 클래스 기록.
6. 그 외 기존 단언(행동·보존·I1~I3)은 무변경 통과.

### 안전망 순서 (brownfield spine step 5)

기존 `probe-settings-tab.mjs`가 이미 커밋된 특성화 안전망이다(이전 계약 산출물).
본 작업의 순서: **프로브 개정을 먼저** 작성·실행하되, 이 시점에는 3·4·5의 신규
단언은 red(구현 전이므로)이고 기존 단언은 green이어야 한다 — 그 상태를 확인한 뒤
구현하고, 구현 후 전체 green. (프로브 개정과 구현은 같은 계약 아래 커밋 —
PROD_RE 테스트 예외 없음.)

### 불변식

- I1~I3: 이전 계약 것을 참조로 상속(§Why Preservation 3).
- **I4** — `getSettingDefinitions()` 반환 트리는 본 작업 전후로 구조 동일: 항목의
  추가·삭제·재배열 없음, name/desc/visible 무변경. 변경은 기존 render/onChange
  본문 내부의 가드 치환(§Spec "refresh() 헬퍼"·"setDestructive 가드" 절)에
  한정된다.

- allowed-surface:
  - src/settings/settings-tab.ts
  - scripts/probe-settings-tab.mjs
  - manifest.json
- refactor-scope:
  - (none)
