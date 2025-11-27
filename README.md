# Monolog

**Your digital life, unified.**

Monolog is a personal website engine for developers who want to own their content without managing a CMS. It operates on a simple philosophy: **You shouldn't have to leave your workflow to update your website.**

If you push code to GitHub, post thoughts on Bluesky, bookmark articles on Raindrop, or upload videos to YouTube, Monolog fetches that activity and weaves it into a single, beautiful, chronological timeline.

It is "Headless" in the truest sense: You don't write content *for* Monolog. You live your digital life, and Monolog records it.

### The Aesthetic
*   **Paper & Ink:** A high-contrast, single-column design focused entirely on typography and readability.
*   **Zero Client-Side Logic:** The filtering and theming happen via CSS. The site loads instantly.
*   **No Maintenance:** It can run entirely on GitHub Actions. No servers to patch, no databases to back up.

---

## 🚀 Getting Started

You can have this site running in about 5 minutes.

1.  **Fork this Repository**
    Click the "Fork" button in the top right to copy this project to your GitHub account.

2.  **Clone & Install**
    Pull it down to your machine to set up the config.
    ```bash
    git clone https://github.com/YOUR_USERNAME/monolog.git
    cd monolog
    npm install
    ```

3.  **Tell it who you are**
    Rename `config.example.json` to `config.json` and open it. Change the `profile` block to match your identity.

4.  **Build locally**
    Create a `.env` file with a `GH_TOKEN` (see [Secrets](#-secrets--keys) below) and run:
    ```bash
    node build.js
    ```
    Open `index.html` in your browser to see your timeline.

## ⚙️ Configuration (`config.json`)

The `config.json` file is the brain of your site. Here is every option available.

### 1. Profile
This section controls the header, footer, and SEO metadata.

| Property | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | **Required.** Displayed in the header and `<title>`. |
| `tagline` | `string` | Displayed below the name and in the meta description. |
| `url` | `string` | **Required.** The production URL (used for canonical links and RSS). |
| `email` | `string` | Displayed in the footer. |
| `og_image` | `string` | Absolute URL to an image used for Twitter/OpenGraph share cards. |
| `copyright_start`| `string` | Year to start the copyright range (e.g., "2023"). |
| `socials` | `array` | List of objects `{ "name": "...", "url": "..." }` displayed in the footer. |

### 2. Analytics

Monolog supports privacy-friendly analytics out of the box.

| Provider | Property | Type | Description |
| :--- | :--- | :--- | :--- |
| **Plausible** | `enabled` | `bool` | Set to `true` to inject the script. |
| | `domain` | `string` | Your Plausible domain (e.g., `mysite.com`). |
| | `src` | `string` | The script source (usually `https://plausible.io/js/script.js`). |
| **Cloudflare** | `enabled` | `bool` | Set to `true` to inject the beacon. |
| | `token` | `string` | Your Cloudflare Web Analytics beacon token. |

```yaml
{
  "analytics": {
    "plausible": {
      "enabled": true,
      "domain": "johnroberts.com",
      "src": "https://plausible.io/js/script.js"
    },
    "cloudflare": {
      "enabled": false,
      "token": "YOUR_BEACON_TOKEN"
    }
  }
}
```

---

## ✍️ How to Write Content

Monolog uses **GitHub Discussions** as its primary authoring tool. To set this up, enable "Discussions" in your GitHub repository settings.

| Content Type | GitHub Category | Behavior |
| :--- | :--- | :--- |
| **Articles** | `General` | Long-form writing. Displayed with a title and a summary. Labels become filter tags (e.g., "CSS", "Rust"). |
| **Notes** | `Notes` | Micro-blogging. No title required; the full text is shown inline. Perfect for status updates or quick thoughts. |
| **The "Now" Page** | `Announcements` | *Special:* Monolog looks for the most recent post in the `Announcements` category of your `username.github.io` repo. It pins this content to the very top of your site. |
| **Drafts** | `Drafts` | Anything in here is ignored by the build engine. |

*Note: You can also pull "Notes" from Bluesky or Mastodon automatically.*

---

## 🔌 Connecting Services

Monolog is an aggregator. You define "Sources" in your `config.json`, and the engine does the rest.

### GitHub

This is the core of Monolog. We can track multiple repositories (e.g., your personal blog repo vs. your work organization). It can pull content from discussions, issues, and tagged releases.

| Property | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | **Required.** Internal ID used for generating specific RSS feeds later. |
| `owner` | `string` | **Required.** The GitHub username or Organization name. |
| `repos` | `array` | **Required.** List of repository names to fetch from. |
| `discussions` | `bool` | Default `true`. Fetch blog posts/notes. |
| `releases` | `bool` | Default `true`. Fetch releases/tags. |
| `issues` | `bool` | Default `false`. Fetch issue activity. |

**Global GitHub Options:**
| Property | Description |
| :--- | :--- |
| `groups` | Map specific repositories to a "Topic" tag in the filter bar. Key is the Tag name, Value is array of `owner/repo`. |
| `tag_overrides` | Dictionary to fix tag capitalization (e.g., `{"css": "CSS"}`). Default is lowercase slug. |

```json
"github": {
  "sources": [
    {
      "name": "personal",       // Used for internal ID
      "owner": "johnroberts",   // Your username
      "repos": ["my-blog"],     // The repo where you write Discussions
      "discussions": true,      // Enable fetching Articles/Notes
      "releases": true,         // Enable fetching Release history
      "issues": false           // Ignore issues
    }
  ],
  // Optional: Map specific repos to a clean "Topic" tag in the UI
  "groups": {
    "Infrastructure": ["dotfiles", "server-config"]
  },
  // Optional: Fix tag capitalization (e.g. "css" -> "CSS")
  "tag_overrides": { "css": "CSS", "api": "API" }
}
```
### Bluesky

Fetches posts as "Notes". Includes images and engagement metrics. All social media posts appear as 'Notes' in your timeline.

| Property | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Internal ID. |
| `handle` | `string` | Your Bluesky handle (e.g., `user.bsky.social`). |
| `feed` | `string` | *(Optional)* A custom feed URI (e.g., `at://did:plc:...`). If omitted, fetches the user's author feed. |

Example:

```json
"bluesky": {
  "sources": [
    { "name": "main", "handle": "john.bsky.social" }
  ]
}
```

### Mastodon / Lemmy

Posts from these fediverse services appear as "Notes" in your timeline.

| Service | Property | Description |
| :--- | :--- | :--- |
| **Mastodon** | `instance` | The domain of the instance (e.g., `mastodon.social`). |
| | `id` | The **Numeric User ID**. (Check your profile source code to find this). |
| **Lemmy** | `instance` | The domain (e.g., `lemmy.world`). |
| | `username` | Your username on that instance. |

Example:

```json
"mastodon": {
  "sources": [
    {
      "name": "social",
      "instance": "mastodon.social",
      "id": "109329..." // Your numeric User ID
    }
  ]
}
```

### 3. Media & Reading (YouTube, Raindrop, RSS)

Share what you are watching and reading automatically.

| Service | Property | Description |
| :--- | :--- | :--- |
| **YouTube** | `channel_id` | The ID starting with `UC...`. Found in your channel URL. |
| **Raindrop** | `collection_id` | The numeric ID of the collection. `0` is "All Bookmarks". |
| **RSS** | `url` | Full URL to an external XML/RSS feed to ingest. |

Examples:

```json
"youtube": {
  "sources": [
    { "name": "vlog", "channel_id": "UC_..." } // Found in your channel URL
  ]
},
"raindrop": {
  "collection_id": "0" // "0" means "All Bookmarks"
},
"rss": {
  "sources": [
    { "name": "hacker-news", "url": "https://news.ycombinator.com/rss" }
  ]
}
```

### 4. Code Forges (GitLab, Gitea, Bitbucket)
If you host code elsewhere, Monolog can fetch your Release history and Tags from there, too.

| Service | Property | Description |
| :--- | :--- | :--- |
| **GitLab** | `instance` | Default `gitlab.com`. |
| | `id` | The numeric Project ID. |
| **Gitea** | `instance` | The domain of your Gitea server. |
| | `owner` | The username of the repo owner. |
| | `repo` | The repository name. |
| **Bitbucket** | `workspace` | The workspace ID/slug. |
| | `repo_slug` | The repository name. |

Examples:

```json
"gitlab": { "sources": [{ "name": "work", "id": "12345" }] },
"gitea": { "instance": "git.example.com", "sources": [{ "owner": "user", "repo": "lab" }] }
```

---

## 📡 Custom Feeds

You probably don't want your "What I'm Reading" links cluttering your "Code Release" RSS feed. Monolog lets you generate specific feeds for specific audiences.

| Property | Type | Description |
| :--- | :--- | :--- |
| `type` | `string` | `"rss"` or `"atom"`. |
| `sources` | `array` | A list of **Source Names** (defined in your service configs above). Use `["*"]` to include everything. |
| `title` | `string` | (Optional) The title of the XML feed. Defaults to profile name. |
| `groups` | `array` | (Optional) Filter items further by requiring them to belong to a specific Group defined in `github.groups`. |


In `config.json`, the `feeds` block maps output files to the `name` of the sources you defined above.

```json
"feeds": {
  // The Firehose: Everything goes here
  "feed.xml": { "type": "rss", "sources": ["*"] },

  // A specific feed for just code releases and devlog
  "feeds/code.xml": {
    "type": "atom",
    "sources": ["personal", "work-code"],
    "title": "John's Engineering Log"
  },

  // A stream of just your social media posts
  "feeds/stream.xml": {
    "type": "rss",
    "sources": ["social-bluesky", "youtube-vlog"],
    "title": "John's Social Stream"
  }
}
```

---

## 🔑 Secrets & Keys

To keep your config file safe to commit, sensitive keys are stored in environment variables.

1.  **Locally:** Create a `.env` file.
2.  **GitHub Actions:** Go to **Settings > Secrets and variables > Actions** and add them there.

| Key | Required? | Description |
| :--- | :--- | :--- |
| `GH_TOKEN` | **Yes** | A GitHub Personal Access Token (Classic). Needs `repo` and `read:discussion` scopes. Used for GraphQL queries. |
| `RAINDROP_TOKEN` | No | Required if using Raindrop. Get a "Test Token" from your Raindrop settings. |
| `GITLAB_TOKEN` | No | Personal Access Token (read_api) for private GitLab repos. |
| `GITEA_TOKEN` | No | Access Token for Gitea. |
| `BITBUCKET_APP_PASS` | No | App Password for Bitbucket (use username in config). |

---

## 🎨 Theming

The visual theme is completely decoupled from the build logic. It lives inside `index.liquid`.

Monolog's default template uses **OKLCH** colors for perceptual uniformity. To change the theme, simply edit the CSS variables in the `<style>` block of `index.liquid`.

**Dark Mode?**
It is handled automatically by the browser (`prefers-color-scheme`). If you want to tweak the dark mode colors, look for the `@media (prefers-color-scheme: dark)` block in the template.

---

## 🤖 Automatic Deployment

You don't need to manually build the site, use a GitHub Action!

To enable Github Pages, go to `Settings > Pages`, and set the Source to **GitHub Actions** then add/edit the workflow:

```yaml
name: Deploy Monolog

on:
  schedule:
    - cron: '0 */4 * * *' # Updates every 4 hours
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: node build.js
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          # Add other tokens here if needed
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## License

You are free to use, modify, and distribute this software under the terms of the Artistic License 2.0.
