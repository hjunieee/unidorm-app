# 유니돔 앱 (UNIDorm App)

인천대학교 기숙사 공식 모바일 포털 애플리케이션 (React Native / Expo SDK 56)

---

## 🛠️ Android 빌드 가이드라인

본 프로젝트는 프로덕션과 개발(Dev) 빌드 간의 환경 분리를 자동화 스크립트로 엄격히 관리합니다.
수동으로 환경 변수나 `.env.local`을 조작하지 마시고, 반드시 아래 npm 스크립트를 사용하세요.

### 1. 프로덕션 빌드 (Google Play 스토어 배포용)
```bash
npm run build:android:prod
```
- **운영 서버 URL**: `https://unidorm.inuappcenter.kr`
- **Application ID**: `com.hjunieee.inudormitory`
- **서명 키**: `unidorm.jks` 자동 서명
- **산출물**: `unidorm-prod.aab` (스토어 콘솔 업로드용), `unidorm-prod.apk` (기기 테스트용)
- **자동 검증(Assertion)**: 컴파일된 JS 번들에 테스트 URL(`unidorm-test.pages.dev`)이 1개라도 감지되면 빌드가 즉시 중단 및 폐기됩니다.

### 2. 개발(Dev) 단독 빌드
```bash
npm run build:android:dev
```
- **테스트 서버 URL**: `https://unidorm-test.pages.dev`
- **Application ID**: `com.hjunieee.inudormitory.dev` (정식 앱과 별도로 기기에 나란히 설치 가능)
- **앱 이름**: `유니돔 Dev` (Dev 전용 뱃지 아이콘)
- **산출물**: `unidorm-dev-arm64.apk`
- **자동 정리**: 빌드 완료 후 임시 `.env.local`을 자동으로 삭제하여 향후 프로덕션 빌드가 오염되지 않도록 보장합니다.
