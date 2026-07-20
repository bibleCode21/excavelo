---
status: confirmed
ceremony: standard
---
# minAppVersion 1.8.7 상향 — i18n localStorage 폴백 제거

커뮤니티 심사의 Local Storage 경고("Persists data in localStorage or
sessionStorage instead of the Obsidian plugin data APIs") 대응.

## §Why

- **Goal** — `manifest.json`의 `minAppVersion`을 1.5.0 → **1.8.7**로 올려
  `src/i18n/index.ts`의 `window.localStorage.getItem("language")` 폴백을 제거한다.
  1.8.7은 `getLanguage()`의 `@since`이므로 이 값이 경고 해소의 하한이다. 결과로
  플러그인의 localStorage 참조가 0건이 되고(`obsidianmd/prefer-get-language`
  lint 경고도 함께 소멸), 언어 감지 분기 하나가 사라진다.

  경고 문구의 전제는 이 플러그인에 애초 성립하지 않는다 — 실측상 localStorage
  사용처는 1곳뿐이고 그것도 Obsidian 자체 언어 키 *읽기*이며, `setItem`/
  `removeItem`/`clear` 호출은 0건이고 플러그인 데이터는 전부
  `loadData()`/`saveData()`로 영속된다. 본 작업은 "잘못된 저장을 고치는 것"이
  아니라 **경고가 발화할 표면 자체를 없애는 것**이다.

- **이전 계약 supersede** — 본 계약은 `settings-dual-path.md`(confirmed,
  `1365658`)의 다음 조항을 명시적으로 대체한다. 그 계약 파일 자체는 편집하지
  않는다(편집은 confirmation을 무효화함 — 포맷 규범 §Frontmatter):
  - **SC1** (`minAppVersion == "1.5.0"`) → `minAppVersion == "1.8.7"`로 대체.
    SC1의 목적(공개 채널 사용자가 설치·사용 가능할 것)은 유지된다 — 공개 최신은
    1.12.7이고 1.8.7은 그보다 낮으므로 현행 사용자는 전원 충족한다.
  - **SC2** (``pnpm lint`` 0건 — 특히 `no-unsupported-api`가 **minAppVersion
    1.5.0 기준**으로 0건) → 본 계약의 **SC3 + SC7**로 대체. 두 부분이 모두
    갱신된다: 판정 기준이 1.8.7로 이동하고, "0건"이라는 총량 표현은 실태와
    맞지 않는다 — 1.5.0 시점에도 warning 4건이 실재했고(본 계약 §Non-goals의
    기존 수용분), 본 계약은 error 0 / warning 3으로 명시한다.
  - **SC5의 서문** ("SC1으로 manifest가 1.5.0이 된 상태에서 … 커뮤니티 봇이
    제출된 **1.5.0 매니페스트**로 내리는 판정과 동일하다") → 같은 문장을
    1.8.7 매니페스트 기준으로 재기술한 것으로 대체. 판정 항목 자체는 살아
    있으나 그 의미를 부여하는 서문이 구 리터럴에 고정돼 있었다: (a)는 본 계약
    SC8로, (d)는 SC7로 각각 새 기준에서 재확인되고, (b)/(c)는 아래대로 여전히
    no-op이다.
  - 그 외 전 조항 — 특히 **Preservation contract 1~3, 불변식 I1~I4, SC5의
    판정 (b)/(c) — 은 전부 효력 유지**하며 본 계약이 참조로 상속한다.
    근거: 세 settings-tab 룰은 `DECLARATIVE_MIN_VERSION = "1.13.0"` 게이트를
    쓰므로(`settingsTab/shared.js` 실측) 1.8.7은 1.5.0과 동일 구간에 있고,
    dual-path 설계는 1.13 경계에만 의존한다. (b)/(c)는 그 구간에서 계속
    비활성이므로 비판별 단언이라는 성격까지 그대로 상속된다.

- **Non-goals** — `versions.json` 수동 편집 없음(릴리즈 시 `version-bump.mjs`가
  manifest에서 자동 복사); `CHANGELOG.md` 미편집(릴리즈 단위 소관 — 1.4.1~1.4.6의
  지배적 관례); dual-path 렌더링 설계 무변경(`settings-tab.ts:75` `refresh()`와
  `:516` `setDestructive` — `requireApiVersion("1.13.0")` 분기 **2곳**, 실측,
  전부 불가침); 릴리즈 자체는 별도 단위; 잔여 lint warning 3건
  (`no-deprecated` display·`ui/sentence-case` ×2) 불가침; i18n 특성화 프로브
  신설하지 않음(사유는 Preservation 1).

- **Success criteria**
  1. `manifest.json` `minAppVersion` == `"1.8.7"` (`version`은 무변경).
  2. `src/i18n/index.ts`에 `localStorage` 참조 0건이고, `detectLocale()`이
     `getLanguage()`를 버전 분기 없이 호출한다.
  3. `pnpm lint` — **0 error**, warning 3건(`prefer-get-language`가 소멸해
     4→3). 잔여 3건은 Non-goals의 기존 수용분.
  4. `pnpm build` 그린.
  5. `node scripts/probe-settings-tab.mjs` 전 단언 통과 — SC1 단언의 기대값이
     1.8.7로 갱신된 상태에서.
  6. `node scripts/probe-git-log.mjs`·`node scripts/probe-templates.mjs`
     **무변경 통과**(이 작업이 두 프로브의 대상 표면을 건드리지 않음의 증명).
  7. `obsidianmd/no-unsupported-api` 0건 — minAppVersion 1.8.7 기준.
     **판별적 단언**: 뮤테이션(§Spec)으로 발화 가능함을 증명한다.
  8. `obsidianmd/settings-tab/require-display` 0건 — 1.8.7 < 1.13이라 룰은
     **여전히 활성**이며 폴백 `display()` 존재로 충족. 이는 이전 계약
     SC5(a)를 새 기준에서 재확인하는 **상속 판정**이지 본 변경이 위태롭게
     하는 항목이 아니다 — `display()`는 allowed-surface 밖이라 손대지 않으며,
     룰의 활성 여부는 게이트 비교(1.8.7 < `DECLARATIVE_MIN_VERSION`)로 이미
     결정된다. 별도 뮤테이션을 구현 단계의 요구사항으로 두지 않는다.
  9. **잔여(이 계약이 검증하지 않는 것)** — Obsidian이 로드 시 `minAppVersion`을
     강제한다는 전제 위에 Preservation 1의 "지원 범위"가 정의된다. 공식 채널
     사용자는 `versions.json`이 1.4.6으로 붙잡아 주지만, **채널 밖 설치**(수동
     복사, BRAT 등)로 1.8.7 미만에 새 버전이 올라간 경우는 이 전제 밖이다 —
     `getLanguage`가 없어 TypeError가 나고 `detectLocale()`의 기존 `catch`에
     삼켜져 **비영어 사용자가 조용히 `"en"`을 보게 된다**(크래시는 없음).
     이는 수용된 잔여 리스크로 기록하며, 이 계약은 그 경로를 검증하지 않는다.

- **Preservation contract** (brownfield)
  1. **지원 범위 전체에서 언어 감지 동작 동일** — 변경 전 식은
     `requireApiVersion("1.8.7") ? getLanguage() : localStorage…`였고, 새 하한
     아래에서는 이 조건이 **항상 참**이다. 즉 남는 경로는 기존 true-branch
     그대로이며, 제거되는 것은 새 하한에서 도달 불가능해진 false-branch뿐이다.
     보존이 코드 동일성으로 증명되므로 특성화 테스트를 신설하지 않는다.
  2. `t()` / `currentLocale()` / `setLocaleOverride()`의 시그니처와 동작 무변경.
     로케일 오버라이드 우선순위, `navigator.language` 폴백, 최종 `"en"` 폴백,
     `try`/`catch` 구조 전부 그대로.
  3. `settings-dual-path`의 Preservation 1~3 및 I1~I4 계속 적용 — 본 작업은
     `settings-tab.ts`를 편집하지 않으며(allowed-surface 밖) 1.13 경계를
     넘지 않는다.

- **Refactor rationale** — 없음. 분기 제거는 하한 상향의 직접 귀결이지 별도
  리팩터가 아니다. `refactor-scope` 비움(surgical 기본).

## §Spec

### manifest

`minAppVersion`: `"1.5.0"` → `"1.8.7"`. 다른 필드 무변경.

### i18n 언어 감지 (`src/i18n/index.ts`)

1. import에서 `requireApiVersion` 제거 — `import { getLanguage } from "obsidian";`
   (이 파일의 유일한 사용처가 사라지므로 남기면 미사용 import).
2. `detectLocale()`의 삼항식과 그에 붙은 3줄 오탐-설명 주석을
   `const raw = getLanguage();` 한 줄로 대체.
3. 파일 상단 docstring의 locale 감지 순서 서술에서 `<1.8.7` 폴백 문장을 제거하고
   `getLanguage()`를 무조건 경로로 기술.
4. 그 외(오버라이드 분기, `navigator` 폴백, `"en"` 폴백, `try`/`catch`) 무변경.

### 프로브 개정 (`scripts/probe-settings-tab.mjs`)

1. SC1 단언의 기대값 `"1.5.0"` → `"1.8.7"`, 단언 이름도 함께 갱신.
2. **같은 단언에 결합 사유 주석 추가** — 1.8.7이 `getLanguage()`의 `@since`이며
   `src/i18n`이 이를 무조건 호출하므로, 이 값을 낮추면 `getLanguage`가 없는
   빌드에서 예외가 `detectLocale()`의 `catch`에 삼켜져 **비영어 사용자가 조용히
   `"en"`으로 떨어진다**는 것, 따라서 낮출 때는 localStorage 폴백 복원과 한
   단위로 움직여야 한다는 것을 명시. 새 단언은 만들지 않는다 — 값을 낮추는
   행위 자체는 이 단언이 이미 잡으므로 보호 범위가 동일하고, 기록은 핀이 있는
   자리에 남는 편이 낫다.
3. 그 외 단언 무변경.

### 판별성 증명 (뮤테이션 체크)

SC7의 "0건"이 룰 비활성으로 인한 비판별 단언이 아님을 증명한다. 뮤테이션은
검증용 일시 변경이며 **커밋하지 않는다**.

- **뮤테이션 M** (allowed-surface 내부) — 구현 완료 상태에서 `manifest.json`의
  `minAppVersion`만 `"1.5.0"`으로 되돌린다 → `no-unsupported-api`가
  `'getLanguage' requires Obsidian v1.8.7, but minAppVersion is 1.5.0`
  (`src/i18n/index.ts`)로 발화해야 한다. 1.8.7로 원복하면 0건 복귀.

  이 뮤테이션을 택한 이유: ① 두 파일 모두 allowed-surface 안이라 불가침 표면을
  건드리지 않는다, ② **이 변경이 실제로 무가드로 만든 바로 그 호출**을 대상으로
  하므로 SC7의 판별성을 직접 증명한다(다른 파일의 다른 API를 건드리는 대리
  증명이 아니다), ③ 동시에 I5 트립와이어의 실동작 시연이 된다 — 한쪽만
  되돌리면 error가 난다는 것이 곧 I5의 강제 메커니즘이다.

### 롤백 경로

`minAppVersion`을 1.5.0 이하로 되돌릴 경우 `src/i18n/index.ts`의 localStorage
폴백도 **함께** 복원해야 한다(Preservation 1의 역방향). 두 방향의 강제 수단이
비대칭이며, 그게 의도된 배치다:

- **위험한 방향**(하한만 낮춤 — 비영어 사용자가 조용히 `"en"`으로 떨어지는
  경로)은 이중으로 잡힌다: 프로브 SC1 단언 실패 + `no-unsupported-api`가
  **error**로 발화(I5·뮤테이션 M). `pnpm lint`가 깨지므로 CI도 멈춘다.
- **무해한 방향**(i18n에 폴백만 되살림)은 `prefer-get-language` **warning**만
  남기며, `pnpm lint`는 `eslint src --ext .ts`로 `--max-warnings`가 없어
  CI는 통과한다. 이 경우 생기는 것은 도달 불가능한 죽은 분기일 뿐 동작
  결함이 아니므로 hard-fail 대상으로 두지 않는다.

공개 채널 사용자에 대한 영향: Obsidian 1.8.7 미만 사용자는 `versions.json`의
`"1.4.6": "1.5.0"` 항목에 걸려 **excaVelo 1.4.6을 계속 서빙받는다**(설치 차단이
아니라 버전 고정 — Obsidian이 manifest의 minAppVersion 미충족 시 versions.json에서
호환 최신본을 찾는 동작). 되돌리려면 manifest 복원 후 재릴리즈가 필요하다.

### 불변식

- **I5** — `src/i18n/index.ts`는 `@since`가 `manifest.json`의 `minAppVersion`을
  초과하는 Obsidian API를 **무가드 경로에서 호출하지 않는다.**

  이는 `no-unsupported-api`가 계산하는 바로 그 술어이므로(`noUnsupportedApi.js`
  `:117` `gt(sinceVersion, minAppVersion)` → 가드 미검출 시 error) **SC7이 이
  불변식의 자동 검증기**다. 두 파일 중 어느 쪽을 단독으로 바꾸든 — 하한을
  낮추든, 더 높은 `@since` API를 무가드로 들여오든 — 같은 error로 잡힌다.
  뮤테이션 M이 그 발화를 실증한다.

- allowed-surface:
  - manifest.json
  - src/i18n/index.ts
  - scripts/probe-settings-tab.mjs
- refactor-scope:
  - (none)
