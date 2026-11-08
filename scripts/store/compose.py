#!/usr/bin/env python3
"""
Turn the raw captures from shots.cjs into captioned store screenshots, at the exact sizes
the stores require, written where the release pipeline uploads them from:
  iPhone 6.9"  1320x2868 -> fastlane/screenshots/<locale>/iphone69-NN-name.png   (App Store)
  iPad 13"     2064x2752 -> fastlane/screenshots/<locale>/ipad13-NN-name.png     (App Store)
  Android      1242x2208 -> fastlane/metadata/android/<locale>/images/phoneScreenshots/N.png (Play)
Run: python3 scripts/store/compose.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "store-screenshots" / "raw"
FONT = ROOT / "node_modules/@expo-google-fonts/unbounded/700Bold/Unbounded_700Bold.ttf"

PETROL_TOP, PETROL_BOTTOM = (18, 98, 105), (9, 58, 62)
IVORY, BRASS, BRASS_LIGHT = (242, 232, 213), (201, 151, 58), (230, 194, 122)

# Store order. The first three are what most people see in search results.
SHOTS = [
    ("01-align", "Spin the rings.\nCrack the lock.", "Tournez les bagues.\nOuvrez la serrure."),
    ("02-celebrate", "Every lock you open\nis a celebration", "Chaque serrure ouverte\nse fête"),
    ("03-safe", "Crack safes\nby feel", "Ouvrez des coffres-forts\nau toucher"),
    ("04-rush", "Golden Rush:\ngrab every coin", "Ruée vers l’or :\nraflez les pièces"),
    ("06-home", "A new lock\nevery day", "Une nouvelle serrure\nchaque jour"),
    ("05-lockbox", "Collect dial\nstyles", "Collectionnez\nles styles de cadran"),
    ("07-gears", "200 levels,\nnew twists", "200 niveaux,\nde nouveaux défis"),
]

# canvas size, screen width, caption font size, caption top margin, bottom margin
LAYOUT = {
    "iphone69": dict(size=(1320, 2868), screen_w=1080, font=88, top=170, bottom=70),
    "ipad13": dict(size=(2064, 2752), screen_w=1560, font=100, top=170, bottom=80),
    "android": dict(size=(1242, 2208), screen_w=960, font=74, top=120, bottom=60),
}


def background(size):
    w, h = size
    img = Image.new("RGB", size)
    top, bot = PETROL_TOP, PETROL_BOTTOM
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    # soft brass glow behind the screen
    glow = Image.new("L", size, 0)
    d = ImageDraw.Draw(glow)
    d.ellipse((w * 0.05, h * 0.3, w * 0.95, h * 0.85), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.12))
    img.paste(Image.new("RGB", size, BRASS), (0, 0), glow)
    return img


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius=radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out, mask


def compose(raw_path, caption, device):
    L = LAYOUT[device]
    W, H = L["size"]
    canvas = background((W, H)).convert("RGBA")
    raw = Image.open(raw_path).convert("RGB")
    sw = L["screen_w"]
    sh = round(raw.height * sw / raw.width)
    screen = raw.resize((sw, sh), Image.LANCZOS)
    radius = round(sw * 0.07)
    screen, mask = rounded(screen, radius)
    x = (W - sw) // 2
    y = H - sh - L["bottom"]
    # shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sm = Image.new("L", (W, H), 0)
    sm.paste(mask, (x, y + round(sw * 0.02)))
    sm = sm.filter(ImageFilter.GaussianBlur(sw * 0.03))
    shadow.putalpha(sm.point(lambda v: v * 0.55))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(screen, (x, y))
    # brass bezel line
    ImageDraw.Draw(canvas).rounded_rectangle((x - 3, y - 3, x + sw + 2, y + sh + 2), radius=radius + 3, outline=BRASS_LIGHT, width=max(3, sw // 300))
    # caption, centred, up to two lines, shrunk to fit above the screen
    size = L["font"]
    draw = ImageDraw.Draw(canvas)
    while True:
        font = ImageFont.truetype(str(FONT), size)
        lines = caption.split("\n")
        widths = [draw.textlength(t, font=font) for t in lines]
        lh = round(size * 1.18)
        block = lh * len(lines)
        if max(widths) <= W * 0.88 and L["top"] + block <= y - size * 0.6:
            break
        size -= 2
    ty = L["top"] + max(0, (y - size * 0.6 - L["top"] - block) // 2)
    for t, tw in zip(lines, widths):
        draw.text(((W - tw) / 2, ty), t, font=font, fill=IVORY)
        ty += lh
    return canvas.convert("RGB")


def main():
    shots_dir = ROOT / "fastlane" / "screenshots"
    for locale, lang in (("fr-CA", 2), ("en-US", 1)):
        ios = shots_dir / locale
        ios.mkdir(parents=True, exist_ok=True)
        for old in ios.glob("*.png"):
            old.unlink()
        play = ROOT / "fastlane" / "metadata" / "android" / locale / "images" / "phoneScreenshots"
        play.mkdir(parents=True, exist_ok=True)
        for old in play.glob("*.png"):
            old.unlink()
        for i, (name, en, fr) in enumerate(SHOTS, start=1):
            caption = fr if lang == 2 else en
            for device in ("iphone69", "ipad13"):
                img = compose(RAW / device / locale / f"{name}.png", caption, device)
                assert img.size == LAYOUT[device]["size"]
                img.save(ios / f"{device}-{i:02d}-{name[3:]}.png", optimize=True)
            img = compose(RAW / "android" / locale / f"{name}.png", caption, "android")
            img.save(play / f"{i}.png", optimize=True)
        print(locale, "done")


if __name__ == "__main__":
    main()
