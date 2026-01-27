const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withAndroidQueries(config, props) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const queries = props.queries || [];

    // 1. queries 태그가 없으면 생성
    if (!androidManifest.manifest.queries) {
      androidManifest.manifest.queries = [];
    }

    // 2. 전달받은 패키지 목록 주입
    const packages = queries.map((q) => ({
      $: { "android:name": q.package },
    }));

    // 기존에 이미 등록된 것과 합치기 (중복 방지)
    if (!androidManifest.manifest.queries[0]) {
      androidManifest.manifest.queries[0] = { package: packages };
    } else {
      androidManifest.manifest.queries[0].package = [
        ...(androidManifest.manifest.queries[0].package || []),
        ...packages,
      ];
    }

    return config;
  });
};