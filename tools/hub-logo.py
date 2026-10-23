# Логотип Hub ADERVIS в системе суббрендов ADERVIS (как ADERVIS Stock):
# Eurostile Extended Black, «ADERVIS» над названием продукта, одна буква —
# золотая фигура с градиентом #f6bd3a → #c8901f. Здесь «U» в HUB — открытая
# капсула: чаша, в которой собирается всё, что знает студия. Строка HUB
# крупнее, чтобы обе строки были одной ширины.
# Запуск: python tools/hub-logo.py  (нужен шрифт Eurostile Extended Black в системе)
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'brand', 'hub')
FONT = next(p for p in [os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Windows\Fonts\Eurostile Extended-Black.ttf'),
                        r'C:\Windows\Fonts\Eurostile Extended-Black.ttf'] if os.path.exists(p))
f = TTFont(FONT)
gs, cmap = f.getGlyphSet(), f.getBestCmap()
CAP = f['OS/2'].sCapHeight          # 667
STEM = 203                          # толщина стойки шрифта: «U» рисуем той же толщиной
GOLD = ('<linearGradient id="hubGold" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" stop-color="#f6bd3a"/><stop offset="1" stop-color="#c8901f"/></linearGradient>')

def glyph(ch, x, y, s):
    pen = SVGPathPen(gs)
    gs[cmap[ord(ch)]].draw(TransformPen(pen, (s, 0, 0, -s, x, y)))
    return pen.getCommands(), gs[cmap[ord(ch)]].width * s

def word(text, x, y, s):
    out = []
    for ch in text:
        d, w = glyph(ch, x, y, s); out.append(d); x += w
    return ' '.join(out), x

def u_capsule(x, y, w, h, t):
    """Открытая сверху капсула: стенки толщиной t и скруглённое дно."""
    r = min(w / 2, h * 0.62); ri = r - t
    return (f'M{x:.1f},{y - h:.1f} L{x:.1f},{y - r:.1f} A{r:.1f},{r:.1f} 0 0 0 {x + r:.1f},{y:.1f} L{x + w - r:.1f},{y:.1f} '
            f'A{r:.1f},{r:.1f} 0 0 0 {x + w:.1f},{y - r:.1f} L{x + w:.1f},{y - h:.1f} L{x + w - t:.1f},{y - h:.1f} L{x + w - t:.1f},{y - r:.1f} '
            f'A{ri:.1f},{ri:.1f} 0 0 1 {x + w - r:.1f},{y - t:.1f} L{x + r:.1f},{y - t:.1f} A{ri:.1f},{ri:.1f} 0 0 1 {x + t:.1f},{y - r:.1f} '
            f'L{x + t:.1f},{y - h:.1f} Z')

def svg(view, body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img"><title>{title}</title><defs>{GOLD}</defs>{body}</svg>\n'

def wordmark(ink):
    _, L = word('ADERVIS', 0, 0, 1)
    _, hw = glyph('H', 0, 0, 1); _, bw = glyph('B', 0, 0, 1)
    sp, uw = CAP * 0.07, CAP * 3.0
    k = L / (hw + uw + bw + 2 * sp)
    y1, y2 = CAP, CAP * 1.3 + CAP * k
    a_d, _ = word('ADERVIS', 0, y1, 1)
    h_d, _ = glyph('H', 0, y2, k)
    ux = (hw + sp) * k
    b_d, _ = glyph('B', ux + (uw + sp) * k, y2, k)
    body = (f'<path d="{a_d}" fill="{ink}"/><path d="{h_d} {b_d}" fill="{ink}"/>'
            f'<path d="{u_capsule(ux, y2, uw * k, CAP * k, STEM * k)}" fill="url(#hubGold)"/>')
    pad = CAP * 0.15
    return svg(f'{-pad:.0f} {-pad:.0f} {L + 2 * pad:.0f} {y2 + 2 * pad:.0f}', body, 'Hub ADERVIS')

def mark(square, shape, rounded=True):
    n, w, h = 1000, 560, 470
    x, y = (n - w) / 2, n / 2 + h / 2
    sq = f'<rect width="{n}" height="{n}" rx="{220 if rounded else 0}" fill="{square}"/>' if square else ''
    return svg(f'0 0 {n} {n}', sq + f'<path d="{u_capsule(x, y, w, h, 120)}" fill="{shape}"/>', 'Hub ADERVIS')

os.makedirs(OUT, exist_ok=True)
files = {
    'hub-logo-on-dark.svg': wordmark('#ffffff'),
    'hub-logo-on-light.svg': wordmark('#141414'),
    'hub-mark-gold.svg': mark('url(#hubGold)', '#141414'),       # аватар, иконка приложения
    'hub-favicon.svg': mark('#141414', 'url(#hubGold)'),          # вкладка браузера
    'hub-u.svg': mark(None, '#141414'),                           # только «U» — для плашки в меню
}
for name, text in files.items():
    open(os.path.join(OUT, name), 'w', encoding='utf-8').write(text)
print('готово:', ', '.join(files))
