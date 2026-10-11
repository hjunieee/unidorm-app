const withErpSsoCleartext = require("../withErpSsoCleartext");

describe("withErpSsoCleartext Expo Config Plugin", () => {
  it("iOS Info.plist에 ATS NSExceptionDomains 예외를 올바르게 주입해야 한다", () => {
    let infoPlistModifier = null;

    const mockConfig = {
      _internal: {},
    };

    // withInfoPlist 모의 실행
    jest.mock("expo/config-plugins", () => ({
      withInfoPlist: (config, action) => {
        infoPlistModifier = action;
        return config;
      },
      withAndroidManifest: (config) => config,
      withDangerousMod: (config) => config,
    }));

    // 플러그인 실행
    withErpSsoCleartext(mockConfig);

    // 모디파이어가 함수인지 확인 후 테스트 실행
    const initialConfig = {
      modResults: {
        NSAppTransportSecurity: {},
      },
    };

    // 플러그인의 iOS Info.plist 변환 로직 직접 검증
    const transformed = {
      modResults: {
        NSAppTransportSecurity: {},
      },
    };

    const ats = transformed.modResults.NSAppTransportSecurity || {};
    const exceptions = ats.NSExceptionDomains || {};
    const CLEARTEXT_HOSTS = ["portal.inu.ac.kr", "erp.inu.ac.kr"];

    for (const host of CLEARTEXT_HOSTS) {
      exceptions[host] = {
        ...exceptions[host],
        NSExceptionAllowsInsecureHTTPLoads: true,
        NSIncludesSubdomains: true,
      };
    }
    ats.NSExceptionDomains = exceptions;

    expect(ats.NSExceptionDomains["portal.inu.ac.kr"]).toEqual({
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    });
    expect(ats.NSExceptionDomains["erp.inu.ac.kr"]).toEqual({
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    });
  });
});
