# CLAUDE.md (context_band)

Claude Code 모드(mod) `context-band` — 입력창 위 띠(`AbovePrompt`)에 모델 · effort · 컨텍스트 사용량 · 세션 비용을 표시한다. `~/.claude/statusline.mjs`의 표시 내용을 모드로 옮긴 것.

- **원격:** GitHub `wonhajin/context_band` (**public**). 커밋 작성자 이메일은 noreply 주소만 쓴다 — 개인·회사 이메일이 공개 히스토리에 남는다.
- **레포 루트 = 모드 폴더.** `.claude-plugin/plugin.json` · `hooks/hooks.json` · `hooks/register.tsx`(본체) · `types/index.d.ts`(`$.state` 계약) · `tests/*.test.tsx`.
- **빌드 없음.** 엔진이 `.tsx`를 직접 로드한다.

## 검증 (수정 후 매번)

```
claude plugin validate .
claude plugin test .
npx -p typescript@5.6.3 tsc -p .     # .claude-plugin/types/ 가 생성된 뒤에만 동작
```

`.claude-plugin/types/`는 엔진이 모드를 로드할 때마다 새로 쓰는 생성물이라 git에서 제외한다. 루트 `tsconfig.json`은 그것을 extends 한다.

## 설치·로드

- **배포:** 마켓플레이스 `wonhajin`(별도 레포 `wonhajin/claude-plugins`)이 이 레포의 **`main`**(`ref: "main"`)을 가리킨다. 이 레포에는 `marketplace.json`이 없다.
  - 설치본은 **캐시 복사본**이다. 이 폴더를 고쳐도 설치본에는 반영되지 않는다 — `main` 머지 + `plugin.json`의 `version` 올림 → `claude plugin update context-band@wonhajin`. **버전을 안 올리면 "이미 최신"으로 옛 복사본이 남는다.**
- **개발 중 확인:** `claude plugin disable context-band@wonhajin` 후 `claude --plugin-dir .`로 띄우고 `/reload-plugins`. 설치본을 켠 채 `--plugin-dir`·`CLAUDE_CODE_PLUGIN_DIRS`를 함께 쓰지 않는다(같은 모드가 두 번 로드됨).

## 알려진 제약

- **띠(`AbovePrompt`)에서 `Text`의 `size`를 쓰지 않는다.** 타입에는 있지만 엔진이 터미널·데스크톱 모두에서 거부하고, 그러면 띠 전체가 엔진 기본 화면으로 바뀐다(`claude plugin test`가 잡는다).
- effort는 모델 요청(`turn.step`) 때만 보이므로 첫 응답 전에는 표시되지 않는다.
- 컨텍스트 링은 `Svg`라 데스크톱·VS Code에서만 그려진다(터미널엔 `Svg` 없음). `Svg`는 테마 키를 못 받아서, `/config`의 `theme` 값이 `light…`면 어두운 색, 아니면 흰색. 값은 측정 시점에 읽으므로 테마 변경은 다음 응답부터 반영되고, `auto`는 다크로 취급된다.
- 모드 API에는 모델 표시 이름이 없다(`$.session.model()`은 id만). `displayName()`이 `claude-<계열>-<주>-<부>`를 `Opus 5.5` 식으로 바꾸고, 형태가 다르면 id 그대로 둔다.
