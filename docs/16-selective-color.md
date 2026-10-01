# 16 선택색상 · Selective Color

직접 만든 웹 사진 편집기 Photoshot의 조정 레이어 공개 소스입니다. **v0.16.0 누적 버전**에 포함됩니다.

9개 색상 계열별 CMYK 성분, 상대값/절대값 모드.

## 사용 순서

1. 이미지를 열고 **조정 추가 → 선택 색상**를 선택합니다.
2. 파랑 계열에 청록 +20·자홍 −25·노랑 −20을 적용해 비교합니다. 검정 계열의 검정 +10으로 깊이를 다듬습니다.
3. **누르고 전후 비교** 또는 레이어 눈 아이콘으로 결과를 확인합니다.
4. 원본은 유지하고 PNG/JPG로 내보내거나, 편집을 계속하려면 `.layerstudio` 프로젝트로 저장합니다.

수치는 예시이며 모든 사진에 맞는 정답은 아닙니다. 마스크·불투명도·혼합 모드, 아래 레이어 전체/클리핑, 실행 취소와 설정 JSON 저장·불러오기를 사용할 수 있습니다.

![선택색상의 실제 Photoshot 조작 패널](images/16-selective-color-panel.png)

위 이미지는 시리즈 제작 당시 Photoshot 화면입니다. 기능 설명용 캡처로, 공개본의 배치·테마와 일부 다를 수 있습니다.

## 조절 값

| 항목     | 범위       | 기본값 |
| -------- | ---------- | ------ |
| 청록 (0) | -100 ~ 100 | 0      |
| 자홍 (0) | -100 ~ 100 | 0      |
| 노랑 (0) | -100 ~ 100 | 0      |
| 검정 (0) | -100 ~ 100 | 0      |
| 청록 (1) | -100 ~ 100 | 0      |
| 자홍 (1) | -100 ~ 100 | 0      |
| 노랑 (1) | -100 ~ 100 | 0      |
| 검정 (1) | -100 ~ 100 | 0      |
| 청록 (2) | -100 ~ 100 | 0      |
| 자홍 (2) | -100 ~ 100 | 0      |
| 노랑 (2) | -100 ~ 100 | 0      |
| 검정 (2) | -100 ~ 100 | 0      |
| 청록 (3) | -100 ~ 100 | 0      |
| 자홍 (3) | -100 ~ 100 | 0      |
| 노랑 (3) | -100 ~ 100 | 0      |
| 검정 (3) | -100 ~ 100 | 0      |
| 청록 (4) | -100 ~ 100 | 0      |
| 자홍 (4) | -100 ~ 100 | 0      |
| 노랑 (4) | -100 ~ 100 | 0      |
| 검정 (4) | -100 ~ 100 | 0      |
| 청록 (5) | -100 ~ 100 | 0      |
| 자홍 (5) | -100 ~ 100 | 0      |
| 노랑 (5) | -100 ~ 100 | 0      |
| 검정 (5) | -100 ~ 100 | 0      |
| 청록 (6) | -100 ~ 100 | 0      |
| 자홍 (6) | -100 ~ 100 | 0      |
| 노랑 (6) | -100 ~ 100 | 0      |
| 검정 (6) | -100 ~ 100 | 0      |
| 청록 (7) | -100 ~ 100 | 0      |
| 자홍 (7) | -100 ~ 100 | 0      |
| 노랑 (7) | -100 ~ 100 | 0      |
| 검정 (7) | -100 ~ 100 | 0      |
| 청록 (8) | -100 ~ 100 | 0      |
| 자홍 (8) | -100 ~ 100 | 0      |
| 노랑 (8) | -100 ~ 100 | 0      |
| 검정 (8) | -100 ~ 100 | 0      |
| 상대값   | 0 ~ 1      | 1      |

## 실행과 구현

Node.js 24에서 `npm ci` → `npm run dev`. 검증은 `npm test`, 빌드는 `npm run build`입니다.

- [픽셀 처리](../src/adjustments.ts) · [패널](../src/adjustment-panel.tsx) · [추가 컨트롤](../src/advanced-adjustment.tsx)
- [전체 회차와 이용 조건](../README.md) · [웹에서 사용](https://slohero.com/photoshot/editor/)

Photoshop과 별개의 독립 구현이며 모든 이미지·색상 관리·비트 깊이에서 같은 결과를 보장하지 않습니다. RGB 8비트 작업 환경입니다. [COPYRIGHT.md](../COPYRIGHT.md)의 기존 이용 조건을 유지합니다.

## English

Episode 16: **Selective Color**. Included in the cumulative v0.16.0 release. Open an image, add the adjustment, compare before/after, and export PNG/JPG or save a project. Masks, opacity, clipping, blending, undo and JSON presets use the shared editor. Processing runs locally in the browser. This independent implementation does not claim complete Photoshop parity. Public source only; no open-source license is granted to Photoshot's own code.
