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
  spotify: 'sauravchandra',
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

async function fetchSpotifyViaAPI(): Promise<any[] | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json() as any;

    const all: any[] = [];
    let url: string | null = `https://api.spotify.com/v1/users/${CONFIG.spotify}/playlists?limit=50`;
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
      if (!res.ok) return null;
      const page = await res.json() as any;
      for (const p of (page.items || [])) {
        if (!p.public) continue;
        all.push({
          id: p.id,
          name: p.name,
          url: p.external_urls?.spotify || '',
          embedUrl: `https://open.spotify.com/embed/playlist/${p.id}`,
          image: p.images?.[0]?.url || '',
        });
      }
      url = page.next;
    }
    return all.length ? all : null;
  } catch { return null; }
}

async function fetchSpotifyViaScrape(): Promise<any[]> {
  try {
    const res = await fetch(`https://open.spotify.com/user/${CONFIG.spotify}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const scripts = [...html.matchAll(/<script[^>]*>(.*?)<\/script>/gs)]
      .map(m => m[1]).filter(s => s.length > 500);

    for (const raw of scripts) {
      let decoded: string;
      try { decoded = Buffer.from(raw, 'base64').toString('utf-8'); } catch { continue; }
      let data: any;
      try { data = JSON.parse(decoded); } catch { continue; }
      const user = data?.entities?.items?.[`spotify:user:${CONFIG.spotify}`];
      if (!user?.publicPlaylistsV2?.items) continue;
      return user.publicPlaylistsV2.items
        .filter((w: any) => w?.data?.uri)
        .map((w: any) => {
          const d = w.data;
          const pid = d.uri.split(':').pop();
          return {
            id: pid,
            name: d.name || 'Untitled',
            url: `https://open.spotify.com/playlist/${pid}`,
            embedUrl: `https://open.spotify.com/embed/playlist/${pid}`,
            image: d.images?.items?.[0]?.sources?.[0]?.url || '',
          };
        });
    }
    return [];
  } catch { return []; }
}

const spotify = defineCollection({
  loader: async () => {
    return (await fetchSpotifyViaAPI()) ?? (await fetchSpotifyViaScrape());
  },
  schema: z.object({
    name: z.string(),
    url: z.string(),
    embedUrl: z.string(),
    image: z.string(),
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
        const review = stripHtml(desc).slice(0, 600);
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
        const excerpt = stripHtml(desc).slice(0, 500);
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
        const excerpt = stripHtml(desc).slice(0, 500);
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
