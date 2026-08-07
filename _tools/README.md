# 앱 미리보기 스크린샷 도구

## 쓰는 법

```bash
node _tools/_shot.js       # 공개 사이트 자동 캡처 → shots/
node _tools/_sync-shots.js # shots/ 목록을 index.html의 SHOTS 집합에 반영
```

## 규칙

- 파일명은 앱 URL에서 자동 생성된다 (`shotSlug()`와 동일 규칙).
  예) `kimju1416.github.io/pension/` → `pension.jpg`
- `shots/`에 올바른 이름으로 jpg를 넣고 `_sync-shots.js`만 돌리면 사이트에 바로 뜬다.
- 캡처 규격: 1024x640, JPEG 품질 68 (장당 25~85KB)

## 자동 캡처가 안 되는 앱

Google Sheets 사본링크(`/copy`)와 네이버 단축링크는 **구글 로그인 화면으로 리다이렉트**된다.
→ 로그인된 브라우저에서 직접 캡처해 1024x640으로 잘라 `shots/`에 넣을 것.

## 주의

Playwright를 이 폴더에 설치하지 않고 `youcall-promo/node_modules`를 참조한다.
그 폴더가 사라지면 `require` 경로를 고치거나 `npm i playwright`를 여기서 실행할 것.
