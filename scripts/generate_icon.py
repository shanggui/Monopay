from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)

W = H = 1024

# Palette
BG_TOP = (9, 48, 37)
BG_BOTTOM = (22, 92, 70)
CREAM_LIGHT = (255, 247, 228)
CREAM = (247, 233, 203)
CREAM_DARK = (236, 213, 174)
GOLD_LIGHT = (250, 213, 132)
GOLD = (232, 178, 86)
GOLD_DARK = (176, 116, 42)
MINT = (124, 210, 174)
DARK = (10, 42, 33)
SPINE_TOP = (24, 96, 73)
SPINE_BOTTOM = (9, 48, 37)


def hexrgb(value: str):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def diagonal_gradient(size, c1, c2, wx=0.35, wy=0.65):
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx / w * wx + yy / h * wy) / (wx + wy)
    t = np.clip(t, 0, 1)[..., None]
    c1 = np.array(c1, dtype=np.float32)
    c2 = np.array(c2, dtype=np.float32)
    arr = c1 * (1 - t) + c2 * t
    return Image.fromarray(np.uint8(np.clip(arr, 0, 255)), "RGB")


def vertical_gradient(size, c1, c2):
    w, h = size
    t = np.linspace(0, 1, h)[:, None, None]
    c1 = np.array(c1, dtype=np.float32)
    c2 = np.array(c2, dtype=np.float32)
    arr = c1 * (1 - t) + c2 * t
    arr = np.repeat(arr, w, axis=1)
    return Image.fromarray(np.uint8(np.clip(arr, 0, 255)), "RGB")


def radial_alpha(size, center, radius, strength=1.0):
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2)
    a = np.clip(1 - d / radius, 0, 1) ** 2
    a = (a * 255 * strength).astype(np.uint8)
    return Image.fromarray(a, "L")


def rounded_shadow(box, radius, offset, blur, alpha):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x1, y1, x2, y2 = box
    d.rounded_rectangle(
        (x1 + offset[0], y1 + offset[1], x2 + offset[0], y2 + offset[1]),
        radius=radius,
        fill=(0, 0, 0, alpha),
    )
    return layer.filter(ImageFilter.GaussianBlur(blur))


# 1. Background
bg = diagonal_gradient((W, H), BG_TOP, BG_BOTTOM).convert("RGBA")

glow = Image.new("RGBA", (W, H), (232, 178, 86, 0))
glow.putalpha(radial_alpha((W, H), (650, 340), 560, 0.22))
bg = Image.alpha_composite(bg, glow)

# Subtle board grid
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid)
for i in range(1, 5):
    x = int(W * i / 5)
    gd.line((x, 0, x, H), fill=(124, 210, 174, 11), width=2)
    y = int(H * i / 5)
    gd.line((0, y, W, y), fill=(124, 210, 174, 11), width=2)
bg = Image.alpha_composite(bg, grid)

# 2. Ledger card shadow + card
card_box = (220, 230, 720, 830)
bg = Image.alpha_composite(bg, rounded_shadow(card_box, 64, (0, 26), 38, 105))

card_mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(card_mask).rounded_rectangle(card_box, radius=64, fill=255)
card_gradient = vertical_gradient((W, H), CREAM_LIGHT, CREAM_DARK)
card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
card.paste(card_gradient, (0, 0), card_mask)
bg = Image.alpha_composite(bg, card)

# 3. Left book spine
spine_mask = Image.new("L", (W, H), 0)
sd = ImageDraw.Draw(spine_mask)
sd.rounded_rectangle((220, 230, 310, 830), radius=64, fill=255)
sd.rectangle((270, 230, 310, 830), fill=255)
spine_gradient = vertical_gradient((W, H), SPINE_TOP, SPINE_BOTTOM)
spine = Image.new("RGBA", (W, H), (0, 0, 0, 0))
spine.paste(spine_gradient, (0, 0), spine_mask)
bg = Image.alpha_composite(bg, spine)

# Spine rings
rings = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rd = ImageDraw.Draw(rings)
for cy in (400, 500, 600):
    rd.ellipse((248, cy - 13, 274, cy + 13), fill=(232, 178, 86, 255))
    rd.ellipse((255, cy - 5, 267, cy + 5), fill=(18, 72, 55, 255))
bg = Image.alpha_composite(bg, rings)

# Card edge highlight
edge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ed = ImageDraw.Draw(edge)
ed.rounded_rectangle(card_box, radius=64, outline=(255, 255, 255, 52), width=3)
bg = Image.alpha_composite(bg, edge)

# 4. Ledger content
content = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(content)

# header rule + short title line
cd.rounded_rectangle((350, 300, 560, 305), radius=2, fill=(232, 178, 86, 200))
cd.rounded_rectangle((350, 330, 500, 348), radius=9, fill=(10, 42, 33, 55))

# rows
for y, width in ((530, 310), (610, 250), (690, 190)):
    cd.rounded_rectangle((350, y, 350 + width, y + 24), radius=12, fill=(10, 42, 33, 68))

# total bar
cd.rounded_rectangle((350, 750, 610, 774), radius=12, fill=(232, 178, 86, 232))
cd.rounded_rectangle((370, 758, 470, 766), radius=4, fill=(10, 42, 33, 95))

bg = Image.alpha_composite(bg, content)

# 5. Coin shadow + coin
coin_box = (465, 155, 835, 525)
coin_center = (650, 340)
bg = Image.alpha_composite(bg, rounded_shadow(coin_box, 185, (0, 20), 30, 115))

coin_mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(coin_mask).ellipse(coin_box, fill=255)
coin_gradient = vertical_gradient((W, H), GOLD_LIGHT, GOLD_DARK)
coin = Image.new("RGBA", (W, H), (0, 0, 0, 0))
coin.paste(coin_gradient, (0, 0), coin_mask)
bg = Image.alpha_composite(bg, coin)

# Coin rim + inner ring + top highlight
coin_detail = Image.new("RGBA", (W, H), (0, 0, 0, 0))
dd = ImageDraw.Draw(coin_detail)
dd.ellipse(coin_box, outline=(176, 116, 42, 255), width=16)
dd.ellipse((480, 170, 820, 510), outline=(255, 255, 255, 62), width=4)
dd.ellipse((505, 195, 795, 485), outline=(176, 116, 42, 205), width=6)
dd.arc((480, 170, 820, 510), 200, 320, fill=(255, 255, 255, 95), width=10)
bg = Image.alpha_composite(bg, coin_detail)

# 6. Monogram M
m = Image.new("RGBA", (W, H), (0, 0, 0, 0))
md = ImageDraw.Draw(m)
points = [(590, 430), (590, 285), (650, 370), (710, 285), (710, 430)]
md.line(points, fill=DARK, width=46, joint="curve")
for px, py in (points[0], points[-1]):
    md.ellipse((px - 23, py - 23, px + 23, py + 23), fill=DARK)
bg = Image.alpha_composite(bg, m)

# 7. Gentle vignette
yy, xx = np.mgrid[0:H, 0:W]
d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
a = np.clip((d - 0.72) / 0.55, 0, 1) ** 1.3 * 42
vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
vignette.putalpha(Image.fromarray(a.astype(np.uint8), "L"))
bg = Image.alpha_composite(bg, vignette)

icon = bg.convert("RGB")
for size in (1024, 512, 256, 144):
    resized = icon.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(OUT / f"icon-{size}.png", optimize=True)

# Rounded display variants (upload still uses the square 144)
mask = Image.new("L", (W * 4, H * 4), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    (0, 0, W * 4 - 1, H * 4 - 1), radius=220 * 4, fill=255
)
mask = mask.resize((W, H), Image.Resampling.LANCZOS)
rounded = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rounded.paste(icon.convert("RGBA"), (0, 0), mask)
for size in (1024, 512):
    rounded.resize((size, size), Image.Resampling.LANCZOS).save(
        OUT / f"icon-rounded-{size}.png", optimize=True
    )

# 8. SVG source (simplified vector twin)
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#093025"/>
      <stop offset="1" stop-color="#165C46"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF7E4"/>
      <stop offset="1" stop-color="#ECD5AE"/>
    </linearGradient>
    <linearGradient id="spine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#186049"/>
      <stop offset="1" stop-color="#093025"/>
    </linearGradient>
    <linearGradient id="coin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FAD584"/>
      <stop offset="1" stop-color="#D79539"/>
    </linearGradient>
    <filter id="blurCard" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
    <filter id="blurCoin" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="20"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g stroke="#7CD2AE" stroke-opacity=".08" stroke-width="2">
    <path d="M205 0V1024M410 0V1024M614 0V1024M819 0V1024"/>
    <path d="M0 205H1024M0 410H1024M0 614H1024M0 819H1024"/>
  </g>
  <rect x="220" y="256" width="500" height="600" rx="64" fill="#000" opacity=".22" filter="url(#blurCard)"/>
  <rect x="220" y="230" width="500" height="600" rx="64" fill="url(#card)" stroke="#FFFFFF" stroke-opacity=".2" stroke-width="3"/>
  <path d="M284 230H272C243.3 230 220 253.3 220 282V778C220 806.7 243.3 830 272 830H284V230Z" fill="url(#spine)"/>
  <g fill="#E8B256">
    <circle cx="261" cy="400" r="13"/><circle cx="261" cy="500" r="13"/><circle cx="261" cy="600" r="13"/>
  </g>
  <g fill="#124837">
    <circle cx="261" cy="400" r="5"/><circle cx="261" cy="500" r="5"/><circle cx="261" cy="600" r="5"/>
  </g>
  <rect x="350" y="300" width="210" height="5" rx="2" fill="#E8B256" opacity=".72"/>
  <rect x="350" y="330" width="150" height="18" rx="9" fill="#0A2A21" opacity=".22"/>
  <g fill="#0A2A21" opacity=".27">
    <rect x="350" y="530" width="310" height="24" rx="12"/>
    <rect x="350" y="610" width="250" height="24" rx="12"/>
    <rect x="350" y="690" width="190" height="24" rx="12"/>
  </g>
  <rect x="350" y="750" width="260" height="24" rx="12" fill="#E8B256" opacity=".91"/>
  <rect x="370" y="758" width="100" height="8" rx="4" fill="#0A2A21" opacity=".37"/>
  <circle cx="650" cy="360" r="185" fill="#000" opacity=".22" filter="url(#blurCoin)"/>
  <circle cx="650" cy="340" r="185" fill="url(#coin)"/>
  <circle cx="650" cy="340" r="185" fill="none" stroke="#B0742A" stroke-width="16"/>
  <circle cx="650" cy="340" r="170" fill="none" stroke="#FFFFFF" stroke-opacity=".24" stroke-width="4"/>
  <circle cx="650" cy="340" r="145" fill="none" stroke="#B0742A" stroke-opacity=".8" stroke-width="6"/>
  <path d="M590 430V285L650 370L710 285V430" fill="none" stroke="#0A2A21" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""
(OUT / "icon.svg").write_text(svg, encoding="utf-8")

print("generated")
for p in sorted(OUT.glob("icon*")):
    print(p.relative_to(ROOT), p.stat().st_size)
