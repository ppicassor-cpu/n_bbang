// FILE: src/components/MyText.js

import React from 'react';
import { Text as RNText, StyleSheet, Platform } from 'react-native';
import { theme } from '../theme'; 

/**
 * 시스템 글자 크기 설정을 무시하도록 고정된 커스텀 텍스트 컴포넌트
 */
export const Text = ({ 
  style, 
  children, 
  variant = 'body', 
  color = 'white',  
  bold,             
  center,           
  ...props 
}) => {

  const combinedStyles = [
    styles.base,
    styles[variant],
    { color: theme[color] || color }, 
    bold && styles.bold,
    center && styles.center,
    style, 
  ];

  return (
    <RNText 
      {...props} 
      allowFontScaling={false} 
      maxFontSizeMultiplier={1} 
      style={combinedStyles}
    >
      {children}
    </RNText>
  );
};

const styles = StyleSheet.create({
  base: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  body: {
    fontSize: 15,
    fontWeight: '500',
  },
  subInfo: {
    fontSize: 13,
    fontWeight: '400',
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  caption: {
    fontSize: 11,
    fontWeight: '700',
  },
  bold: {
    fontWeight: 'bold',
  },
  center: {
    textAlign: 'center',
  },
});