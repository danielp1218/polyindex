import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['storage'],
    host_permissions: [
      'https://*.workers.dev/*',
      'https://gamma-api.polymarket.com/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    // Remove default_popup to allow onClicked to fire
    action: {
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '96': 'icon/96.png',
        '128': 'icon/128.png',
      },
      default_title: 'Pindex',
    },
    web_accessible_resources: [
      {
        resources: ['0117.mp4'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
