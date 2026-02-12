// FILE: C:\n_bbang\plugins\withAndroidNavigationBarLock.js
const { withAndroidStyles } = require("@expo/config-plugins");

function upsertStyleItem(items, name, value) {
  const v = String(value);
  const found = (items || []).find((i) => i?.$?.name === name);
  if (found) {
    found._ = v;
    return;
  }
  items.push({ $: { name }, _: v });
}

function ensureStyle(stylesArray, name, parent) {
  let style = (stylesArray || []).find((s) => s?.$?.name === name);
  if (!style) {
    style = { $: { name, parent }, item: [] };
    stylesArray.push(style);
    return style;
  }

  style.$ = style.$ || {};
  style.$.name = name;
  if (parent && !style.$.parent) style.$.parent = parent;
  style.item = style.item || [];
  return style;
}

module.exports = function withAndroidNavigationBarLock(config, props = {}) {
  const backgroundColor = props.backgroundColor || "#000000";
  const barStyle = props.barStyle || "light-content"; // 아이콘 흰색
  const enforceContrast = props.enforceContrast ?? false;

  // 1) app.json이 뭐가 됐든, 이 값으로 강제
  config.androidNavigationBar = {
    backgroundColor,
    barStyle,
    enforceContrast,
  };

  // 2) 네이티브 테마(styles.xml)에도 강제로 박기
  return withAndroidStyles(config, (config) => {
    const res = config.modResults;
    res.resources = res.resources || {};
    res.resources.style = res.resources.style || [];

    const targets = [
      { name: "AppTheme", parent: "Theme.AppCompat.DayNight.NoActionBar" },
      { name: "Theme.App", parent: "Theme.AppCompat.DayNight.NoActionBar" },
      { name: "Theme.App.SplashScreen", parent: "Theme.AppCompat.DayNight.NoActionBar" },
    ];

    for (const t of targets) {
      const style = ensureStyle(res.resources.style, t.name, t.parent);

      // 내비게이션바 색을 “투명/기본값”으로 못 가게 고정
      upsertStyleItem(style.item, "android:windowDrawsSystemBarBackgrounds", "true");
      upsertStyleItem(style.item, "android:windowTranslucentNavigation", "false");

      // 배경 검정
      upsertStyleItem(style.item, "android:navigationBarColor", backgroundColor);
      upsertStyleItem(style.item, "android:navigationBarDividerColor", backgroundColor);

      // 아이콘 흰색(= light icons)  -> windowLightNavigationBar=false
      upsertStyleItem(style.item, "android:windowLightNavigationBar", "false");

      // 대비 강제 옵션(원하시는 값으로)
      upsertStyleItem(
        style.item,
        "android:enforceNavigationBarContrast",
        enforceContrast ? "true" : "false"
      );
    }

    return config;
  });
};
