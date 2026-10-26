#!/usr/bin/env node
/**
 * Android 자동 빌드 및 검증 스크립트 (Production / Development)
 *
 * 작업자나 AI가 환경 변수, .env.local 잔재, 캐시 오염 등으로 인해
 * 잘못된 빌드(Dev URL이 들어간 프로덕션 빌드 등)를 생성하는 실수를 원천 차단합니다.
 *
 * 사용법:
 *   npm run build:android:prod  # 프로덕션 AAB & APK 생성 및 무결성 검증
 *   npm run build:android:dev   # 개발용 Standalone APK 생성 및 자동 정리
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const parentDir = path.resolve(rootDir, '..');
const androidDir = path.resolve(rootDir, 'android');
const envLocalPath = path.resolve(rootDir, '.env.local');

const isProd = process.argv.includes('--prod');
const isDev = process.argv.includes('--dev');

if (!isProd && !isDev) {
  console.error('❌ 모드를 지정해주세요: --prod 또는 --dev');
  process.exit(1);
}

const mode = isProd ? 'production' : 'development';
console.log(`\n🚀 [UNIDORM] Android ${mode.toUpperCase()} 빌드 파이프라인 가동\n`);

// 1. 캐시 및 환경 정리
console.log('🧹 [1/5] 빌드 캐시 및 환경 파일 정리...');
if (fs.existsSync(envLocalPath)) {
  fs.unlinkSync(envLocalPath);
}

// React Native JS 번들 캐시 강제 삭제 (이전 빌드의 번들이 재사용되는 참사 원천 방지)
const bundleAssetsDir = path.resolve(androidDir, 'app/build/generated/assets/react/release');
if (fs.existsSync(bundleAssetsDir)) {
  fs.rmSync(bundleAssetsDir, { recursive: true, force: true });
}

// 2. 모드별 환경 구성
const env = { ...process.env };
let envLocalBackup = null;

try {
  if (isProd) {
    console.log('🔒 [2/5] 프로덕션 환경 설정 (URL: unidorm.inuappcenter.kr)');
    env.APP_VARIANT = 'production';
    env.EXPO_PUBLIC_ROOT_URL = 'https://unidorm.inuappcenter.kr';

    // 릴리스 키스토어 설정
    const keystorePath = path.resolve(parentDir, 'unidorm.jks');
    if (!fs.existsSync(keystorePath)) {
      throw new Error(`릴리스 키스토어를 찾을 수 없습니다: ${keystorePath}`);
    }
    env.ANDROID_RELEASE_STORE_FILE = keystorePath;
    env.ANDROID_RELEASE_STORE_PASSWORD = '17b7ca49d13038a7170c58b5c7137a03';
    env.ANDROID_RELEASE_KEY_ALIAS = '1e5c58c595feae1422690fea41ebdda5';
    env.ANDROID_RELEASE_KEY_PASSWORD = 'db50705bb2c9227e0388fd6016ed85d3';
  } else {
    console.log('🧪 [2/5] 개발 환경 설정 (URL: unidorm-test.pages.dev)');
    env.APP_VARIANT = 'development';
    env.EXPO_PUBLIC_ROOT_URL = 'https://unidorm-test.pages.dev';
    // expo export:embed 가 참조하도록 임시 .env.local 생성
    fs.writeFileSync(envLocalPath, 'EXPO_PUBLIC_ROOT_URL=https://unidorm-test.pages.dev\n', 'utf8');
  }

  // 3. 빌드 실행
  console.log('⚙️  [3/5] Gradle 빌드 실행...');
  const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
  const gradleArgs = isProd
    ? ['bundleRelease', 'assembleRelease', '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a']
    : ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'];

  const buildResult = spawnSync(gradlew, gradleArgs, {
    cwd: androidDir,
    env,
    stdio: 'inherit',
    shell: true,
  });

  if (buildResult.status !== 0) {
    throw new Error(`Gradle 빌드 실패 (종료 코드: ${buildResult.status})`);
  }

  // 4. 번들 무결성 사후 검증 (Sanity Assertions)
  console.log('🔍 [4/5] 번들 무결성 사후 검증 (Sanity Assertion)...');
  const bundleFile = path.resolve(bundleAssetsDir, 'index.android.bundle');
  if (fs.existsSync(bundleFile)) {
    const bundleContent = fs.readFileSync(bundleFile, 'utf8');
    if (isProd) {
      if (bundleContent.includes('https://unidorm-test.pages.dev')) {
        throw new Error('❌ [치명적 결함] 프로덕션 번들에 테스트 URL(https://unidorm-test.pages.dev)이 포함되어 있습니다! 빌드를 즉시 폐기합니다.');
      }
      if (!bundleContent.includes('https://unidorm.inuappcenter.kr')) {
        throw new Error('❌ [치명적 결함] 프로덕션 번들에 운영 URL(https://unidorm.inuappcenter.kr)이 누락되었습니다! 빌드를 즉시 폐기합니다.');
      }
      console.log('   ✅ 프로덕션 URL 검증 통과 (https://unidorm.inuappcenter.kr 확인, https://unidorm-test.pages.dev 미포함)');
    } else {
      if (!bundleContent.includes('https://unidorm-test.pages.dev')) {
        console.warn('   ⚠️ [경고] 개발용 번들에 https://unidorm-test.pages.dev가 감지되지 않았습니다.');
      } else {
        console.log('   ✅ 개발 테스트 URL(https://unidorm-test.pages.dev) 번들링 확인');
      }
    }
  }

  // 5. 산출물 복사
  console.log('📦 [5/5] 산출물 복사 및 완료 처리...');
  if (isProd) {
    const aabSource = path.resolve(androidDir, 'app/build/outputs/bundle/release/app-release.aab');
    const apkSource = path.resolve(androidDir, 'app/build/outputs/apk/release/app-release.apk');
    fs.copyFileSync(aabSource, path.resolve(parentDir, 'unidorm-prod.aab'));
    fs.copyFileSync(apkSource, path.resolve(parentDir, 'unidorm-prod.apk'));
    fs.copyFileSync(aabSource, path.resolve(rootDir, 'unidorm-prod.aab'));
    fs.copyFileSync(apkSource, path.resolve(rootDir, 'unidorm-prod.apk'));
    console.log('\n🎉 [성공] 프로덕션 빌드 완료: unidorm-prod.aab, unidorm-prod.apk\n');
  } else {
    const apkSource = path.resolve(androidDir, 'app/build/outputs/apk/release/app-release.apk');
    fs.copyFileSync(apkSource, path.resolve(parentDir, 'unidorm-dev-arm64.apk'));
    fs.copyFileSync(apkSource, path.resolve(rootDir, 'unidorm-dev-arm64.apk'));
    console.log('\n🎉 [성공] 개발용 빌드 완료: unidorm-dev-arm64.apk\n');
  }

} finally {
  // 빌드 후 어떤 상황에서도 .env.local 잔재를 깨끗이 청소하여 차후 빌드 오염 방지
  if (fs.existsSync(envLocalPath)) {
    fs.unlinkSync(envLocalPath);
    console.log('🧹 임시 .env.local 파일 자동 정리 완료');
  }
}
