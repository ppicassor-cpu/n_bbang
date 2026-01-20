import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated, Easing, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// =================================================================
// 🎨 [색상 설정] 여기서 색깔을 마음대로 바꾸세요!
// =================================================================
const SILHOUETTE_COLOR = '#f5fae3';  // 로고 뒤에 퍼지는 빛 색상 (예: 'cyan', '#FF00FF', 'gold')
const NEON_COLOR = '#CCFF00';      // 반딧불이 색상 (형광 연두)
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
// 2. 로고 뒤 실루엣 (은은하게 퍼지는 효과 구현)
// =================================================================
const LogoNeonSilhouette = ({ source, delay, duration, maxScale, maxOpacity }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay), // 레이어별 시차
        Animated.timing(anim, {
          toValue: 1,
          duration: duration,
          // ✨ 핵심: 시작은 빠르고 끝은 천천히 퍼지는 느낌
          easing: Easing.out(Easing.sin), 
          useNativeDriver: true,
        }),
        // 뚝 끊기지 않게 아주 짧게 리셋
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // 커지는 크기
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, maxScale] 
  });

  // 투명도: 서서히 나타났다가 끝에서 사라짐
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
          // ✨ 빛 번짐 효과 추가 (부드러움 강화)
          shadowColor: SILHOUETTE_COLOR,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 10 * maxScale, // 커질수록 그림자도 퍼짐
        }
      ]}
    />
  );
};

// =================================================================
// 3. 메인 화면
// =================================================================
export default function InitialLoader({ onLoaded, isLoading }) {
  const logoSource = require('../../../assets/splash-icon.png');

  useEffect(() => {
    if (!isLoading && onLoaded) onLoaded();
  }, [isLoading]);

  const renderFireflies = () => Array.from({ length: FIREFLY_COUNT }).map((_, i) => (
    <Firefly key={i} startPosition={{ x: Math.random() * width, y: Math.random() * height }} />
  ));

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFillObject}>{renderFireflies()}</View>

      <View style={styles.logoWrapper}>
        {/* ✨ 5겹의 레이어로 자연스러운 빛 물결 구현 */}
        {/* 1. 가장 넓고 은은한 빛 */}
        <LogoNeonSilhouette source={logoSource} delay={0}    duration={3000} maxScale={1.35} maxOpacity={0.2} />
        {/* 2. 중간 빛 */}
        <LogoNeonSilhouette source={logoSource} delay={500}  duration={2800} maxScale={1.28} maxOpacity={0.3} />
        {/* 3. 메인 빛 흐름 */}
        <LogoNeonSilhouette source={logoSource} delay={1000} duration={2600} maxScale={1.22} maxOpacity={0.4} />
        {/* 4. 조금 더 진한 빛 */}
        <LogoNeonSilhouette source={logoSource} delay={1500} duration={2400} maxScale={1.15} maxOpacity={0.5} />
        {/* 5. 로고 바로 뒤의 가장 진하고 좁은 빛 */}
        <LogoNeonSilhouette source={logoSource} delay={2000} duration={2200} maxScale={1.08} maxOpacity={0.6} />
        
        {/* 맨 앞의 진짜 로고 */}
        <Image source={logoSource} style={[styles.logoBase, { zIndex: 10 }]} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  logoWrapper: { justifyContent: 'center', alignItems: 'center' },
  logoBase: { width: 150, height: 150 },
  firefly: { position: 'absolute', backgroundColor: NEON_COLOR, shadowColor: NEON_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, elevation: 10 }
});