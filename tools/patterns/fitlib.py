import json, numpy as np
from PIL import Image, ImageFilter
W, H = 320, 180
BW, BH = 3 * W, 3 * H
pts = json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'mark-points.json')))
HOLE = np.array(pts['hole']); OUTER = np.array(pts['outer'])
C = np.array([1080.5, 1046.5]); O = np.array([1080.5, 775.1]); STEP = 0.732; RINGS = 7
ALL = np.vstack([HOLE, OUTER] + [O + (OUTER - O) * (1 + STEP * n) for n in range(1, RINGS + 1)])

def project(p):
    rot, scale, cx, cy = p
    k = scale * 0.82 * H / 1269
    q = (ALL - C) * k
    a = np.radians(rot); c, s = np.cos(a), np.sin(a)
    return q[:, 0] * c - q[:, 1] * s + W * cx, q[:, 0] * s + q[:, 1] * c + H * cy

def soft(mask, r):
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    a = np.asarray(im, dtype=np.float32); m = a.max()
    return a / m if m > 0 else a

_cache = {}
def edges(i):
    if i in _cache: return _cache[i]
    g = Image.open(f"D:/01. ADERVIS/ADERVIS Брендбук 2026/Патерны/паттерн{i}.jpg").convert('L')
    a = np.asarray(g, dtype=np.float32)
    bg = np.asarray(g.filter(ImageFilter.GaussianBlur(9)), dtype=np.float32)
    line = ((a - bg) > 14).astype(np.uint8)
    im = Image.fromarray(line * 255).resize((W * 4, H * 4), Image.BOX).filter(ImageFilter.MaxFilter(3)).resize((W, H), Image.BOX)
    _cache[i] = (np.asarray(im, dtype=np.float32) > 10).astype(np.float32)
    return _cache[i]

def scorer(E, r):
    Es = soft(E, r)
    def f(p):
        x, y = project(p)
        ok = (x >= 0) & (x < W) & (y >= 0) & (y < H)
        if ok.sum() < 250: return 0.0
        xi, yi = x[ok].astype(int), y[ok].astype(int)
        prec = Es[yi, xi].mean()
        M = np.zeros((H, W), np.float32); M[yi, xi] = 1
        rec = (E * soft(M, r)).sum() / max(E.sum(), 1)
        return 2 * prec * rec / (prec + rec + 1e-9)
    return f

def climb(f, p, step, rounds):
    best = f(p)
    for _ in range(rounds):
        imp = True
        while imp:
            imp = False
            for i in range(4):
                for sg in (-1, 1):
                    q = p.copy(); q[i] += sg * step[i]
                    sc = f(q)
                    if sc > best: best, p, imp = sc, q, True
        step = step / 2
    return best, p

def render_big(rot, scale, r):
    x, y = project(np.array([rot, scale, 1.5, 1.5]))
    x = x - W * 1.5 + BW / 2; y = y - H * 1.5 + BH / 2
    ok = (x >= 0) & (x < BW) & (y >= 0) & (y < BH)
    M = np.zeros((BH, BW), np.float32); M[y[ok].astype(int), x[ok].astype(int)] = 1
    return np.asarray(Image.fromarray((M * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255

def fit(i, rots, scales):
    E = edges(i)
    Epad = np.zeros((BH, BW), np.float32); Epad[:H, :W] = soft(E, 2.0)
    FE = np.conj(np.fft.rfft2(Epad)); fC = scorer(E, 2.2)
    res = []
    for rot in rots:
        for scale in scales:
            corr = np.fft.irfft2(FE * np.fft.rfft2(render_big(rot, scale, 2.0)), s=(BH, BW))[:2 * H + 1, :2 * W + 1]
            v, u = np.unravel_index(np.argmax(corr), corr.shape)
            p = np.array([rot, scale, (BW / 2 - u) / W, (BH / 2 - v) / H])
            res.append((fC(p), p))
    res.sort(key=lambda t: -t[0])
    return max((climb(fC, p.copy(), np.array([3, .08, .02, .02]), 6) for _, p in res[:6]), key=lambda t: t[0])

def rec(s, p):
    return dict(score=round(float(s), 3), rot=round(float(((p[0] + 180) % 360) - 180), 1),
                scale=round(float(p[1]), 3), cx=round(float(p[2]), 3), cy=round(float(p[3]), 3))
