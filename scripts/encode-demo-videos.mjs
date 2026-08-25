// Transcodes the repo-root `docs/assets/*.gif` demo clips into an H.264 MP4 and
// a first-frame WebP poster that sit next to them. The GIFs stay the source of
// truth — GitHub's README renderer only animates GIFs — while the landing site
// plays the MP4s, which are roughly a sixth of the bytes for the same clip
// (5.6 MB of GIF becomes 0.9 MB of MP4).
//
// The poster is what the card shows before the clip is scrolled to, and what it
// keeps showing if the browser refuses muted autoplay (a data-saver setting, or
// iOS Low Power Mode). Without it a refused clip is a blank rectangle.
//
// This is NOT part of dev/build: it shells out to ffmpeg, which is not
// available in every CI image, so the MP4s are committed alongside their GIFs.
// Run it by hand (`pnpm encode-demos`) whenever a GIF under docs/assets/
// changes, and commit what it writes.
//
// Idempotent by mtime: a clip is re-encoded only when its GIF is newer than the
// MP4 beside it. Pass --force to re-encode everything.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "docs/assets");
const force = process.argv.includes("--force");

// CRF 22 keeps terminal text in the screen recordings legible; the default 23
// already starts to smear the thin strokes of the monospace glyphs.
const CRF = "22";

if (!existsSync(SRC)) {
  console.error(`[encode-demo-videos] missing source directory: ${SRC}`);
  process.exit(1);
}

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("[encode-demo-videos] ffmpeg not found on PATH — install it and re-run.");
  process.exit(1);
}

let encoded = 0;
const gifs = readdirSync(SRC).filter((name) => name.endsWith(".gif"));

for (const name of gifs) {
  const from = join(SRC, name);
  const stem = name.slice(0, -4);
  const mp4 = join(SRC, `${stem}.mp4`);
  const poster = join(SRC, `${stem}.webp`);
  const fresh = (out) => existsSync(out) && statSync(out).mtimeMs >= statSync(from).mtimeMs;
  if (!force && fresh(mp4) && fresh(poster)) continue;

  execFileSync(
    "ffmpeg",
    [
      ...["-y", "-v", "error", "-i", from],
      // GIF frames can be odd-sized; yuv420p demands even dimensions.
      ...["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"],
      ...["-c:v", "libx264", "-crf", CRF, "-preset", "slow", "-pix_fmt", "yuv420p"],
      // The clips are silent, and faststart puts the index up front so playback
      // can begin before the whole file has arrived.
      ...["-an", "-movflags", "+faststart"],
      mp4,
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "ffmpeg",
    [...["-y", "-v", "error", "-i", from, "-frames:v", "1", "-c:v", "libwebp", "-q:v", "80"], poster],
    { stdio: "inherit" },
  );
  encoded += 1;
}

console.log(`[encode-demo-videos] ${gifs.length} gif(s) checked, ${encoded} encoded -> ${SRC}`);
