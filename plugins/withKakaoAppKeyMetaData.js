const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withKakaoAppKeyMetaData(config, props = {}) {
  const kakaoAppKey = props.kakaoAppKey;
  if (!kakaoAppKey) {
    throw new Error("withKakaoAppKeyMetaData: kakaoAppKey is required");
  }

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    if (!manifest.manifest) manifest.manifest = {};
    if (!manifest.manifest.application) manifest.manifest.application = [];

    const app = manifest.manifest.application[0];
    if (!app) {
      manifest.manifest.application.push({ $: {}, "meta-data": [] });
    }

    const application = manifest.manifest.application[0];
    if (!application["meta-data"]) application["meta-data"] = [];

    const metaData = application["meta-data"];

    // 기존에 있으면 업데이트, 없으면 추가
    const existing = metaData.find(
      (m) => m.$ && m.$["android:name"] === "com.kakao.sdk.AppKey"
    );

    const value = `kakao${kakaoAppKey}`;

    if (existing) {
      existing.$["android:value"] = value;
    } else {
      metaData.push({
        $: {
          "android:name": "com.kakao.sdk.AppKey",
          "android:value": value,
        },
      });
    }

    return config;
  });
};
