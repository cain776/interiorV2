# Instagram 후보 CSV 추출

인스타그램 개발자도구 Network 응답을 로컬 파일로 저장한 뒤, 공개 프로필 후보를 CSV로 정리하는 보조 스크립트입니다.

## 저장

1. Instagram에서 `F12`를 누릅니다.
2. `Network` 탭에서 `Fetch/XHR`를 켭니다.
3. 해시태그, 장소, 계정 검색을 수행합니다.
4. Network 목록에서 우클릭 후 `Save all as HAR with content`를 선택합니다.
5. HAR 파일은 쿠키/세션이 포함될 수 있으니 외부 공유하지 않습니다.

## 실행

```sh
node tools/instagram-har-to-csv.mjs --input instagram.har --output candidates.csv
```

응답 JSON을 직접 저장했다면 JSON 파일도 입력으로 쓸 수 있습니다.

```sh
node tools/instagram-har-to-csv.mjs -i response.json -o candidates.csv --min-score 2
```

## CSV 컬럼

- `username`
- `profileUrl`
- `fullName`
- `followers`
- `verified`
- `private`
- `fitScore`
- `eyeSignals`
- `koreaSignals`
- `categorySignals`
- `bio`

`fitScore`는 라식/렌즈/안과 신호, 한국 관련 신호, 뷰티/여행/라이프스타일 신호를 단순 가중치로 합산한 참고 점수입니다. 최종 섭외 전에는 반드시 계정을 직접 열어 최근 활동, 댓글 품질, 의료광고 적합성을 확인해야 합니다.
