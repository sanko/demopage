const fs = require('fs');
// const fetch = require('node-fetch'); // Uncomment if using Node < 18
const MarkdownIt = require('markdown-it');
require('dotenv').config();

const md = new MarkdownIt({ html: true, linkify: true });
const config = require('./config.json');

const slugify = txt => txt.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Global map to store "slug" -> "Display Name"
const tagDisplayMap = { 'notes': 'Notes', 'commits': 'Commits', 'bluesky': 'Bluesky' };
if (config.github.tag_overrides) {
    for (const [slug, display] of Object.entries(config.github.tag_overrides)) {
        tagDisplayMap[slug] = display;
    }
}

// --- HELPER: EXTRACT USERNAME FROM PROFILE ---
function getPrimaryGitHubUser() {
    if (config.profile.github_username) return config.profile.github_username;
    if (config.profile.socials) {
        const ghLink = config.profile.socials.find(s => s.name.toLowerCase() === 'github');
        if (ghLink && ghLink.url) {
            const cleanUrl = ghLink.url.replace(/\/$/, '');
            return cleanUrl.split('/').pop();
        }
    }
    return null;
}

// --- DATA FETCHING ---
async function fetchGitHubData() {
  console.log(`--- STARTING GITHUB FETCH ---`);

  const primaryUser = getPrimaryGitHubUser();
  const features = config.features || {};

  // Construct Query
  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        ${features.github_discussions ? `
        discussions(first: 20, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            title, url, createdAt, body,
            author { login },
            category { name },
            labels(first: 5) { nodes { name } },
            comments { totalCount },
            reactions { totalCount }
          }
        }` : ''}
        ${features.github_issues ? `
        issues(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            title, url, createdAt, body,
            author { login },
            labels(first: 5) { nodes { name } },
            comments { totalCount },
            reactions { totalCount }
          }
        }` : ''}
        ${features.github_releases ? `
        releases(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes { tagName, url, publishedAt, description, name }
        }
        refs(refPrefix: "refs/tags/", first: 10, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
          nodes { name, target { ... on Commit { committedDate, message } ... on Tag { tagger { date }, message } } }
        }` : ''}
      }
    }
  `;

  const allData = [];

  for (const source of config.github.sources) {
    if (!source.owner) continue;

    for (const repo of source.repos) {
      try {
        const repoSlug = slugify(repo);
        if (!tagDisplayMap[repoSlug]) tagDisplayMap[repoSlug] = repo;

        const response = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            'Authorization': `bearer ${process.env.GH_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables: { owner: source.owner, name: repo } }),
        });

        const json = await response.json();
        if (json.errors || !json.data || !json.data.repository) continue;

        const repoData = json.data.repository;

        // Shared Helper for Groups
        const getGroupTags = (ownerName, repoName) => {
            const groups = [];
            const fullName = `${ownerName}/${repoName}`;
            for (const [gName, rList] of Object.entries(config.github.groups || {})) {
                for (const item of rList) {
                    if ((item.includes('/') && item === fullName) || (!item.includes('/') && item === repoName)) {
                        const gSlug = slugify(gName);
                        groups.push(gSlug);
                        if (!tagDisplayMap[gSlug]) tagDisplayMap[gSlug] = gName;
                    }
                }
            }
            return [...new Set(groups)];
        };

        // Helper for Processing Items (Issues/Discussions)
        const processItem = (item, isIssue = false) => {
            if (primaryUser && item.author.login !== primaryUser && item.author.login !== source.owner) return;

            // If discussion has category
            if (item.category && item.category.name.toLowerCase() === 'drafts') return;

            const isNote = item.category && item.category.name.toLowerCase() === 'notes';
            const tags = [repoSlug];

            item.labels.nodes.forEach(l => {
                const lSlug = slugify(l.name).substring(0, 3);
                tags.push(lSlug);
                if (!tagDisplayMap[lSlug] && !config.github.tag_overrides?.[lSlug]) {
                    tagDisplayMap[lSlug] = l.name.toUpperCase().substring(0, 3);
                }
            });

            tags.push(...getGroupTags(source.owner, repo));

            allData.push({
                type: isNote ? 'note' : 'article',
                source: 'github',
                owner: source.owner,
                repo: repo,
                date: new Date(item.createdAt),
                title: item.title,
                url: item.url,
                body: item.body,
                tags: [...new Set(tags)],
                metrics: { comments: item.comments.totalCount, reactions: item.reactions.totalCount }
            });
        };

        // 1. Process Discussions
        if (repoData.discussions) repoData.discussions.nodes.forEach(d => processItem(d));

        // 2. Process Issues
        if (repoData.issues) repoData.issues.nodes.forEach(i => processItem(i, true));

        // 3. Process Releases/Tags
        if (features.github_releases) {
            const processedVersions = new Set();
            if (repoData.releases) {
                repoData.releases.nodes.forEach(r => {
                    processedVersions.add(r.tagName);
                    const tags = ['commits', repoSlug, ...getGroupTags(source.owner, repo)];
                    allData.push({ type: 'release', source: 'github', owner: source.owner, repo: repo, date: new Date(r.publishedAt), version: r.tagName, url: r.url, body: r.description || r.name || "Maintenance release", tags: [...new Set(tags)] });
                });
            }
            if (repoData.refs) {
                repoData.refs.nodes.forEach(t => {
                    if (processedVersions.has(t.name)) return;
                    const target = t.target;
                    const date = target.committedDate ? target.committedDate : (target.tagger ? target.tagger.date : new Date().toISOString());
                    const msg = target.message ? target.message : "Version tag";
                    const tags = ['commits', repoSlug, ...getGroupTags(source.owner, repo)];
                    allData.push({ type: 'release', source: 'github', owner: source.owner, repo: repo, date: new Date(date), version: t.name, url: `https://github.com/${source.owner}/${repo}/tree/${t.name}`, body: msg, tags: [...new Set(tags)] });
                });
            }
        }

      } catch (e) { console.error(`❌ ERROR ${repo}:`, e.message); }
    }
  }
  return allData;
}

async function fetchBlueskyData() {
  console.log(`--- STARTING BLUESKY FETCH ---`);
  if (!config.features?.bluesky_notes) return [];

  const allPosts = [];
  if (!config.bluesky || !config.bluesky.handles) return [];

  for (const handle of config.bluesky.handles) {
    try {
      const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&filter=posts_no_replies&limit=20`);
      const json = await response.json();
      if (!json.feed) continue;

      json.feed.forEach(item => {
        const post = item.post;
        const record = post.record;
        let imageUrl = null;
        if (post.embed && post.embed.images && post.embed.images.length > 0) imageUrl = post.embed.images[0].fullsize;

        allPosts.push({
          type: 'note',
          source: 'bluesky',
          date: new Date(record.createdAt),
          body: record.text,
          url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
          image: imageUrl,
          tags: ['notes'],
          metrics: { replies: post.replyCount || 0, reposts: post.repostCount || 0, likes: post.likeCount || 0 }
        });
      });
    } catch (e) { console.error(`❌ BLUESKY ERROR ${handle}:`, e.message); }
  }
  return allPosts;
}

// --- GENERATORS ---

function generateDynamicStyles(uniqueTags) {
  let css = '';
  uniqueTags.forEach(tag => {
    const id = `f-${tag}`; const cls = `tag-${tag}`;
    css += `body:has(#${id}:checked) label[for="${id}"] { color: var(--c-text); font-weight: 800; }\n`;
    css += `body:has(#${id}:checked) label[for="${id}"]::before, body:has(#${id}:checked) label[for="${id}"]::after { opacity: 1; }\n`;
    css += `body:has(#${id}:checked) .entry.${cls} { opacity: 1; filter: none; }\n`;
  });
  return css;
}

function generateFilterHTML(uniqueTags) {
  const types = ['notes', 'commits'];
  const knownRepos = config.github.sources.flatMap(s => s.repos.map(r => slugify(r)));
  const knownGroups = config.github.groups ? Object.keys(config.github.groups).map(g => slugify(g)) : [];
  const typeTags = [], repoTags = [], groupTags = [], topicTags = [];
  uniqueTags.forEach(tag => {
    if (types.includes(tag)) typeTags.push(tag);
    else if (knownRepos.includes(tag)) repoTags.push(tag);
    else if (knownGroups.includes(tag)) groupTags.push(tag);
    else topicTags.push(tag);
  });
  const renderLabel = (tag, colorVar) => {
    const style = colorVar ? `style="color: var(${colorVar})"` : '';
    const displayName = tagDisplayMap[tag] || tag;
    return `<label for="f-${tag}" class="filter-tag" ${style}>${displayName}</label>`;
  };
  let html = '';
  if (typeTags.length > 0) { typeTags.forEach(t => html += renderLabel(t, '--c-accent')); html += `<span class="filter-separator">|</span>`; }
  if (groupTags.length > 0) { groupTags.sort().forEach(t => html += renderLabel(t)); html += `<span class="filter-separator">|</span>`; }
  if (repoTags.length > 0) { repoTags.sort().forEach(t => html += renderLabel(t)); if (topicTags.length > 0) html += `<span class="filter-separator">|</span>`; }
  topicTags.sort().forEach(t => html += renderLabel(t));
  return html;
}

function renderContent(item) {
  const dateStr = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tagClasses = item.tags.map(t => `tag-${t}`).join(' ');

  // NOTE (Bluesky or GH Note)
  if (item.type === 'note') {
    const content = md.render(item.body);
    const sourceLabel = item.source === 'bluesky' ? 'Bluesky' : (item.repo ? item.repo : 'Note');
    return `
      <article class="entry ${tagClasses}">
          <div class="note-text">${content}</div>
          ${item.image ? `<div class="note-media"><img src="${item.image}" loading="lazy" alt="Attachment"></div>` : ''}
          <div class="note-meta">
              <time>${dateStr}</time>
              <span>&middot;</span>
              ${item.metrics.replies > 0 ? `<a href="${item.url}" class="meta-stat" title="${item.metrics.replies} Replies"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round"></path></svg> ${item.metrics.replies}</a>` : ''}
              ${item.metrics.reposts > 0 ? `<a href="${item.url}" class="meta-stat" title="${item.metrics.reposts} Reposts"><svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" stroke-linecap="round" stroke-linejoin="round"></path></svg> ${item.metrics.reposts}</a>` : ''}
              ${item.metrics.likes > 0 ? `<a href="${item.url}" class="meta-stat" title="${item.metrics.likes} Likes"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round" stroke-linejoin="round"></path></svg> ${item.metrics.likes}</a>` : ''}
              <span>&middot;</span>
              <a href="${item.url}" class="note-link">${sourceLabel} ↗</a>
          </div>
      </article>`;
  }

  // RELEASE
  if (item.type === 'release') {
    return `
      <article class="entry ${tagClasses}">
          <div class="entry-row">
              <span>
                  <a href="${item.url}" class="rel-repo">${item.owner}/${item.repo}</a>
                  <span class="rel-version">${item.version}</span>
              </span>
              <span class="dots"></span>
              <time class="entry-date">${dateStr}</time>
          </div>
          <code class="rel-msg">${item.body.split('\n')[0]}</code>
      </article>`;
  }

  // ARTICLE (Discussion or Issue)
  const rawBody = item.body.split('\n').filter(line => line.length > 0 && !line.startsWith('#'))[0] || "";
  const summary = md.render(rawBody).replace(/<[^>]*>?/gm, '');

  return `
    <article class="entry ${tagClasses}">
        <div class="entry-row">
            <a href="${item.url}" class="entry-title">${item.title}</a>
            <span class="dots"></span>
            <div class="meta-group">
                ${item.metrics.comments > 0 ? `<a href="${item.url}#comments" class="meta-stat" title="${item.metrics.comments} Comments"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round"></path></svg>${item.metrics.comments}</a>` : ''}
                ${item.metrics.reactions > 0 ? `<a href="${item.url}" class="meta-stat" title="${item.metrics.reactions} Reactions"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round" stroke-linejoin="round"></path></svg>${item.metrics.reactions}</a>` : ''}
                <time class="entry-date">${dateStr}</time>
            </div>
        </div>
        <span class="entry-summary">${summary}</span>
    </article>`;
}

// --- RSS ---
function generateRSS(items) {
    const p = config.profile;
    const now = new Date().toUTCString();
    let xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${p.name}</title>
  <link>${p.url}</link>
  <description>${p.tagline}</description>
  <lastBuildDate>${now}</lastBuildDate>
  <language>en-us</language>`;

    items.slice(0, 20).forEach(item => {
        const title = item.title ? item.title : (item.type === 'release' ? `Release ${item.version}` : 'Note');
        const desc = item.body.replace(/<[^>]*>?/gm, '').substring(0, 300) + '...';
        xml += `
  <item>
    <title>${title}</title>
    <link>${item.url}</link>
    <description><![CDATA[${desc}]]></description>
    <pubDate>${item.date.toUTCString()}</pubDate>
    <guid>${item.url}</guid>
  </item>`;
    });
    xml += `\n</channel>\n</rss>`;
    return xml;
}

async function build() {
  console.log("Fetching data...");
  const [ghData, bskyData] = await Promise.all([fetchGitHubData(), fetchBlueskyData()]);
  const allContent = [...ghData, ...bskyData].sort((a, b) => b.date - a.date);
  console.log(`\nTotal Items Found: ${allContent.length}`);

  const uniqueTags = new Set();
  allContent.forEach(item => item.tags.forEach(t => uniqueTags.add(t)));
  const sortedTags = Array.from(uniqueTags);

  const dynamicCSS = generateDynamicStyles(sortedTags);
  const filterHTML = generateFilterHTML(sortedTags);
  const inputsHTML = sortedTags.map(t => `<input type="checkbox" class="filter-check" id="f-${t}">`).join('');

  const byYear = {};
  allContent.forEach(item => {
    const year = item.date.getFullYear();
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(item);
  });

  let contentHTML = '';
  Object.keys(byYear).sort((a, b) => b - a).forEach(year => {
    contentHTML += `<section class="year-block"><h2 class="year-title">${year}</h2>`;
    byYear[year].forEach(item => contentHTML += renderContent(item));
    contentHTML += `</section>`;
  });

  // Socials
  let socialsHTML = '';
  if (config.profile && config.profile.socials && Array.isArray(config.profile.socials)) {
      socialsHTML = config.profile.socials.map(s => `<a href="${s.url}">${s.name}</a>`).join('\n');
  }
  const yearRange = `${config.profile.copyright_start}–${new Date().getFullYear()}`;

  const template = fs.readFileSync('index.template.html', 'utf8');
  let finalHTML = template
    .replace(/<!-- CONFIG_NAME -->/g, config.profile.name)
    .replace(/<!-- CONFIG_TAGLINE -->/g, config.profile.tagline)
    .replace(/<!-- CONFIG_YEAR_RANGE -->/g, yearRange)
    .replace('<!-- INJECT_SOCIALS -->', socialsHTML)
    .replace('<!-- INJECT_CSS -->', dynamicCSS)
    .replace('<!-- INJECT_FILTERS -->', inputsHTML)
    .replace('<!-- INJECT_FILTER_LIST -->', filterHTML)
    .replace('<!-- INJECT_CONTENT -->', contentHTML);

  fs.writeFileSync('index.html', finalHTML);

  const rssXML = generateRSS(allContent);
  fs.writeFileSync('feed.xml', rssXML);

  console.log("Build complete.");
}

build();
