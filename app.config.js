const fs = require("node:fs");
const { expo } = require("./app.json");

const isDevVariant = process.env.APP_VARIANT === "development";

module.exports = () => ({
  expo: {
    ...expo,
    ios: {
      ...expo.ios,
      buildNumber: process.env.EXPO_IOS_BUILD_NUMBER ?? expo.ios.buildNumber,
      ...(isDevVariant && {
        bundleIdentifier: "com.inuappcenter.unidorm.dev",
        icon: "./assets/icon-dev.icon",
        googleServicesFile: fs.existsSync("./GoogleService-Info-Dev.plist")
          ? "./GoogleService-Info-Dev.plist"
          : "./GoogleService-Info.plist",
        associatedDomains: ["applinks:unidorm-test.pages.dev"],
        infoPlist: {
          ...expo.ios.infoPlist,
          CFBundleDisplayName: "유니돔 Dev",
        },
      }),
    },
    android: {
      ...expo.android,
      ...(isDevVariant && {
        package: "com.hjunieee.inudormitory.dev",
        googleServicesFile: "./google-services-dev.json",
        adaptiveIcon: {
          foregroundImage: "./assets/images/android-icon-foreground-dev.png",
          backgroundImage: "./assets/images/android-icon-background.png",
        },
        intentFilters: [
          {
            action: "VIEW",
            autoVerify: true,
            data: [{ scheme: "https", host: "unidorm-test.pages.dev" }],
            category: ["BROWSABLE", "DEFAULT"],
          },
        ],
      }),
    },
    updates: {
      ...expo.updates,
      ...(isDevVariant && {
        requestHeaders: { "expo-channel-name": "development" },
      }),
    },
    ...(isDevVariant && { scheme: "unidormappdev" }),
    plugins: [
      ...expo.plugins,
      ...(isDevVariant ? ["./plugins/withDevAppLabel"] : []),
    ],
  },
});
