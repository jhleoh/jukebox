import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import toIco from 'to-ico'

const projectRoot = path.resolve(process.cwd())
const buildDir = path.join(projectRoot, 'build')
const pngPath = path.join(buildDir, 'icon.png')
const icoPath = path.join(buildDir, 'icon.ico')

function lerp(start, end, t) {
  return Math.round(start + (end - start) * t)
}

function drawRoundedRect(png, x, y, width, height, radius, color) {
  const [r, g, b, a] = color
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const left = px - x
      const right = x + width - 1 - px
      const top = py - y
      const bottom = y + height - 1 - py
      const cornerX = Math.min(left, right)
      const cornerY = Math.min(top, bottom)

      if (cornerX < radius && cornerY < radius) {
        const dx = radius - cornerX
        const dy = radius - cornerY
        if (dx * dx + dy * dy > radius * radius) {
          continue
        }
      }

      const idx = (png.width * py + px) * 4
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = a
    }
  }
}

function drawCircle(png, centerX, centerY, radius, color) {
  const [r, g, b, a] = color
  for (let y = Math.floor(centerY - radius); y <= centerY + radius; y += 1) {
    for (let x = Math.floor(centerX - radius); x <= centerX + radius; x += 1) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
        continue
      }

      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy > radius * radius) {
        continue
      }

      const idx = (png.width * y + x) * 4
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = a
    }
  }
}

async function buildIcon() {
  await fs.mkdir(buildDir, { recursive: true })

  const size = 1024
  const png = new PNG({ width: size, height: size })

  for (let y = 0; y < size; y += 1) {
    const t = y / (size - 1)
    const r = lerp(12, 56, t)
    const g = lerp(57, 107, t)
    const b = lerp(100, 185, t)

    for (let x = 0; x < size; x += 1) {
      const idx = (size * y + x) * 4
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }

  drawRoundedRect(png, 138, 138, 748, 748, 140, [239, 248, 255, 235])
  drawCircle(png, 512, 512, 250, [30, 81, 138, 255])
  drawCircle(png, 512, 512, 160, [242, 249, 255, 255])
  drawCircle(png, 512, 512, 55, [30, 81, 138, 255])

  const pngBuffer = PNG.sync.write(png)
  await fs.writeFile(pngPath, pngBuffer)

  const icoBuffer = await toIco([pngBuffer], { resize: true, sizes: [16, 24, 32, 48, 64, 128, 256] })
  await fs.writeFile(icoPath, icoBuffer)

  console.log(`Generated ${path.relative(projectRoot, pngPath)} and ${path.relative(projectRoot, icoPath)}`)
}

await buildIcon()
