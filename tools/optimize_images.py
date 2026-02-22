import os
import sys
from pathlib import Path
from PIL import Image

#Use from repo folder: python tools\optimize_images.py images

ALLOWED = {".jpg", ".jpeg", ".png"}

def human(n: int) -> str:
    for unit in ["B","KB","MB","GB"]:
        if n < 1024 or unit == "GB":
            return f"{n:.1f}{unit}" if unit != "B" else f"{n}{unit}"
        n /= 1024
    return f"{n:.1f}GB"

def optimize_one(path: Path, quality: int, max_w: int, method: int) -> tuple[int,int,bool]:
    ext = path.suffix.lower()
    if ext not in ALLOWED:
        return (0, 0, False)

    before = path.stat().st_size
    out = path.with_suffix(".webp")

    # If already webp exists, skip (you can change this behavior if you want)
    if out.exists():
        return (before, out.stat().st_size, False)

    try:
        with Image.open(path) as im:
            im.load()

            # Convert modes safely (keep alpha for PNG)
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if ("A" in im.getbands()) else "RGB")

            # Resize if wider than max_w
            w, h = im.size
            if max_w and w > max_w:
                new_h = int(h * (max_w / w))
                im = im.resize((max_w, new_h), Image.LANCZOS)

            tmp = out.with_suffix(".webp.tmp")
            im.save(
                tmp,
                "WEBP",
                quality=quality,
                method=method,      # 0..6 (6 = best compression)
                optimize=True
            )

        after = tmp.stat().st_size
        os.replace(tmp, out)

        # Delete original only after success
        path.unlink(missing_ok=True)
        return (before, after, True)

    except Exception as e:
        print(f"[FAIL] {path}: {e}")
        return (before, before, False)

def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("images")
    quality = int(os.environ.get("WEBP_QUALITY", "80"))
    max_w = int(os.environ.get("MAX_W", "1920"))
    method = int(os.environ.get("WEBP_METHOD", "6"))

    if not root.exists():
        print(f"Root not found: {root}")
        sys.exit(1)

    total_before = 0
    total_after = 0
    converted = 0
    scanned = 0

    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in ALLOWED:
            continue

        scanned += 1
        b, a, ok = optimize_one(p, quality, max_w, method)
        total_before += b
        total_after += a
        if ok:
            converted += 1
            print(f"[OK] {p} -> {p.with_suffix('.webp').name}  ... {human(b)} -> {human(a)}")

    saved = total_before - total_after
    print("\n--- Summary ---")
    print(f"Scanned:   {scanned}")
    print(f"Converted: {converted}")
    print(f"Before:    {human(total_before)}")
    print(f"After:     {human(total_after)}")
    print(f"Saved:     {human(saved)}")

if __name__ == "__main__":
    main()
