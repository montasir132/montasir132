import fs from "node:fs";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME || "montasir132";
const email = process.env.GITHUB_EMAIL || "montasiralam132@gmail.com";

if (!token) throw new Error("GITHUB_TOKEN is required");

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": "montasir132-github-overview"
};

async function githubRest(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub REST ${res.status}: ${body}`);
  }
  return res.json();
}

async function githubGraphQL(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(JSON.stringify(data.errors || data));
  }
  return data.data;
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shortName(name, max = 26) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function yearsSince(dateString) {
  const start = new Date(dateString);
  const now = new Date();
  let years = now.getUTCFullYear() - start.getUTCFullYear();
  const anniversary = new Date(Date.UTC(
    now.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  ));
  if (anniversary > now) years--;
  return Math.max(0, years);
}

function niceDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

const user = await githubRest(`/users/${username}`);

let repos = [];
let page = 1;

while (page <= 5) {
  const batch = await githubRest(
    `/users/${username}/repos?per_page=100&page=${page}&type=owner&sort=updated`
  );
  repos.push(...batch);
  if (batch.length < 100) break;
  page++;
}

const publicRepos = user.public_repos;
const followers = user.followers;
const stars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);

const contributionQuery = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
          }
        }
      }
    }
  }
}`;

const contributionData = await githubGraphQL(contributionQuery, { login: username });
const calendar = contributionData.user.contributionsCollection.contributionCalendar;

const weekly = calendar.weeks.map(week =>
  week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0)
);

const recentWeekly = weekly.slice(-53);
const maxWeekly = Math.max(...recentWeekly, 1);

const languageCounts = {};
const repoCommitCounts = {};

for (const repo of repos.slice(0, 40)) {
  if (repo.fork) continue;

  try {
    const langData = await githubRest(
      `/repos/${username}/${encodeURIComponent(repo.name)}/languages`
    );

    for (const [language, bytes] of Object.entries(langData)) {
      languageCounts[language] = (languageCounts[language] || 0) + bytes;
    }
  } catch {}

  try {
    let commits = await githubRest(
      `/repos/${username}/${encodeURIComponent(repo.name)}/commits?author=${username}&per_page=1`
    );
    repoCommitCounts[repo.language || "Other"] =
      (repoCommitCounts[repo.language || "Other"] || 0) + Math.min(commits.length, 1);
  } catch {}
}

const topRepoLanguages = Object.entries(languageCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4);

const topCommitLanguages = Object.entries(repoCommitCounts)
  .filter(([name]) => name !== "Other")
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4);

const palette = ["#58a6ff", "#a371f7", "#3fb950", "#f2cc60", "#f85149", "#79c0ff"];

function donutSegments(items, total, cx, cy, r) {
  if (!items.length || total <= 0) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#30363d" stroke-width="18"/>`;
  }

  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return items.map(([name, value], i) => {
    const fraction = value / total;
    const length = fraction * circumference;
    const segment = `
      <circle
        cx="${cx}" cy="${cy}" r="${r}"
        fill="none"
        stroke="${palette[i % palette.length]}"
        stroke-width="18"
        stroke-linecap="butt"
        stroke-dasharray="${length} ${circumference - length}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})"
      />
    `;
    offset += length;
    return segment;
  }).join("");
}

function donutCard(x, title, items) {
  const total = items.reduce((s, [, v]) => s + v, 0);
  const cx = x + 145;
  const cy = 520;
  const r = 62;

  let legend = "";
  items.forEach(([name, value], i) => {
    const y = 465 + i * 25;
    const pct = total ? Math.round((value / total) * 100) : 0;
    legend += `
      <rect x="${x + 28}" y="${y - 10}" width="10" height="10"
            rx="1" fill="${palette[i % palette.length]}"/>
      <text x="${x + 45}" y="${y}" class="legend">${esc(name)}</text>
      <text x="${x + 285}" y="${y}" class="percent">${pct}%</text>
    `;
  });

  if (!items.length) {
    legend = `<text x="${x + 28}" y="470" class="legend">No language data yet</text>`;
  }

  return `
    <g>
      <rect x="${x}" y="405" width="300" height="230" rx="10" class="card"/>
      <text x="${x + 22}" y="438" class="cardTitle">${esc(title)}</text>
      ${donutSegments(items, total, cx, cy, r)}
      <circle cx="${cx}" cy="${cy}" r="42" fill="#161b22"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="centerText">${items.length}</text>
      ${legend}
    </g>
  `;
}

const graphX = 355;
const graphY = 90;
const graphW = 570;
const graphH = 145;

let graph = `<line x1="${graphX}" y1="${graphY + graphH}" x2="${graphX + graphW}" y2="${graphY + graphH}" class="axis"/>`;

const points = recentWeekly.map((value, i) => {
  const x = graphX + (i / Math.max(recentWeekly.length - 1, 1)) * graphW;
  const y = graphY + graphH - (value / maxWeekly) * graphH;
  return [x, y];
});

const linePoints = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const areaPoints = `${graphX},${graphY + graphH} ${linePoints} ${graphX + graphW},${graphY + graphH}`;

graph += `<polygon points="${areaPoints}" fill="#a371f7" opacity="0.45"/>`;
graph += `<polyline points="${linePoints}" fill="none" stroke="#c084fc" stroke-width="3"/>`;

[0, 25, 50, 75, 100].forEach((label) => {
  const y = graphY + graphH - (label / 100) * graphH;
  graph += `<text x="${graphX + graphW + 12}" y="${y + 4}" class="axisText">${label}</text>`;
});

const totalContributions = calendar.totalContributions;
const memberYears = yearsSince(user.created_at);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="980" height="680" viewBox="0 0 980 680" role="img" aria-label="GitHub overview for ${esc(username)}">
  <defs>
    <style>
      .bg { fill:#0d1117; }
      .card { fill:#161b22; stroke:#30363d; stroke-width:1; }
      .title { fill:#79c0ff; font:600 24px Arial,sans-serif; }
      .name { fill:#c084fc; font:700 25px Arial,sans-serif; }
      .info { fill:#7ee787; font:500 14px Arial,sans-serif; }
      .muted { fill:#8b949e; font:500 12px Arial,sans-serif; }
      .cardTitle { fill:#79c0ff; font:600 18px Arial,sans-serif; }
      .legend { fill:#c9d1d9; font:500 13px Arial,sans-serif; }
      .percent { fill:#8b949e; font:500 12px Arial,sans-serif; text-anchor:end; }
      .centerText { fill:#c9d1d9; font:700 20px Arial,sans-serif; }
      .axis { stroke:#30363d; stroke-width:1; }
      .axisText { fill:#8b949e; font:500 11px Arial,sans-serif; }
    </style>
  </defs>

  <rect width="980" height="680" rx="14" class="bg"/>

  <rect x="30" y="30" width="920" height="340" rx="12" class="card"/>

  <text x="55" y="72" class="title">📌 GitHub Overview</text>
  <text x="55" y="116" class="name">${esc(shortName(user.name || username))}</text>
  <text x="55" y="138" class="muted">@${esc(username)}</text>

  <text x="55" y="178" class="info">◉ ${formatNumber(totalContributions)} Contributions on GitHub</text>
  <text x="55" y="207" class="info">▣ ${formatNumber(publicRepos)} Public Repositories</text>
  <text x="55" y="236" class="info">★ ${formatNumber(stars)} Stars Received</text>
  <text x="55" y="265" class="info">● ${formatNumber(followers)} Followers</text>
  <text x="55" y="294" class="info">✉ ${esc(email)}</text>
  <text x="55" y="323" class="muted">◷ Joined GitHub ${memberYears} year${memberYears === 1 ? "" : "s"} ago · ${esc(niceDate(user.created_at))}</text>

  <text x="${graphX}" y="72" class="muted">contributions in the last year</text>
  ${graph}

  ${donutCard(30, "Top Languages by Repo", topRepoLanguages)}
  ${donutCard(350, "Top Languages by Commit", topCommitLanguages)}

  <rect x="670" y="405" width="280" height="230" rx="10" class="card"/>
  <text x="692" y="438" class="cardTitle">GitHub Snapshot</text>
  <text x="692" y="478" class="legend">Repositories</text>
  <text x="925" y="478" class="percent">${formatNumber(publicRepos)}</text>
  <text x="692" y="510" class="legend">Stars</text>
  <text x="925" y="510" class="percent">${formatNumber(stars)}</text>
  <text x="692" y="542" class="legend">Followers</text>
  <text x="925" y="542" class="percent">${formatNumber(followers)}</text>
  <text x="692" y="574" class="legend">Contributions</text>
  <text x="925" y="574" class="percent">${formatNumber(totalContributions)}</text>
  <text x="692" y="606" class="legend">Focus</text>
  <text x="925" y="606" class="percent">Full-Stack</text>
</svg>`;

fs.mkdirSync("generated", { recursive: true });
fs.writeFileSync("generated/overview.svg", svg, "utf8");
console.log("Generated generated/overview.svg");
