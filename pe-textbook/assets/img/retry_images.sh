#!/bin/bash
cd /c/Users/USER/pe-textbook/assets/img
# 키는 환경변수로 전달한다 (코드에 하드코딩 금지)
if [ -z "$GEMINI_API_KEY" ]; then
  echo "환경변수 GEMINI_API_KEY 가 설정되지 않았습니다." >&2
  exit 1
fi
API="https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_API_KEY}"

declare -A PROMPTS
PROMPTS[lj-takeoff.jpg]="Korean middle school student at the moment of long jump takeoff from the board, one foot launching upward, dynamic freeze-frame action shot, outdoor field"
PROMPTS[hj-fosbury.jpg]="Korean middle school student performing Fosbury Flop high jump, back arched over bar, blue crash mat, freeze-frame action shot"
PROMPTS[hj-bar.jpg]="Korean middle school student landing on blue high jump crash mat after clearing bar, back landing technique, bright daylight sports photography"
PROMPTS[hj-team.jpg]="Group of Korean middle school students at high jump practice, one student jumping while others cheer, PE class, encouraging atmosphere"
PROMPTS[vt-cover.jpg]="Korean middle school student performing straddle vault over gymnastics vaulting box in gymnasium, dynamic mid-air pose, editorial magazine style sports photography"
PROMPTS[vt-jump.jpg]="Korean middle school student hands on vaulting box during straddle vault, legs spread wide in mid-air, gymnasium, freeze-frame action"
PROMPTS[vt-team.jpg]="Korean middle school PE class practicing vault in gymnasium, students taking turns with vaulting box, teacher supervising, safety mats, warm atmosphere"
PROMPTS[mt-cover.jpg]="Korean middle school student performing forward roll on blue gymnastics mat in school gymnasium, dynamic motion, editorial magazine style sports photography"
PROMPTS[mt-flip.jpg]="Korean middle school student performing cartwheel on gymnastics mat in gymnasium, mid-rotation with arms and legs extended, dynamic freeze-frame"
PROMPTS[mt-team.jpg]="Korean middle school PE class on gymnastics mats in gymnasium, students practicing mat exercises together, supportive atmosphere, teacher guiding"
PROMPTS[pp-cover.jpg]="Korean middle school students doing fitness testing in school gymnasium, shuttle run with cones, scientific measurement atmosphere, editorial magazine style"
PROMPTS[pp-cardio.jpg]="Korean middle school students performing shuttle run beep test in gymnasium, running between lines, cones marking distance, PE teacher with clipboard"

echo "$(date) - Starting retry loop for 12 missing images..."

while true; do
  MISSING=0
  for file in "${!PROMPTS[@]}"; do
    sz=$(wc -c < "$file" 2>/dev/null || echo 0)
    if [ "$sz" -lt 1000 ]; then
      MISSING=$((MISSING+1))
      echo "$(date) - Generating $file..."
      result=$(curl -s "$API" \
        -H "Content-Type: application/json" \
        -d "{\"instances\":[{\"prompt\":\"${PROMPTS[$file]}\"}],\"parameters\":{\"sampleCount\":1,\"aspectRatio\":\"16:9\",\"personGeneration\":\"allow_all\"}}")
      echo "$result" | python -c "import sys,json,base64; data=json.load(sys.stdin); open('$file','wb').write(base64.b64decode(data['predictions'][0]['bytesBase64Encoded'])); print('OK')" 2>/dev/null
      newsz=$(wc -c < "$file" 2>/dev/null || echo 0)
      if [ "$newsz" -gt 1000 ]; then
        echo "$(date) - $file SUCCESS ($newsz bytes)"
      else
        echo "$(date) - $file FAILED, will retry later"
        # quota exhausted, wait 10 minutes before next attempt
        echo "$(date) - Quota likely exhausted, sleeping 10 minutes..."
        sleep 600
      fi
      sleep 8
    fi
  done

  if [ "$MISSING" -eq 0 ]; then
    echo "$(date) - ALL 12 IMAGES COMPLETE!"
    break
  fi

  echo "$(date) - $MISSING images still missing, retrying in 10 minutes..."
  sleep 600
done

echo "$(date) - Done. Final check:"
for file in "${!PROMPTS[@]}"; do
  sz=$(wc -c < "$file" 2>/dev/null || echo 0)
  echo "$file: $sz bytes"
done
