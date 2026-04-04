/**
 * Site Configuration
 *
 * This is the only file you need to edit to make this template yours.
 * Fill in your name, links, and platform handles below.
 *
 * Each feed value can be:
 *   true       — auto-fetch using your default handle
 *   'string'   — auto-fetch using a custom handle / ID
 *   ['url',..] — show specific URLs (playlists, videos, repos, etc.)
 */

export type FeedValue = true | string | string[];

export const worlds = [
  { slug: 'tech', label: 'Tech' },
  { slug: 'film', label: 'Film' },
  { slug: 'music', label: 'Music' },
  { slug: 'writing', label: 'Writing' },
  { slug: 'travel', label: 'Travel' },
] as const;

export type World = (typeof worlds)[number]['slug'];

export const worldLabels: Record<string, string> = Object.fromEntries(
  worlds.map((w) => [w.slug, w.label]),
);

export type SocialPlatform =
  | 'github'
  | 'instagram'
  | 'x'
  | 'youtube'
  | 'linkedin';

export type FeedPlatform =
  | 'youtube'
  | 'letterboxd'
  | 'substack'
  | 'medium'
  | 'github'
  | 'soundcloud'
  | 'spotify';

export type SiteConfig = {
  name: string;
  tagline: string;
  site: string;
  handle: string;
  favicon?: string;
  socials: Partial<Record<SocialPlatform, string>>;
  feeds: Partial<Record<FeedPlatform, FeedValue>>;
};

export const config: SiteConfig = {
  name: 'Saurav Chandra',
  tagline: 'A life portfolio — tech, film, music, writing, travel.',
  site: 'https://sauravchandra.com',
  handle: 'sauravchandra',
  favicon: '/favicon.ico',

  socials: {
    github: 'sauravchandra',
    instagram: 'sauravchandra_',
    x: 'sauravschandra',
    youtube: '@sauravschandra',
    linkedin: 'sauravschandra',
  },

  // spotify only supports specific URLs (playlists, tracks, albums, artists).
  feeds: {
    github: true,
    letterboxd: true,
    substack: true,
    soundcloud: true,
    medium: 'sauravchandra123',
    youtube: 'sauravschandra',
    spotify: [
      'https://open.spotify.com/playlist/2PsBSU6EOWyHg2RjpcGyMd',
    ],
  },
};

export function resolveHandle(value: FeedValue | undefined): string | undefined {
  if (value === true) return config.handle;
  if (typeof value === 'string') return value;
  return undefined;
}

export function resolveUrls(value: FeedValue | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

