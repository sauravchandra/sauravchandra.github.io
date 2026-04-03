import 'dotenv/config';
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const CONFIG = {
  youtube: 'UCa7NBlOhfj9lXS3p4uZ6Wfg',
  letterboxd: 'sauravchandra',
  substack: 'sauravchandra',
  medium: 'sauravchandra123',
  github: 'sauravchandra',
  soundcloud: '19843180',
};

const worlds = ['tech', 'film', 'music', 'philosophy', 'travel'] as const;

function xmlText(block: string, tag: string): string | undefined {
  return block.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1];
}

function xmlCdata(block: string, tag: string): string | undefined {
  return block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))?.[1];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function makeId(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 80);
}

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    world: z.enum(worlds),
    cover: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
  }),
});

const carousel = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/carousel' }),
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

const spotify = defineCollection({
  loader: async () => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return [];
    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
      });
      if (!tokenRes.ok) return [];
      const { access_token } = await tokenRes.json() as any;

      const plRes = await fetch(
        'https://api.spotify.com/v1/users/sauravchandra/playlists?limit=50',
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      if (!plRes.ok) return [];
      const data = await plRes.json() as any;

      return (data.items || [])
        .filter((p: any) => p.public)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          description: (p.description || '').replace(/<[^>]+>/g, '').slice(0, 150),
          url: p.external_urls?.spotify || '',
          embedUrl: `https://open.spotify.com/embed/playlist/${p.id}`,
          image: p.images?.[0]?.url || '',
          tracks: p.tracks?.total || 0,
          date: p.id,
        }));
    } catch { return []; }
  },
  schema: z.object({
    name: z.string(),
    description: z.string(),
    url: z.string(),
    embedUrl: z.string(),
    image: z.string(),
    tracks: z.number(),
    date: z.string(),
  }),
});

const youtube = defineCollection({
  loader: async () => {
    try {
      const res = await fetch(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${CONFIG.youtube}`
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

const letterboxd = defineCollection({
  loader: async () => {
    try {
      const res = await fetch(`https://letterboxd.com/${CONFIG.letterboxd}/rss/`);
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
        const review = stripHtml(desc).slice(0, 200);
        if (filmTitle && pubDate) {
          entries.push({
            id: makeId(link),
            filmTitle, rating: rating ? parseFloat(rating) : undefined,
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

const substackFeed = defineCollection({
  loader: async () => {
    try {
      const res = await fetch(`https://${CONFIG.substack}.substack.com/feed`);
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
        const excerpt = stripHtml(desc).slice(0, 200);
        if (title && pubDate) {
          entries.push({ id: makeId(link), title, excerpt: excerpt || undefined, url: link, date: pubDate });
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
  }),
});

const mediumFeed = defineCollection({
  loader: async () => {
    try {
      const res = await fetch(`https://medium.com/feed/@${CONFIG.medium}`);
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
        const excerpt = stripHtml(desc).slice(0, 200);
        if (title && pubDate) {
          entries.push({ id: makeId(link), title, excerpt: excerpt || undefined, url: link, date: pubDate });
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
  }),
});

const github = defineCollection({
  loader: async () => {
    try {
      const res = await fetch(
        `https://api.github.com/users/${CONFIG.github}/repos?sort=pushed&per_page=15`,
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
  }),
});

const soundcloud = defineCollection({
  loader: async () => {
    try {
      const res = await fetch(
        `https://feeds.soundcloud.com/users/soundcloud:users:${CONFIG.soundcloud}/sounds.rss`
      );
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
        const artwork = b.match(/<itunes:image href="([^"]+)"/)?.[1];
        if (title && pubDate) {
          entries.push({
            id: makeId(link), trackTitle: title, url: link,
            date: pubDate, artwork: artwork || undefined,
          });
        }
      }
      return entries;
    } catch { return []; }
  },
  schema: z.object({
    trackTitle: z.string(),
    url: z.string(),
    date: z.coerce.date(),
    artwork: z.string().optional(),
  }),
});

export const collections = {
  posts, carousel, youtube, gallery, spotify,
  letterboxd, substackFeed, mediumFeed, github, soundcloud,
};
