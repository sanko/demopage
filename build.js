const fs = require('fs');
const fetch = require('node-fetch'); // Use v2 for CommonJS or v3 with ESM
const MarkdownIt = require('markdown-it');
require('dotenv').config();

const md = new MarkdownIt({ html: true, linkify: true });
const config = require('./config.json');

async function fetchGitHubData() {
  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            title, url, createdAt, body,
            category { name },
            labels(first: 3) { nodes { name } },
            comments { totalCount },
            reactions { totalCount }
          }
        }
        releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            tagName, url, publishedAt, description,
            name
          }
        }
      }
    }
  `;

  const allData = [];

  for (const repo of config.github.repos) {
    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `bearer ${process.env.GH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { owner: config.github.username, name: repo }
        }),
      });

      const json = await response.json();
      if (json.errors) {
        console.error(`Error fetching ${repo}:`, json.errors);
        continue;
      }

      const { discussions, releases } = json.data.repository;

      // Process Discussions
      discussions.nodes.forEach(d => {
        if (d.category.name.toLowerCase() === 'draft') return; // Skip drafts

        const isNote = d.category.name.toLowerCase() === 'notes';
        allData.push({
          type: isNote ? 'note' : 'article',
          source: 'github',
          date: new Date(d.createdAt),
          title: d.title,
          url: d.url,
          body: d.body,
          tags: d.labels.nodes.map(l => l.name.toLowerCase()),
          metrics: {
            comments: d.comments.totalCount,
            reactions: d.reactions.totalCount
          }
        });
      });

      // Process Releases (Commits/Tags)
      releases.nodes.forEach(r => {
        allData.push({
          type: 'release',
          source: 'github',
          repoName: repo,
          date: new Date(r.publishedAt),
          version: r.tagName,
          url: r.url,
          body: r.description || r.name || "Maintenance release",
          tags: ['rel'] // Special tag for releases
        });
      });

    } catch (e) {
      console.error(`Failed to fetch repo ${repo}:`, e);
    }
  }
  return allData;
}

async function fetchBlueskyData() {
  const allPosts = [];

  for (const handle of config.bluesky.handles) {
    try {
      // Public endpoint, no auth required for public feeds
      const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&filter=posts_no_replies&limit=20`);
      const json = await response.json();

      if (!json.feed) continue;

      json.feed.forEach(item => {
        const post = item.post;
        const record = post.record;

        // Extract image if present
        let imageUrl = null;
        if (post.embed && post.embed.images && post.embed.images.length > 0) {
          imageUrl = post.embed.images[0].fullsize;
        }

        allPosts.push({
          type: 'note',
          source: 'bluesky',
          date: new Date(record.createdAt),
          body: record.text,
          url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
          image: imageUrl,
          tags: ['not'], // Special tag for notes
          metrics: {
            replies: post.replyCount || 0,
            reposts: post.repostCount || 0,
            likes: post.likeCount || 0
          }
        });
      });
    } catch (e) {
      console.error(`Failed to fetch Bluesky handle ${handle}:`, e);
    }
  }
  return allPosts;
}

function renderArticle(item) {
  const dateStr = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tagClasses = item.tags.map(t => `tag-${t}`).join(' ');
  const summary = md.render(item.body.split('\n')[0]); // First line as summary for articles

  return `
    <article class="entry ${tagClasses}">
        <div class="entry-row">
            <a href="${item.url}" class="entry-title">${item.title}</a>
            <span class="dots"></span>
            <div class="meta-group">
                ${item.metrics.comments > 0 ? `
                <span class="meta-stat" title="${item.metrics.comments} Comments">
                    <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    ${item.metrics.comments}
                </span>` : ''}
                ${item.metrics.reactions > 0 ? `
                <span class="meta-stat" title="${item.metrics.reactions} Reactions">
                    <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    ${item.metrics.reactions}
                </span>` : ''}
                <time class="entry-date">${dateStr}</time>
            </div>
        </div>
        <span class="entry-summary">${summary.replace(/<[^>]*>?/gm, '')}</span>
    </article>
  `;
}

function renderNote(item) {
  const dateStr = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const content = md.render(item.body);

  return `
    <article class="entry tag-not">
        <div class="note-text">${content}</div>
        ${item.image ? `<div class="note-media"><img src="${item.image}" loading="lazy" alt="Attachment"></div>` : ''}
        <div class="note-meta">
            <time>${dateStr}</time>
            <span>&middot;</span>
            ${item.metrics.replies > 0 ? `<span class="meta-stat" title="${item.metrics.replies} Replies"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round"></path></svg> ${item.metrics.replies}</span>` : ''}
            ${item.metrics.reposts > 0 ? `<span class="meta-stat" title="${item.metrics.reposts} Reposts"><svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" stroke-linecap="round" stroke-linejoin="round"></path></svg> ${item.metrics.reposts}</span>` : ''}
            ${item.metrics.likes > 0 ? `<span class="meta-stat" title="${item.metrics.likes} Likes"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round" stroke-linejoin="round"></path></svg> ${item.metrics.likes}</span>` : ''}
            <span>&middot;</span>
            <a href="${item.url}" class="note-link">${item.source === 'bluesky' ? 'Bluesky ↗' : 'Note ↗'}</a>
        </div>
    </article>
  `;
}

function renderRelease(item) {
  const dateStr = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `
    <article class="entry tag-rel">
        <div class="entry-row">
            <span>
                <a href="${item.url}" class="rel-repo">${config.github.username}/${item.repoName}</a>
                <span class="rel-version">${item.version}</span>
            </span>
            <span class="dots"></span>
            <time class="entry-date">${dateStr}</time>
        </div>
        <code class="rel-msg">${item.body.split('\n')[0]}</code>
    </article>
  `;
}

async function build() {
  console.log("Fetching data...");
  const [ghData, bskyData] = await Promise.all([fetchGitHubData(), fetchBlueskyData()]);

  // Merge and Sort
  const allContent = [...ghData, ...bskyData].sort((a, b) => b.date - a.date);

  console.log(`Found ${allContent.length} items. Generating HTML...`);

  // Group by Year
  const byYear = {};
  allContent.forEach(item => {
    const year = item.date.getFullYear();
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(item);
  });

  let htmlOutput = '';
  const sortedYears = Object.keys(byYear).sort((a, b) => b - a);

  sortedYears.forEach(year => {
    htmlOutput += `<section class="year-block"><h2 class="year-title">${year}</h2>`;
    byYear[year].forEach(item => {
      if (item.type === 'article') htmlOutput += renderArticle(item);
      else if (item.type === 'note') htmlOutput += renderNote(item);
      else if (item.type === 'release') htmlOutput += renderRelease(item);
    });
    htmlOutput += `</section>`;
  });

  // Inject into Template
  // Note: Ensure you have an 'index.template.html' file with <!-- INJECT_CONTENT --> in it
  const template = fs.readFileSync('index.template.html', 'utf8');
  const finalHTML = template.replace('<!-- INJECT_CONTENT -->', htmlOutput);

  fs.writeFileSync('index.html', finalHTML);
  console.log("Build complete.");
}

build();
