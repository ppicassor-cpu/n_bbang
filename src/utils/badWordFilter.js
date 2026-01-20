// FILE: src/utils/badWordFilter.js

import {
  ADMIN_KEYWORDS,
  PROFANITY_LIST,
  SOFT_PROFANITY_LIST,
  NEUTRAL_TERMS,
  ALLOW_TERMS,
} from "./badWordsList";

/**
 * [내부 함수] 정규식 이스케이프
 */
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * [내부 데이터] 무조건 허용(과필터링 방지)
 */
const SAFE_WORDS = new Set([...(ALLOW_TERMS || [])].map((w) => String(w).toLowerCase()));

/**
 * [내부 함수] 하드(진짜 욕설) 리스트 검사
 * - 단어 경계 기반(부분일치 과필터링 방지)
 * - 공백 제거 우회는 "고위험 패턴"만 적용
 */
const checkText = (text, list) => {
  if (!text) return false;

  const originalLower = text.toLowerCase();
  const cleanText = originalLower.replace(/\s/g, "");

  return list.some((word) => {
    if (!word) return false;
    const lowerWord = String(word).toLowerCase();

    // ✅ 예외 단어는 절대 차단하지 않음
    if (SAFE_WORDS.has(lowerWord)) return false;

    // ✅ 1) "단어 경계" 기반 매칭 (부분일치 과필터링 방지)
    const boundaryRe = new RegExp(
      `(^|[^0-9a-z가-힣])${escapeRegExp(lowerWord)}([^0-9a-z가-힣]|$)`,
      "i"
    );
    if (boundaryRe.test(originalLower)) return true;

    // ✅ 2) 공백 제거 우회 방지는 "고위험 패턴"만 적용
    const isHighRisk =
      /[0-9]|[ㄱ-ㅎㅏ-ㅣ]|[^0-9a-z가-힣]/i.test(lowerWord) || lowerWord.length <= 2;

    if (isHighRisk && cleanText.includes(lowerWord)) return true;

    return false;
  });
};

/**
 * [내부 함수] 조건부/중립 단어(단독 허용) 비하 조합만 차단
 * - 공백/기호/밑줄 등으로 우회하는 조합도 잡기 위해 사이 구분자를 넓게 허용
 */
const hasConditionalSlur = (text) => {
  if (!text) return false;
  const originalLower = text.toLowerCase();

  // 단어와 접미(비하 표현) 사이에 공백/기호/밑줄 등이 끼어도 허용
  const gap = `(?:\\s|[^0-9a-z가-힣])*`;

  // 1) SOFT_PROFANITY_LIST (예: 걸레/대걸레) → 모욕 조합일 때만 차단
  for (const w of SOFT_PROFANITY_LIST || []) {
    const lw = String(w).toLowerCase();
    const re = new RegExp(
      `${escapeRegExp(lw)}${gap}(년|놈|새끼|같은|같네|같다)`,
      "i"
    );
    if (re.test(originalLower)) return true;
  }

  // 2) NEUTRAL_TERMS (예: 게이/동성애자) → 모욕 조합일 때만 차단
  for (const w of NEUTRAL_TERMS || []) {
    const lw = String(w).toLowerCase();
    const re = new RegExp(
      `${escapeRegExp(lw)}${gap}(새끼|놈|년|병신|븅신|ㅂㅅ|ㅄ|같은|같네|같다|냐\\b|임\\b)`,
      "i"
    );
    if (re.test(originalLower)) return true;
  }

  return false;
};

/**
 * 1. [닉네임용] 관리자 사칭 + 하드 욕설 + (조건부/중립 비하 조합)
 */
export const hasBadWord = (text) => {
  if (!text) return false;

  // 조건부/중립 단어의 비하 조합은 닉네임에서도 차단
  if (hasConditionalSlur(text)) return true;

  const allWords = [...ADMIN_KEYWORDS, ...PROFANITY_LIST];
  return checkText(text, allWords);
};

/**
 * 2. [채팅/글쓰기용] 하드 욕설 + (조건부/중립 비하 조합)만 차단
 *    (관리자/운영자 등의 단어는 허용)
 */
export const hasProfanity = (text) => {
  if (!text) return false;

  // 조건부/중립 단어의 비하 조합은 채팅에서도 차단
  if (hasConditionalSlur(text)) return true;

  return checkText(text, PROFANITY_LIST);
};
