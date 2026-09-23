# 03 곡선

조정 추가 → 곡선를 선택하세요. 이미지 레이어 위에 조정 레이어가 생깁니다.

채널별 히스토그램, 제어점·연필·부드럽게, 격자·채널 겹쳐 보기, 자동 명암·색상 보정, 검정·회색·흰색 스포이드, 사진에서 제어점 추가, JSON 설정 저장·불러오기를 제공합니다. 레이어 마스크, 불투명도, 혼합 모드, 아래 레이어 전체 또는 클리핑 적용, 실행 취소와 전후 비교에 연결됩니다. PNG/JPG 내보내기와 `.layerstudio` 프로젝트 저장을 지원합니다.

## 실행

`npm ci` → `npm run dev` 후 터미널의 로컬 주소를 여세요. `npm test`와 `npm run build`로 검증합니다.

## 범위

운영 Photoshot의 해당 기능을 독립 공개 편집기에 연결한 버전입니다. RGB 8비트이며 히스토그램은 긴 변 최대 384px 미리보기에서 계산합니다. Photoshop의 전체 기능·HDR·CMYK·RAW 지원을 뜻하지 않습니다. 공개하지 않은 다른 조정이 있는 프로젝트는 거부합니다.

기존 01 저장 공간은 보존하고 `photoshot-adjustments`라는 별도 IndexedDB를 사용합니다. 이전 프로젝트는 파일로 저장해 다시 열 수 있습니다. 이미지와 프로젝트는 브라우저에서 처리하며 서버로 전송하지 않습니다.

공개 소스에 오픈소스 라이선스를 부여하지 않았습니다. 기존 COPYRIGHT.md의 이용 조건을 유지합니다.

## English

Episode 03: Curves. Add the adjustment above an image using the adjustment menu. Masking, opacity, clipping, undo, project serialization and image export share the editor compositor. RGB 8-bit only; this is an independent implementation, not full Photoshop parity. No backend or API key is required. See COPYRIGHT.md for unchanged source-use terms.
