/**
 * Projectieve transformatie (homografie) voor perspectiefcorrectie van gevelfoto's.
 * De gebruiker markeert 4 hoeken van de gevel op de scheve foto; wij bewerken die
 * naar een rechtgetrokken rechthoek zodat Claude accurate procent-coordinaten kan geven.
 */

export type Point = { x: number; y: number }

/**
 * Los een 8-onbekenden-systeem op via Gauss-eliminatie met partiele pivotering.
 * A is een 8x9 augmented matrix; retourneert de 8 coefficienten of null bij singulariteit.
 */
function solveLinearSystem(A: number[][]): number[] | null {
  const n = 8
  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[pivot][i])) pivot = k
    }
    if (Math.abs(A[pivot][i]) < 1e-12) return null
    if (pivot !== i) [A[i], A[pivot]] = [A[pivot], A[i]]
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i]
      for (let j = i; j <= n; j++) A[k][j] -= factor * A[i][j]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n]
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]
    x[i] = s / A[i][i]
  }
  return x
}

/**
 * Bereken 3x3 homografie die src-punten mapt naar dst-punten.
 * Retourneert array van 9 getallen (row-major) of null.
 */
export function solveHomography(src: Point[], dst: Point[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = src[i]
    const { x, y } = dst[i]
    A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y, x])
    A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y, y])
  }
  const h = solveLinearSystem(A)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

/** Pas 3x3 homografie toe op een punt (projectieve deling). */
function applyHomography(H: number[], x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8]
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  }
}

/**
 * Rectificeer een afbeelding: srcQuad (4 hoeken in beeldcoordinaten, kloksgewijs
 * startend linksboven) wordt getransformeerd naar een rechthoek outW x outH.
 * Retourneert een base64 data-URL van het rechtgetrokken beeld.
 */
export function rectifyImage(
  img: HTMLImageElement,
  srcQuad: Point[],
  outW: number,
  outH: number
): string | null {
  const dstQuad: Point[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ]
  // H maps dst (output) naar src (input) zodat we per output-pixel de bron kunnen opzoeken.
  const H = solveHomography(dstQuad, srcQuad)
  if (!H) return null

  // Lees de bron-pixels via een off-screen canvas.
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = img.naturalWidth
  srcCanvas.height = img.naturalHeight
  const srcCtx = srcCanvas.getContext('2d')
  if (!srcCtx) return null
  srcCtx.drawImage(img, 0, 0)
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)

  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = outW
  dstCanvas.height = outH
  const dstCtx = dstCanvas.getContext('2d')
  if (!dstCtx) return null
  const dstData = dstCtx.createImageData(outW, outH)

  const sw = srcCanvas.width
  const sh = srcCanvas.height

  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const p = applyHomography(H, u, v)
      const sx = p.x
      const sy = p.y
      const di = (v * outW + u) * 4
      if (sx < 0 || sx >= sw - 1 || sy < 0 || sy >= sh - 1) {
        dstData.data[di] = 255
        dstData.data[di + 1] = 255
        dstData.data[di + 2] = 255
        dstData.data[di + 3] = 255
        continue
      }
      // Bilineaire interpolatie
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + sw * 4
      const i11 = i01 + 4
      for (let c = 0; c < 3; c++) {
        const a = srcData.data[i00 + c] * (1 - fx) + srcData.data[i10 + c] * fx
        const b = srcData.data[i01 + c] * (1 - fx) + srcData.data[i11 + c] * fx
        dstData.data[di + c] = a * (1 - fy) + b * fy
      }
      dstData.data[di + 3] = 255
    }
  }

  dstCtx.putImageData(dstData, 0, 0)
  return dstCanvas.toDataURL('image/jpeg', 0.9)
}
