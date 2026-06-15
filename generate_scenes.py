#!/usr/bin/env python3
"""
Stickman Video Scene Generator — "How People Entertained Themselves in the Past"
Generates 52 scene images via the Higgsfield AI API.

Usage:
    export HIGGSFIELD_API_KEY="your_api_key_here"
    python generate_scenes.py

Images are saved to ./output/scene_XX.png
"""

import os
import sys
import time
import json
import pathlib
import requests

# ── Config ──────────────────────────────────────────────────────────────────
API_KEY = os.environ.get("HIGGSFIELD_API_KEY", "")
BASE_URL = "https://api.higgsfield.ai/v1"
OUTPUT_DIR = pathlib.Path("output")
RETRY_DELAY = 5          # seconds between poll attempts
MAX_POLL_TRIES = 60      # ~5 minutes per image at 5-second intervals
REQUEST_PAUSE = 1.5      # seconds between successive generation calls

# ── Stickman base style injected into every prompt ─────────────────────────
STYLE_SUFFIX = (
    "Simple black stickman with a round head, clean smooth lines, "
    "thin consistent line thickness, minimalist flat style, simple expressive face, "
    "consistent body proportions, modern flat illustration, "
    "plain white minimal background, warm and curious storytelling tone, "
    "16:9 aspect ratio."
)

# ── 52 scene prompts ────────────────────────────────────────────────────────
SCENES = [
    # Act 1 — Hook + Earliest Humans
    (1,  "He stands holding a blank switched-off phone in one hand, looking at it bored and unsure, shoulders slightly slumped. Prop: a plain switched-off phone."),
    (2,  "He stands with one finger on his chin, head tilted, thinking, holding a small card with a question mark on it. Prop: a question-mark card."),
    (3,  "He smiles and tosses a simple round ball up in the air with one hand, relaxed and playful. Prop: a small ball."),
    (4,  "He sits cross-legged beside a small campfire, mouth open mid-speech, telling a story with a lively face. Prop: a small campfire with logs and flame."),
    (5,  "He sits and gestures with both hands as he tells a tale, eyebrows raised, animated and dramatic. Prop: the small campfire beside him."),
    (6,  "He stands at a small cave-wall panel, painting a simple animal shape on it, focused expression, holding a torch in the other hand. Prop: a cave-wall panel and a torch."),
    (7,  "He points proudly at a finished cave painting of a deer, smiling. Prop: a cave wall with a simple deer painting."),
    (8,  "He sits tapping a simple hand drum, head bobbing, happy rhythm face. Prop: a small hand drum."),
    (9,  "He dances with both arms raised and one knee lifted, joyful open-mouth smile, shaking a tambourine. Prop: a tambourine."),
    (10, "He stands with both arms open wide, warm big smile, the campfire glowing beside him. Prop: a small campfire."),

    # Act 2 — Ancient Egypt, Greece, Rome
    (11, "He sits at a low table, moving a piece on an ancient grid board game, curious focused face. Prop: an ancient grid board game on a low table."),
    (12, "He holds two dice up near his face, mid-roll, excited grin. Prop: two dice."),
    (13, "He holds a single theater drama mask in front of part of his face, playful expression. Prop: a theater drama mask."),
    (14, "He holds up two masks, one happy and one sad, presenting them with an expressive face. Prop: a comedy mask and a tragedy mask."),
    (15, "He sits on a simple stone bench as an audience member, clapping his hands, delighted face looking forward. Prop: a stone bench."),
    (16, "He stands leaning forward with wide excited eyes, hands ready, holding a small banner. Prop: a small banner."),
    (17, "He stands in a brave pose holding a small sword and a round shield, determined face. Prop: a small sword and a round shield."),
    (18, "He leans forward holding chariot reins as if racing, thrilled face, one simple wheel beside him. Prop: chariot reins and a wheel."),
    (19, "He sits relaxed leaning back with a towel over his shoulders, calm happy face, a small steam cloud nearby. Prop: a towel and steam."),
    (20, "He stands tall with one arm raised, holding a laurel wreath, confident proud smile. Prop: a laurel wreath."),

    # Act 3 — Middle Ages
    (21, "He gives a small shrug turning into a hopeful smile, standing beside a simple wooden stool. Prop: a wooden stool."),
    (22, "He wears a jester's hat and juggles three balls, silly happy grin. Prop: a jester hat and three juggling balls."),
    (23, "He holds a long jousting lance forward, brave focused face, a small flag on the tip. Prop: a jousting lance with a flag."),
    (24, "He cheers with both fists up, big excited smile, waving a small flag. Prop: a small flag."),
    (25, "He holds a small lute and strums it, singing face with a gentle smile. Prop: a lute (small string instrument)."),
    (26, "He holds a small fair flag in one hand and a snack on a stick in the other, happy. Prop: a fair flag and a festival snack."),
    (27, "He holds up a small hand puppet on one hand, playful smile. Prop: a hand puppet."),
    (28, "He sits at a chessboard with his hand on a chess piece, thinking hard, focused face. Prop: a chessboard."),
    (29, "He sits holding a fan of playing cards close to his chest, sly confident smile. Prop: playing cards."),
    (30, "He stands holding a single lit candle, soft warm smile in the dim glow. Prop: a lit candle."),

    # Act 4 — 1600s–1700s Theaters & Taverns
    (31, "He stands pointing toward a small stage with a curtain, eager hopeful face. Prop: a small theater stage with a curtain."),
    (32, "He sits on a wooden bench as audience, leaning in with wide eyes and open mouth, amazed. Prop: a wooden bench."),
    (33, "He sits raising a mug, singing with eyes closed, cheerful face. Prop: a mug."),
    (34, "He dances holding a long ribbon that curves through the air, lively joyful face. Prop: a long ribbon."),
    (35, "He stands wearing a carnival mask with confetti around him, festive grin. Prop: a carnival mask and confetti."),
    (36, "He sits holding an open book up, reading aloud with an animated face. Prop: an open book."),
    (37, "He sits at a small upright piano with his hands on the keys, gentle happy smile. Prop: a small upright piano."),
    (38, "He stands singing with one hand on his chest, music notes floating around his head, happy face. Prop: floating music notes."),

    # Act 5 — 1800s Victorian Home Fun
    (39, "He sits at a small table with a board game, relaxed family-fun smile. Prop: a board game on a table."),
    (40, "He strikes a charades pose, arms acting out a shape, playful focused face, a small guess card nearby. Prop: a guess card."),
    (41, "He stands beside a magic lantern projector that casts a beam of light, curious face. Prop: a magic lantern projector."),
    (42, "He juggles pins in a circus pose with a tiny top hat, big showman smile. Prop: juggling pins and a small top hat."),
    (43, "He sits curled up reading a small cheap novel, excited absorbed face. Prop: a small paperback novel."),
    (44, "He sits at a piano playing happily, eyes bright, a candle resting on top of the piano. Prop: a piano with a candle."),
    (45, "He stands next to an old phonograph with a big horn, surprised and delighted face. Prop: a phonograph with a horn."),

    # Act 6 — 1900s Film, Radio, TV + Takeaway
    (46, "He sits watching a small old film screen with a film reel beside him, amazed face. Prop: a film reel and a small screen."),
    (47, "He sits holding a tub of popcorn, wide-eyed and grinning at something off to the side. Prop: a tub of popcorn."),
    (48, "He sits close to an old radio set, leaning in to listen, focused happy face. Prop: a vintage radio."),
    (49, "He laughs with his head tipped back and a hand on his belly, beside the old radio. Prop: a vintage radio."),
    (50, "He sits in front of a chunky old TV set with antenna, eyes glued to it, smiling. Prop: an old TV with antenna."),
    (51, "He stands holding a small glowing modern screen, thoughtful soft expression. Prop: a small modern screen."),
    (52, "He stands with both arms open, warm big smile, holding an old book in one hand and a modern phone in the other. Prop: an old book and a phone."),
]


def build_prompt(description: str) -> str:
    return (
        f"Use the same stickman character as before. {description} "
        f"Plain white minimal background. 16:9 aspect ratio. {STYLE_SUFFIX}"
    )


def generate_image(session: requests.Session, scene_num: int, prompt: str) -> str | None:
    """Submit a generation job and return the job/image id."""
    payload = {
        "prompt": prompt,
        "aspect_ratio": "16:9",
        "style": "illustration",
        "num_images": 1,
    }
    try:
        resp = session.post(
            f"{BASE_URL}/images/generations",
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        job_id = data.get("id") or data.get("job_id") or data.get("request_id")
        if not job_id:
            print(f"  [Scene {scene_num:02d}] Unexpected response: {data}")
            return None
        return str(job_id)
    except requests.HTTPError as exc:
        print(f"  [Scene {scene_num:02d}] HTTP error during generation: {exc} — {exc.response.text}")
        return None
    except requests.RequestException as exc:
        print(f"  [Scene {scene_num:02d}] Network error: {exc}")
        return None


def poll_for_result(session: requests.Session, scene_num: int, job_id: str) -> str | None:
    """Poll until the job is done and return an image URL."""
    for attempt in range(1, MAX_POLL_TRIES + 1):
        time.sleep(RETRY_DELAY)
        try:
            resp = session.get(f"{BASE_URL}/images/generations/{job_id}", timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            print(f"  [Scene {scene_num:02d}] Poll error (attempt {attempt}): {exc}")
            continue

        status = data.get("status", "").lower()
        if status in ("completed", "succeeded", "done"):
            # Try common response shapes
            images = data.get("images") or data.get("data") or []
            if images:
                return images[0].get("url") or images[0].get("image_url")
            url = data.get("url") or data.get("image_url")
            if url:
                return url
            print(f"  [Scene {scene_num:02d}] Job done but no URL found: {data}")
            return None
        elif status in ("failed", "error"):
            print(f"  [Scene {scene_num:02d}] Job failed: {data.get('error', data)}")
            return None
        else:
            print(f"  [Scene {scene_num:02d}] Status: {status} (attempt {attempt}/{MAX_POLL_TRIES})")

    print(f"  [Scene {scene_num:02d}] Timed out waiting for result.")
    return None


def download_image(session: requests.Session, url: str, path: pathlib.Path) -> bool:
    try:
        resp = session.get(url, timeout=60)
        resp.raise_for_status()
        path.write_bytes(resp.content)
        return True
    except requests.RequestException as exc:
        print(f"  Download failed: {exc}")
        return False


def main() -> None:
    if not API_KEY:
        print("ERROR: Set the HIGGSFIELD_API_KEY environment variable before running.")
        sys.exit(1)

    OUTPUT_DIR.mkdir(exist_ok=True)

    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    })

    print(f"Generating {len(SCENES)} scenes → {OUTPUT_DIR.resolve()}\n")

    results = {"success": [], "failed": []}

    for scene_num, description in SCENES:
        out_path = OUTPUT_DIR / f"scene_{scene_num:02d}.png"
        if out_path.exists():
            print(f"[Scene {scene_num:02d}] Already exists, skipping.")
            results["success"].append(scene_num)
            continue

        prompt = build_prompt(description)
        print(f"[Scene {scene_num:02d}] Submitting …")

        job_id = generate_image(session, scene_num, prompt)
        if not job_id:
            results["failed"].append(scene_num)
            continue

        print(f"[Scene {scene_num:02d}] Job ID: {job_id} — polling …")
        image_url = poll_for_result(session, scene_num, job_id)

        if not image_url:
            results["failed"].append(scene_num)
            continue

        print(f"[Scene {scene_num:02d}] Downloading from {image_url[:60]}…")
        if download_image(session, image_url, out_path):
            print(f"[Scene {scene_num:02d}] Saved → {out_path}")
            results["success"].append(scene_num)
        else:
            results["failed"].append(scene_num)

        time.sleep(REQUEST_PAUSE)

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"Done.  Success: {len(results['success'])}/52  |  Failed: {len(results['failed'])}/52")
    if results["failed"]:
        print(f"Failed scenes: {results['failed']}")
    print("=" * 60)

    # Save a manifest
    manifest = {
        "total": 52,
        "success": results["success"],
        "failed": results["failed"],
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Manifest saved → {OUTPUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
