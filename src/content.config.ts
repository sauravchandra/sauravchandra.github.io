import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { config, worlds, resolveHandle, resolveUrls } from './config';

const worldSlugs = worlds.map((w) => w.slug) as [string, ...string[]];

function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const GITHUB_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&h=800&fit=crop&q=80';

function xmlText(block: string, tag: string): string | undefined {
  return block.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1];
}

function xmlCdata(block: string, tag: string): string | undefined {
  return block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))?.[1];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function firstImg(html: string): string | undefined {
  return html.match(/<img[^>]+src=["']([^"']+)["']/)?.[1];
}

function makeId(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 80);
}

// ---------------------------------------------------------------------------
// Local content (markdown files)
// ---------------------------------------------------------------------------

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    world: z.enum(worldSlugs),
    cover: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
  }),
});

const photos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/photos' }),
  schema: z.object({
    caption: z.string(),
    date: z.coerce.date(),
    image: z.string(),
  }),
});

const gallery = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/gallery' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    location: z.string(),
    cover: z.string(),
    photos: z.array(z.string()),
  }),
});

// ---------------------------------------------------------------------------
// Spotify — URL-array only (oEmbed for each URL)
// ---------------------------------------------------------------------------

const spotify = defineCollection({
  loader: async () => {
    const urls = resolveUrls(config.feeds.spotify);
    if (!urls.length) return [];
    const results = await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
        );
        if (!res.ok) return null;
        const data = await res.json() as any;
        const embedUrl = url.replace('open.spotify.com/', 'open.spotify.com/embed/');
        return {
          id: makeId(url),
          name: data.title || 'Spotify',
          url,
          embedUrl,
          image: data.thumbnail_url || '',
        };
      } catch { return null; }
    }));
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },
  schema: z.object({
    name: z.string(),
    url: z.string(),
    embedUrl: z.string(),
    image: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// YouTube — handle mode: resolve handle → channel ID → RSS; URL mode: parse video IDs
// ---------------------------------------------------------------------------

function parseYouTubeVideoId(url: string): string | undefined {
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1];
}

async function resolveYouTubeChannelId(handle: string): Promise<string | undefined> {
  if (handle.startsWith('UC') && handle.length === 24) return handle;
  const slug = handle.startsWith('@') ? handle : `@${handle}`;
  try {
    const res = await fetch(`https://www.youtube.com/${slug}`);
    if (!res.ok) return undefined;
    const html = await res.text();
    return html.match(/channel_id=([A-Za-z0-9_-]{24})/)?.[1];
  } catch { return undefined; }
}

const youtube = defineCollection({
  loader: async () => {
    const urls = resolveUrls(config.feeds.youtube);
    if (urls.length) {
      return urls
        .map((url) => {
          const videoId = parseYouTubeVideoId(url);
          if (!videoId) return null;
          return {
            id: videoId,
            videoId,
            caption: '',
            date: new Date().toISOString(),
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
    }
    const handle = resolveHandle(config.feeds.youtube);
    if (!handle) return [];
    const channelId = await resolveYouTubeChannelId(handle);
    if (!channelId) return [];
    try {
      const res = await fetch(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
      );
      if (!res.ok) return [];
      const xml = await res.text();
      const entries: any[] = [];
      const re = /<entry>([\s\S]*?)<\/entry>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const b = m[1];
        const videoId = b.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
        const title = b.match(/<title>([^<]+)<\/title>/)?.[1];
        const published = b.match(/<published>([^<]+)<\/published>/)?.[1];
        const thumbnail = b.match(/<media:thumbnail url="([^"]+)"/)?.[1];
        if (videoId && title && published) {
          entries.push({ id: videoId, videoId, caption: title, date: published, thumbnail });
        }
      }
      return entries;
    } catch { return []; }
  },
  schema: z.object({
    videoId: z.string(),
    caption: z.string(),
    date: z.coerce.date(),
    thumbnail: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Letterboxd — handle mode: RSS feed; URL mode: extract film title from slug
// ---------------------------------------------------------------------------

const letterboxd = defineCollection({
  loader: async () => {
    const urls = resolveUrls(config.feeds.letterboxd);
    if (urls.length) {
      return urls.map((url) => {
        const slug = url.replace(/\/$/, '').split('/').pop() || '';
        return {
          id: makeId(url),
          filmTitle: slugToTitle(slug),
          url,
          date: new Date().toISOString(),
        };
      });
    }
    const handle = resolveHandle(config.feeds.letterboxd);
    if (!handle) return [];
    try {
      const res = await fetch(`https://letterboxd.com/${handle}/rss/`);
      if (!res.ok) return [];
      const xml = await res.text();
      const entries: any[] = [];
      const re = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const b = m[1];
        const filmTitle = xmlText(b, 'letterboxd:filmTitle') || xmlText(b, 'title') || '';
        const rating = xmlText(b, 'letterboxd:memberRating');
        const link = xmlText(b, 'link') || xmlText(b, 'guid') || '';
        const pubDate = xmlText(b, 'pubDate');
        const desc = xmlCdata(b, 'description') || '';
        const poster = desc.match(/<img src="([^"]+)"/)?.[1];
        const review = stripHtml(desc).slice(0, 600);
        if (filmTitle && pubDate) {
          entries.push({
            id: makeId(link),
            filmTitle, rating: rating && !isNaN(parseFloat(rating)) ? parseFloat(rating) : undefined,
            review: review || undefined, url: link, date: pubDate, poster,
          });
        }
      }
      return entries;
    } catch { return []; }
  },
  schema: z.object({
    filmTitle: z.string(),
    rating: z.number().optional(),
    review: z.string().optional(),
    url: z.string(),
    date: z.coerce.date(),
    poster: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Substack — handle mode: RSS feed; URL mode: extract title from slug
// ---------------------------------------------------------------------------

const substackFeed = defineCollection({
  loader: async () => {
    const urls = resolveUrls(config.feeds.substack);
    if (urls.length) {
      return urls.map((url) => {
        const slug = url.replace(/\/$/, '').split('/').pop() || '';
        return {
          id: makeId(url),
          title: slugToTitle(slug),
          url,
          date: new Date().toISOString(),
        };
      });
    }
    const handle = resolveHandle(config.feeds.substack);
    if (!handle) return [];
    try {
      const res = await fetch(`https://${handle}.substack.com/feed`);
      if (!res.ok) return [];
      const xml = await res.text();
      const entries: any[] = [];
      const re = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const b = m[1];
        const title = xmlText(b, 'title') || '';
        const link = xmlText(b, 'link') || '';
        const pubDate = xmlText(b, 'pubDate');
        const desc = xmlCdata(b, 'description') || xmlText(b, 'description') || '';
        const excerpt = stripHtml(desc).slice(0, 500);
        const image = firstImg(desc);
        if (title && pubDate) {
          entries.push({ id: makeId(link), title, excerpt: excerpt || undefined, url: link, date: pubDate, image });
        }
      }
      return entries;
    } catch { return []; }
  },
  schema: z.object({
    title: z.string(),
    excerpt: z.string().optional(),
    url: z.string(),
    date: z.coerce.date(),
    image: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Medium — handle mode: RSS feed; URL mode: extract title from slug
// ---------------------------------------------------------------------------

const mediumFeed = defineCollection({
  loader: async () => {
    const urls = resolveUrls(config.feeds.medium);
    if (urls.length) {
      return urls.map((url) => {
        const slug = url.replace(/\/$/, '').split('/').pop() || '';
        const cleaned = slug.replace(/-[a-f0-9]{10,}$/, '');
        return {
          id: makeId(url),
          title: slugToTitle(cleaned),
          url,
          date: new Date().toISOString(),
        };
      });
    }
    const handle = resolveHandle(config.feeds.medium);
    if (!handle) return [];
    try {
      const res = await fetch(`https://medium.com/feed/@${handle}`);
      if (!res.ok) return [];
      const xml = await res.text();
      const entries: any[] = [];
      const re = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const b = m[1];
        const title = xmlCdata(b, 'title') || xmlText(b, 'title') || '';
        const link = xmlText(b, 'link') || '';
        const pubDate = xmlText(b, 'pubDate');
        const desc = xmlCdata(b, 'description') || xmlText(b, 'description') || '';
        const contentEncoded = xmlCdata(b, 'content:encoded') || '';
        const excerpt = stripHtml(desc).slice(0, 500);
        const image = firstImg(contentEncoded) || firstImg(desc);
        if (title && pubDate) {
          entries.push({ id: makeId(link), title, excerpt: excerpt || undefined, url: link, date: pubDate, image });
        }
      }
      return entries;
    } catch { return []; }
  },
  schema: z.object({
    title: z.string(),
    excerpt: z.string().optional(),
    url: z.string(),
    date: z.coerce.date(),
    image: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// GitHub — handle mode: user repos API; URL mode: fetch individual repos
// ---------------------------------------------------------------------------

function parseGitHubRepo(url: string): { owner: string; repo: string } | undefined {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  return m ? { owner: m[1], repo: m[2] } : undefined;
}

const github = defineCollection({
  loader: async () => {
    const urls = resolveUrls(config.feeds.github);
    if (urls.length) {
      const results = await Promise.all(urls.map(async (url) => {
        const parsed = parseGitHubRepo(url);
        if (!parsed) return null;
        try {
          const res = await fetch(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
            { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'astro-build' } }
          );
          if (!res.ok) return null;
          const r = await res.json() as any;
          return {
            id: r.name,
            name: r.name,
            description: r.description || '',
            url: r.html_url,
            language: r.language || '',
            stars: r.stargazers_count,
            date: r.pushed_at,
            image: GITHUB_PLACEHOLDER_IMAGE,
          };
        } catch { return null; }
      }));
      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    }
    const handle = resolveHandle(config.feeds.github);
    if (!handle) return [];
    try {
      const res = await fetch(
        `https://api.github.com/users/${handle}/repos?sort=pushed&per_page=15`,
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'astro-build' } }
      );
      if (!res.ok) return [];
      const repos: any[] = await res.json();
      return repos
        .filter((r: any) => !r.fork && !r.archived)
        .map((r: any) => ({
          id: r.name,
          name: r.name,
          description: r.description || '',
          url: r.html_url,
          language: r.language || '',
          stars: r.stargazers_count,
          date: r.pushed_at,
          image: GITHUB_PLACEHOLDER_IMAGE,
        }));
    } catch { return []; }
  },
  schema: z.object({
    name: z.string(),
    description: z.string(),
    url: z.string(),
    language: z.string(),
    stars: z.number(),
    date: z.coerce.date(),
    image: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// SoundCloud — handle mode: oEmbed profile; URL mode: oEmbed per URL
// ---------------------------------------------------------------------------

async function resolveSoundCloudOembed(url: string): Promise<any | null> {
  try {
    const res = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const srcMatch = data.html?.match(/src="([^"]+)"/);
    if (!srcMatch) return null;
    return {
      id: makeId(url),
      trackTitle: data.title || 'SoundCloud',
      url: data.author_url || url,
      date: new Date().toISOString(),
      artwork: data.thumbnail_url || '',
      embedUrl: srcMatch[1],
    };
  } catch { return null; }
}

const soundcloud = defineCollection({
  loader: async () => {
    const urls = resolveUrls(config.feeds.soundcloud);
    if (urls.length) {
      const results = await Promise.all(urls.map(resolveSoundCloudOembed));
      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    }
    const handle = resolveHandle(config.feeds.soundcloud);
    if (!handle) return [];
    const result = await resolveSoundCloudOembed(`https://soundcloud.com/${handle}`);
    if (!result) return [];
    return [{ ...result, id: 'soundcloud-profile', trackTitle: 'SoundCloud' }];
  },
  schema: z.object({
    trackTitle: z.string(),
    url: z.string(),
    date: z.coerce.date(),
    artwork: z.string().optional(),
    embedUrl: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------

export const collections = {
  posts, photos, youtube, gallery, spotify,
  letterboxd, substackFeed, mediumFeed, github, soundcloud,
};
