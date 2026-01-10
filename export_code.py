import os
import time

# ==========================================
# 설정: 제외할 폴더 및 포함할 파일 확장자
# ==========================================
IGNORED_DIRS = {'node_modules', '.expo', '.git', 'assets', 'android', 'ios', '__pycache__'}
IGNORED_FILES = {'package-lock.json', 'yarn.lock', 'export_code.py', 'all_project_code.txt', '.gitignore'}
ALLOWED_EXTENSIONS = {'.js', '.jsx', '.ts', '.tsx', '.json'}

def merge_project_files(output_filename="all_project_code.txt"):
    # 스크립트가 있는 현재 폴더 기준
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, output_filename)
    
    print("=" * 50)
    print(f"📂 [N빵] React Native 소스코드 변환기")
    print("=" * 50)
    print(f"📍 대상 폴더: {current_dir}")
    print(f"🚫 제외 폴더: {', '.join(IGNORED_DIRS)}")

    count = 0
    try:
        with open(output_path, 'w', encoding='utf-8') as outfile:
            # 헤더 작성
            outfile.write("==================================================\n")
            outfile.write("   N_BBANG PROJECT SOURCE CODE\n")
            outfile.write(f"   Exported at: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            outfile.write("==================================================\n\n")

            # 폴더 탐색 (os.walk)
            for root, dirs, files in os.walk(current_dir):
                # 제외할 폴더는 탐색 리스트에서 제거 (in-place modification)
                dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
                
                for file in files:
                    # 제외할 파일 및 확장자 필터링
                    if file in IGNORED_FILES:
                        continue
                    
                    _, ext = os.path.splitext(file)
                    if ext.lower() not in ALLOWED_EXTENSIONS:
                        continue

                    file_path = os.path.join(root, file)
                    relative_path = os.path.relpath(file_path, current_dir)
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            content = infile.read()
                            
                            # 파일 구분선 및 내용 기록
                            outfile.write(f"\n{'='*80}\n")
                            outfile.write(f" FILE: {relative_path}\n")
                            outfile.write(f"{'='*80}\n\n")
                            outfile.write(content)
                            outfile.write("\n")
                            
                            print(f"✅ 추가됨: {relative_path}")
                            count += 1
                    except Exception as e:
                        print(f"⚠️ 읽기 실패 (건너뜀): {relative_path} - {e}")
        
        print("\n" + "=" * 50)
        print(f"🎉 변환 완료! 총 {count}개의 핵심 파일을 합쳤습니다.")
        print(f"📄 저장된 파일: {output_filename}")
        print("=" * 50)

    except Exception as e:
        print(f"\n❌ 치명적인 오류 발생: {e}")

if __name__ == "__main__":
    merge_project_files()
    # 작업 완료 후 창이 바로 꺼지지 않게 대기
    input("\n[안내] 창을 닫으려면 엔터 키를 누르세요...")
