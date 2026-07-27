import {
  assertNormalizedHilbertInvariants,
  generateHilbertPoints,
  generateHilbertRegions,
  getEndpointAnchoredHilbertFrame,
  type HilbertBounds,
  type HilbertFrame,
  type HilbertPoint,
} from './hilbert.ts'

type RgbColor = readonly [red: number, green: number, blue: number]

export type HilbertBackgroundConfig = Readonly<{
  baseOrder: number
  interactionOrder: number
  maxEffectiveOrder: number
  interactionInset: number
  coverScale: number
  anchorX: number
  anchorY: number
  maxDevicePixelRatio: number
  lineWidth: number
  lineOpacity: number
  backgroundColor: RgbColor
  gradientStart: RgbColor
  gradientEnd: RgbColor
  gradientSteps: number
  seedPositions: readonly number[]
  durationMs: number
  refinementEraseDurationMs: number
  refinementDrawDurationMs: number
}>

type Viewport = Readonly<{
  width: number
  height: number
  devicePixelRatio: number
  side: number
  offsetX: number
  offsetY: number
}>

type PathInterval = Readonly<{
  start: number
  end: number
}>

type DrawablePath = Readonly<{
  points: readonly HilbertPoint[]
  pathStart: number
  pathEnd: number
  progress?: number
}>

type RefinementPhase = 'erase' | 'draw'

type RefinementAnimation = {
  fromPoints: readonly HilbertPoint[]
  toPoints: readonly HilbertPoint[]
  toFrame: HilbertFrame
  phase: RefinementPhase
  phaseStartTime: number | null
  progress: number
}

type RefinementNode = {
  key: string
  geometryFrame: HilbertFrame
  hitFrame: HilbertFrame
  hitBounds: HilbertBounds
  points: readonly HilbertPoint[]
  effectiveOrder: number
  pathStart: number
  pathEnd: number
  children: readonly RefinementNode[] | null
  animation: RefinementAnimation | null
}

const IGNORED_CLICK_TARGETS = 'a, button, input, textarea, select, [data-hilbert-ignore]'
const MAXIMUM_DEVICE_PIXEL_RATIO = 2
const IS_DEVELOPMENT = import.meta.env?.DEV === true

export class HilbertBackground {
  private readonly canvas: HTMLCanvasElement
  private readonly config: HilbertBackgroundConfig
  private readonly context: CanvasRenderingContext2D
  private readonly basePoints: readonly HilbertPoint[]
  private readonly baseSegmentCount: number
  private readonly initialInteractionDepth: number
  private readonly initialGridSize: number
  private readonly rootNodes: readonly RefinementNode[]
  private readonly rootNodeByCell = new Map<number, RefinementNode>()
  private readonly animatingNodes = new Set<RefinementNode>()
  private readonly seedPositions: readonly number[]
  private readonly maximumSeedDistance: number
  private readonly originalCanvasBackground: string

  private viewport: Viewport | null = null
  private mounted = false
  private introComplete = false
  private introStartTime: number | null = null
  private visibleRadius = 0
  private introFrameId: number | null = null
  private refinementFrameId: number | null = null
  private resizeFrameId: number | null = null

  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

  public constructor(canvas: HTMLCanvasElement, config: HilbertBackgroundConfig) {
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('Canvas 2D is not available')
    }

    this.canvas = canvas
    this.config = config
    this.validateConfig()
    this.context = context
    this.basePoints = generateHilbertPoints(config.baseOrder)
    this.baseSegmentCount = this.basePoints.length - 1
    this.initialInteractionDepth = config.baseOrder - config.interactionOrder
    this.initialGridSize = 2 ** this.initialInteractionDepth
    this.rootNodes = this.createRootNodes()
    this.seedPositions = [...config.seedPositions].sort((left, right) => left - right)
    this.maximumSeedDistance = this.getMaximumSeedDistance()
    this.originalCanvasBackground = canvas.style.backgroundColor

    if (IS_DEVELOPMENT) {
      assertNormalizedHilbertInvariants(this.basePoints, config.baseOrder)
      this.assertRootInvariants()
    }
  }

  public mount(): void {
    if (this.mounted) {
      return
    }

    this.mounted = true
    this.introComplete = false
    this.introStartTime = null
    this.visibleRadius = 0
    this.canvas.style.backgroundColor = colorToCss(this.config.backgroundColor)

    window.addEventListener('resize', this.handleResize, { passive: true })
    document.addEventListener('click', this.handleDocumentClick)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotionChange)

    this.updateViewport()

    if (this.reducedMotionQuery.matches || document.hidden || this.config.durationMs === 0) {
      this.introComplete = true
      this.visibleRadius = this.maximumSeedDistance
      if (!document.hidden) {
        this.renderRefinementScene()
      }
      return
    }

    this.introFrameId = requestAnimationFrame(this.animateIntro)
  }

  public destroy(): void {
    if (!this.mounted) {
      return
    }

    this.mounted = false
    window.removeEventListener('resize', this.handleResize)
    document.removeEventListener('click', this.handleDocumentClick)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.reducedMotionQuery.removeEventListener('change', this.handleReducedMotionChange)
    this.cancelScheduledFrames()
    this.resetRefinements()

    this.context.setTransform(1, 0, 0, 1, 0, 0)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.style.backgroundColor = this.originalCanvasBackground
    this.introComplete = false
    this.introStartTime = null
    this.visibleRadius = 0
  }

  private readonly animateIntro = (timestamp: number): void => {
    this.introFrameId = null

    if (!this.mounted || this.introComplete) {
      return
    }

    if (document.hidden) {
      this.finishIntro(false)
      return
    }

    if (this.introStartTime === null) {
      this.introStartTime = timestamp
    }

    const progress = Math.min((timestamp - this.introStartTime) / this.config.durationMs, 1)
    this.visibleRadius = progress * this.maximumSeedDistance

    if (progress === 1) {
      this.introComplete = true
      this.introStartTime = null
      this.renderRefinementScene()
      return
    }

    this.renderBaseIntervals(this.getVisibleIntervals(this.visibleRadius))
    this.introFrameId = requestAnimationFrame(this.animateIntro)
  }

  private readonly animateRefinements = (timestamp: number): void => {
    this.refinementFrameId = null

    if (!this.mounted) {
      return
    }

    if (document.hidden) {
      this.finishRefinements(false)
      return
    }

    for (const node of [...this.animatingNodes]) {
      const animation = node.animation
      if (animation === null) {
        this.animatingNodes.delete(node)
        continue
      }

      if (animation.phaseStartTime === null) {
        animation.phaseStartTime = timestamp
      }

      if (animation.phase === 'erase') {
        animation.progress = getTimedProgress(
          timestamp,
          animation.phaseStartTime,
          this.config.refinementEraseDurationMs,
        )

        if (animation.progress === 1) {
          animation.phase = 'draw'
          animation.phaseStartTime += this.config.refinementEraseDurationMs
          animation.progress = getTimedProgress(
            timestamp,
            animation.phaseStartTime,
            this.config.refinementDrawDurationMs,
          )
        }
      } else {
        animation.progress = getTimedProgress(
          timestamp,
          animation.phaseStartTime,
          this.config.refinementDrawDurationMs,
        )
      }

      if (animation.phase === 'draw' && animation.progress === 1) {
        this.splitNode(node, animation)
        this.animatingNodes.delete(node)
      }
    }

    this.renderRefinementScene()

    if (this.animatingNodes.size > 0) {
      this.refinementFrameId = requestAnimationFrame(this.animateRefinements)
    }
  }

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    if (
      !this.mounted ||
      !this.introComplete ||
      document.hidden ||
      event.button !== 0 ||
      event.defaultPrevented
    ) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest(IGNORED_CLICK_TARGETS) !== null) {
      return
    }

    const node = this.getLeafAtViewportPoint(event.clientX, event.clientY)
    if (
      node === null ||
      node.animation !== null ||
      node.effectiveOrder >= this.config.maxEffectiveOrder
    ) {
      return
    }

    const animation = this.createRefinementAnimation(node)

    if (
      this.reducedMotionQuery.matches ||
      this.config.refinementEraseDurationMs + this.config.refinementDrawDurationMs === 0
    ) {
      this.splitNode(node, animation)
      this.renderRefinementScene()
      return
    }

    node.animation = animation
    this.animatingNodes.add(node)

    if (this.refinementFrameId === null) {
      this.refinementFrameId = requestAnimationFrame(this.animateRefinements)
    }
  }

  private readonly handleResize = (): void => {
    if (!this.mounted || this.resizeFrameId !== null) {
      return
    }

    this.resizeFrameId = requestAnimationFrame(() => {
      this.resizeFrameId = null

      if (!this.mounted || !this.updateViewport()) {
        return
      }

      if (this.introComplete) {
        this.renderRefinementScene()
      } else {
        this.renderBaseIntervals(this.getVisibleIntervals(this.visibleRadius))
      }
    })
  }

  private readonly handleVisibilityChange = (): void => {
    if (!this.mounted) {
      return
    }

    if (document.hidden) {
      if (this.resizeFrameId !== null) {
        cancelAnimationFrame(this.resizeFrameId)
        this.resizeFrameId = null
      }
      if (!this.introComplete) {
        this.finishIntro(false)
      }
      this.finishRefinements(false)
      return
    }

    this.updateViewport()
    this.renderRefinementScene()
  }

  private readonly handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    if (!this.mounted || !event.matches) {
      return
    }

    if (!this.introComplete) {
      this.finishIntro(false)
    }
    this.finishRefinements(false)
    this.renderRefinementScene()
  }

  private createRootNodes(): readonly RefinementNode[] {
    const pointsPerNode = 4 ** this.config.interactionOrder
    const rootGeometry = generateHilbertRegions(this.initialInteractionDepth)

    return rootGeometry.map((geometry) => {
      const startPointIndex = geometry.traversalIndex * pointsPerNode
      const points = this.basePoints.slice(startPointIndex, startPointIndex + pointsPerNode)
      const cellX = Math.round(geometry.bounds.minX * this.initialGridSize)
      const cellY = Math.round(geometry.bounds.minY * this.initialGridSize)
      const node: RefinementNode = {
        key: `${geometry.traversalIndex}`,
        geometryFrame: geometry.frame,
        hitFrame: geometry.frame,
        hitBounds: geometry.bounds,
        points,
        effectiveOrder: this.config.baseOrder,
        pathStart: startPointIndex / this.baseSegmentCount,
        pathEnd: (startPointIndex + pointsPerNode - 1) / this.baseSegmentCount,
        children: null,
        animation: null,
      }

      const cellKey = cellY * this.initialGridSize + cellX
      if (this.rootNodeByCell.has(cellKey)) {
        throw new Error(`Multiple Hilbert roots mapped to interaction cell ${cellKey}`)
      }
      this.rootNodeByCell.set(cellKey, node)

      return node
    })
  }

  private createRefinementAnimation(node: RefinementNode): RefinementAnimation {
    const toFrame = getEndpointAnchoredHilbertFrame(
      this.config.interactionOrder,
      this.config.interactionOrder + 1,
      node.geometryFrame,
    )
    const toPoints = generateHilbertPoints(this.config.interactionOrder + 1, toFrame)

    if (IS_DEVELOPMENT) {
      assertMatchingEndpoints(node.points, toPoints)
    }

    return {
      fromPoints: node.points,
      toPoints,
      toFrame,
      phase: 'erase',
      phaseStartTime: null,
      progress: 0,
    }
  }

  private splitNode(node: RefinementNode, animation: RefinementAnimation): void {
    const geometryChildren = generateHilbertRegions(1, animation.toFrame)
    const hitChildren = generateHilbertRegions(1, node.hitFrame)
    const pointsPerChild = 4 ** this.config.interactionOrder
    const replacementSegmentCount = animation.toPoints.length - 1
    const parentPathLength = node.pathEnd - node.pathStart

    node.children = geometryChildren.map((geometry, index) => {
      const startPointIndex = index * pointsPerChild
      const hitGeometry = hitChildren[index]

      return {
        key: `${node.key}.${index}`,
        geometryFrame: geometry.frame,
        hitFrame: hitGeometry.frame,
        hitBounds: hitGeometry.bounds,
        points: animation.toPoints.slice(startPointIndex, startPointIndex + pointsPerChild),
        effectiveOrder: node.effectiveOrder + 1,
        pathStart:
          node.pathStart + (startPointIndex / replacementSegmentCount) * parentPathLength,
        pathEnd:
          node.pathStart +
          ((startPointIndex + pointsPerChild - 1) / replacementSegmentCount) * parentPathLength,
        children: null,
        animation: null,
      }
    })
    node.animation = null

    if (IS_DEVELOPMENT) {
      this.assertSplitInvariants(node, animation.toPoints)
    }
  }

  private getLeafAtViewportPoint(clientX: number, clientY: number): RefinementNode | null {
    const viewport = this.viewport
    if (viewport === null) {
      return null
    }

    const logicalX = (clientX - viewport.offsetX) / viewport.side
    const logicalY = (clientY - viewport.offsetY) / viewport.side
    if (logicalX < 0 || logicalX >= 1 || logicalY < 0 || logicalY >= 1) {
      return null
    }

    const cellX = Math.floor(logicalX * this.initialGridSize)
    const cellY = Math.floor(logicalY * this.initialGridSize)
    const rootNode = this.rootNodeByCell.get(cellY * this.initialGridSize + cellX)
    if (rootNode === undefined) {
      return null
    }
    let node: RefinementNode = rootNode

    while (node.children !== null) {
      const child: RefinementNode | undefined = node.children.find(({ hitBounds }) =>
        pointIsInsideBounds(logicalX, logicalY, hitBounds),
      )
      if (child === undefined) {
        return null
      }
      node = child
    }

    const { hitBounds } = node
    const localX = (logicalX - hitBounds.minX) / (hitBounds.maxX - hitBounds.minX)
    const localY = (logicalY - hitBounds.minY) / (hitBounds.maxY - hitBounds.minY)
    const inset = this.config.interactionInset

    if (localX < inset || localX > 1 - inset || localY < inset || localY > 1 - inset) {
      return null
    }

    return node
  }

  private getActiveLeaves(): readonly RefinementNode[] {
    const leaves: RefinementNode[] = []
    for (const rootNode of this.rootNodes) {
      collectLeaves(rootNode, leaves)
    }
    return leaves
  }

  private finishIntro(shouldRender: boolean): void {
    if (this.introFrameId !== null) {
      cancelAnimationFrame(this.introFrameId)
      this.introFrameId = null
    }

    this.introComplete = true
    this.introStartTime = null
    this.visibleRadius = this.maximumSeedDistance

    if (shouldRender) {
      this.renderRefinementScene()
    }
  }

  private finishRefinements(shouldRender: boolean): void {
    if (this.refinementFrameId !== null) {
      cancelAnimationFrame(this.refinementFrameId)
      this.refinementFrameId = null
    }

    for (const node of [...this.animatingNodes]) {
      const animation = node.animation
      if (animation !== null) {
        this.splitNode(node, animation)
      }
    }
    this.animatingNodes.clear()

    if (shouldRender) {
      this.renderRefinementScene()
    }
  }

  private resetRefinements(): void {
    this.animatingNodes.clear()
    for (const rootNode of this.rootNodes) {
      rootNode.children = null
      rootNode.animation = null
    }
  }

  private cancelScheduledFrames(): void {
    if (this.introFrameId !== null) {
      cancelAnimationFrame(this.introFrameId)
      this.introFrameId = null
    }
    if (this.refinementFrameId !== null) {
      cancelAnimationFrame(this.refinementFrameId)
      this.refinementFrameId = null
    }
    if (this.resizeFrameId !== null) {
      cancelAnimationFrame(this.resizeFrameId)
      this.resizeFrameId = null
    }
  }

  private updateViewport(): boolean {
    const width = Math.max(1, window.innerWidth)
    const height = Math.max(1, window.innerHeight)
    const devicePixelRatio = Math.min(
      Math.max(1, window.devicePixelRatio || 1),
      this.config.maxDevicePixelRatio,
      MAXIMUM_DEVICE_PIXEL_RATIO,
    )

    if (
      this.viewport?.width === width &&
      this.viewport.height === height &&
      this.viewport.devicePixelRatio === devicePixelRatio
    ) {
      return false
    }

    const side = Math.max(width, height) * this.config.coverScale
    this.viewport = {
      width,
      height,
      devicePixelRatio,
      side,
      offsetX: (width - side) * this.config.anchorX,
      offsetY: (height - side) * this.config.anchorY,
    }

    const pixelWidth = Math.round(width * devicePixelRatio)
    const pixelHeight = Math.round(height * devicePixelRatio)
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    }

    return true
  }

  private renderBaseIntervals(intervals: readonly PathInterval[]): void {
    const viewport = this.prepareCanvas()
    if (viewport === null || intervals.length === 0) {
      return
    }

    const context = this.context
    context.globalAlpha = this.config.lineOpacity

    for (let step = 0; step < this.config.gradientSteps; step += 1) {
      const colorStart = step / this.config.gradientSteps
      const colorEnd = (step + 1) / this.config.gradientSteps
      let hasPath = false

      context.beginPath()
      for (const interval of intervals) {
        const start = Math.max(colorStart, interval.start)
        const end = Math.min(colorEnd, interval.end)
        if (end <= start) {
          continue
        }

        this.appendPathRange(this.basePoints, start, end, viewport)
        hasPath = true
      }

      if (hasPath) {
        context.strokeStyle = this.getGradientColor(colorStart, colorEnd)
        context.stroke()
      }
    }

    context.globalAlpha = 1
  }

  private renderRefinementScene(): void {
    if (this.prepareCanvas() === null) {
      return
    }

    const leaves = this.getActiveLeaves()
    const staticPaths: DrawablePath[] = []

    for (let index = 0; index < leaves.length; index += 1) {
      const node = leaves[index]
      if (node.animation === null) {
        staticPaths.push({
          points: node.points,
          pathStart: node.pathStart,
          pathEnd: node.pathEnd,
        })
      }

      const nextNode = leaves[index + 1]
      if (nextNode !== undefined) {
        staticPaths.push({
          points: [node.points[node.points.length - 1], nextNode.points[0]],
          pathStart: node.pathEnd,
          pathEnd: nextNode.pathStart,
        })
      }
    }

    this.renderColoredPaths(staticPaths, 1)

    for (const node of this.animatingNodes) {
      const animation = node.animation
      if (animation === null) {
        continue
      }

      if (animation.phase === 'erase') {
        this.renderColoredPaths(
          [
            {
              points: animation.fromPoints,
              pathStart: node.pathStart,
              pathEnd: node.pathEnd,
            },
          ],
          1 - animation.progress,
        )
      } else if (animation.progress > 0) {
        this.renderColoredPaths(
          [
            {
              points: animation.toPoints,
              pathStart: node.pathStart,
              pathEnd: node.pathEnd,
              progress: animation.progress,
            },
          ],
          1,
        )
      }
    }
  }

  private prepareCanvas(): Viewport | null {
    const viewport = this.viewport
    if (viewport === null) {
      return null
    }

    this.context.setTransform(
      viewport.devicePixelRatio,
      0,
      0,
      viewport.devicePixelRatio,
      0,
      0,
    )
    this.context.clearRect(0, 0, viewport.width, viewport.height)
    this.context.lineWidth = this.config.lineWidth
    this.context.lineCap = 'round'
    this.context.lineJoin = 'round'

    return viewport
  }

  private renderColoredPaths(paths: readonly DrawablePath[], opacityMultiplier: number): void {
    const viewport = this.viewport
    if (viewport === null || paths.length === 0 || opacityMultiplier <= 0) {
      return
    }

    const context = this.context
    context.globalAlpha = this.config.lineOpacity * opacityMultiplier

    for (let step = 0; step < this.config.gradientSteps; step += 1) {
      const colorStart = step / this.config.gradientSteps
      const colorEnd = (step + 1) / this.config.gradientSteps
      let hasPath = false

      context.beginPath()
      for (const path of paths) {
        const revealedEnd =
          path.pathStart + (path.pathEnd - path.pathStart) * (path.progress ?? 1)
        const start = Math.max(colorStart, path.pathStart)
        const end = Math.min(colorEnd, revealedEnd)
        if (end <= start) {
          continue
        }

        const pathLength = path.pathEnd - path.pathStart
        this.appendPathRange(
          path.points,
          (start - path.pathStart) / pathLength,
          (end - path.pathStart) / pathLength,
          viewport,
        )
        hasPath = true
      }

      if (hasPath) {
        context.strokeStyle = this.getGradientColor(colorStart, colorEnd)
        context.stroke()
      }
    }

    context.globalAlpha = 1
  }

  private appendPathRange(
    points: readonly HilbertPoint[],
    start: number,
    end: number,
    viewport: Viewport,
  ): void {
    const segmentCount = points.length - 1
    const scaledStart = start * segmentCount
    const scaledEnd = end * segmentCount
    const startSegment = Math.min(Math.floor(scaledStart), segmentCount - 1)
    const startPoint = interpolatePoint(
      points[startSegment],
      points[startSegment + 1],
      scaledStart - startSegment,
    )

    this.context.moveTo(
      viewport.offsetX + startPoint.x * viewport.side,
      viewport.offsetY + startPoint.y * viewport.side,
    )

    const lastWholePoint = Math.min(Math.floor(scaledEnd), segmentCount)
    for (let pointIndex = startSegment + 1; pointIndex <= lastWholePoint; pointIndex += 1) {
      const point = points[pointIndex]
      this.context.lineTo(
        viewport.offsetX + point.x * viewport.side,
        viewport.offsetY + point.y * viewport.side,
      )
    }

    if (!Number.isInteger(scaledEnd)) {
      const endSegment = Math.floor(scaledEnd)
      const endPoint = interpolatePoint(
        points[endSegment],
        points[endSegment + 1],
        scaledEnd - endSegment,
      )
      this.context.lineTo(
        viewport.offsetX + endPoint.x * viewport.side,
        viewport.offsetY + endPoint.y * viewport.side,
      )
    }
  }

  private getVisibleIntervals(radius: number): readonly PathInterval[] {
    const intervals: PathInterval[] = []

    for (const seed of this.seedPositions) {
      const next = {
        start: Math.max(0, seed - radius),
        end: Math.min(1, seed + radius),
      }
      const previous = intervals.at(-1)

      if (previous !== undefined && next.start <= previous.end) {
        intervals[intervals.length - 1] = {
          start: previous.start,
          end: Math.max(previous.end, next.end),
        }
      } else {
        intervals.push(next)
      }
    }

    return intervals
  }

  private getMaximumSeedDistance(): number {
    let maximumDistance = Math.max(
      this.seedPositions[0],
      1 - this.seedPositions[this.seedPositions.length - 1],
    )

    for (let index = 1; index < this.seedPositions.length; index += 1) {
      maximumDistance = Math.max(
        maximumDistance,
        (this.seedPositions[index] - this.seedPositions[index - 1]) / 2,
      )
    }

    return maximumDistance
  }

  private getGradientColor(start: number, end: number): string {
    return interpolateColor(
      this.config.gradientStart,
      this.config.gradientEnd,
      (start + end) / 2,
    )
  }

  private assertRootInvariants(): void {
    if (
      this.rootNodes.length !== this.initialGridSize ** 2 ||
      this.rootNodeByCell.size !== this.rootNodes.length
    ) {
      throw new Error('Hilbert interaction roots do not cover the initial grid exactly once')
    }

    for (const node of this.rootNodes) {
      const generatedPoints = generateHilbertPoints(
        this.config.interactionOrder,
        node.geometryFrame,
      )
      if (generatedPoints.length !== node.points.length) {
        throw new Error(`Hilbert root ${node.key} has an invalid point count`)
      }

      for (let index = 0; index < generatedPoints.length; index += 1) {
        if (!pointsMatch(generatedPoints[index], node.points[index])) {
          throw new Error(`Hilbert root ${node.key} does not match the base traversal`)
        }
      }
    }
  }

  private assertSplitInvariants(
    node: RefinementNode,
    replacementPoints: readonly HilbertPoint[],
  ): void {
    const children = node.children
    if (children === null || children.length !== 4) {
      throw new Error(`Refined Hilbert node ${node.key} did not produce four children`)
    }

    const flattenedPoints = children.flatMap((child) => child.points)
    if (flattenedPoints.length !== replacementPoints.length) {
      throw new Error(`Refined Hilbert node ${node.key} lost replacement points`)
    }
    for (let index = 0; index < replacementPoints.length; index += 1) {
      if (!pointsMatch(flattenedPoints[index], replacementPoints[index])) {
        throw new Error(`Refined Hilbert node ${node.key} changed child traversal order`)
      }
    }

    if (
      !numbersMatch(children[0].pathStart, node.pathStart) ||
      !numbersMatch(children[children.length - 1].pathEnd, node.pathEnd)
    ) {
      throw new Error(`Refined Hilbert node ${node.key} changed its traversal interval`)
    }

    const parentArea = getBoundsArea(node.hitBounds)
    const childArea = children.reduce((area, child) => area + getBoundsArea(child.hitBounds), 0)
    if (!numbersMatch(parentArea, childArea)) {
      throw new Error(`Refined Hilbert node ${node.key} does not preserve its hit area`)
    }
  }

  private validateConfig(): void {
    const { config } = this

    if (!Number.isInteger(config.baseOrder) || config.baseOrder < 1) {
      throw new RangeError('baseOrder must be a positive integer')
    }
    if (
      !Number.isInteger(config.interactionOrder) ||
      config.interactionOrder < 1 ||
      config.interactionOrder > config.baseOrder
    ) {
      throw new RangeError('interactionOrder must be between one and baseOrder')
    }
    if (
      !Number.isInteger(config.maxEffectiveOrder) ||
      config.maxEffectiveOrder < config.baseOrder
    ) {
      throw new RangeError('maxEffectiveOrder cannot be lower than baseOrder')
    }
    if (
      !Number.isFinite(config.interactionInset) ||
      config.interactionInset < 0 ||
      config.interactionInset >= 0.5
    ) {
      throw new RangeError('interactionInset must be at least zero and below 0.5')
    }
    if (!Number.isFinite(config.coverScale) || config.coverScale <= 0) {
      throw new RangeError('coverScale must be greater than zero')
    }
    if (![config.anchorX, config.anchorY].every(isUnitInterval)) {
      throw new RangeError('anchorX and anchorY must be between zero and one')
    }
    if (!Number.isFinite(config.maxDevicePixelRatio) || config.maxDevicePixelRatio <= 0) {
      throw new RangeError('maxDevicePixelRatio must be greater than zero')
    }
    if (!Number.isFinite(config.lineWidth) || config.lineWidth <= 0) {
      throw new RangeError('lineWidth must be greater than zero')
    }
    if (!isUnitInterval(config.lineOpacity)) {
      throw new RangeError('lineOpacity must be between zero and one')
    }
    if (!Number.isInteger(config.gradientSteps) || config.gradientSteps <= 0) {
      throw new RangeError('gradientSteps must be a positive integer')
    }
    if (config.seedPositions.length === 0 || !config.seedPositions.every(isUnitInterval)) {
      throw new RangeError('seedPositions must contain positions between zero and one')
    }
    for (const duration of [
      config.durationMs,
      config.refinementEraseDurationMs,
      config.refinementDrawDurationMs,
    ]) {
      if (!Number.isFinite(duration) || duration < 0) {
        throw new RangeError('Animation durations cannot be negative')
      }
    }

    for (const color of [config.backgroundColor, config.gradientStart, config.gradientEnd]) {
      if (!color.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
        throw new RangeError('Color channels must be integers between zero and 255')
      }
    }
  }
}

function collectLeaves(node: RefinementNode, leaves: RefinementNode[]): void {
  if (node.children === null) {
    leaves.push(node)
    return
  }

  for (const child of node.children) {
    collectLeaves(child, leaves)
  }
}

function pointIsInsideBounds(x: number, y: number, bounds: HilbertBounds): boolean {
  return x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY
}

function getBoundsArea(bounds: HilbertBounds): number {
  return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)
}

function getTimedProgress(timestamp: number, startTime: number, duration: number): number {
  return duration === 0 ? 1 : Math.min(Math.max((timestamp - startTime) / duration, 0), 1)
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function interpolatePoint(start: HilbertPoint, end: HilbertPoint, progress: number): HilbertPoint {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  }
}

function interpolateColor(start: RgbColor, end: RgbColor, progress: number): string {
  return `rgb(${Math.round(start[0] + (end[0] - start[0]) * progress)} ${Math.round(
    start[1] + (end[1] - start[1]) * progress,
  )} ${Math.round(start[2] + (end[2] - start[2]) * progress)})`
}

function colorToCss(color: RgbColor): string {
  return `rgb(${color[0]} ${color[1]} ${color[2]})`
}

function numbersMatch(first: number, second: number): boolean {
  return Math.abs(first - second) <= Number.EPSILON * 64
}

function pointsMatch(first: HilbertPoint, second: HilbertPoint): boolean {
  return numbersMatch(first.x, second.x) && numbersMatch(first.y, second.y)
}

function assertMatchingEndpoints(
  basePoints: readonly HilbertPoint[],
  refinedPoints: readonly HilbertPoint[],
): void {
  if (
    !pointsMatch(basePoints[0], refinedPoints[0]) ||
    !pointsMatch(basePoints[basePoints.length - 1], refinedPoints[refinedPoints.length - 1])
  ) {
    throw new Error('Refined Hilbert geometry did not preserve its base endpoints')
  }
}
