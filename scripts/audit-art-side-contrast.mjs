import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const ASSET_DIR = resolve(ROOT, 'src/ui/art/assets')
const FIXTURE_PATH = resolve(ROOT, 'tests/fixtures/art-side-contrast-targets.json')
const AUDIT_PATH = resolve(ROOT, 'work-docs/ART-AUDIT-archer-side-contrast.md')
const PREVIEW_DIR = resolve(ROOT, 'work-docs/art-previews')
const ALPHA_FLOOR = 16
const WARM_OVERLAP_TRIGGER = 0.2
const SIDE_VALUE_REVIEW_BOUNDARY = 1.25
const REVIEW_MARGIN = 0.03
const BASELINE_SHA = 'd50289114a92dc363aca7c90f060600884efab04'

const relativeAsset = (file) => relative(ROOT, file).replaceAll('\\', '/')

function atomicWrite(file, contents) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, contents)
  renameSync(temporary, file)
}

function replacePreviewDirectory(stage) {
  if (!stage) return
  const backup = `${PREVIEW_DIR}.previous-${process.pid}`
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true })
  if (existsSync(PREVIEW_DIR)) renameSync(PREVIEW_DIR, backup)
  try {
    renameSync(stage, PREVIEW_DIR)
  } catch (error) {
    if (existsSync(backup)) renameSync(backup, PREVIEW_DIR)
    throw error
  }
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true })
}

function discoverPairs() {
  const files = readdirSync(ASSET_DIR)
  const names = files
    .filter((file) => /^piece-.+-white\.webp$/.test(file))
    .map((file) => file.slice('piece-'.length, -'-white.webp'.length))
    .sort()

  if (names.length !== 33) {
    throw new Error(`expected 33 white piece assets, found ${names.length}`)
  }

  for (const name of names) {
    const black = join(ASSET_DIR, `piece-${name}-black.webp`)
    if (!existsSync(black)) throw new Error(`missing black pair for ${name}`)
  }

  return names.map((name) => ({
    name,
    white: join(ASSET_DIR, `piece-${name}-white.webp`),
    black: join(ASSET_DIR, `piece-${name}-black.webp`),
  }))
}

function dataUrl(file) {
  return `data:image/webp;base64,${readFileSync(file).toString('base64')}`
}

function baselineDataUrl(relativePath) {
  const bytes = execFileSync('git', ['show', `${BASELINE_SHA}:${relativePath}`], { cwd: ROOT })
  return `data:image/webp;base64,${bytes.toString('base64')}`
}

async function measurePair(page, pair, sourceUrls = null) {
  return page.evaluate(
    async ({ black, white, alphaFloor }) => {
      const srgb = (channel) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      }
      const luminance = (r, g, b) =>
        0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const load = (src) =>
        new Promise((resolveImage, reject) => {
          const image = new Image()
          image.onload = () => resolveImage(image)
          image.onerror = () => reject(new Error(`could not decode ${src.slice(0, 48)}`))
          image.src = src
        })
      const draw = (image, size) => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) throw new Error('2d canvas context unavailable')
        context.clearRect(0, 0, size, size)
        context.drawImage(image, 0, 0, size, size)
        return context.getImageData(0, 0, size, size).data
      }
      const summarize = (data) => {
        let opaque = 0
        let warm = 0
        let blue = 0
        let red = 0
        let meanY = 0
        const mask = new Uint8Array(data.length / 4)
        for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
          if (data[i + 3] < alphaFloor) continue
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          mask[pixel] = 1
          opaque += 1
          meanY += luminance(r, g, b)
          if (r >= 96 && r - g >= 25 && r - b >= 25) warm += 1
          if (b - Math.max(r, g) >= 18) blue += 1
          if (r - Math.max(g, b) >= 18) red += 1
        }
        return {
          opaque,
          warm,
          blueShare: opaque ? blue / opaque : 0,
          redShare: opaque ? red / opaque : 0,
          meanY: opaque ? meanY / opaque : 0,
          mask,
        }
      }
      const compare = (whiteData, blackData) => {
        const whiteSummary = summarize(whiteData)
        const blackSummary = summarize(blackData)
        let shared = 0
        let warmBoth = 0
        let intersection = 0
        let union = 0
        for (let i = 0; i < whiteSummary.mask.length; i += 1) {
          const whiteOpaque = whiteSummary.mask[i] === 1
          const blackOpaque = blackSummary.mask[i] === 1
          if (whiteOpaque || blackOpaque) union += 1
          if (!whiteOpaque || !blackOpaque) continue
          shared += 1
          intersection += 1
          const whiteOffset = i * 4
          const blackOffset = i * 4
          const whiteWarm =
            whiteData[whiteOffset] >= 96 &&
            whiteData[whiteOffset] - whiteData[whiteOffset + 1] >= 25 &&
            whiteData[whiteOffset] - whiteData[whiteOffset + 2] >= 25
          const blackWarm =
            blackData[blackOffset] >= 96 &&
            blackData[blackOffset] - blackData[blackOffset + 1] >= 25 &&
            blackData[blackOffset] - blackData[blackOffset + 2] >= 25
          if (whiteWarm && blackWarm) warmBoth += 1
        }
        return {
          whiteOpaque: whiteSummary.opaque,
          blackOpaque: blackSummary.opaque,
          whiteWarmShare: whiteSummary.opaque ? whiteSummary.warm / whiteSummary.opaque : 0,
          blackWarmShare: blackSummary.opaque ? blackSummary.warm / blackSummary.opaque : 0,
          sharedWarmOverlap: shared ? warmBoth / shared : 1,
          opponentMargin: Math.min(
            whiteSummary.blueShare - blackSummary.blueShare,
            blackSummary.redShare - whiteSummary.redShare,
          ),
          maskIou: union ? intersection / union : 0,
          sideValueRatio: ratio(whiteSummary.meanY, blackSummary.meanY),
          whiteMeanY: whiteSummary.meanY,
          blackMeanY: blackSummary.meanY,
        }
      }

      const whiteImage = await load(white)
      const blackImage = await load(black)
      const measurements = Object.fromEntries(
        [192, 28, 40, 55].map((size) => [
          String(size),
          compare(draw(whiteImage, size), draw(blackImage, size)),
        ]),
      )
      return {
        naturalSize: {
          white: [whiteImage.naturalWidth, whiteImage.naturalHeight],
          black: [blackImage.naturalWidth, blackImage.naturalHeight],
        },
        measurements,
      }
    },
    {
      black: sourceUrls?.black ?? dataUrl(pair.black),
      white: sourceUrls?.white ?? dataUrl(pair.white),
      alphaFloor: ALPHA_FLOOR,
    },
  )
}

async function renderPreviews(page, pair) {
  return page.evaluate(
    async ({ black, white }) => {
      const load = (src) =>
        new Promise((resolveImage, reject) => {
          const image = new Image()
          image.onload = () => resolveImage(image)
          image.onerror = () => reject(new Error(`could not decode ${src.slice(0, 48)}`))
          image.src = src
        })
      const render = (whiteImage, blackImage, size, grayscale) => {
        const canvas = document.createElement('canvas')
        const gap = Math.max(4, Math.ceil(size * 0.08))
        canvas.width = size * 2 + gap
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) throw new Error('2d canvas context unavailable')
        context.imageSmoothingEnabled = true
        context.filter = grayscale ? 'grayscale(1)' : 'none'
        context.drawImage(whiteImage, 0, 0, size, size)
        context.drawImage(blackImage, size + gap, 0, size, size)
        context.filter = 'none'
        return canvas.toDataURL('image/png')
      }
      const whiteImage = await load(white)
      const blackImage = await load(black)
      return Object.fromEntries(
        [192, 28, 40, 55].map((size) => [
          String(size),
          {
            color: render(whiteImage, blackImage, size, false),
            grayscale: render(whiteImage, blackImage, size, true),
          },
        ]),
      )
    },
    { black: dataUrl(pair.black), white: dataUrl(pair.white) },
  )
}

function isBorderline(name, source) {
  return (
    name === 'archer' ||
    Math.abs(source.sharedWarmOverlap - WARM_OVERLAP_TRIGGER) <= REVIEW_MARGIN ||
    Math.abs(source.sideValueRatio - SIDE_VALUE_REVIEW_BOUNDARY) <= REVIEW_MARGIN
  )
}

function markdown(fixture) {
  const rows = fixture.pairs
    .map((pair) => {
      const source = pair.metrics.source
      const review = pair.manualReview
      return `| ${pair.name} | ${pair.affected ? 'include' : 'exclude'} | ${pair.borderline ? 'yes' : 'no'} | ${source.sharedWarmOverlap.toFixed(3)} | ${source.sideValueRatio.toFixed(3)} | ${source.opponentMargin.toFixed(3)} | ${source.maskIou.toFixed(3)} | ${review?.disposition ?? 'pending'} | ${review?.rationale ?? 'pending Codex review'} |`
    })
    .join('\n')
  return `# ART-AUDIT — archer-side-contrast\n\n- Baseline SHA: \`${fixture.baselineSha}\`\n- Pair count: ${fixture.pairs.length}\n- Metric decoder: Playwright Chromium canvas\n- Alpha inclusion: alpha >= ${ALPHA_FLOOR}/255\n- Selection: archer is mandatory; include when shared warm overlap >= ${WARM_OVERLAP_TRIGGER} or source side-value ratio < ${SIDE_VALUE_REVIEW_BOUNDARY}\n- Borderline review margin: +/-${REVIEW_MARGIN} around either selection threshold, plus archer\n\n| Pair | Affected | Borderline | Shared warm overlap | Side-value ratio | Opponent margin | Mask IoU | Review | Rationale |\n|---|---:|---:|---:|---:|---:|---:|---|---|\n${rows}\n`
}

async function main() {
  const shouldWrite = process.argv.includes('--write')
  const pairs = discoverPairs()
  const existing = existsSync(FIXTURE_PATH)
    ? JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    : { pairs: [] }
  if (existing.baselineSha && existing.baselineSha !== BASELINE_SHA) {
    throw new Error(`fixture baseline must remain ${BASELINE_SHA}`)
  }
  const priorReviews = new Map(existing.pairs?.map((pair) => [pair.name, pair.manualReview]) ?? [])
  const priorAffected = new Map(existing.pairs?.map((pair) => [pair.name, pair.affected]) ?? [])
  const priorBorderline = new Map(existing.pairs?.map((pair) => [pair.name, pair.borderline]) ?? [])
  const priorMetrics = new Map(existing.pairs?.map((pair) => [pair.name, pair.metrics]) ?? [])
  const baselineSha = BASELINE_SHA
  const previewStage = shouldWrite ? `${PREVIEW_DIR}.stage-${process.pid}` : null
  if (previewStage) {
    if (existsSync(previewStage)) rmSync(previewStage, { recursive: true, force: true })
    mkdirSync(previewStage, { recursive: true })
  }
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const measuredPairs = []
  try {
    for (const pair of pairs) {
      const measured = await measurePair(page, pair, {
        black: baselineDataUrl(relativeAsset(pair.black)),
        white: baselineDataUrl(relativeAsset(pair.white)),
      })
      const source = measured.measurements['192']
      const borderline = priorBorderline.has(pair.name) ? priorBorderline.get(pair.name) : isBorderline(pair.name, source)
      const review = priorReviews.get(pair.name)
      const autoAffected =
        pair.name === 'archer' ||
        source.sharedWarmOverlap >= WARM_OVERLAP_TRIGGER ||
        source.sideValueRatio < SIDE_VALUE_REVIEW_BOUNDARY
      const affected = review
        ? review.disposition === 'include'
        : priorAffected.has(pair.name)
          ? priorAffected.get(pair.name)
          : autoAffected
      if (shouldWrite && (borderline || affected)) {
        const previews = await renderPreviews(page, pair)
        for (const [size, variants] of Object.entries(previews)) {
          for (const [variant, data] of Object.entries(variants)) {
            const encoded = data.slice(data.indexOf(',') + 1)
            const previewPath = join(previewStage, `${pair.name}-${size}-${variant}.png`)
            writeFileSync(previewPath, Buffer.from(encoded, 'base64'))
          }
        }
      }
      measuredPairs.push({
        name: pair.name,
        white: relativeAsset(pair.white),
        black: relativeAsset(pair.black),
        affected,
        borderline,
        metrics:
          priorMetrics.get(pair.name) ?? {
            naturalSize: measured.naturalSize,
            source,
            rendered: {
              28: measured.measurements['28'],
              40: measured.measurements['40'],
              55: measured.measurements['55'],
            },
          },
        ...(review ? { manualReview: review } : {}),
      })
    }
  } finally {
    await browser.close()
  }

  replacePreviewDirectory(previewStage)

  const fixture = {
    version: 1,
    baselineSha,
    pairs: measuredPairs,
  }
  if (shouldWrite) {
    atomicWrite(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`)
    atomicWrite(AUDIT_PATH, markdown(fixture))
    console.log(`wrote ${relative(ROOT, FIXTURE_PATH)} and ${relative(ROOT, AUDIT_PATH)}`)
  } else {
    console.log(JSON.stringify(fixture, null, 2))
  }
}

await main()
