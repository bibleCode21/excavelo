const ko: Record<string, string> = {
  // Commands
  "command.transform-note": "노트 변환...",
  "command.transform-default": "기본 템플릿으로 변환",
  "command.new-note-from-template": "템플릿으로 새 노트 만들기",
  "command.open-templates-folder": "템플릿 폴더 열기",

  // Ribbon + context menu
  "ribbon.transform-note": "ExcaVelo: 노트 변환",
  "menu.transform-note": "ExcaVelo: 노트 변환",

  // Status bar
  "status.ready": "ExcaVelo: 대기 중",
  "status.thinking": "ExcaVelo: 생성 중...",

  // ChooserModal
  "chooser.placeholder.transform": "변환에 사용할 템플릿 선택",
  "chooser.placeholder.new-note": "새 노트의 시작이 될 템플릿 선택",
  "chooser.default-suffix": "(기본)",

  // PreviewModal
  "preview.title": "미리보기 — {template}",
  "preview.save-to-name": "저장 위치",
  "preview.save-to-desc": "'새 파일로 저장' 선택 시 사용됩니다.",
  "preview.action.regenerate": "다시 생성",
  "preview.action.append": "현재 노트 아래에 추가",
  "preview.action.save-as-new": "새 파일로 저장",
  "preview.action.replace": "현재 노트 덮어쓰기",
  "preview.action.copy": "복사",
  "preview.action.discard": "버리기",
  "preview.tooltip.regenerate": "Transform 을 다시 실행합니다. LLM 응답은 결정적이지 않아 결과가 매번 달라집니다.",
  "preview.tooltip.append": "현재 노트 끝에 응답을 덧붙입니다. 원본 메모는 그대로 보존됩니다.",
  "preview.tooltip.save-as-new": "위의 '저장 위치' 경로에 응답을 새 파일로 저장합니다. 현재 노트는 변경되지 않습니다.",
  "preview.tooltip.replace": "현재 노트를 응답으로 덮어씁니다. Cmd+Z (또는 Ctrl+Z) 로 되돌릴 수 있습니다.",
  "preview.tooltip.copy": "응답 텍스트를 시스템 클립보드에 복사합니다. 파일은 변경되지 않습니다.",
  "preview.tooltip.discard": "응답을 저장하지 않고 닫습니다.",

  // OnboardingModal
  "onboarding.title": "ExcaVelo 설정",
  "onboarding.intro": "플러그인이 Claude 와 어떻게 통신할지 선택하세요. 나중에 설정에서 변경할 수 있습니다.",
  "onboarding.cli.name": "Claude Code 사용 (권장)",
  "onboarding.cli.desc": "이미 Claude Code 가 설치되어 있고 로그인된 상태라면, 플러그인이 자동으로 이를 사용합니다. Claude Pro/Max 구독 및 팀 계정 모두 지원. 데스크톱 전용.",
  "onboarding.cli.button": "Claude Code 감지",
  "onboarding.cli.detecting": "감지 중...",
  "onboarding.cli.not-found": "Claude Code 를 찾지 못했습니다. claude.ai/code 에서 설치하거나, 설정에서 바이너리 경로를 지정하세요.",
  "onboarding.cli.detected": "Claude Code 감지됨 (버전 {version}).",
  "onboarding.api.name": "Anthropic API 키 사용",
  "onboarding.api.desc": "console.anthropic.com 에서 키를 발급받으세요. 토큰당 과금이며 Claude.ai 구독과는 별도입니다.",
  "onboarding.api.button": "API 키 사용",
  "onboarding.api.notice": "설정에서 Anthropic API 키를 붙여넣어 주세요.",
  "onboarding.skip": "지금은 건너뛰기",

  // Settings - top
  "settings.title": "ExcaVelo",
  "settings.language.name": "언어",
  "settings.language.desc":
    "ExcaVelo 의 UI 언어입니다. 자동은 Obsidian 앱 언어를 따릅니다. " +
    "명령 팔레트의 명령 이름은 플러그인을 다시 로드해야 바뀝니다.",
  "settings.language.option.auto": "자동 (Obsidian 설정 따름)",
  "settings.language.option.en": "English",
  "settings.language.option.ko": "한국어",

  // Settings - Connection
  "settings.connection.header": "연결",
  "settings.auth-method.name": "인증 방식",
  "settings.auth-method.desc": "Claude Code CLI 는 기존 Pro/Max 구독을 OAuth 로 그대로 활용합니다 (API 키 불필요).",
  "settings.auth-method.option.cli": "Claude Code CLI (권장)",
  "settings.auth-method.option.api": "Anthropic API 키",
  "settings.auth-method.option.openai": "OpenAI 호환 엔드포인트",

  "settings.cli.binary.name": "바이너리 경로",
  "settings.cli.binary.desc": "비워두면 PATH 에서 자동 감지합니다.",
  "settings.cli.binary.placeholder": "예: /usr/local/bin/claude",
  "settings.cli.model.name": "모델",
  "settings.cli.model.desc":
    "별칭은 항상 각 티어의 최신 모델을 가리킵니다. " +
    "Claude Code 에는 모델 목록 API 가 없어 특정 id 는 직접 입력으로 지정합니다. " +
    "템플릿 frontmatter 의 'model' 키로 템플릿별 재정의가 가능합니다.",
  "settings.cli.model.option.sonnet": "sonnet (권장)",
  "settings.cli.model.option.opus": "opus",
  "settings.cli.model.option.haiku": "haiku",
  "settings.cli.model.option.default": "Claude Code 기본값",
  "settings.cli.model.option.custom": "모델 id 직접 입력...",
  "settings.cli.custom-model.name": "모델 id 직접 입력",
  "settings.cli.custom-model.desc": "전체 모델 id 를 입력하세요. 예: claude-sonnet-4-6",
  "settings.cli.permission.name": "권한 모드",
  "settings.cli.permission.desc": "bypassPermissions 는 도구 사용 확인 프롬프트를 건너뜁니다. 순수 텍스트 생성에는 안전합니다.",
  "settings.cli.timeout.name": "타임아웃 (초)",
  "settings.cli.timeout.desc": "Claude Code 응답을 기다리는 최대 시간. 긴 입력은 몇 분씩 걸릴 수 있으니(특히 opus) 넉넉히 잡으세요.",

  "settings.anthropic.key.name": "API 키",
  "settings.anthropic.key.desc": "console.anthropic.com 에서 발급. data.json 에 로컬 저장됩니다.",

  "settings.api-model.name": "모델",
  "settings.api-model.desc-text": "모델 id 를 직접 입력하거나, 엔드포인트의 목록을 불러와 선택하세요.",
  "settings.api-model.desc-loaded": "엔드포인트에서 모델 {count}개를 불러왔습니다.",
  "settings.api-model.load": "모델 목록 불러오기",
  "settings.api-model.reload": "목록 새로고침",
  "settings.api-model.loading": "불러오는 중...",
  "settings.api-model.failed": "모델 목록을 불러오지 못했습니다. {error}",

  "settings.openai.baseurl.name": "Base URL",
  "settings.openai.baseurl.desc": "예: https://api.openai.com/v1, http://localhost:11434/v1 (Ollama), https://api.groq.com/openai/v1",
  "settings.openai.key.name": "API 키",
  "settings.openai.key.desc": "Ollama 같은 로컬 전용 공급자는 비워두면 됩니다.",

  "settings.test-connection.button": "연결 테스트",
  "settings.test-connection.testing": "테스트 중...",
  "settings.test-connection.ok": "ExcaVelo: 연결 OK ({detail})",
  "settings.test-connection.fail": "ExcaVelo: 연결 실패 — {detail}",

  // Settings - Context
  "settings.context.header": "컨텍스트",
  "settings.default-context.name": "기본 컨텍스트",
  "settings.default-context.desc": "모든 LLM 프롬프트에 항상 prepended 됩니다. 본인 / 팀 / 프로젝트에 대한 장기적 정보를 적어 두세요. 노트별 컨텍스트는 [!context] 콜아웃으로 추가할 수 있습니다.",

  // Settings - Templates
  "settings.templates.header": "템플릿",
  "settings.templates-folder.name": "템플릿 폴더",
  "settings.templates-folder.desc": "이 폴더 안의 markdown 파일을 자동으로 템플릿으로 인식합니다.",
  "settings.default-template.name": "기본 템플릿",
  "settings.default-template.desc": "템플릿을 선택하지 않고 변환할 때 사용됩니다.",
  "settings.open-templates-folder.button": "템플릿 폴더 열기",
  "settings.restore-starter.name": "기본 템플릿 복원",
  "settings.restore-starter.desc": "위 폴더에 누락된 starter 템플릿을 다시 생성합니다 (기존 파일은 덮어쓰지 않습니다).",
  "settings.restore-starter.button": "복원",
  "settings.restore-starter.notice": "누락된 starter 템플릿이 복원되었습니다.",
  "settings.update-starter.name": "기본 템플릿 업데이트",
  "settings.update-starter.desc": "위 폴더의 starter 템플릿들을 플러그인의 최신 버전으로 덮어씁니다. 사용자가 편집한 내용은 모두 사라집니다. 본인이 만든 다른 템플릿은 영향받지 않습니다.",
  "settings.update-starter.button": "업데이트",
  "settings.update-starter.notice": "starter 템플릿이 최신 버전으로 업데이트되었습니다.",

  // Settings - UI
  "settings.ui.header": "UI",
  "settings.status-bar.name": "상태 표시줄",
  "settings.status-bar.desc": "사용 정보가 표시되는 작은 상태 항목을 보여줍니다.",
  "settings.show-cost.name": "미리보기에 비용 표시",
  "settings.show-cost.desc": "토큰 사용량과 비용을 표시합니다 (공급자가 보고하는 경우).",

  // Notices
  "notice.open-note-first": "먼저 노트를 여세요.",
  "notice.no-templates": "'{folder}' 에 템플릿이 없습니다. 템플릿을 추가하거나 starter 세트를 복원하세요.",
  "notice.default-template-missing": "기본 템플릿 '{name}' 을 찾지 못했습니다.",
  "notice.appended": "현재 노트에 추가했습니다.",
  "notice.replaced": "노트 본문을 교체했습니다.",
  "notice.copied": "클립보드에 복사했습니다.",
  "notice.saved": "저장됨: {path}",
  "notice.created": "생성됨: {path}",
  "notice.file-exists": "파일이 이미 존재합니다: {path}",
  "notice.file-exists-rename": "파일이 이미 존재합니다: {path}. 이름을 바꾸거나 다른 시각에 다시 시도하세요.",
  "notice.open-settings-fallback": "Settings -> Community plugins -> ExcaVelo 를 직접 열어주세요",
  "notice.templates-folder": "템플릿 폴더: {path}",
  "notice.templates-folder-platform": "템플릿 폴더: {path} (이 플랫폼에서는 직접 열어주세요).",
  "notice.open-folder-failed": "폴더를 열지 못했습니다: {detail}",
  "notice.mobile-fallback": "ExcaVelo: Claude Code CLI 는 데스크톱 전용 — 모바일에서는 Anthropic API 키로 대체합니다.",
  "notice.error-generic": "ExcaVelo: {detail}",
  "transform.note-empty": "노트가 비어 있습니다.",
};

export default ko;
