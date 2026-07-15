# ExcaVelo

> English README: [README.md](README.md)

Claude 를 활용해 거친 메모를 구조화된 노트로 변환합니다. 사용 중인 Claude Code 로그인 (Pro/Max) 을 그대로 쓰거나, Anthropic API 키로도 동작합니다.

## 왜 쓰나요

회의 중 또는 머릿속에 떠오른 단편적인 메모를 휘갈겨 두고, 그걸 회의록 / 1:1 요약 / 결정 기록 / 직접 만든 템플릿으로 다듬고 싶을 때 — Obsidian 밖으로 나가서 별도 채팅 창에 복붙하지 않고도 처리하기 위해 만들어진 플러그인입니다.

ExcaVelo 는 아래 네 가지를 받습니다:

- 사용자가 미리 설정한 컨텍스트 (본인 정보, 팀, 프로젝트 등),
- 노트별 컨텍스트 (선택),
- **메모 본문** — ExcaVelo 가 다듬을 영역,
- 사용자가 고른 템플릿,

그리고 Claude 를 호출해 정돈된 구조화 노트를 만들어 줍니다. **메모 본문은 기본적으로 보존됩니다** (Replace 를 명시적으로 클릭한 경우만 덮어쓰여집니다).

## 빠른 시작

1. Obsidian 의 커뮤니티 플러그인에서 ExcaVelo 를 설치합니다 (개발 단계에서는 빌드 산출물을 직접 vault 에 복사하셔도 됩니다).
2. 인증 방식을 하나 고릅니다:
   - **Claude Code CLI (권장)** — 데스크톱에 Claude Code 를 설치하고 Pro/Max 로 로그인되어 있다면, 플러그인이 자동 감지해서 그대로 씁니다. API 키 필요 없음.
   - **Anthropic API 키** — `console.anthropic.com` 에서 발급받은 키를 설정에 붙여넣습니다. 토큰당 과금. 모바일에서도 동작합니다.
   - **OpenAI 호환 엔드포인트** — OpenAI 본가, Ollama, LM Studio, Groq, Together, OpenRouter 등 OpenAI Chat Completions 모양을 따르는 어디든 연결 가능.
3. 설정의 **Default context** 에 본인이 누구이고 무엇을 다루는지 한 문단 정도 적어 둡니다.
4. 기존 노트를 열어서 메모를 적거나, 또는 명령 팔레트에서 **ExcaVelo: New note from template** 을 실행해 `[!context]` 콜아웃 scaffold 가 미리 박혀 있는 새 노트를 생성합니다.
5. 명령 팔레트에서 **ExcaVelo: Transform note...** 를 실행합니다 (또는 좌측 리본의 마법봉 아이콘 클릭).
6. 템플릿을 고릅니다. 미리보기를 확인한 뒤 새 파일로 저장 / 아래에 추가 / 클립보드로 복사 중 선택합니다.

## 플러그인이 노트를 읽는 방식

ExcaVelo 는 프롬프트를 세 영역으로 나눠 LLM 에 보냅니다:

| 영역 | 출처 | 역할 | 변경 빈도 |
|---|---|---|---|
| **사용자 컨텍스트** (항상 적용) | Settings -> "Default context" | 본인 / 팀 / 업무에 대한 장기적 사실 | 거의 안 변함 |
| **노트별 컨텍스트** | 노트 본문 안의 `[!context]` 콜아웃 | 이 노트 한정 사실 (참가자, 일시, 주제 등) | 노트마다 다름 |
| **메모 본문** | 노트 본문 중 `[!context]` 콜아웃 **밖** 전체 | ExcaVelo 가 다듬을 본문 | 노트마다 다름 |

**메모 본문만** 변환됩니다. `[!context]` 안 내용은 LLM 이 배경 정보로 읽되 변환 결과에 직접 옮겨 적지는 않습니다.

예시:

```markdown
> [!context]
> 오늘은 인프라팀 시니어 박과의 1:1.
> 주제: 마이그레이션 리스크 평가.

- 마이그레이션 단계별 — 리스크
- A: 블루-그린, B: 점진식
- 박 선임은 B 선호 (롤백이 단순)
- 화요일까지 결정 필요
```

콜아웃 안 두 줄은 **노트별 컨텍스트**, 그 아래 네 개의 bullet 은 **메모 본문** 입니다. Settings 의 "Default context" 는 둘 위에 항상 추가됩니다.

만약 노트에 `[!context]` 콜아웃이 없으면 전체 노트가 메모 본문으로 처리됩니다. Settings 의 Default context 는 이 경우에도 적용됩니다.

팁: 긴 노트의 일부만 변환하고 싶으면 에디터에서 해당 영역을 선택한 뒤 Transform 을 실행하세요 — 선택 영역이 노트 전체보다 우선합니다.

매번 `[!context]` 콜아웃을 손으로 적기 번거롭다면 명령 팔레트의 **ExcaVelo: New note from template** 을 사용하세요. 콜아웃 scaffold 와 빈 자리 placeholder 가 박힌 새 노트가 자동 생성되어, 빈칸만 채우고 본문을 적으면 됩니다.

## 추가 입력 소스: STT 전사본과 git 히스토리

콜아웃 두 개로 변환에 소스 자료를 붙일 수 있습니다. 메모가 항상 우선하는 기록이고, 이 소스들은 메모가 빠뜨린 내용을 보충합니다.

**`[!stt]`** — 음성 인식(STT) 전사 파일을 연결합니다 (회의 녹음 등):

```markdown
> [!stt] [[2026-07-04 회의 녹취록]]
```

회의 템플릿들이 전사본에서 메모가 놓친 세부 사항, 수치, 결정을 복원합니다. 인식 오류와 잡담 처리는 내장 프롬프트 규칙이 담당하고, 메모와 충돌하면 메모가 이깁니다.

**`[!git]`** — 로컬 git 저장소의 커밋 히스토리를 변환에 공급합니다 (데스크톱 전용):

```markdown
> [!git] C:/git/project-a
> D:/git/project-b since:2026-06-26
```

한 줄에 저장소 하나씩, `since:` / `until:` 은 선택 (ISO 날짜, `today`, `7d`).

**작업은 기본 브랜치에 반영(landing)될 때 완료로 칩니다.** 브랜치에 커밋만 되어 있으면 완료가 아닙니다. ExcaVelo 는 기본 브랜치를 훑어 거기 도착한 것을 반영 건별로 한 섹션씩 보고하며, 날짜는 작업한 날이 아니라 **반영된 날**입니다. 아직 반영되지 않은 브랜치의 커밋은 그렇게 라벨링되고 완료 작업으로 쓰이지 않습니다. merge / squash / rebase 어느 방식이든 동작하며 설정할 것은 없습니다.

git 출력에서 복사한 브랜치 줄(`브랜치명  커밋제목`)을 메모에 붙여넣으면, ExcaVelo 가 그 브랜치명을 달고 있는 반영 건만 정확히 보고합니다 — 이슈당 브랜치 하나로 일하는 팀에 맞는 방식입니다. `work-report` 와 `work-log` 템플릿이 이 입력용으로 만들어졌습니다. (브랜치명은 팀이 merge 커밋으로 병합할 때만 히스토리에 남습니다. squash / rebase 방식이라 이름이 남지 않으면 반영 건 자체는 그대로 보고되지만 이름으로 좁히지는 못합니다.)

## 템플릿

템플릿은 vault 의 `excaVelo/templates/` 폴더 안에 있는 일반 markdown 파일입니다. 편집하고, 새로 만들고, 공유할 수 있습니다. 형식은 [`docs/templates-format.md`](docs/templates-format.md) 에 정리되어 있습니다. 처음 실행할 때 여덟 개의 스타터 템플릿이 자동 복사됩니다:

- `meeting` — 타팀·외부 미팅: 회의 목적, 핵심 논점, 확정 사항, 시사점, 액션 아이템
- `task-meeting` — 내부 실무 회의: 주제별 핵심 정리 (기술적 세부 유지), 결정, 미해결 질문
- `work-report` — git 히스토리 + 메모 기반 서술형 업무 보고 / 릴리스 노트
- `work-log` — git 커밋 기반 날짜별 업무내역 changelog, 비개발자 독자용
- `1on1` — 주제별 완전한 1:1 기록, 결정 사항, 추적 항목
- `daily-memo` — 하이라이트, 주제별 정리, 액션, 미해결 질문
- `decision-record` — ADR 양식의 결정 기록
- `brainstorm` — 클러스터링된 테마, 유력 후보, 다음 단계

출력은 **보존 우선(preservation-first)** 입니다: 메모의 모든 내용이 결과에 살아남습니다 (템플릿은 재구성하지, 요약으로 내용을 날리지 않습니다). 템플릿이 명시적으로 선별한다고 선언한 경우만 예외입니다 — 타팀 미팅용 `meeting` 템플릿이 그렇습니다. 템플릿마다 `model` frontmatter 로 모델을 고정할 수 있고, 설정에는 공급자별 모델 선택 UI 가 있습니다.

## 인증 경로

### Claude Code CLI (Claude Pro/Max 사용자 권장)

플러그인이 시스템에 설치된 `claude` CLI 를 서브프로세스로 띄웁니다. 인증은 Claude Code 자체가 관리 (`claude login`) 하므로 플러그인은 키를 보지 않습니다. 개인 Claude Pro 계정뿐 아니라 팀 단위로 공유하는 Claude Max 계정도 동일하게 동작합니다.

**필요 조건**: Claude Code 가 설치되고 로그인된 상태. 데스크톱 전용 — 모바일에서는 ExcaVelo 가 자동으로 Anthropic API 키 경로로 빠집니다 (사용자에게 한 번 알림이 표시됩니다).

**Anthropic 약관 관련**: 이미 로그인된 본인 소유의 `claude` CLI 를 띄우는 동작은 사용자가 직접 터미널에서 실행하는 것과 기계적으로 동일합니다. ExcaVelo 는 Anthropic 의 어떤 라이선스도 재배포하지 않으며 Anthropic 인증 정보를 저장하지도 않습니다. 다만 Claude Code 를 다른 도구의 백엔드로 쓰는 방식은 Anthropic 의 공식 문서가 다루는 사용 사례가 아닙니다 — 이 점을 인지한 상태에서 CLI 경로를 사용하시거나, API 키 경로를 선택하시면 됩니다.

### Anthropic API 키

표준 방식. `console.anthropic.com` 에서 키를 발급받아 설정에 붙여넣습니다. 토큰당 과금 — Claude.ai 구독과는 별도 청구입니다. 모바일/데스크톱 모두 동작합니다.

### OpenAI 호환 엔드포인트

OpenAI 본가, 그리고 OpenAI Chat Completions 형식을 따르는 어떤 로컬/호스티드 서버든 사용 가능 (Ollama, LM Studio, Groq, Together, OpenRouter, vLLM, Fireworks, Mistral 등).

## 프라이버시

- 사용자의 API 키 (사용할 경우) 는 Obsidian 플러그인 폴더 안의 `data.json` 에 로컬로 저장됩니다. 사용자가 설정한 공급자 외 어디로도 전송되지 않습니다.
- Claude Code CLI 경로를 쓰는 경우, 플러그인은 단순히 로컬 서브프로세스만 띄웁니다. 어떤 키도 토큰도 플러그인이 저장하지 않습니다.
- 텔레메트리, 분석, 원격 로깅 없음.
- 네트워크 요청은 **사용자가 transform 을 명시적으로 실행할 때만** 발생합니다 — 설치 시, 설정 화면 진입 시, vault 스캔 시에는 발생하지 않습니다.

## Wiki 통합

vault 루트에 `excavelo.json` 이 있으면, 플러그인이 LLM Wiki 구조 (`raw/`, `wiki/sources/` 등) 에 맞춰 출력 경로와 frontmatter 기본값을 자동 채워 줍니다. 설정 스키마는 [`docs/architecture.md`](docs/architecture.md) 참고.

## 개발

```
pnpm install
pnpm dev     # esbuild watch
pnpm build   # 프로덕션 빌드
```

pnpm 을 쓰며 `packageManager` 필드에 박제되어 있습니다. pnpm 이 없다면 `npm i -g pnpm` 또는 `corepack enable` 로 활성화하시면 됩니다.

빌드 산출물 (`main.js`, `manifest.json`, `styles.css`) 을 테스트용 vault 의 `.obsidian/plugins/excavelo/` 에 심볼릭 링크 (또는 복사) 하면 동작 확인이 가능합니다.

아키텍처 개요: [`docs/architecture.md`](docs/architecture.md).
공급자 구현 노트: [`docs/adapters.md`](docs/adapters.md).
템플릿 형식: [`docs/templates-format.md`](docs/templates-format.md).
개발자 스펙: [`CLAUDE.md`](CLAUDE.md).

## 라이선스

MIT. [`LICENSE`](LICENSE) 참고.
