import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import png2icons from 'png2icons'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const iconsDir = resolve(root, 'build/app/icons')
if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true })

const svgPath = resolve(root, 'electron/renderer/public/icon.svg')
if (!existsSync(svgPath)) {
  console.error('icon.svg not found at', svgPath)
  process.exit(1)
}

const svgBuffer = readFileSync(svgPath)

async function generatePNG(size, name) {
  const buf = await sharp(svgBuffer).resize(size, size).png().toBuffer()
  writeFileSync(resolve(iconsDir, name), buf)
  console.log(`  ${name}  (${size}x${size})`)
}

async function createIco() {
  const sourcePng = await sharp(svgBuffer).resize(1024, 1024).png().toBuffer()
  const ico = png2icons.createICO(sourcePng, png2icons.BICUBIC2, 0, false, true)
  if (!ico) throw new Error('Failed to generate icon.ico')
  writeFileSync(resolve(iconsDir, 'icon.ico'), ico)
  console.log('  icon.ico')
}

async function createMacIcon() {
  const sourcePng = await sharp(svgBuffer).resize(1024, 1024).png().toBuffer()
  const icns = png2icons.createICNS(sourcePng, png2icons.BICUBIC2, 0)
  if (!icns) throw new Error('Failed to generate icon.icns')
  writeFileSync(resolve(iconsDir, 'icon.icns'), icns)
  console.log('  icon.icns')
}

async function main() {
  console.log('Generating app icons...')

  await createIco()

  await generatePNG(16, 'icon_16x16.png')
  await generatePNG(32, 'icon_32x32.png')
  await generatePNG(64, 'icon_64x64.png')
  await generatePNG(128, 'icon_128x128.png')
  await generatePNG(256, 'icon_256x256.png')
  await generatePNG(512, 'icon_512x512.png')
  await generatePNG(1024, 'icon_1024x1024.png')

  await generatePNG(256, 'icon.png')
  await createMacIcon()

  console.log('Done. Icons generated in', iconsDir)
}

main().catch(console.error)
