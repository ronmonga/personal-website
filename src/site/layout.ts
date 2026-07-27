import type { ContentImage, SiteContent } from '../content/siteContent.ts'
import { renderProjectCard } from './projectCard.ts'
import {
  escapeHtml,
  renderBlurb,
  renderPrimaryNav,
  renderSocialIconLinks,
  resolveSiteHref,
} from './rendering.ts'
import type { SiteView } from './types.ts'

const portraitSwapSelections = new Map<string, ContentImage>()
// Temporary comparison switch; set to false to remove the navigation wash.
const NAV_WASH_ENABLED = true

function renderHeader(content: SiteContent, view: SiteView): string {
  return `
    <header class="site-header" data-hilbert-ignore>
      <a class="site-wordmark" href="#about">${escapeHtml(content.profile.name)}</a>
      ${renderPrimaryNav(content, view, 'site-nav')}
    </header>
  `
}

function renderProfilePanel(
  content: SiteContent,
  view: SiteView,
  className: string,
): string {
  const photo = `
    <span class="site-photo-stage" data-profile-photo-stage>
      <img class="site-photo" id="profile-photo" data-profile-photo src="${escapeHtml(resolveSiteHref(content.profile.photo.src))}" alt="${escapeHtml(content.profile.photo.alt)}">
    </span>
  `
  const photoFrame =
    view === 'about'
      ? `<div class="site-photo-frame">${photo}</div>`
      : `<a class="site-photo-frame site-photo-link" href="#about" aria-label="About ${escapeHtml(content.profile.name)}">${photo}</a>`

  return `
    <aside class="${className}" data-hilbert-ignore>
      ${photoFrame}
      ${renderSocialIconLinks(content, 'site-icons')}
    </aside>
  `
}

export function renderSiteLayout(content: SiteContent, view: SiteView): string {
  const headline = content.profile.headline.trim()
  const layoutClass = NAV_WASH_ENABLED ? 'site-layout site-layout--nav-wash' : 'site-layout'

  return `
    <div class="${layoutClass}">
      ${renderHeader(content, view)}
      ${
        view === 'about'
          ? `<main class="site-about">
              <section class="site-sheet" data-hilbert-ignore>
                ${renderProfilePanel(content, view, 'site-about-identity')}
                <article class="site-prose">
                  ${headline.length === 0 ? '' : `<p class="site-kicker">${escapeHtml(headline)}</p>`}
                  ${renderBlurb(content, 'site-blurb')}
                </article>
              </section>
            </main>`
          : `<div class="site-project-layout">
              ${renderProfilePanel(content, view, 'site-project-identity')}
              <main class="site-project-main">
                <header class="site-project-heading" data-hilbert-ignore>
                  <!-- <p class="site-kicker">Selected work</p> -->
                  <h1>Projects and such.</h1>
                </header>
                <div class="project-card-grid">
                  ${content.projects.map(renderProjectCard).join('')}
                </div>
              </main>
            </div>`
      }
    </div>
  `
}

export function mountSiteInteractions(
  root: ParentNode,
  content: SiteContent,
): () => void {
  const portrait = root.querySelector<HTMLImageElement>('[data-profile-photo]')
  const stage = root.querySelector<HTMLElement>('[data-profile-photo-stage]')
  const triggers = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-portrait-swap]'),
  )
  const swaps = new Map(
    (content.profile.portraitSwaps ?? []).map((swap) => [swap.id, swap] as const),
  )

  if (portrait === null || stage === null || triggers.length === 0 || swaps.size === 0) {
    return () => {}
  }

  const defaultImage = content.profile.photo
  const selectedImages = new Map<string, ContentImage>()
  const imageLoadPromises = new Map<string, Promise<boolean>>()

  for (const [id, swap] of swaps) {
    const images = swap.images.filter((image) => image.src.trim().length > 0)
    if (images.length === 0) {
      continue
    }

    const cachedImage = portraitSwapSelections.get(id)
    const selectedImage =
      cachedImage !== undefined && images.some((image) => sameImage(image, cachedImage))
        ? cachedImage
        : images[Math.floor(Math.random() * images.length)]

    if (selectedImage === undefined) {
      continue
    }

    portraitSwapSelections.set(id, selectedImage)
    selectedImages.set(id, selectedImage)
  }

  let hoveredTrigger: HTMLButtonElement | undefined
  let focusedTrigger: HTMLButtonElement | undefined
  let pinnedTrigger: HTMLButtonElement | undefined
  let desiredImage = defaultImage
  let displayedImage = defaultImage
  let activeAnimation: Animation | undefined
  let isAnimating = false
  let isDestroyed = false
  let imageRequestId = 0
  const removeListeners: Array<() => void> = []
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

  const applyImage = (image: ContentImage): void => {
    portrait.src = resolveSiteHref(image.src)
    portrait.alt = image.alt
    portrait.style.objectPosition = image.objectPosition ?? ''
  }

  const loadImage = (image: ContentImage): Promise<boolean> => {
    const existingLoad = imageLoadPromises.get(image.src)
    if (existingLoad !== undefined) {
      return existingLoad
    }

    const preload = new Image()
    preload.src = resolveSiteHref(image.src)
    const pendingLoad = preload.decode().then(
      () => true,
      () => false,
    )
    imageLoadPromises.set(image.src, pendingLoad)
    return pendingLoad
  }

  const runAnimationQueue = async (): Promise<void> => {
    if (isAnimating || isDestroyed) {
      return
    }

    isAnimating = true

    try {
      while (!isDestroyed && !sameImage(displayedImage, desiredImage)) {
        if (reducedMotionQuery.matches || typeof stage.animate !== 'function') {
          displayedImage = desiredImage
          applyImage(displayedImage)
          continue
        }

        const turnOut = stage.animate(
          [
            { opacity: 1, transform: 'rotateY(0deg)' },
            { opacity: 0.72, transform: 'rotateY(88deg)' },
          ],
          { duration: 165, easing: 'ease-in', fill: 'forwards' },
        )
        activeAnimation = turnOut

        try {
          await turnOut.finished
        } catch {
          return
        }

        if (isDestroyed) {
          return
        }

        displayedImage = desiredImage
        applyImage(displayedImage)

        const turnIn = stage.animate(
          [
            { opacity: 0.72, transform: 'rotateY(-88deg)' },
            { opacity: 1, transform: 'rotateY(0deg)' },
          ],
          { duration: 195, easing: 'ease-out' },
        )
        activeAnimation = turnIn
        turnOut.cancel()

        try {
          await turnIn.finished
        } catch {
          return
        }
      }
    } finally {
      isAnimating = false
      activeAnimation = undefined
    }
  }

  const requestImage = (image: ContentImage): void => {
    const requestId = ++imageRequestId

    if (image.src === defaultImage.src) {
      desiredImage = image
      void runAnimationQueue()
      return
    }

    void loadImage(image).then((loaded) => {
      if (isDestroyed || requestId !== imageRequestId) {
        return
      }

      desiredImage = loaded ? image : defaultImage
      void runAnimationQueue()
    })
  }

  const syncActiveTrigger = (): void => {
    const activeTrigger = pinnedTrigger ?? focusedTrigger ?? hoveredTrigger
    for (const trigger of triggers) {
      trigger.setAttribute('aria-pressed', String(trigger === pinnedTrigger))
    }

    const id = activeTrigger?.dataset.portraitSwap
    requestImage(id === undefined ? defaultImage : (selectedImages.get(id) ?? defaultImage))
  }

  for (const trigger of triggers) {
    const handlePointerEnter = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') {
        hoveredTrigger = trigger
        syncActiveTrigger()
      }
    }
    const handlePointerLeave = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch' && hoveredTrigger === trigger) {
        hoveredTrigger = undefined
        syncActiveTrigger()
      }
    }
    const handleFocus = (): void => {
      focusedTrigger = trigger.matches(':focus-visible') ? trigger : undefined
      syncActiveTrigger()
    }
    const handleBlur = (): void => {
      if (focusedTrigger === trigger) {
        focusedTrigger = undefined
      }
      if (pinnedTrigger === trigger) {
        pinnedTrigger = undefined
      }
      syncActiveTrigger()
    }
    const handleClick = (): void => {
      if (pinnedTrigger === trigger) {
        pinnedTrigger = undefined
        focusedTrigger = undefined
        trigger.blur()
      } else {
        pinnedTrigger = trigger
      }
      syncActiveTrigger()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }

      pinnedTrigger = undefined
      focusedTrigger = undefined
      trigger.blur()
      syncActiveTrigger()
    }

    trigger.addEventListener('pointerenter', handlePointerEnter)
    trigger.addEventListener('pointerleave', handlePointerLeave)
    trigger.addEventListener('focus', handleFocus)
    trigger.addEventListener('blur', handleBlur)
    trigger.addEventListener('click', handleClick)
    trigger.addEventListener('keydown', handleKeyDown)
    removeListeners.push(() => {
      trigger.removeEventListener('pointerenter', handlePointerEnter)
      trigger.removeEventListener('pointerleave', handlePointerLeave)
      trigger.removeEventListener('focus', handleFocus)
      trigger.removeEventListener('blur', handleBlur)
      trigger.removeEventListener('click', handleClick)
      trigger.removeEventListener('keydown', handleKeyDown)
    })
  }

  const handlePortraitError = (): void => {
    imageRequestId += 1
    desiredImage = defaultImage
    displayedImage = defaultImage
    applyImage(defaultImage)
  }
  const handleOutsidePointerDown = (event: PointerEvent): void => {
    if (
      pinnedTrigger === undefined ||
      !(event.target instanceof Node) ||
      pinnedTrigger.contains(event.target)
    ) {
      return
    }

    const previousTrigger = pinnedTrigger
    pinnedTrigger = undefined
    focusedTrigger = undefined
    previousTrigger.blur()
    syncActiveTrigger()
  }
  portrait.addEventListener('error', handlePortraitError)
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  removeListeners.push(() => portrait.removeEventListener('error', handlePortraitError))
  removeListeners.push(() =>
    document.removeEventListener('pointerdown', handleOutsidePointerDown),
  )

  return () => {
    isDestroyed = true
    imageRequestId += 1
    activeAnimation?.cancel()
    removeListeners.forEach((removeListener) => removeListener())
  }
}

function sameImage(left: ContentImage, right: ContentImage): boolean {
  return (
    left.src === right.src &&
    left.alt === right.alt &&
    left.objectPosition === right.objectPosition
  )
}
