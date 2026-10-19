# context-band

Claude Code 모드(mod). 입력창 위 띠에 모델 · effort · 컨텍스트 사용량 · 세션 비용을 표시합니다.

```
Context 7% (74k/1000k) · $3.21                    Opus 5.5 · high
```

- 컨텍스트가 250k를 넘으면 노란색, 350k를 넘으면 빨간색으로 바뀝니다.
- 데스크톱 앱·VS Code에서는 컨텍스트 원형 링도 함께 그려집니다.
- 비용은 Claude Code가 API 정가 기준으로 낸 추정치입니다.

## 설치

마켓플레이스 [wonhajin/claude-plugins](https://github.com/wonhajin/claude-plugins)로 배포합니다.

```
claude plugin marketplace add wonhajin/claude-plugins
claude plugin install context-band@wonhajin
```

새 버전은 `claude plugin update context-band@wonhajin`으로 받습니다.

## 개발

빌드 단계가 없습니다. 엔진이 `.tsx`를 직접 로드합니다. 설치본을 끄고 이 폴더를 한 세션만 로드해 확인합니다.

```
claude plugin disable context-band@wonhajin
claude --plugin-dir .
```

코드를 고친 뒤에는 세션에서 `/reload-plugins`를 실행하면 반영됩니다.

## 검증

```
claude plugin validate .
claude plugin test .
npx -p typescript@5.6.3 tsc -p .
```

`tsc`는 엔진이 모드를 한 번 로드해 `.claude-plugin/types/`를 만든 뒤에만 동작합니다.
