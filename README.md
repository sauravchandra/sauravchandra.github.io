# Life Portfolio

A personal website template that pulls your content from across the internet and presents it as a unified timeline. Built with [Astro](https://astro.build).

## Quick Start

1. **Fork / clone** this repo
2. **Edit `src/config.ts`** — set your name, site URL, social links, and feed handles
3. **Install dependencies** — `npm install`
4. **Run locally** — `npm run dev`
5. **Deploy** — `npm run build` (static output in `dist/`)

## Configuration

Everything is driven by a single file: **`src/config.ts`**.

```ts
export const config = {
  name: 'Your Name',
  tagline: 'Your tagline here.',
  site: 'https://yourdomain.com',
  handle: 'yourusername',

  socials: {
    github: 'yourusername',
    // instagram: 'yourusername',
    // x: 'yourusername',
    // youtube: '@yourusername',
    // linkedin: 'yourusername',
  },

  feeds: {
    github: true,                         // auto-fetch using default handle
    // letterboxd: true,
    // substack: true,
    // soundcloud: true,
    // medium: 'different_handle',        // override with a custom handle
    // youtube: true,                      // uses your handle or '@username'
    // spotify: [                         // specific URLs
    //   'https://open.spotify.com/playlist/...',
    // ],
  },
};
```

Each feed value can be:
- **`true`** — auto-fetch content using your default `handle`
- **`'string'`** — auto-fetch using a different handle or ID
- **`['url', ...]`** — show specific URLs (playlists, videos, repos, etc.)

Leave a feed commented out to hide it entirely — no errors, no empty sections.

### Environment Variables (optional)

Create a `.env` file for optional API keys:

```
UNSPLASH_ACCESS_KEY=...
```

- **Unsplash** — fills in random cover images for feed items that don't have one. Without it, static fallback images are used. Get a key at [unsplash.com/developers](https://unsplash.com/developers).

### Publishing

Manage content using GitHub Issues.

| Action | How |
|--------|-----|
| **Create** | New Issue → pick template (Post / Photo / Gallery) → fill form → submit |
| **Update** | Edit the issue body → reopen it |
| **Delete** | Add the `delete` label to the issue |

A GitHub Action handles the rest — commits the file, deploys, and closes the issue with a link. Only the repo owner and collaborators can publish. First push creates the required labels automatically.

### Content

Local content lives in `src/content/`:

| Directory | Purpose |
|-----------|---------|
| `posts/` | Markdown blog posts — served at `/blog/{slug}/` — with frontmatter (`title`, `description`, `date`, `world`, optional `cover`, `tags`, `draft`) |
| `photos/` | Photo slides (`caption`, `date`, `image`) — each gets a `/photo/{slug}/` page |
| `gallery/` | Photo galleries (`title`, `date`, `location`, `cover`, `photos[]`) |

### Worlds

Content is organized into five "worlds": **Tech**, **Film**, **Music**, **Writing**, **Travel**. Each feed source maps to a world automatically (e.g., Letterboxd → Film, GitHub → Tech). Worlds are defined in `config.ts` (the `worlds` array) and the corresponding CSS color variables live in `global.css`.

## Deploying to GitHub Pages

The included `.github/workflows/deploy.yml` builds and deploys on every push to `master` and on a daily schedule. To use it:

1. Enable **GitHub Pages** in your repo settings (source: GitHub Actions)
2. Optionally add `UNSPLASH_ACCESS_KEY` under Settings → Secrets
3. Update `public/CNAME` with your custom domain, or delete the file to use `username.github.io`

## License

MIT
