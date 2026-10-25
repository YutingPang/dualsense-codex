#!/usr/bin/env python3
"""Generate desktop/main/tray-icons.ts from the tray icon shapes.

Requires Pillow (`python3 -m pip install pillow`). Run from the repo root:

    python3 scripts/gen-tray-icons.py

macOS menu-bar icons must be PNG template images: Electron's nativeImage does
not decode SVG, and returns an empty 0x0 image when it fails (the tray item is
then invisible even though `new Tray()` succeeds). The icons are emitted as
base64 so they are bundled by Vite and need no packaging asset rules.

The connected icon is a solid controller; the disconnected icon is the same
shape at reduced opacity, which macOS tints through the template alpha channel.
"""

from __future__ import annotations

import base64
import io
import pathlib

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "desktop" / "main" / "tray-icons.ts"

S = 18 * 16  # supersampled canvas
U = S / 18


def canvas() -> Image.Image:
    return Image.new("L", (S, S), 0)


def rounded(img: Image.Image, x0: float, y0: float, x1: float, y1: float, r: float) -> None:
    ImageDraw.Draw(img).rounded_rectangle(
        [x0 * U, y0 * U, x1 * U, y1 * U], radius=r * U, fill=255
    )


def ellipse(img: Image.Image, cx: float, cy: float, rx: float, ry: float) -> None:
    ImageDraw.Draw(img).ellipse(
        [(cx - rx) * U, (cy - ry) * U, (cx + rx) * U, (cy + ry) * U], fill=255
    )


def build_shape() -> Image.Image:
    base = canvas()
    rounded(base, 1.1, 4.5, 16.9, 11.9, 3.4)
    ellipse(base, 4.1, 12.2, 3.0, 3.1)
    ellipse(base, 13.9, 12.2, 3.0, 3.1)
    # Notch between the grips: without it the union reads as a blob.
    ImageDraw.Draw(base).rounded_rectangle(
        [7.0 * U, 11.4 * U, 11.0 * U, 18.0 * U], radius=1.1 * U, fill=0
    )
    base = base.filter(ImageFilter.GaussianBlur(2)).point(lambda v: 255 if v > 110 else 0)

    detail = canvas()
    draw = ImageDraw.Draw(detail)
    draw.rounded_rectangle([4.7 * U, 7.95 * U, 7.2 * U, 8.95 * U], radius=0.16 * U, fill=255)
    draw.rounded_rectangle([5.45 * U, 7.2 * U, 6.45 * U, 9.7 * U], radius=0.16 * U, fill=255)
    draw.ellipse(
        [(12.0 - 0.58) * U, (8.0 - 0.58) * U, (12.0 + 0.58) * U, (8.0 + 0.58) * U], fill=255
    )
    draw.ellipse(
        [(13.5 - 0.58) * U, (9.0 - 0.58) * U, (13.5 + 0.58) * U, (9.0 + 0.58) * U], fill=255
    )
    return ImageChops.subtract(base, detail)


def png(mask: Image.Image, size: int, opacity: int = 255) -> str:
    resized = mask.resize((size, size), Image.LANCZOS)
    if opacity != 255:
        resized = resized.point(lambda value: int(value * opacity / 255))
    image = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    image.putalpha(resized)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode()


def main() -> None:
    filled = build_shape()
    shape = png(filled, 18)
    shape2x = png(filled, 36)
    dim = png(filled, 18, opacity=120)
    dim2x = png(filled, 36, opacity=120)

    lines = [
        "// Generated menu-bar template images. Do not edit by hand.",
        "// Reproduce with: python3 scripts/gen-tray-icons.py",
        "//",
        "// macOS template images must be PNG: Electron's nativeImage cannot decode",
        "// SVG data URLs (it returns an empty 0x0 image), which made the tray icon",
        "// invisible. Connected = solid controller, disconnected = dimmed controller.",
        "",
        f"export const TRAY_ICON_CONNECTED_1X = '{shape}'",
        f"export const TRAY_ICON_CONNECTED_2X = '{shape2x}'",
        f"export const TRAY_ICON_DISCONNECTED_1X = '{dim}'",
        f"export const TRAY_ICON_DISCONNECTED_2X = '{dim2x}'",
        "",
    ]
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
