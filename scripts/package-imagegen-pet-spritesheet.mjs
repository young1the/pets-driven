import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const ATLAS_WIDTH = CELL_WIDTH * 8;
const ATLAS_HEIGHT = CELL_HEIGHT * 9;

const TARGET_ROW_COUNTS = [6, 8, 8, 4, 5, 8, 6, 6, 6];

const PET_METADATA = {
  cato: {
    displayName: "Cato",
    description:
      "A tiny lavender cat companion with soft rounded proportions, glossy eyes, rosy cheeks, and expressive Codex task animations.",
  },
  otto: {
    displayName: "Otto",
    description:
      "A tiny golden puppy companion with floppy ears, glossy eyes, rosy cheeks, and expressive Codex task animations.",
  },
  mochi: {
    displayName: "Mochi",
    description:
      "A tiny pink bunny companion with tall soft ears, glossy eyes, rosy cheeks, and expressive Codex task animations.",
  },
  fenn: {
    displayName: "Fenn",
    description:
      "A tiny coral fox companion with sharp little ears, a fluffy tail, glossy eyes, and expressive Codex task animations.",
  },
  bloop: {
    displayName: "Bloop",
    description:
      "A tiny mint frog companion with round raised eyes, rosy cheeks, a gentle goofy face, and expressive Codex task animations.",
  },
  pip: {
    displayName: "Pip",
    description:
      "A tiny sky-blue bird companion with little wings, a feather tuft, glossy eyes, and expressive Codex task animations.",
  },
};

function getArg(name, fallback) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  if (!process.argv[index + 1]) {
    throw new Error(`${name} requires a value`);
  }

  return process.argv[index + 1];
}

function getPetId() {
  const id = getArg("--id", "cato");

  if (!PET_METADATA[id]) {
    throw new Error(`Unsupported pet id: ${id}`);
  }

  return id;
}

function getOutputDir(id) {
  const codexHome =
    process.env.CODEX_HOME ||
    (process.env.USERPROFILE
      ? `${process.env.USERPROFILE}\\.codex`
      : process.env.HOME
        ? `${process.env.HOME}/.codex`
        : undefined);

  if (!codexHome) {
    throw new Error("Could not resolve CODEX_HOME, USERPROFILE, or HOME");
  }

  return resolve(codexHome, "pets", id);
}

function getSourcePath() {
  return resolve(getArg("--source"));
}

function getChromaKey() {
  const key = getArg("--key", "green");

  if (key !== "green" && key !== "magenta") {
    throw new Error("--key must be green or magenta");
  }

  return key;
}

async function main() {
  const id = getPetId();
  const sourcePath = getSourcePath();
  const chromaKey = getChromaKey();
  const metadata = PET_METADATA[id];
  const outputDir = getOutputDir(id);
  const sourceDataUrl = `data:image/png;base64,${(await readFile(sourcePath)).toString("base64")}`;
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage();

  try {
    const atlas = await page.evaluate(
      async ({ sourceDataUrl, targetRowCounts, cellWidth, cellHeight, atlasWidth, atlasHeight, chromaKey }) => {
        const image = new Image();
        image.src = sourceDataUrl;
        await image.decode();

        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = image.naturalWidth;
        sourceCanvas.height = image.naturalHeight;
        const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

        if (!sourceContext) {
          throw new Error("Could not create source canvas context");
        }

        sourceContext.drawImage(image, 0, 0);
        const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        const mask = new Uint8Array(width * height);

        function clamp(value, min, max) {
          return Math.max(min, Math.min(max, value));
        }

        function getKeyMatte(red, green, blue) {
          if (chromaKey === "magenta") {
            const key = Math.min(red, blue);
            const dominance = key - green;

            if (key > 172 && green < 138 && dominance > 28) {
              return 1;
            }

            return (
              clamp((dominance - 8) / 38, 0, 1) *
              clamp((key - 78) / 98, 0, 1) *
              clamp((215 - green) / 135, 0, 1)
            );
          }

          const nonKey = Math.max(red, blue);
          const dominance = green - nonKey;

          if (green > 172 && red < 138 && blue < 138 && dominance > 28) {
            return 1;
          }

          return (
            clamp((dominance - 8) / 38, 0, 1) *
            clamp((green - 78) / 98, 0, 1) *
            clamp((215 - nonKey) / 135, 0, 1)
          );
        }

        function applyChromaMatte(data, index, red, green, blue, alpha, matte) {
          if (chromaKey === "magenta") {
            const cap = green + 10;
            data[index * 4] = Math.round(red + (Math.min(red, cap) - red) * Math.min(1, matte * 1.4));
            data[index * 4 + 2] = Math.round(blue + (Math.min(blue, cap) - blue) * Math.min(1, matte * 1.4));
          } else {
            const cap = Math.max(red, blue) + 10;
            data[index * 4 + 1] = Math.round(green + (Math.min(green, cap) - green) * Math.min(1, matte * 1.4));
          }

          data[index * 4 + 3] = Math.round(alpha * (1 - matte));
        }

        for (let index = 0; index < width * height; index += 1) {
          const red = sourceData.data[index * 4];
          const green = sourceData.data[index * 4 + 1];
          const blue = sourceData.data[index * 4 + 2];
          const alpha = sourceData.data[index * 4 + 3];
          const matte = getKeyMatte(red, green, blue);

          if (matte > 0) {
            applyChromaMatte(sourceData.data, index, red, green, blue, alpha, Math.min(1, matte * 1.65));
          }

          if (sourceData.data[index * 4 + 3] < 8) {
            sourceData.data[index * 4] = 0;
            sourceData.data[index * 4 + 1] = 0;
            sourceData.data[index * 4 + 2] = 0;
            sourceData.data[index * 4 + 3] = 0;
          }

          if (sourceData.data[index * 4 + 3] > 22) {
            mask[index] = 1;
          }
        }

        sourceContext.putImageData(sourceData, 0, 0);

        const seen = new Uint8Array(width * height);
        const components = [];
        const queueX = [];
        const queueY = [];

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const startIndex = y * width + x;

            if (!mask[startIndex] || seen[startIndex]) {
              continue;
            }

            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let count = 0;
            queueX.length = 0;
            queueY.length = 0;
            queueX.push(x);
            queueY.push(y);
            seen[startIndex] = 1;

            for (let queueIndex = 0; queueIndex < queueX.length; queueIndex += 1) {
              const currentX = queueX[queueIndex];
              const currentY = queueY[queueIndex];
              count += 1;
              minX = Math.min(minX, currentX);
              maxX = Math.max(maxX, currentX);
              minY = Math.min(minY, currentY);
              maxY = Math.max(maxY, currentY);

              for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]) {
                const nextX = currentX + dx;
                const nextY = currentY + dy;
                const nextIndex = nextY * width + nextX;

                if (
                  nextX >= 0 &&
                  nextY >= 0 &&
                  nextX < width &&
                  nextY < height &&
                  mask[nextIndex] &&
                  !seen[nextIndex]
                ) {
                  seen[nextIndex] = 1;
                  queueX.push(nextX);
                  queueY.push(nextY);
                }
              }
            }

            if (count > 1000) {
              components.push({
                minX,
                maxX,
                minY,
                maxY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
              });
            }
          }
        }

        components.sort((left, right) => left.centerY - right.centerY);

        const rows = [];

        for (const component of components) {
          const row = rows.find(
            (candidate) => Math.abs(candidate.centerY - component.centerY) < 55,
          );

          if (row) {
            row.components.push(component);
            row.centerY =
              row.components.reduce((sum, item) => sum + item.centerY, 0) /
              row.components.length;
          } else {
            rows.push({ centerY: component.centerY, components: [component] });
          }
        }

        rows.sort((left, right) => left.centerY - right.centerY);
        for (const row of rows) {
          row.components.sort((left, right) => left.centerX - right.centerX);
        }

        const atlasCanvas = document.createElement("canvas");
        atlasCanvas.width = atlasWidth;
        atlasCanvas.height = atlasHeight;
        const atlasContext = atlasCanvas.getContext("2d", { willReadFrequently: true });

        if (!atlasContext) {
          throw new Error("Could not create atlas canvas context");
        }

        atlasContext.imageSmoothingEnabled = true;
        atlasContext.imageSmoothingQuality = "high";

        for (let rowIndex = 0; rowIndex < targetRowCounts.length; rowIndex += 1) {
          const sourceRow = rows[rowIndex]?.components ?? rows[rows.length - 1].components;
          const targetCount = targetRowCounts[rowIndex];

          for (let frameIndex = 0; frameIndex < targetCount; frameIndex += 1) {
            const sourceIndex =
              sourceRow.length === targetCount
                ? frameIndex
                : Math.min(sourceRow.length - 1, Math.round((frameIndex / Math.max(1, targetCount - 1)) * (sourceRow.length - 1)));
            const component = sourceRow[sourceIndex];
            const padding = 8;
            const cropX = Math.max(0, component.minX - padding);
            const cropY = Math.max(0, component.minY - padding);
            const cropWidth = Math.min(width - cropX, component.maxX - component.minX + 1 + padding * 2);
            const cropHeight = Math.min(height - cropY, component.maxY - component.minY + 1 + padding * 2);
            const scale = Math.min(154 / cropWidth, 174 / cropHeight, 1.35);
            const drawWidth = cropWidth * scale;
            const drawHeight = cropHeight * scale;
            const drawX = frameIndex * cellWidth + (cellWidth - drawWidth) / 2;
            const drawY = rowIndex * cellHeight + cellHeight - drawHeight - 14;

            atlasContext.drawImage(
              sourceCanvas,
              cropX,
              cropY,
              cropWidth,
              cropHeight,
              drawX,
              drawY,
              drawWidth,
              drawHeight,
            );
          }
        }

        const atlasData = atlasContext.getImageData(0, 0, atlasWidth, atlasHeight);

        for (let index = 0; index < atlasWidth * atlasHeight; index += 1) {
          const red = atlasData.data[index * 4];
          const green = atlasData.data[index * 4 + 1];
          const blue = atlasData.data[index * 4 + 2];
          const alpha = atlasData.data[index * 4 + 3];
          const matte = getKeyMatte(red, green, blue);

          if (matte > 0) {
            applyChromaMatte(atlasData.data, index, red, green, blue, alpha, Math.min(1, matte * 1.25));
          }

          if (atlasData.data[index * 4 + 3] < 8) {
            atlasData.data[index * 4] = 0;
            atlasData.data[index * 4 + 1] = 0;
            atlasData.data[index * 4 + 2] = 0;
            atlasData.data[index * 4 + 3] = 0;
          }
        }

        for (let row = 0; row < targetRowCounts.length; row += 1) {
          for (let column = 0; column < targetRowCounts[row]; column += 1) {
            const cellX = column * cellWidth;
            const cellY = row * cellHeight;
            const seen = new Uint8Array(cellWidth * cellHeight);
            const queueX = [];
            const queueY = [];

            for (let y = 0; y < cellHeight; y += 1) {
              for (let x = 0; x < cellWidth; x += 1) {
                const localIndex = y * cellWidth + x;
                const atlasIndex = (cellY + y) * atlasWidth + cellX + x;

                if (seen[localIndex] || atlasData.data[atlasIndex * 4 + 3] === 0) {
                  continue;
                }

                let count = 0;
                let minX = x;
                let maxX = x;
                let minY = y;
                let maxY = y;
                const pixels = [];
                queueX.length = 0;
                queueY.length = 0;
                queueX.push(x);
                queueY.push(y);
                seen[localIndex] = 1;

                for (let queueIndex = 0; queueIndex < queueX.length; queueIndex += 1) {
                  const currentX = queueX[queueIndex];
                  const currentY = queueY[queueIndex];
                  const currentLocal = currentY * cellWidth + currentX;
                  const currentAtlas = (cellY + currentY) * atlasWidth + cellX + currentX;
                  count += 1;
                  minX = Math.min(minX, currentX);
                  maxX = Math.max(maxX, currentX);
                  minY = Math.min(minY, currentY);
                  maxY = Math.max(maxY, currentY);
                  pixels.push(currentAtlas);

                  for (const [dx, dy] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                  ]) {
                    const nextX = currentX + dx;
                    const nextY = currentY + dy;
                    const nextLocal = nextY * cellWidth + nextX;
                    const nextAtlas = (cellY + nextY) * atlasWidth + cellX + nextX;

                    if (
                      nextX >= 0 &&
                      nextY >= 0 &&
                      nextX < cellWidth &&
                      nextY < cellHeight &&
                      !seen[nextLocal] &&
                      atlasData.data[nextAtlas * 4 + 3] !== 0
                    ) {
                      seen[nextLocal] = 1;
                      queueX.push(nextX);
                      queueY.push(nextY);
                    }
                  }
                }

                const componentWidth = maxX - minX + 1;
                const componentHeight = maxY - minY + 1;

                if (count < 120 || componentWidth < 8 || componentHeight < 8) {
                  for (const pixelIndex of pixels) {
                    atlasData.data[pixelIndex * 4 + 3] = 0;
                  }
                }
              }
            }
          }
        }

        const strokedAtlasData = new Uint8ClampedArray(atlasData.data);

        for (let row = 0; row < targetRowCounts.length; row += 1) {
          for (let column = 0; column < targetRowCounts[row]; column += 1) {
            const cellX = column * cellWidth;
            const cellY = row * cellHeight;

            for (let y = 0; y < cellHeight; y += 1) {
              for (let x = 0; x < cellWidth; x += 1) {
                const atlasIndex = (cellY + y) * atlasWidth + cellX + x;

                if (atlasData.data[atlasIndex * 4 + 3] !== 0) {
                  continue;
                }

                let maxNeighborAlpha = 0;

                for (let dy = -1; dy <= 1; dy += 1) {
                  for (let dx = -1; dx <= 1; dx += 1) {
                    if (dx === 0 && dy === 0) {
                      continue;
                    }

                    const nextX = x + dx;
                    const nextY = y + dy;

                    if (nextX < 0 || nextY < 0 || nextX >= cellWidth || nextY >= cellHeight) {
                      continue;
                    }

                    const neighborIndex = (cellY + nextY) * atlasWidth + cellX + nextX;
                    maxNeighborAlpha = Math.max(maxNeighborAlpha, atlasData.data[neighborIndex * 4 + 3]);
                  }
                }

                if (maxNeighborAlpha > 72) {
                  strokedAtlasData[atlasIndex * 4] = 42;
                  strokedAtlasData[atlasIndex * 4 + 1] = 24;
                  strokedAtlasData[atlasIndex * 4 + 2] = 52;
                  strokedAtlasData[atlasIndex * 4 + 3] = Math.min(105, Math.round(maxNeighborAlpha * 0.36));
                }
              }
            }
          }
        }

        atlasData.data.set(strokedAtlasData);

        atlasContext.putImageData(atlasData, 0, 0);

        const blob = await new Promise((resolve) =>
          atlasCanvas.toBlob(resolve, "image/png"),
        );

        if (!blob) {
          throw new Error("Could not encode atlas as WebP");
        }

        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      },
      {
        sourceDataUrl,
        targetRowCounts: TARGET_ROW_COUNTS,
        cellWidth: CELL_WIDTH,
        cellHeight: CELL_HEIGHT,
        atlasWidth: ATLAS_WIDTH,
        atlasHeight: ATLAS_HEIGHT,
        chromaKey,
      },
    );

    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, "spritesheet.webp"), Buffer.from(atlas));
    await writeFile(
      resolve(outputDir, "pet.json"),
      `${JSON.stringify(
        {
          id,
          displayName: metadata.displayName,
          description: metadata.description,
          spritesheetPath: "spritesheet.webp",
        },
        null,
        2,
      )}\n`,
    );
    console.log(`packaged ${id}: ${resolve(outputDir, "spritesheet.webp")}`);
  } finally {
    await browser.close();
  }
}

await main();
