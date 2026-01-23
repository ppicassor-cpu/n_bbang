// FILE: src/components/MyText.js

import React from 'react';
// ✅ [필수] react-native에서 기본 텍스트와 스타일 관련 기능을 가져옵니다. 
// 튕김(Crash) 방지를 위해 Text as RNText, StyleSheet, Platform이 반드시 포함되어야 합니다.
import { Text as RNText, StyleSheet, Platform } from 'react-native';

// ✅ [경로 확인] 앱의 공통 색상 설정 파일입니다. 글자 색상을 바꿀 때 참조하세요.
import { theme } from '../theme'; 

/**
 * 시스템 글자 크기 설정을 무시하도록 고정된 커스텀 텍스트 컴포넌트
 */
export const Text = ({ 
  style, 
  children, 
  variant = 'body', // 기본 디자인 유형 (예: header, title, body 등)
  color = 'white',  // 기본 글자 색상
  bold,             // true일 경우 글자를 굵게 표시
  center,           // true일 경우 가운데 정렬
  ...props 
}) => {

  // ✅ [스타일 합성] 하단의 styles 객체에 정의된 스타일들을 조건에 맞춰 하나로 합칩니다.
  const combinedStyles = [
    styles.base,
    styles[variant], // 선택된 variant(유형)에 맞는 크기와 굵기 적용
    { color: theme[color] || color }, // 테마에 등록된 색상이면 해당 색을, 아니면 일반 색상값 사용
    bold && styles.bold,
    center && styles.center,
    style, // 외부(사용하는 곳)에서 추가로 넣은 스타일을 가장 마지막에 적용 (우선순위 최고)
  ];

  return (
    <RNText 
      {...props} 
      // ✅ [핵심 설정] 시스템의 글자 크기 조절 설정을 완전히 무시하고 고정합니다.
      allowFontScaling={false} 
      maxFontSizeMultiplier={1} 
      style={combinedStyles}
    >
      {children}
    </RNText>
  );
};

// ✅ [디자인 수정] 각 유형별 글자 크기(fontSize)나 굵기(fontWeight)를 여기서 직접 수정하세요.
const styles = StyleSheet.create({
  base: {
    // OS별 기본 시스템 폰트 설정
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  header: {
    fontSize: 20, // 가장 큰 제목 크기
    fontWeight: 'bold',
  },
  title: {
    fontSize: 16, // 중간 제목 크기
    fontWeight: 'bold',
  },
  body: {
    fontSize: 15, // 일반 본문 크기
    fontWeight: '500',
  },
  subInfo: {
    fontSize: 13, // 보조 설명이나 작은 글씨 크기
    fontWeight: '400',
  },
  price: {
    fontSize: 18, // 가격 강조용 크기
    fontWeight: 'bold',
  },
  caption: {
    fontSize: 12, // 아주 작은 캡션용 크기
    fontWeight: '700',
  },
  bold: {
    fontWeight: 'bold',
  },
  center: {
    textAlign: 'center',
  },
});