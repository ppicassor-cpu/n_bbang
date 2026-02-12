// FILE: C:\n_bbang\plugins\withKakaoMavenRepo.js
const { withSettingsGradle, withProjectBuildGradle } = require("@expo/config-plugins");

const KAKAO_REPO_URL = "https://devrepo.kakao.com/nexus/content/groups/public/";
const KAKAO_REPO = `maven { url "${KAKAO_REPO_URL}" }`;

function ensureKakaoRepoInSettingsGradle(src) {
  if (src.includes("devrepo.kakao.com")) return src;

  // dependencyResolutionManagement { repositories { ... } } 안에 주입
  const drmRe = /(dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{\s*)/m;
  if (drmRe.test(src)) {
    return src.replace(drmRe, `$1\n        ${KAKAO_REPO}\n`);
  }

  // 없으면 끝에 최소 블록 추가
  return (
    src +
    `

dependencyResolutionManagement {
  repositories {
    ${KAKAO_REPO}
  }
}
`
  );
}

function ensureKakaoRepoInProjectBuildGradle(src) {
  if (src.includes("devrepo.kakao.com")) return src;

  // allprojects { repositories { ... } } 안에 주입
  const allprojectsRe = /(allprojects\s*\{[\s\S]*?repositories\s*\{\s*)/m;
  if (allprojectsRe.test(src)) {
    return src.replace(allprojectsRe, `$1\n        ${KAKAO_REPO}\n`);
  }

  // subprojects { repositories { ... } } 안에 주입
  const subprojectsRe = /(subprojects\s*\{[\s\S]*?repositories\s*\{\s*)/m;
  if (subprojectsRe.test(src)) {
    return src.replace(subprojectsRe, `$1\n        ${KAKAO_REPO}\n`);
  }

  // 둘 다 없으면 끝에 최소 블록 추가
  return (
    src +
    `

allprojects {
  repositories {
    ${KAKAO_REPO}
  }
}
`
  );
}

module.exports = function withKakaoMavenRepo(config) {
  config = withSettingsGradle(config, (config) => {
    const src = config.modResults.contents || "";
    config.modResults.contents = ensureKakaoRepoInSettingsGradle(src);
    return config;
  });

  config = withProjectBuildGradle(config, (config) => {
    const src = config.modResults.contents || "";
    config.modResults.contents = ensureKakaoRepoInProjectBuildGradle(src);
    return config;
  });

  return config;
};
