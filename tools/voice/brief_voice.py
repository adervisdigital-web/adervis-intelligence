"""Голос помощника брифа: короткие фразы из brief-data.js → brief-voice/<ключ>.mp3.
Голос — Gemini TTS (ключ берёт voice_note.py, в коде и выводе его нет). Уже готовые
файлы не перезаписываются: чтобы переозвучить фразу, удалите её mp3.
    python tools/voice/brief_voice.py [голос]
"""
import json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice_note as vn

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'brief-voice')
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'Leda'
# модель можно задать: у моделей TTS свои дневные лимиты, голос (Leda) у всех один
if os.environ.get('BRIEF_TTS'): vn.model = lambda k: os.environ['BRIEF_TTS']
vn.DIRECTION = """# AUDIO PROFILE: Russian young woman, a friendly manager of a creative video and design studio, guiding a client through a short questionnaire
## THE SCENE: A website form. She speaks to one client, warmly and simply, like a helpful person sitting next to them.
### DIRECTOR'S NOTES
Style: warm, friendly, natural, with a light smile in the voice. Calm and clear, not salesy, not like a robot or a news anchor.
Pacing: natural conversational pace, slightly brisk, short pauses at commas.
Pronunciation: native Russian. Read numbers and ruble amounts as words.
#### TRANSCRIPT
"""

# фразы берём из того же файла, что и страница
js = open(os.path.join(ROOT, 'brief-data.js'), encoding='utf-8').read()
data = json.loads(subprocess.run(['node', '-e', 'global.window={};' + js + ';process.stdout.write(JSON.stringify(window.BRIEF_DATA))'],
                                 capture_output=True, text=True, encoding='utf-8', check=True).stdout)
lines = {'intro': data['intro']['say'], 'contact': data['contact']['say'], 'done': data['done']['say']}
for svc, steps in data['steps'].items():
    for st in steps: lines[f'{svc}-{st["id"]}'] = st['say']
for st in data['common']: lines[f'common-{st["id"]}'] = st['say']

os.makedirs(OUT, exist_ok=True)
for k, text in lines.items():
    out = os.path.join(OUT, k + '.mp3')
    if os.path.exists(out): continue
    vn.speak(text, out, VOICE)
    print('готово', k, round(os.path.getsize(out) / 1024), 'КБ', flush=True)
    time.sleep(2)
print('фраз', len(lines))
