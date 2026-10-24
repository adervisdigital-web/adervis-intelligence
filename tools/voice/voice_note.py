"""Голосовая сводка по клиенту: короткий живой рассказ «что за клиент и что дальше» в mp3.
Голос — Gemini TTS с режиссёрскими заметками. Ключ — GEMINI_API_KEY (переменная окружения
или переменная пользователя Windows); в коде и выводе его нет.

    python tools/voice/voice_note.py <текст.txt> <выход.mp3> [голос]
"""
import base64, json, os, re, subprocess, sys, tempfile, time, urllib.error, urllib.request, wave

API = "https://generativelanguage.googleapis.com/v1beta"

# Модели 3.x читают вслух всё, что похоже на текст, поэтому структура «режиссёр → актёр»:
# профиль, сцена, заметки и отдельный блок ТРАНСКРИПТ — звучит только он.
DIRECTION = """# AUDIO PROFILE: Russian male, a friendly producer at a video studio, telling his colleague about a client
## THE SCENE: A short voice message in a work chat. The colleague forgot who this client is; the producer quickly and vividly brings him up to speed.
### DIRECTOR'S NOTES
Style: lively, warm and expressive, with a smile in the voice, genuinely interested in the project. Conversational, like a real person, never like a robot or a news anchor. Clear emphasis on names, numbers and the next step.
Pacing: brisk but clear, short natural pauses between thoughts.
Pronunciation: native Russian. Read numbers as words.
#### TRANSCRIPT
"""


def key():
    k = os.environ.get("GEMINI_API_KEY")
    if not k and os.name == "nt":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as h:
                k = winreg.QueryValueEx(h, "GEMINI_API_KEY")[0]
        except OSError:
            k = None
    if not k:   # тот же файл секретов, что у озвучки промо CRM: вне всех репозиториев
        f = os.path.join(os.path.expanduser("~"), "Desktop", "ADERVIS CRM", "_secrets_outside_repo", "API key voice.txt")
        if os.path.exists(f):
            m = re.search(r"^\s*((?:AIza|AQ\.)\S{20,})\s*$", open(f, encoding="utf-8-sig").read(), re.M)
            k = m.group(1) if m else None
    if not k:
        sys.exit("Нет GEMINI_API_KEY")
    return k


def call(url, k, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", "x-goog-api-key": k})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 4:
                time.sleep(8 * (attempt + 1)); continue
            sys.exit(f"Gemini {e.code}: {e.read().decode(errors='replace')[:300]}")


def model(k):
    names = [m["name"].split("/")[-1] for m in call(f"{API}/models?pageSize=200", k).get("models", [])
             if "tts" in m["name"] and "generateContent" in m.get("supportedGenerationMethods", [])]
    if not names:
        sys.exit("TTS-моделей нет")
    ver = lambda n: float((re.findall(r"(\d+(?:\.\d+)?)", n) or [0])[0])
    return sorted(names, key=lambda n: (ver(n), "flash" in n and "lite" not in n, "pro" not in n), reverse=True)[0]


def speak(text, out, voice="Puck"):
    k = key(); m = model(k)
    body = {"contents": [{"parts": [{"text": DIRECTION + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    part = call(f"{API}/models/{m}:generateContent", k, body)["candidates"][0]["content"]["parts"][0]["inlineData"]
    data, mime = base64.b64decode(part["data"]), part.get("mimeType", "")
    wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    if data[:4] == b"RIFF":
        open(wav, "wb").write(data)
    else:   # голый PCM 16 бит моно
        rate = int((re.search(r"rate=(\d+)", mime) or [0, 24000])[1])
        with wave.open(wav, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(data)
    # громкость как у голосовых в мессенджерах, тишину по краям срезаем
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af",
                    "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5",
                    "-c:a", "libmp3lame", "-q:a", "2", out], check=True)
    os.remove(wav)
    return m


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    used = speak(open(src, encoding="utf-8").read().strip(), dst, sys.argv[3] if len(sys.argv) > 3 else "Puck")
    print("модель", used, "файл", dst)
