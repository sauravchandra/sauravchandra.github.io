import { defineConfig } from 'astro/config';
import { config } from './src/config';

export default defineConfig({
  site: config.site,
});
