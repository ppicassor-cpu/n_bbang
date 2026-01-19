# FILE: C:\n_bbang\scripts\convert_mapping.py
import csv
import json
import os

# =============================================================================
# 경로 설정 (사용자 환경에 맞게 수정)
# =============================================================================
ROOT = r"C:\n_bbang"
CSV_PATH = os.path.join(ROOT, "assets", "geo", "국가데이터처_법정동 연계정보_20250602.csv")
OUT_JSON_PATH = os.path.join(ROOT, "assets", "geo", "BjdToAdmMapping.json")

def main():
    print(f">>> CSV 파일 로딩: {CSV_PATH}")
    
    if not os.path.exists(CSV_PATH):
        print("!! 파일이 없습니다. 경로를 확인해주세요.")
        return

    # 법정동코드(key) -> { "adm_cd": 행정동코드, "date": 개정일자 }
    # 중복 데이터가 많으므로, 가장 최신(개정일자 기준) 데이터를 남기기 위해 임시 저장
    temp_map = {}
    
    # 인코딩: 보통 공공데이터는 'cp949' 또는 'euc-kr'인 경우가 많음. 에러 시 'utf-8' 시도.
    try:
        f = open(CSV_PATH, "r", encoding="cp949")
        rdr = csv.DictReader(f)
        next(rdr) # 헤더 체크용(에러 안나면 되돌리기)
        f.seek(0)
        rdr = csv.DictReader(f)
    except UnicodeDecodeError:
        f = open(CSV_PATH, "r", encoding="utf-8")
        rdr = csv.DictReader(f)

    count = 0
    with f:
        for row in rdr:
            # 컬럼명 확인 (파일마다 조금씩 다를 수 있으니 유연하게)
            bjd_cd = row.get("법정동코드")
            adm_cd = row.get("행정동코드")
            date_str = row.get("개정일자", "1900-01-01") # 없으면 과거 날짜

            if not bjd_cd or not adm_cd:
                continue

            # 10자리 코드로 통일 (문자열)
            bjd_cd = str(bjd_cd).strip()
            adm_cd = str(adm_cd).strip()
            
            # 갱신 로직: 기존에 없거나, 이번 데이터가 더 최신이면 덮어쓰기
            if bjd_cd not in temp_map:
                temp_map[bjd_cd] = {"adm_cd": adm_cd, "date": date_str}
            else:
                if date_str > temp_map[bjd_cd]["date"]:
                    temp_map[bjd_cd] = {"adm_cd": adm_cd, "date": date_str}
            
            count += 1
            if count % 100000 == 0:
                print(f"    ... {count}행 처리 중")

    print(f">>> 데이터 정제 완료. (원본 {count}건 -> 정제 {len(temp_map)}건)")

    # 최종 결과: 용량 최소화를 위해 date 빼고 adm_cd만 남김
    # { "법정동코드": "행정동코드" }
    final_map = {k: v["adm_cd"] for k, v in temp_map.items()}

    print(f">>> JSON 저장: {OUT_JSON_PATH}")
    with open(OUT_JSON_PATH, "w", encoding="utf-8") as f:
        # 공백 제거(separators)로 용량 극한 압축
        json.dump(final_map, f, ensure_ascii=False, separators=(',', ':'))

    print(">>> 완료! 이제 메인 빌드 스크립트를 실행하세요.")

if __name__ == "__main__":
    main()