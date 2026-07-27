export type ProjectLink = Readonly<{
  label: string
  href: string
}>

export type ContentImage = Readonly<{
  src: string
  alt: string
  objectPosition?: string
}>

export type PortraitSwap = Readonly<{
  id: string
  phrase: string
  images: readonly ContentImage[]
}>

export type Project = Readonly<{
  title: string
  slug?: string
  summary?: string
  year?: string
  status?: string
  role?: string
  image?: ContentImage
  links?: readonly ProjectLink[]
}>

export type SiteContent = Readonly<{
  profile: Readonly<{
    name: string
    headline: string
    photo: ContentImage
    blurb: readonly string[]
    portraitSwaps?: readonly PortraitSwap[]
  }>
  links: Readonly<Record<string, string>>
  projects: readonly Project[]
}>

/**
 * Shared, design-neutral website content.
 *
 * Keep personal information here rather than embedding it in presentation
 * markup. Add, remove, or reorder entries as the site evolves.
 */
export const siteContent = {
  profile: {
    name: 'Ronak Singh Monga',
    headline: '',
    photo: {
      src: '/media/profile.webp',
      alt: 'Portrait',
    },
    // Each entry is one paragraph. Add, remove, and reorder freely.
    blurb: [
      `Welcome! My name is Ronak Singh Monga.`,
      `I'm a Data Scientist interested in finding ways to apply, align, and train LLMs in ways that safely generate positive impact. I'm considerably worried about the world's future, especially for the next few years.`,
      `I live in the bay, but have also spent significant time on the east coast, midwest, and in Sydney, Australia!`,
      `By night I'm a bhangra dancer. I love to teach, compete, and perform at the occasional concert.`,
      `On a full moon, however, you might find me involved in puzzles, music, hiking, camping, or even fruit.`
    ],
    // Each phrase is matched once across the free-form blurb. Add, remove, or
    // move the phrase without changing the page markup. Multiple images are
    // supported; one is selected per visit and kept consistent while browsing.
    portraitSwaps: [
      {
        id: 'dance',
        phrase: 'dancer',
        images: [
          {
            src: '/media/portraits/dance.webp',
            alt: 'Bhangra photo',
            objectPosition: 'center 28%',
          },
        ],
      },
      {
        id: 'hiking',
        phrase: 'hiking',
        images: [
          {
            src: '/media/portraits/hiking.webp',
            alt: 'Hiking photo',
          },
        ],
      },
    ],
  },
  // Add or remove named links without changing the content type.
  links: {
    resume: '/resume.pdf',
    github: 'https://github.com/ronmonga',
    linkedin: 'https://www.linkedin.com/in/ronak-monga/',
    email: 'mailto:ronak.monga@gmail.com',
  },
  // Only a project title is required; all other project fields are optional.
  projects: [
    {
      slug: 'minecraft-mosaics',
      title: 'Evolution Algorithm for Minecraft Mosaics',
      summary: 'making pretty pictures out of minecraft textures.. or any textures! an old school project recently refactored',
      year: '2025',
      status: '',
      role: '',
      image: {
        src: '/media/projects/melodrama-progress.webp',
        alt: 'Melodrama mosaic gif',
      },
      links: [
        {
          label: 'GitHub',
          href: 'https://github.com/ronmonga/minecraft-mosaic',
        },
      ],
    },
    {
      slug: 'cache-utilization-research-poster',
      title: 'Cache Utilization Research Poster',
      summary:
        'First Place in the ACM Student Research Competition! While an intern at Lawrence Berkeley National Lab, I created some insights and models about in-network cache utilization, check it out',
      year: '2023',
      image: {
        src: '/media/projects/cache-poster.webp',
        alt: 'Cache utilization research poster presented at SC23',
      },
      links: [
        {
          label: 'Paper',
          href: 'https://www.epj-conferences.org/articles/epjconf/abs/2025/22/epjconf_chep2025_01341/epjconf_chep2025_01341.html',
        },
        {
          label: 'Poster',
          href: 'https://sdm.lbl.gov/oapapers/sc23-poster-monga.pdf',
        },
        {
          label: 'Article',
          href: 'https://cs.lbl.gov/news-and-events/news/2023/former-cs-area-intern-wins-student-research-award-at-sc23/',
        },
      ],
    },
    {
      slug: 'active-missing-persons-cases',
      title: 'Active Missing Persons Cases',
      summary:
        'A school project for the IDS newspaper! An interactive map designed to highlight how the frequency of unsolved missing persons cases can appear disproportionately in minority groups.',
      year: '2023',
      image: {
        src: '/media/projects/missing-viz.webp',
        alt: 'Interactive visualization of active missing persons cases',
      },
      links: [
        {
          label: 'GitHub',
          href: 'https://github.com/ronmonga/missing-persons-map/',
        },
        {
          label: 'Live site (down)',
          href: 'https://html.luddy.indiana.edu/~ronmonga/visualization.html',
        },
      ],
    },
    {
      slug: 'election-day-2024',
      title: 'Election Day 2024!',
      summary:
        'An IDS newspaper buildout in which I played a very data-centric role! We tracked the county, state, and national elections, including live feeds for news, election results, and interactive historical results. (now a bit broken)',
      year: '2024',
      image: {
        src: '/media/projects/elections-viz.webp',
        alt: 'IDS 2024 election results visualization',
      },
      links: [
        {
          label: 'Live site',
          href: 'https://specials.idsnews.com/elections-guide-2024-ids/index.html',
        },
      ],
    },
    {
      slug: 'spotify-data-visualizations',
      title: 'Spotify data visualizations',
      summary:
        "You can see my sleep schedule AND travel in just spotify listening. If there's one thing I love, it's looking at my music through the lens of data analysis. I find myself periodically returning to this project. It taught me basic python data viz in 2022, and I still come back now and again to add an even more convoluted feature!",
      year: '2022',
      status: 'Ongoing',
      image: {
        src: '/media/projects/spotify-viz-heatmap.webp',
        alt: 'Spotify listening data visualizations',
      },
      links: [
        {
          label: 'GitHub',
          href: 'https://github.com/ronmonga/spotify-viz',
        },
      ],
    },
  ],
} satisfies SiteContent
