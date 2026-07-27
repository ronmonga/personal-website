export type HilbertPoint = Readonly<{
  x: number
  y: number
}>

export type HilbertFrame = Readonly<{
  origin: HilbertPoint
  xAxis: HilbertPoint
  yAxis: HilbertPoint
}>

export type HilbertBounds = Readonly<{
  minX: number
  minY: number
  maxX: number
  maxY: number
}>

type HilbertRegion = Readonly<{
  traversalIndex: number
  frame: HilbertFrame
  bounds: HilbertBounds
}>

const NORMALIZED_FRAME: HilbertFrame = {
  origin: { x: 0, y: 0 },
  xAxis: { x: 1, y: 0 },
  yAxis: { x: 0, y: 1 },
}

function validateOrder(order: number): void {
  const pointCount = 4 ** order

  if (!Number.isInteger(order) || order < 0 || !Number.isSafeInteger(pointCount)) {
    throw new RangeError('Hilbert order must be a non-negative integer with a safe point count')
  }
}

/**
 * Generates cell centers in Hilbert traversal order. The affine frame carries
 * orientation through recursion and can be reused for any local subcurve.
 */
export function generateHilbertPoints(
  order: number,
  frame: HilbertFrame = NORMALIZED_FRAME,
): readonly HilbertPoint[] {
  validateOrder(order)

  const points: HilbertPoint[] = []
  visitHilbertLeaves(order, frame, (leafFrame) => {
    points.push({
      x: leafFrame.origin.x + (leafFrame.xAxis.x + leafFrame.yAxis.x) / 2,
      y: leafFrame.origin.y + (leafFrame.xAxis.y + leafFrame.yAxis.y) / 2,
    })
  })

  return points
}

export function generateHilbertRegions(
  depth: number,
  frame: HilbertFrame = NORMALIZED_FRAME,
): readonly HilbertRegion[] {
  validateOrder(depth)

  const regions: HilbertRegion[] = []
  visitHilbertLeaves(depth, frame, (regionFrame) => {
    regions.push({
      traversalIndex: regions.length,
      frame: regionFrame,
      bounds: getFrameBounds(regionFrame),
    })
  })

  return regions
}

export function getEndpointAnchoredHilbertFrame(
  baseOrder: number,
  targetOrder: number,
  frame: HilbertFrame,
): HilbertFrame {
  validateOrder(baseOrder)
  validateOrder(targetOrder)

  if (baseOrder < 1) {
    throw new RangeError('Endpoint-anchored Hilbert geometry requires a base order of at least one')
  }
  if (targetOrder < baseOrder) {
    throw new RangeError('targetOrder cannot be lower than baseOrder')
  }

  if (targetOrder === baseOrder) {
    return frame
  }

  const baseMargin = 1 / (2 * 2 ** baseOrder)
  const targetMargin = 1 / (2 * 2 ** targetOrder)
  const scale = (1 - 2 * baseMargin) / (1 - 2 * targetMargin)
  const translation = baseMargin - targetMargin * scale
  return {
    origin: {
      x: frame.origin.x + translation * (frame.xAxis.x + frame.yAxis.x),
      y: frame.origin.y + translation * (frame.xAxis.y + frame.yAxis.y),
    },
    xAxis: {
      x: frame.xAxis.x * scale,
      y: frame.xAxis.y * scale,
    },
    yAxis: {
      x: frame.yAxis.x * scale,
      y: frame.yAxis.y * scale,
    },
  }
}

export function assertNormalizedHilbertInvariants(
  points: readonly HilbertPoint[],
  order: number,
): void {
  validateOrder(order)

  const gridSize = 2 ** order
  const expectedPointCount = gridSize ** 2

  if (points.length !== expectedPointCount) {
    throw new Error(`Expected ${expectedPointCount} Hilbert points, received ${points.length}`)
  }

  const visitedCells = new Set<number>()

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const cellX = Math.floor(point.x * gridSize)
    const cellY = Math.floor(point.y * gridSize)

    if (cellX < 0 || cellX >= gridSize || cellY < 0 || cellY >= gridSize) {
      throw new Error(`Hilbert point ${index} is outside normalized bounds`)
    }

    const cellKey = cellY * gridSize + cellX
    if (visitedCells.has(cellKey)) {
      throw new Error(`Hilbert path visits cell (${cellX}, ${cellY}) more than once`)
    }
    visitedCells.add(cellKey)

    if (index === 0) {
      continue
    }

    const previous = points[index - 1]
    const cellDistance =
      Math.abs(point.x - previous.x) * gridSize +
      Math.abs(point.y - previous.y) * gridSize

    if (Math.abs(cellDistance - 1) > Number.EPSILON * gridSize * 4) {
      throw new Error(`Hilbert path is discontinuous between points ${index - 1} and ${index}`)
    }
  }
}

function visitHilbertLeaves(
  level: number,
  frame: HilbertFrame,
  visit: (leafFrame: HilbertFrame) => void,
): void {
  if (level === 0) {
    visit(frame)
    return
  }

  const halfX = scalePoint(frame.xAxis, 0.5)
  const halfY = scalePoint(frame.yAxis, 0.5)
  const nextLevel = level - 1

  visitHilbertLeaves(
    nextLevel,
    {
      origin: frame.origin,
      xAxis: halfY,
      yAxis: halfX,
    },
    visit,
  )
  visitHilbertLeaves(
    nextLevel,
    {
      origin: addPoints(frame.origin, halfX),
      xAxis: halfX,
      yAxis: halfY,
    },
    visit,
  )
  visitHilbertLeaves(
    nextLevel,
    {
      origin: addPoints(frame.origin, halfX, halfY),
      xAxis: halfX,
      yAxis: halfY,
    },
    visit,
  )
  visitHilbertLeaves(
    nextLevel,
    {
      origin: addPoints(frame.origin, halfX, frame.yAxis),
      xAxis: scalePoint(halfY, -1),
      yAxis: scalePoint(halfX, -1),
    },
    visit,
  )
}

function getFrameBounds(frame: HilbertFrame): HilbertBounds {
  const corners = [
    frame.origin,
    addPoints(frame.origin, frame.xAxis),
    addPoints(frame.origin, frame.yAxis),
    addPoints(frame.origin, frame.xAxis, frame.yAxis),
  ]

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  }
}

function addPoints(...points: readonly HilbertPoint[]): HilbertPoint {
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  )
}

function scalePoint(point: HilbertPoint, scale: number): HilbertPoint {
  return { x: point.x * scale, y: point.y * scale }
}
