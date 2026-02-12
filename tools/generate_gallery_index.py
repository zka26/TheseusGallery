from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple


SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass(frozen=True)
class ImageEntry:
    missionId: str
    filename: str


def _is_supported_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_EXTS


def _scan_images(images_root: Path) -> Tuple[Dict[str, List[str]], List[ImageEntry]]:
    by_mission: Dict[str, List[str]] = {}
    all_images: List[ImageEntry] = []

    if not images_root.exists():
        return by_mission, all_images

    # Expect: /images/<missionId>/*.ext
    for mission_dir in sorted((p for p in images_root.iterdir() if p.is_dir()), key=lambda p: p.name.lower()):
        mission_id = mission_dir.name

        filenames = sorted(
            (p.name for p in mission_dir.iterdir() if _is_supported_image(p)),
            key=lambda s: s.lower(),
        )

        if not filenames:
            continue

        by_mission[mission_id] = filenames
        all_images.extend(ImageEntry(missionId=mission_id, filename=fn) for fn in filenames)

    return by_mission, all_images


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    images_root = repo_root / "images"
    data_root = repo_root / "data"
    data_root.mkdir(parents=True, exist_ok=True)

    by_mission, all_images = _scan_images(images_root)

    payload = {
        "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "byMission": by_mission,
        "allImages": [e.__dict__ for e in all_images],
    }

    out_path = data_root / "gallery_index.json"
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    mission_count = len(by_mission)
    image_count = len(all_images)
    print(f"Wrote {out_path.relative_to(repo_root)} ({mission_count} missions, {image_count} images)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())