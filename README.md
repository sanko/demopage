# Monolog

**Monolog** is a headless, single-column content aggregator and personal website engine.

It treats the internet as your CMS. You write posts on Github or Bluesky, push code to GitLab or Gitea, and bookmark links on Raindrop. Monolog fetches it all, filters it, and builds a static HTML site (with RSS feeds) automatically.

## 🚀 Quick Start

1.  **Fork this Repository.**
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure:** Copy the example config and edit it.
    ```bash
    cp config.example.json config.json
    ```
4.  **Set Secrets:** Create a `.env` file (see [Secrets](#-secrets--environment-variables)).
5.  **Build:**
    ```bash
    node build.js
    ```

Personally, I'd throw the thing in a Github Workflow.

```yaml
name: Build and Deploy Monolog

on:
  # Every 2 hours
  schedule:
    - cron: '0 0/2 * * *'
  # Run when you push changes to config or template
  push:
    branches: [ main ]
  # Allow manual run button in GitHub UI
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: npm install node-fetch@2 markdown-it rss dotenv rss rss-parser node-emoji@1

      - name: Run Build Script
        env:
          # GITHUB_TOKEN is automatically provided by Actions
          # We use it to fetch your discussions/releases
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node build.js

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## ⚙️ Configuration (`config.json`)

### `profile`
Controls the header, footer, and SEO meta tags.

| Property | Type | Description |
| :--- | :--- | :--- |
| `name` | string | Displayed in the header and `<title>`. |
| `tagline` | string | Displayed below the name and in meta description. |
| `url` | string | The production URL (used for canonical links/RSS). |
| `email` | string | Displayed in footer. |
| `og_image` | string | Absolute URL to an image used for Twitter/OpenGraph cards. |
| `copyright_start`| string | Year to start the copyright range (e.g., "2023"). |
| `socials` | array | List of objects `{ "name": "...", "url": "..." }` to display in the footer. |

### `analytics`
Supports privacy-friendly analytics out of the box.

| Provider | Config Keys | Description |
| :--- | :--- | :--- |
| **plausible** | `enabled` (bool), `domain`, `src` | Injects the Plausible tracking script. |
| **cloudflare** | `enabled` (bool), `token` | Injects the Cloudflare Web Analytics beacon. |

---

### `github` (Source)
The core engine. Fetches Discussions, Issues, and Releases via GraphQL.

**`sources` array options:**
| Property | Required | Description |
| :--- | :--- | :--- |
| `name` | **Yes** | Internal ID used for generating specific RSS feeds later. |
| `owner` | **Yes** | The Github username or Organization name. |
| `repos` | **Yes** | Array of repository names to fetch from. |
| `discussions` | No | `true`/`false` (Default: `true`). Fetch blog posts/notes. |
| `releases` | No | `true`/`false` (Default: `true`). Fetch releases/tags. |
| `issues` | No | `true`/`false` (Default: `false`). Fetch issue activity. |

**Other Options:**
*   `groups`: Maps specific repositories to a "Topic" tag in the filter bar. Useful for grouping multiple micro-services under one project name.
*   `tag_overrides`: A dictionary to fix tag casing (e.g., convert the slug "ios" to display "iOS").

**Example:**
```json
"github": {
  "sources": [
    {
      "name": "personal",
      "owner": "johndoe",
      "repos": ["blog"],
      "discussions": true
    },
    {
      "name": "work",
      "owner": "acme-corp",
      "repos": ["backend-api"],
      "discussions": false,
      "releases": true
    }
  ],
  "groups": {
    "Infrastructure": ["johndoe/dotfiles", "backend-api"]
  },
  "tag_overrides": { "api": "API", "css": "CSS" }
}
```

---

### `bluesky` (Source)
Fetches posts from Bluesky as "Notes".

**`sources` array options:**
| Property | Description |
| :--- | :--- |
| `name` | Internal ID for RSS filtering. |
| `handle` | Your Bluesky handle (e.g., `user.bsky.social`). |
| `feed` | *(Optional)* A custom feed URI (e.g., `at://did:plc:...`). If omitted, fetches the user's author feed. |

---

### `mastodon` / `lemmy` (Fediverse)
Fetches toots/posts from any compatible instance.

| Service | Config Keys | Description |
| :--- | :--- | :--- |
| **mastodon** | `instance`, `id` | Numeric User ID required. |
| **lemmy** | `instance`, `username` | Fetches user posts/comments. |

---

### `youtube` (Source)
Fetches recent videos.

**`sources` array options:**
| Property | Description |
| :--- | :--- |
| `name` | Internal ID for RSS filtering. |
| `channel_id` | The ID starting with `UC...`. |

---

### `raindrop` (Source)
Fetches bookmarks from Raindrop.io collections.

| Property | Description |
| :--- | :--- |
| `collection_id` | The numeric ID of the collection. `0` is "All Bookmarks". |

---

### `rss` (Source)
Ingest external RSS or Atom feeds (e.g., Substack, Medium, Blogs).

**`sources` array options:**
| Property | Description |
| :--- | :--- |
| `name` | Internal ID for filtering and tag generation. |
| `url` | The full URL to the `.xml` or `.rss` feed. |

---

### `gitlab` / `gitea` / `bitbucket` (Sources)
Fetch releases/tags from other git forges.

| Service | Config Keys | Description |
| :--- | :--- | :--- |
| **gitlab** | `instance` (default `gitlab.com`), `id` (Project ID) | Fetch releases for a specific project ID. |
| **gitea** | `instance` (domain), `owner`, `repo` | Fetch releases from a Gitea repo. |
| **bitbucket** | `workspace`, `repo_slug` | Fetch tags from a Bitbucket repo. |

---

### `feeds` (Output)
Define exactly which content goes into which RSS/Atom feed file.

**Example:**
```json
"feeds": {
  // The Master Feed (Everything)
  "feed.xml": { "type": "rss", "sources": ["*"] },

  // Code Only (No social posts)
  "feeds/code.xml": {
    "type": "atom",
    "sources": ["personal", "work"], // Matches 'name' in github/gitlab config
    "title": "John's Code Releases"
  }
}
```

---

## 🔑 Secrets & Environment Variables

Create a `.env` file in the root directory for local development. In Github Actions, add these to **Settings > Secrets and variables > Actions**.

*   `GH_TOKEN`: (Required) Github Personal Access Token.
*   `RAINDROP_TOKEN`: (Optional) For Raindrop.
*   `GITLAB_TOKEN`, `GITEA_TOKEN`, `BITBUCKET_APP_PASS`: (Optional) For private repos.

## 📝 Writing Content

*   **Blog Post:** Github Discussion -> Category "General".
*   **Note:** Github Discussion -> Category "Notes".
*   **Now Page:** Github Discussion -> Category "Now".
*   **Draft:** Github Discussion -> Category "Drafts".

## License

You are free to use, modify, and distribute this software under the terms of the Artistic License 2.0
