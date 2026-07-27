import type {
  PortraitSwap,
  Project,
  ProjectLink,
  SiteContent,
} from '../content/siteContent.ts'
import type { SiteView } from './types.ts'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function resolveSiteHref(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) {
    return `${import.meta.env.BASE_URL}${value.slice(1)}`
  }

  if (
    value.startsWith('#') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    return value
  }

  return `https://${value}`
}

export function renderBlurb(content: SiteContent, className: string): string {
  const renderedSwapIds = new Set<string>()
  const paragraphs = content.profile.blurb
    .filter((paragraph) => paragraph.trim().length > 0)
    .map(
      (paragraph) =>
        `<p>${renderBlurbParagraph(paragraph, content.profile.portraitSwaps ?? [], renderedSwapIds)}</p>`,
    )
    .join('')

  return paragraphs.length === 0 ? '' : `<div class="${className}">${paragraphs}</div>`
}

function renderBlurbParagraph(
  paragraph: string,
  swaps: readonly PortraitSwap[],
  renderedSwapIds: Set<string>,
): string {
  const normalizedParagraph = paragraph.toLocaleLowerCase()
  const matches = swaps
    .filter(
      (swap) =>
        !renderedSwapIds.has(swap.id) &&
        swap.phrase.trim().length > 0 &&
        swap.images.some((image) => image.src.trim().length > 0),
    )
    .map((swap) => ({
      swap,
      start: normalizedParagraph.indexOf(swap.phrase.toLocaleLowerCase()),
    }))
    .filter((match) => match.start >= 0)
    .sort((left, right) => left.start - right.start)

  if (matches.length === 0) {
    return escapeHtml(paragraph)
  }

  let cursor = 0
  let rendered = ''

  for (const { swap, start } of matches) {
    const end = start + swap.phrase.length
    if (start < cursor) {
      continue
    }

    const visiblePhrase = paragraph.slice(start, end)
    rendered += escapeHtml(paragraph.slice(cursor, start))
    rendered += `<button class="portrait-swap-trigger" type="button" data-portrait-swap="${escapeHtml(swap.id)}" aria-controls="editorial-top-profile-photo" aria-label="${escapeHtml(`${visiblePhrase}: show related photo`)}" aria-pressed="false">${escapeHtml(visiblePhrase)}</button>`
    renderedSwapIds.add(swap.id)
    cursor = end
  }

  return rendered + escapeHtml(paragraph.slice(cursor))
}

export function renderPrimaryNav(
  content: SiteContent,
  view: SiteView,
  className: string,
): string {
  const resume = content.links.resume

  return `
    <nav class="${className}" aria-label="Primary navigation" data-hilbert-ignore>
      ${renderViewLink('about', 'About', view)}
      ${renderViewLink('projects', 'Projects', view)}
      ${resume === undefined || resume.trim().length === 0 ? '' : renderExternalLink('Résumé', resume)}
    </nav>
  `
}

export function renderSocialIconLinks(content: SiteContent, className: string): string {
  const labels: Readonly<Record<string, string>> = {
    github: 'GitHub',
    linkedin: 'LinkedIn',
    email: 'Email',
  }
  const icons: Readonly<Record<string, string>> = {
    github: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.57-.29-5.28-1.29-5.28-5.73 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .98-.31 3.17 1.19A11 11 0 0 1 12 6.04c.98 0 1.98.13 2.9.39 2.2-1.5 3.17-1.19 3.17-1.19.63 1.6.23 2.78.11 3.07.75.81 1.2 1.84 1.2 3.11 0 4.45-2.72 5.43-5.3 5.72.42.36.79 1.07.79 2.15v3.25c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>`,
    linkedin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.3 7.9H1.7V22h3.6V7.9ZM3.5 2A2.1 2.1 0 1 0 3.5 6.2 2.1 2.1 0 0 0 3.5 2ZM22.3 13.9c0-4.25-2.27-6.23-5.3-6.23a4.57 4.57 0 0 0-4.14 2.28V7.9H9.25V22h3.61v-7c0-1.84.35-3.62 2.63-3.62 2.25 0 2.28 2.1 2.28 3.74V22h3.61l.92-8.1Z"/></svg>`,
    email: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5h18v13H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  }
  const links = Object.entries(content.links)
    .filter(([key, href]) => key !== 'resume' && icons[key] !== undefined && href.trim().length > 0)
    .map(([key, href]) => {
      const label = labels[key] ?? key
      const targetAttributes = href.startsWith('mailto:') ? '' : ' target="_blank" rel="noreferrer"'
      return `<a href="${escapeHtml(resolveSiteHref(href))}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${targetAttributes}>${icons[key]}</a>`
    })
    .join('')

  return links.length === 0
    ? ''
    : `<nav class="${className}" aria-label="External profiles">${links}</nav>`
}

export function renderProjectLinks(project: Project, className: string): string {
  if (project.links === undefined || project.links.length === 0) {
    return ''
  }

  const links = project.links
    .filter((link) => link.href.trim().length > 0)
    .map(renderProjectLink)
    .join('')

  return links.length === 0 ? '' : `<div class="${className}">${links}</div>`
}

export function renderProjectMeta(project: Project, className: string): string {
  const items = [project.year, project.status, project.role]
    .filter((item): item is string => item !== undefined && item.trim().length > 0)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join('')

  return items.length === 0 ? '' : `<div class="${className}">${items}</div>`
}

export function renderProjectImage(project: Project, className: string): string {
  if (project.image === undefined || project.image.src.trim().length === 0) {
    return ''
  }

  return `<img class="${className}" src="${escapeHtml(resolveSiteHref(project.image.src))}" alt="${escapeHtml(project.image.alt)}" loading="lazy">`
}

function renderViewLink(target: SiteView, label: string, view: SiteView): string {
  const current = target === view ? ' aria-current="page"' : ''
  return `<a href="#${target}"${current}>${label}</a>`
}

function renderExternalLink(label: string, href: string): string {
  return `<a href="${escapeHtml(resolveSiteHref(href))}" target="_blank" rel="noreferrer">${escapeHtml(label)}<span aria-hidden="true"> ↗</span></a>`
}

function renderProjectLink(link: ProjectLink): string {
  return renderExternalLink(link.label, link.href)
}
