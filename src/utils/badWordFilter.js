// FILE: src/utils/badWordFilter.js

import { ADMIN_KEYWORDS, PROFANITY_LIST } from "./badWordsList";

/**
 * [내부 함수] 주어진 리스트에 금지어가 있는지 검사
 */
const checkText = (text, list) => {
  if (!text) return false;
  
  // 1. 공백 제거 후 소문자로 변환하여 검사 (우회 방지용)
  const cleanText = text.replace(/\s/g, "").toLowerCase();
  
  // 2. 원래 텍스트도 소문자로 변환하여 검사
  const originalLower = text.toLowerCase();

  return list.some(word => {
    const lowerWord = word.toLowerCase();
    
    // 원래 문장 또는 공백 제거 문장에 금지어가 포함되어 있는지 확인
    if (cleanText.includes(lowerWord)) return true;
    if (originalLower.includes(lowerWord)) return true;
    
    return false;
  });
};

/**
 * 1. [닉네임용] 모든 금지어(관리자 사칭 + 욕설) 검사
 */
export const hasBadWord = (text) => {
  const allWords = [...ADMIN_KEYWORDS, ...PROFANITY_LIST];
  return checkText(text, allWords);
};

/**
 * 2. [채팅/글쓰기용] 욕설만 검사 (관리자, 운영자 등의 단어는 허용)
 */
export const hasProfanity = (text) => {
  return checkText(text, PROFANITY_LIST);
};