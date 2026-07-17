---
status: draft
type: umbrella-prd
date: 2026-07-17
---
# 커뮤니티 플러그인 심사 실패 대응 PRD

Obsidian 커뮤니티 플러그인 심사(1.4.3)가 Error 2종 + Warning/Recommendation 다수로
실패했다. 이 문서는 2026-07-17 전수조사 결과와 그에 근거한 작업 단위(WU) 분해다.
각 WU는 착수 시 `/brownfield`(보존 의무 있음) 또는 `/greenfield`로 진입해 개별
work contract를 받는다 — 이 문서는 우산 문서이지 work contract가 아니다.

## 1. 진단 요약 (전수조사 결과, 2026-07-17)

### 1.1 Attestation Error — **코드 문제가 아니다**

심사 리포트: "The `main.js`/`styles.css` release asset has an attestation that
failed cryptographic verification. … its signature is invalid or does not match
this repository."

실측 (로컬 재검증):

- 1.4.3 릴리즈 자산 3종을 내려받아 `gh attestation verify` 실행 → **3파일 모두
  통과** (exit 0, sha256 digest 일치, sigstore 서명·인증서 체인 유효).
- 자산 업로더는 `github-actions[bot]`, attestation을 만든 바로 그 워크플로우 런
  (run 29511325162)이 업로드. 재업로드·수동 교체 흔적 없음.
- 인증서 SAN: `https://github.com/bibleCode21/excavelo/.github/workflows/release.yml@refs/tags/1.4.3`.

**발견된 유일한 불일치**: 커뮤니티 등록부(`obsidianmd/obsidian-releases`의
`community-plugins.json`) 항목이 `"repo": "biblecode21/excavelo"` — 실제 repo
canonical 명은 `bibleCode21/excavelo` (GitHub API `full_name` 확인). GitHub
URL은 대소문자 무시라 다운로드는 되지만, 봇이 attestation 인증서의 repo 정체성
문자열을 등록부 문자열과 **대소문자 구분 비교**하면 정확히 "does not match this
repository"로 실패한다. `gh` CLI는 `(?i)` 정규식이라 로컬에선 통과 — 봇은 자체
sigstore 검증(비공개 코드)을 쓰는 것으로 보인다.

- 확증 한계: 봇 검증 코드는 비공개. 다만 암호학적 검증이 전부 통과하는 상태에서
  발견된 불일치는 케이싱 하나뿐이다.
- manifest.json이 에러에 없는 것과도 정합: 봇은 release 자산 중 main.js /
  styles.css만 attestation 검증 대상으로 삼는 것으로 보임.

**조치 (WU-0)**: obsidian-releases는 외부 PR을 더 이상 받지 않으므로(정책 변경,
2026-07-17 확인 — OAuth 토큰의 PR 생성도 조직 차원에서 차단됨) 등록부 쪽은 고칠
수 없다. 남은 자력 경로는 **우리 쪽 canonical 케이싱을 등록부에 맞추는 것**:
GitHub 계정명을 `bibleCode21` → `biblecode21`로 변경(케이스만 변경, 셀프서비스,
구 URL은 GitHub이 리다이렉트). 변경 후 만들어지는 릴리즈의 attestation 인증서
SAN이 소문자 정체성으로 발급되어 등록부 문자열과 일치한다. 기존 릴리즈(1.4.3
이하)의 attestation은 구 케이싱으로 서명돼 있으므로 **변경 후 새 릴리즈(1.4.4)가
있어야 검증이 맞아떨어진다** — WU-7과 순서 결합. 이후에도 실패가 재현되면
Obsidian 지원 채널로 검증 로그 요청.

### 1.2 `display` deprecated (Error급 Recommendation) — **이미 수정 완료, 미배포**

`src/settings/settings-tab.ts`의 4개 사이트. 본 브랜치
(`feature/settings-declarative-definitions`)에서 `getSettingDefinitions()` 채택
완료(커밋 59186e3, 특성화 프로브 + recall 테스트 포함). 심사가 본 것은 이 수정
이전의 1.4.3 릴리즈다. **머지 + 릴리즈만 남음.**

### 1.3 봇의 `no-unsafe-assignment`/`no-unsafe-call` 수십 건 — 원인은 `require()`

봇이 지목한 라인(claude-code-cli.ts:32-35, git-log.ts:106-108 및 그 사용처)은
정확히 `nodeApis()`의 `require("child_process" | "fs" | "path" | "os")` 라인과
그 반환값 사용처다. 봇 환경은 `@types/node` 없이 린트하므로 `require`가
error-typed → 사용처 전체로 캐스케이드. 로컬(타입 정보 있음) 재현에서는 no-unsafe
0건으로 실증했다. **`require()` 제거(WU-2)가 이 캐스케이드 전체를 근본 해소한다.**

### 1.4 봇 룰셋 전수 인벤토리 (obsidianmd recommended + typed rules 로컬 재현)

no-undef·no-unsafe 캐스케이드(위 1.3에 종속)를 제외한 실질 findings:

| 규칙 | 건수 | 파일 | 처리 WU |
|---|---|---|---|
| `obsidianmd/no-nodejs-modules` | 7 | claude-code-cli.ts, git-log.ts | WU-2 |
| `@typescript-eslint/no-require-imports` | 7 | 〃 | WU-2 |
| `@typescript-eslint/no-base-to-string` | 10 | templates.ts:111-136 | WU-4 |
| `obsidianmd/prefer-window-timers` | 4 | claude-code-cli.ts, git-log.ts | WU-3 |
| `obsidianmd/ui/sentence-case` | 4 | settings-tab.ts | WU-5 |
| `obsidianmd/prefer-get-language` | 1 | i18n/index.ts:34 | WU-3 |
| `@typescript-eslint/prefer-promise-reject-errors` | 1 | git-log.ts:133 | WU-3 |
| `@typescript-eslint/only-throw-error` | 1 | git-log.ts:166 | WU-3 |
| `@typescript-eslint/no-unnecessary-type-assertion` | 1 | git-log.ts:608 | WU-3 |
| `@typescript-eslint/restrict-template-expressions` | 1 | main.ts:160 | WU-3 |

### 1.5 정당화로 수용할 Warning (코드 무변경)

- **Shell Execution / Direct Filesystem Access**: Claude Code CLI 통합과 git-log
  컨텍스트 추출의 본질. 모든 호출처는 `Platform.isMobile` 가드 뒤에 있고(실측:
  main.ts:139, claude-code-cli.ts:343·414·438, git-log.ts:508), API-key 경로는
  모바일에서 Node API 없이 동작한다(`isDesktopOnly: false` 유지 근거). 심사
  응답/README에 사유 명시.
- **Clipboard Access**: preview의 "copy" 액션(main.ts:342) 그 자체가 기능.
  쓰기 전용(`writeText`), 읽기 없음.
- **Local Storage**: 유일한 사용처는 Obsidian 자체 언어 키 *읽기*(i18n).
  WU-3의 `getLanguage()` 전환으로 소멸 → 수용이 아니라 해소된다.

## 2. 목표와 성공 기준

**목표**: 커뮤니티 심사 재통과 — Error 0건, 해소 가능한 Warning 전부 해소,
잔존 Warning은 문서화된 정당화 첨부.

1. WU-0(계정 케이싱 변경) + WU-7(새 릴리즈) 후 심사 대시보드에서 attestation
   Error 소멸.
2. 새 릴리즈(1.4.4)에서 `display` deprecated 지적 소멸.
3. 봇 룰셋 재현 린트(1.4에 사용한 구성) 실행 시 findings 0건
   (sentence-case 오탐의 명시적 disable 주석 제외).
4. 기존 특성화 프로브 전부 통과 (`scripts/probe-settings-tab.mjs`,
   `scripts/probe-git-log.mjs`) — CLI/git 동작 보존 증명.
5. `pnpm build` + `pnpm lint`(확장된 룰셋) 통과, CI 그린.

## 3. 작업 단위 (우선순위 순)

### WU-0 — 계정 케이싱 정렬 (P0, 코드 외, 사용자 액션)
등록부 PR이 불가하므로(§1.1) GitHub 계정명을 `biblecode21`(소문자)로 변경 —
GitHub Settings → Account → Change username. 사용자 본인만 수행 가능. 부수 정리:
`manifest.json`의 `authorUrl`·`author` 케이싱, 로컬 git remote URL(리다이렉트로
동작은 하나 정리 차원). 검증: WU-7 릴리즈의 attestation SAN이
`github.com/biblecode21/excavelo`로 발급되고 심사 재실행에서 Error 소멸.

### WU-1 — settings 브랜치 마무리·머지 (P0, 진행 중)
`feature/settings-declarative-definitions`를 `/safe-merge`로 main에.
`display` 4건 해소분이 릴리즈 라인에 오른다.

### WU-2 — Node API 접근 재구조화 (P1, brownfield)
`nodeApis()`의 `require()` → 룰 가이드가 지시하는 `Platform.isDesktopApp` 가드
동적 import 패턴. 대상: claude-code-cli.ts, git-log.ts. 해소:
no-nodejs-modules 7 + no-require-imports 7 + 봇 no-unsafe 캐스케이드 전체.
**보존 계약 필수**: CLI provider·git-log의 동작 동일성 — 기존 프로브 2종이
특성화 안전망. mobile에서 번들 평가 시 Node 내장 참조가 평가되지 않아야 한다는
기존 불변식 유지(현 lazy-require의 존재 이유).

### WU-3 — 소규모 API 정합 8건 (P1, 소형)
`getLanguage()` 전환(1) · `window.setTimeout/clearTimeout`(4) ·
reject/throw에 Error 객체(2) · 불필요 assertion 제거(1) ·
템플릿 표현식 타입(1). 각각 국소 수정, 기존 테스트로 검증.

### WU-4 — templates.ts frontmatter 문자열화 10건 (P2, 실버그 클래스)
`frontmatter.name` 등이 object일 때 `"[object Object]"`로 직렬화되는 실제 버그
표면. frontmatter 필드의 타입 내로잉(string 검증) 도입. 템플릿 파싱 특성화
테스트 선행.

### WU-5 — sentence-case 4건 판정 (P2)
대상 문자열은 `claude-sonnet-4-6`(placeholder), `default`/`bypassPermissions`
(API enum 값), `sk-ant-...`(placeholder) — 룰의 교정 제안("Bypasspermissions")이
무의미한 **오탐**. 명시적 disable 주석 + 사유로 처리(문구 변경은 API 값 왜곡).

### WU-6 — lint 패리티: 로컬/CI 룰셋을 봇과 일치 (P2, 이월 항목 4와 동일)
`eslint.config.mjs`를 obsidianmd `recommended` + typed no-unsafe 룰로 확장,
CI의 `pnpm lint`가 그대로 강제. WU-2~5 완료 후 0건 상태에서 스위치 온.
1.4.1("검사가 없어서"), 이번 건("검사가 로컬과 심사에서 달라서")의 재발 방지.

### WU-7 — 릴리즈 1.4.4 + 재심사 (P0 마감)
WU-1~5 머지 후 태그. attestation 워크플로우는 현행 유지(문제 없음이 실증됨).

## 4. Out of scope

- 이월 항목 2(프로브 CI 등재 — A14 타이밍 이슈 선결 필요), 3(`PROD_RE` 결정 —
  보안 게이트 입력, 사용자 판단 대기).
- obsidianmd 룰 외 리팩터링 일체. 기존 표면은 surgical 원칙 유지.

## 5. 리스크

- WU-0 가설이 틀렸을 경우(봇이 다른 이유로 실패): 계정명 케이스 변경은
  리다이렉트가 보장되고 언제든 되돌릴 수 있는 저비용 조치이며, 어차피 canonical
  케이싱과 등록부의 불일치는 사실이므로 정렬 자체에 손실이 없다. 1.4.4 재심사에서
  실패가 재현되면 Obsidian 지원 문의로 전환.
- WU-2는 CLI 실행·프로세스 트리 킬·타임아웃 등 민감 표면 — 프로브가 안전망이나
  실기기 수동 QA(§WU 계약에서 정의)를 생략하지 않는다.
