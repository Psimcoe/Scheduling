from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "assets" / "brand" / "source-logo.png"
WEB_PUBLIC_DIR = ROOT / "web" / "packages" / "frontend" / "public"
DESKTOP_ASSETS_DIR = ROOT / "ScheduleSync.Desktop" / "Assets"
INSTALLER_ASSETS_DIR = ROOT / "installer" / "Assets"

ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate brand assets from the source logo PNG.")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Path to the source PNG.",
    )
    return parser.parse_args()


def make_square(image: Image.Image) -> Image.Image:
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    offset = ((side - image.width) // 2, (side - image.height) // 2)
    canvas.paste(image, offset, image)
    return canvas


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def write_png(image: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    resized(image, size).save(path, format="PNG")


def write_ico(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="ICO", sizes=ICO_SIZES)


def main() -> None:
    args = parse_args()
    source_path = args.source.resolve()
    if not source_path.exists():
        raise SystemExit(f"Source logo not found: {source_path}")

    with Image.open(source_path) as source_image:
        source = source_image.convert("RGBA")

    square = make_square(source)

    write_png(square, WEB_PUBLIC_DIR / "logo.png", 512)
    write_png(square, WEB_PUBLIC_DIR / "apple-touch-icon.png", 180)
    write_png(square, WEB_PUBLIC_DIR / "favicon-32x32.png", 32)
    write_png(square, WEB_PUBLIC_DIR / "favicon-16x16.png", 16)
    write_ico(square, WEB_PUBLIC_DIR / "favicon.ico")

    write_png(square, DESKTOP_ASSETS_DIR / "AppLogo.png", 256)
    write_ico(square, DESKTOP_ASSETS_DIR / "AppIcon.ico")

    write_ico(square, INSTALLER_ASSETS_DIR / "AppIcon.ico")


if __name__ == "__main__":
    main()
