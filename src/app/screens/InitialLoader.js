import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated, Easing, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// =================================================================
// 🎨 [색상 설정]
// =================================================================
const SILHOUETTE_COLOR = '#f5fae3';  // 로고 뒤 실루엣
const NEON_COLOR = '#CCFF00';      // 반딧불이 & 로딩바 색상
const LOADING_BAR_WIDTH = 200;     // 로딩바 전체 길이
const FIREFLY_COUNT = 18;          // 반딧불이 개수

// =================================================================
// 1. 개별 반딧불이 (배경 효과)
// =================================================================
const Firefly = ({ startPosition }) => {
  const animVal = useRef(new Animated.Value(0)).current;
  
  const size = 2 + Math.random() * 5;
  const duration = 1500 + Math.random() * 2500;
  const delay = Math.random() * 2000;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(animVal, {
          toValue: 1,
          duration: duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animVal, {
          toValue: 0,
          duration: duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  const opacity = animVal.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.8, 0]
  });

  const translateY = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20 - Math.random() * 30]
  });

  return (
    <Animated.View
      style={[
        styles.firefly,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          top: startPosition.y,
          left: startPosition.x,
          opacity: opacity,
          transform: [{ translateY }],
          shadowRadius: size * 1.5, 
        },
      ]}
    />
  );
};

// =================================================================
// 2. 로고 뒤 실루엣
// =================================================================
const LogoNeonSilhouette = ({ source, delay, duration, maxScale, maxOpacity }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: duration,
          easing: Easing.out(Easing.sin), 
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, maxScale] 
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, maxOpacity, 0] 
  });

  return (
    <Animated.Image
      source={source}
      resizeMode="contain"
      style={[
        styles.logoBase,
        {
          position: 'absolute',
          tintColor: SILHOUETTE_COLOR,
          transform: [{ scale }],
          opacity: opacity,
          zIndex: 1,
          shadowColor: SILHOUETTE_COLOR,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 10 * maxScale,
        }
      ]}
    />
  );
};

// =================================================================
// 3. 메인 화면 (로딩바 로직 추가됨)
// =================================================================
export default function InitialLoader({ onLoaded, isLoading }) {
  const logoSource = require('../../../assets/splash-icon.png');
  const progressAnim = useRef(new Animated.Value(0)).current;

  // 💡 중복 실행 방지용 플래그 (타이머 vs 데이터 완료 중 먼저 끝나는 쪽 한 번만 실행)
  const isFinished = useRef(false);

  // 🚀 공통 로딩 완료 함수: 바를 100%로 채우고 홈 화면으로 전환
  const finishLoading = () => {
    if (isFinished.current) return;
    isFinished.current = true;

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && onLoaded) {
        setTimeout(onLoaded, 100);
      }
    });
  };

  useEffect(() => {
    let timer = null;

    if (isLoading) {
      // 1️⃣ [애니메이션] 0% -> 90%까지 천천히 채움
      Animated.timing(progressAnim, {
        toValue: 0.9,
        duration: 5000, 
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      // 2️⃣ [강제 타이머] 10초가 지나면 무조건 완료 함수 실행
      timer = setTimeout(() => {
        if (!isFinished.current) {
          finishLoading();
        }
      }, 10000); 
    } else {
      // 3️⃣ [정상 종료] isLoading이 false가 되면 즉시 완료 함수 실행
      finishLoading();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLoading]);

  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const renderFireflies = () => Array.from({ length: FIREFLY_COUNT }).map((_, i) => (
    <Firefly key={i} startPosition={{ x: Math.random() * width, y: Math.random() * height }} />
  ));

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFillObject}>{renderFireflies()}</View>

      <View style={styles.contentContainer}>
        <View style={styles.logoWrapper}>
          <LogoNeonSilhouette source={logoSource} delay={0}    duration={3000} maxScale={1.35} maxOpacity={0.2} />
          <LogoNeonSilhouette source={logoSource} delay={500}  duration={2800} maxScale={1.28} maxOpacity={0.3} />
          <LogoNeonSilhouette source={logoSource} delay={1000} duration={2600} maxScale={1.22} maxOpacity={0.4} />
          <LogoNeonSilhouette source={logoSource} delay={1500} duration={2400} maxScale={1.15} maxOpacity={0.5} />
          <LogoNeonSilhouette source={logoSource} delay={2000} duration={2200} maxScale={1.08} maxOpacity={0.6} />
          <Image source={logoSource} style={[styles.logoBase, { zIndex: 10 }]} resizeMode="contain" />
        </View>

        <View style={styles.loadingBarContainer}>
          <Animated.View 
            style={[
              styles.loadingBarFill, 
              { width: widthInterpolated }
            ]} 
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#000000' 
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: { 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 40, // ✅ 로딩바와 로고 사이 간격
  },
  logoBase: { width: 120, height: 120 },
  
  firefly: { 
    position: 'absolute', 
    backgroundColor: NEON_COLOR, 
    shadowColor: NEON_COLOR, 
    shadowOffset: { width: 0, height: 0 }, 
    shadowOpacity: 0.8, 
    elevation: 10 
  },

  // ✅ 로딩 바 스타일
  loadingBarContainer: {
    width: LOADING_BAR_WIDTH,
    height: 4,               // 얇고 세련되게
    backgroundColor: '#333', // 빈 게이지 색상 (다크 그레이)
    borderRadius: 2,
    overflow: 'hidden',      // 채워지는 바가 둥근 모서리를 넘지 않게
  },
  loadingBarFill: {
    height: '100%',
    backgroundColor: NEON_COLOR, // 채워지는 색상 (형광 연두)
    shadowColor: NEON_COLOR,     // 빛나는 효과
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  }
});