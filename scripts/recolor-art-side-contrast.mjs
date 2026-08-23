import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const ROOT = resolve(import.meta.dirname, '..')
const FIXTURE_PATH = join(ROOT, 'tests/fixtures/art-side-contrast-targets.json')
const ALPHA_FLOOR = 16
const EXPECTED_BASELINE_SHA = 'd50289114a92dc363aca7c90f060600884efab04'
const ASSET_ROOT = resolve(ROOT, 'src/ui/art/assets')
const TRANSACTION_PATH = join(ROOT, 'work-docs/.art-side-contrast-recolor-transaction.json')

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function luminance(r, g, b) {
  const linear = (channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function mix(start, end, amount) {
  return start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount))
}

function toneFor(sourceY, minimum, maximum) {
  return clamp((sourceY - minimum) / (maximum - minimum), 0, 1)
}

function sourceMaterial(r, g, b) {
  const maximum = Math.max(r, g, b)
  if (maximum <= 52) return 'outline'
  if (r >= 110 && g >= 70 && b <= g * 0.82) return 'gold'
  if (b >= r * 1.2 && b >= g * 1.04) return 'blue'
  if (r >= g * 1.3 && r >= b * 1.3) return 'warm'
  if (r >= 130 && g >= 110 && b >= 90) return 'light'
  return 'neutral'
}

function palettePixel(r, g, b, side) {
  const sourceY = luminance(r, g, b)
  const material = sourceMaterial(r, g, b)

  if (material === 'outline') return side === 'white' ? [8, 18, 38] : [0, 0, 0]
  if (material === 'gold') {
    return side === 'white'
      ? mix([163, 153, 102], [250, 235, 180], toneFor(sourceY, 0.08, 0.65))
      : mix([85, 52, 12], [180, 125, 35], toneFor(sourceY, 0.08, 0.65))
  }
  if (material === 'blue') {
    return side === 'white'
      ? mix([90, 130, 175], [200, 220, 240], toneFor(sourceY, 0.01, 0.22))
      : mix([35, 0, 10], [70, 5, 22], toneFor(sourceY, 0.01, 0.22))
  }
  if (material === 'warm') {
    return side === 'white'
      ? mix([211, 188, 155], [250, 239, 216], toneFor(sourceY, 0.02, 0.16))
      : mix([132, 42, 55], [198, 82, 97], toneFor(sourceY, 0.02, 0.16))
  }
  if (material === 'light') {
    return side === 'white' ? [250, 240, 220] : [190, 120, 113]
  }

  return side === 'white' ? [216, 198, 171] : [128, 54, 64]
}

function resolveFixtureAsset(relativePath, pairName, side) {
  const expected = `src/ui/art/assets/piece-${pairName}-${side}.webp`
  if (relativePath !== expected) {
    throw new Error(`fixture path mismatch for ${pairName} ${side}: ${relativePath}`)
  }
  const absolute = resolve(ROOT, relativePath)
  const relativeToAssets = resolve(absolute).slice(`${ASSET_ROOT}${process.platform === 'win32' ? '\\' : '/'}`.length)
  if (relativeToAssets !== `piece-${pairName}-${side}.webp` || !absolute.startsWith(`${ASSET_ROOT}/`)) {
    throw new Error(`fixture path escapes asset root for ${pairName} ${side}`)
  }
  return absolute
}

function readBaselineAsset(relativePath, baselineSha) {
  return execFileSync('git', ['show', `${baselineSha}:${relativePath}`], { cwd: ROOT })
}

function removeIfExists(path) {
  if (existsSync(path)) unlinkSync(path)
}

function cleanupTransaction(transaction) {
  removeIfExists(transaction.whiteTemporaryPath)
  removeIfExists(transaction.blackTemporaryPath)
  removeIfExists(transaction.whiteBackup)
  removeIfExists(transaction.blackBackup)
  removeIfExists(TRANSACTION_PATH)
}

function restoreTransaction(transaction) {
  if (existsSync(transaction.whiteBackup)) copyFileSync(transaction.whiteBackup, transaction.whitePath)
  if (existsSync(transaction.blackBackup)) copyFileSync(transaction.blackBackup, transaction.blackPath)
  cleanupTransaction(transaction)
}

function recoverInterruptedTransaction() {
  if (!existsSync(TRANSACTION_PATH)) return
  const transaction = JSON.parse(readFileSync(TRANSACTION_PATH, 'utf8'))
  restoreTransaction(transaction)
}

async function transform(sourceBuffer, outputPath, side) {
  const { data, info } = await sharp(sourceBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const output = Buffer.from(data)
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels
    if (data[offset + 3] < ALPHA_FLOOR) {
      output[offset] = 0
      output[offset + 1] = 0
      output[offset + 2] = 0
      output[offset + 3] = 0
      continue
    }
    const [r, g, b] = palettePixel(data[offset], data[offset + 1], data[offset + 2], side)
    output[offset] = r
    output[offset + 1] = g
    output[offset + 2] = b
  }

  const temporaryPath = `${outputPath}.tmp-${process.pid}-${side}`
  await sharp(output, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .webp({ lossless: true })
    .toFile(temporaryPath)
  renameSync(temporaryPath, outputPath)
}

async function main() {
  recoverInterruptedTransaction()
  if (!existsSync(FIXTURE_PATH)) throw new Error(`fixture not found: ${FIXTURE_PATH}`)
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
  if (fixture.baselineSha !== EXPECTED_BASELINE_SHA) {
    throw new Error(`fixture baseline must remain ${EXPECTED_BASELINE_SHA}`)
  }
  const affected = fixture.pairs.filter((pair) => pair.affected)
  if (affected.length === 0) throw new Error('fixture contains no affected pairs')

  for (const pair of affected) {
    const whitePath = resolveFixtureAsset(pair.white, pair.name, 'white')
    const blackPath = resolveFixtureAsset(pair.black, pair.name, 'black')
    const transaction = {
      whitePath,
      blackPath,
      whiteTemporaryPath: `${whitePath}.pair-${process.pid}-white`,
      blackTemporaryPath: `${blackPath}.pair-${process.pid}-black`,
      whiteBackup: `${whitePath}.backup-${process.pid}-white`,
      blackBackup: `${blackPath}.backup-${process.pid}-black`,
    }
    writeFileSync(TRANSACTION_PATH, `${JSON.stringify(transaction)}\n`)
    try {
      copyFileSync(whitePath, transaction.whiteBackup)
      copyFileSync(blackPath, transaction.blackBackup)
      await transform(readBaselineAsset(pair.white, fixture.baselineSha), transaction.whiteTemporaryPath, 'white')
      await transform(readBaselineAsset(pair.black, fixture.baselineSha), transaction.blackTemporaryPath, 'black')
      renameSync(transaction.whiteTemporaryPath, whitePath)
      renameSync(transaction.blackTemporaryPath, blackPath)
      cleanupTransaction(transaction)
    } catch (error) {
      restoreTransaction(transaction)
      throw error
    }
    console.log(`recolored ${pair.name}`)
  }
}

await main()
