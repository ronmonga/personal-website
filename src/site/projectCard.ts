import type { Project } from '../content/siteContent.ts'
import {
  escapeHtml,
  renderProjectImage,
  renderProjectLinks,
  renderProjectMeta,
} from './rendering.ts'

export function renderProjectCard(project: Project): string {
  const image = renderProjectImage(project, 'project-card-image')
  const summary = project.summary?.trim()

  return `
    <article class="project-card" data-hilbert-ignore>
      ${image.length === 0 ? '' : `<figure class="project-card-visual">${image}</figure>`}
      <div class="project-card-copy">
        ${renderProjectMeta(project, 'project-meta')}
        <h2>${escapeHtml(project.title)}</h2>
        ${summary === undefined || summary.length === 0 ? '' : `<p>${escapeHtml(summary)}</p>`}
        ${renderProjectLinks(project, 'project-links')}
      </div>
    </article>
  `
}
