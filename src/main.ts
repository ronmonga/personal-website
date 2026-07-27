import './style.css'
import './site/projectCard.css'
import './site/layout.css'
import { siteContent } from './content/siteContent.ts'
import {
  mountSiteInteractions,
  renderSiteLayout,
} from './site/layout.ts'
import type { SiteView } from './site/types.ts'
import {
  HilbertBackground,
  type HilbertBackgroundConfig,
} from './hilbert/HilbertBackground.ts'

const backgroundConfig: HilbertBackgroundConfig = {
  baseOrder: 6,
  interactionOrder: 2,
  maxEffectiveOrder: 10,
  interactionInset: 0.08,
  coverScale: 1.0,
  anchorX: 0.5,
  anchorY: 0.5,
  maxDevicePixelRatio: 2,
  lineWidth: 2.0,
  lineOpacity: 0.3,
  backgroundColor: [248, 246, 242],
  gradientStart: [224, 67, 76],
  gradientEnd: [67, 67, 224],
  gradientSteps: 192,
  seedPositions: [0.08, 0.31, 0.57, 0.82],
  durationMs: 2_100,
  refinementEraseDurationMs: 220,
  refinementDrawDurationMs: 520,
}

const app = document.querySelector<HTMLDivElement>('#app')
if (app === null) {
  throw new Error('App root was not found')
}

app.innerHTML = `
  <canvas class="hilbert-canvas" aria-hidden="true"></canvas>
  <div class="site-root" id="site-root"></div>
`

const canvas = document.querySelector<HTMLCanvasElement>('.hilbert-canvas')
const siteRoot = document.querySelector<HTMLDivElement>('#site-root')

if (canvas === null || siteRoot === null) {
  throw new Error('The site shell could not be initialized')
}

const canvasElement = canvas
const siteRootElement = siteRoot

function getCurrentView(): SiteView {
  return window.location.hash === '#projects' ? 'projects' : 'about'
}

let unmountSiteInteractions: () => void = () => {}

function renderSite(): void {
  const view = getCurrentView()

  unmountSiteInteractions()
  document.body.dataset.view = view
  document.title = `${siteContent.profile.name} — ${view === 'about' ? 'About' : 'Projects'}`
  siteRootElement.innerHTML = renderSiteLayout(siteContent, view)
  unmountSiteInteractions = mountSiteInteractions(siteRootElement, siteContent)
}

const handleHashChange = (): void => {
  renderSite()
  window.scrollTo({ top: 0 })
}

window.addEventListener('hashchange', handleHashChange)

renderSite()

const background = new HilbertBackground(canvasElement, backgroundConfig)
background.mount()

const destroyBackground = (): void => background.destroy()
window.addEventListener('pagehide', destroyBackground, { once: true })

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unmountSiteInteractions()
    window.removeEventListener('hashchange', handleHashChange)
    window.removeEventListener('pagehide', destroyBackground)
    background.destroy()
  })
}
