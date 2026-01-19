# FILE: C:\n_bbang\scripts\build_dong_search_index.py
import os
import json
import csv
import re

# =============================================================================
# 설정 및 경로
# =============================================================================
ROOT = r"C:\n_bbang"
GEO_JSON_PATH = os.path.join(ROOT, "assets", "geo", "HangJeongDong.json")
LEGAL_CSV_PATH = os.path.join(ROOT, "assets", "geo", "국토교통부_전국 법정동_20250807.csv")
MAPPING_JSON_PATH = os.path.join(ROOT, "assets", "geo", "BjdToAdmMapping.json")
OUT_PATH = os.path.join(ROOT, "assets", "geo", "DongSearchIndex.json")

# =============================================================================
# 유틸리티
# =============================================================================
def norm(s: str) -> str:
    return re.sub(r"\s+", "", str(s or "").strip())

def base_dong(name: str) -> str:
    s = str(name or "").strip()
    s = re.sub(r"^제", "", s)
    s = re.sub(r"\d+", "", s)
    s = s.replace("본동", "동")
    s = s.replace(".", "")
    return norm(s)

# =============================================================================
# 메인 로직
# =============================================================================
def main():
    print(">>> [1/5] 행정동(GeoJSON/TopoJSON) 데이터 로딩...")
    
    # Key: adm_cd2(10자리) -> Value: (adm_cd(8자리), adm_nm)
    # 이것만 있으면 이름 매칭 안 해도 코드로 100% 연결 가능
    adm_cd2_map = {}
    
    # 백업용 이름 매칭 맵
    admin_map_exact = {} 
    admin_map_base = {}

    if not os.path.exists(GEO_JSON_PATH):
        print(f"!! 에러: {GEO_JSON_PATH} 파일이 없습니다.")
        return

    with open(GEO_JSON_PATH, "r", encoding="utf-8") as f:
        geo_data = json.load(f)
        
        # [핵심 수정] TopoJSON / GeoJSON 자동 판별하여 features 추출
        features = []
        file_type = geo_data.get("type", "")
        
        if file_type == "Topology":
            print("    - 감지됨: TopoJSON 형식")
            objects = geo_data.get("objects", {})
            for obj_key in objects:
                geoms = objects[obj_key].get("geometries", [])
                features.extend(geoms)
        else:
            print("    - 감지됨: GeoJSON 형식")
            features = geo_data.get("features", [])
        
        print(f"    - 총 {len(features)}개 구역 데이터 로드됨")

        for ft in features:
            props = ft.get("properties", {})
            
            # GeoJSON/TopoJSON의 속성값 읽기
            adm_cd = str(props.get("adm_cd", ""))   # 8자리 (통계청 코드, 앱 폴리곤 매핑용)
            adm_cd2 = str(props.get("adm_cd2", "")) # 10자리 (행안부 코드, 법정동 매핑용)
            adm_nm = props.get("adm_nm", "")
            
            if not adm_cd or not adm_nm: continue

            entry = (adm_cd, adm_nm)

            # 1. 코드 맵핑 (가장 중요)
            if adm_cd2:
                adm_cd2_map[adm_cd2] = entry

            # 2. 이름 맵핑 (백업용)
            tokens = adm_nm.split()
            if not tokens: continue
            
            dong_nm = tokens[-1]
            if len(tokens) == 2:
                sido, sgg = tokens[0], ""
            else:
                sido, sgg = tokens[0], "".join(tokens[1:-1])

            n_sido, n_sgg, n_dong = norm(sido), norm(sgg), norm(dong_nm)
            b_dong = base_dong(dong_nm)

            k_exact = (n_sido, n_sgg, n_dong)
            if k_exact not in admin_map_exact: admin_map_exact[k_exact] = []
            admin_map_exact[k_exact].append(entry)

            k_base = (n_sido, n_sgg, b_dong)
            if k_base not in admin_map_base: admin_map_base[k_base] = []
            admin_map_base[k_base].append(entry)

    print(f"    - 코드 매핑 테이블 생성 완료 ({len(adm_cd2_map)}개)")

    print(">>> [2/5] 법정동-행정동 매핑 JSON 로딩...")
    bjd_to_adm_map = {}
    if os.path.exists(MAPPING_JSON_PATH):
        with open(MAPPING_JSON_PATH, "r", encoding="utf-8") as f:
            bjd_to_adm_map = json.load(f)
        print(f"    - 매핑 테이블 로드 완료 ({len(bjd_to_adm_map)}건)")
    else:
        print("    !! 주의: 매핑 JSON이 없습니다. 이름 매칭으로만 진행합니다.")

    # 비상용 하드코딩 (매핑 파일에도 없는 극소수 케이스 대비)
    HARDCODED_FIX = {
        ("경상남도", "김해시", "삼정동"): "활천동",
        ("경상남도", "김해시", "어방동"): "활천동",
    }

    print(">>> [3/5] 법정동(CSV) 로딩 및 매칭...")
    temp_index = {}
    
    if not os.path.exists(LEGAL_CSV_PATH):
        print(f"!! 에러: {LEGAL_CSV_PATH} 파일이 없습니다.")
        return

    with open(LEGAL_CSV_PATH, "r", encoding="utf-8-sig") as f:
        rdr = csv.DictReader(f)
        count_matched_code = 0
        count_matched_name = 0
        count_total = 0

        for row in rdr:
            if row.get("삭제일자"): continue
            count_total += 1
            
            bjd_cd = str(row.get("법정동코드", "")).strip()
            sido = row.get("시도명")
            sgg = row.get("시군구명")
            emd = row.get("읍면동명")
            ri = row.get("리명")
            
            if ri: target_dong_name = ri
            elif emd: target_dong_name = emd
            else: continue

            full_addr_str = " ".join([x for x in [sido, sgg, emd, ri] if x])
            
            candidates = []
            match_type = "none"

            # -------------------------------------------------------------
            # [전략 1] 코드 기반 매칭 (정확도 100%)
            # -------------------------------------------------------------
            if bjd_cd in bjd_to_adm_map:
                target_adm_cd2 = bjd_to_adm_map[bjd_cd] # 예: "활천동" 코드
                if target_adm_cd2 in adm_cd2_map:
                    found_entry = adm_cd2_map[target_adm_cd2] # (adm_cd, adm_nm)
                    candidates.append(found_entry)
                    match_type = "code"

            # -------------------------------------------------------------
            # [전략 2] 이름 및 하드코딩 매칭 (Fallback)
            # -------------------------------------------------------------
            if not candidates:
                n_sido, n_sgg = norm(sido), norm(sgg)
                n_target = norm(target_dong_name)
                
                # 하드코딩 확인
                fix_key = (sido, sgg, emd)
                if fix_key in HARDCODED_FIX:
                    target_adm_nm = HARDCODED_FIX[fix_key]
                    k_fix = (n_sido, n_sgg, norm(target_adm_nm))
                    if k_fix in admin_map_exact:
                        candidates = admin_map_exact[k_fix]
                        match_type = "hardcoded"
                
                # 일반 이름 매칭
                if not candidates:
                    b_target = base_dong(target_dong_name)
                    k_exact = (n_sido, n_sgg, n_target)
                    k_base = (n_sido, n_sgg, b_target)
                    
                    if k_exact in admin_map_exact:
                        candidates = admin_map_exact[k_exact]
                        match_type = "name_exact"
                    elif k_base in admin_map_base:
                        candidates = admin_map_base[k_base]
                        match_type = "name_base"
                    
                    # 리 -> 읍면동 fallback
                    if not candidates and ri and emd:
                        n_emd, b_emd = norm(emd), base_dong(emd)
                        k_emd = (n_sido, n_sgg, n_emd)
                        if k_emd in admin_map_exact:
                            candidates = admin_map_exact[k_emd]
                            match_type = "name_parent"

            # 결과 저장
            q_key = norm(target_dong_name)
            if q_key not in temp_index: temp_index[q_key] = []

            if candidates:
                if match_type == "code": count_matched_code += 1
                else: count_matched_name += 1

                for (match_adm_cd, match_adm_nm) in candidates:
                    # 라벨: 법정동주소 + (행정동명)
                    adm_dong_name = match_adm_nm.split()[-1]
                    final_label = f"{full_addr_str} ({adm_dong_name})"
                    
                    temp_index[q_key].append({
                        "label": final_label,
                        "adm_cd": match_adm_cd,
                        "bjd_cd": bjd_cd
                    })
            else:
                temp_index[q_key].append({
                    "label": full_addr_str,
                    "adm_cd": "",
                    "bjd_cd": bjd_cd
                })

    print(f"    - 매핑 결과: 코드매칭 {count_matched_code}건, 기타매칭 {count_matched_name}건")
    print(f"    - 총 {count_total}개 중 {count_matched_code + count_matched_name}개 연결 성공")

    print(">>> [4/5] 데이터 최적화...")
    final_labels = []
    label_to_id = {}
    final_data = {}

    for q_key, items in temp_index.items():
        items.sort(key=lambda x: x["adm_cd"] == "", reverse=False)
        entry_list = []
        for item in items:
            lbl = item["label"]
            if lbl not in label_to_id:
                label_to_id[lbl] = len(final_labels)
                final_labels.append(lbl)
            entry_list.append([label_to_id[lbl], item["adm_cd"], item["bjd_cd"]])
        final_data[q_key] = entry_list

    output_json = {"labels": final_labels, "index": final_data}

    print(f">>> [5/5] 파일 저장: {OUT_PATH}")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_json, f, ensure_ascii=False, separators=(',', ':'))

    print(">>> 모든 작업 완료!")

if __name__ == "__main__":
    main()