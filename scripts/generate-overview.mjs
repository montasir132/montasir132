import fs from "node:fs";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME || "montasir132";
const email = process.env.GITHUB_EMAIL || "montasiralam132@gmail.com";

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": "montasir132-github-overview"
};

async function rest(path) {
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

async function gql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });
  const d = await r.json();
  if (!r.ok || d.errors) throw new Error(JSON.stringify(d.errors || d));
  return d.data;
}

const esc = (v="") => String(v)
  .replaceAll("&","&amp;").replaceAll("<","&lt;")
  .replaceAll(">","&gt;").replaceAll('"',"&quot;");

const num = n => new Intl.NumberFormat("en-US").format(n);

function yearsSince(s) {
  const a = new Date(s), b = new Date();
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  const ann = new Date(Date.UTC(b.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  if (ann > b) y--;
  return Math.max(0, y);
}

const user = await rest(`/users/${username}`);

let repos = [];
for (let page=1; page<=5; page++) {
  const batch = await rest(`/users/${username}/repos?per_page=100&page=${page}&type=owner`);
  repos.push(...batch);
  if (batch.length < 100) break;
}

const stars = repos.reduce((s,r)=>s+(r.stargazers_count||0),0);

const query = `
query($login:String!) {
  user(login:$login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date } }
      }
    }
  }
}`;

const data = await gql(query, {login:username});
const cal = data.user.contributionsCollection.contributionCalendar;
const weekly = cal.weeks.map(w => w.contributionDays.reduce((s,d)=>s+d.contributionCount,0)).slice(-53);
const max = Math.max(...weekly,1);

const langs = {};
for (const repo of repos.slice(0,40)) {
  if (repo.fork) continue;
  try {
    const x = await rest(`/repos/${username}/${encodeURIComponent(repo.name)}/languages`);
    for (const [k,v] of Object.entries(x)) langs[k]=(langs[k]||0)+v;
  } catch {}
}

const top = Object.entries(langs).sort((a,b)=>b[1]-a[1]).slice(0,4);
const colors = ["#58a6ff","#a371f7","#3fb950","#f2cc60"];

function donut(items,cx,cy) {
  const total=items.reduce((s,[,v])=>s+v,0);
  if(!items.length) return `<circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="#30363d" stroke-width="18"/>`;
  const C=2*Math.PI*62;
  let off=0;
  return items.map(([name,value],i)=>{
    const len=value/total*C;
    const out=`<circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="${colors[i]}" stroke-width="18" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off+=len;
    return out;
  }).join("");
}

function langCard(x,title) {
  const cx=x+150, cy=520, total=top.reduce((s,[,v])=>s+v,0);
  let legend="";
  top.forEach(([name,v],i)=>{
    const y=460+i*28, pct=Math.round(v/total*100);
    legend += `<rect x="${x+25}" y="${y-10}" width="10" height="10" fill="${colors[i]}"/>
    <text x="${x+44}" y="${y}" class="legend">${esc(name)}</text>
    <text x="${x+275}" y="${y}" class="percent">${pct}%</text>`;
  });
  return `<rect x="${x}" y="405" width="300" height="230" rx="10" class="card"/>
  <text x="${x+20}" y="438" class="cardTitle">${title}</text>
  ${donut(top,cx,cy)}
  <circle cx="${cx}" cy="${cy}" r="42" fill="#161b22"/>${legend}`;
}

const gx=355, gy=95, gw=550, gh=145;
const pts=weekly.map((v,i)=>[gx+i/Math.max(weekly.length-1,1)*gw,gy+gh-v/max*gh]);
const line=pts.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const area=`${gx},${gy+gh} ${line} ${gx+gw},${gy+gh}`;

const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="980" height="680" viewBox="0 0 980 680">
<style>
.bg{fill:#0d1117}.card{fill:#161b22;stroke:#30363d}
.title{fill:#79c0ff;font:600 24px Arial}.name{fill:#c084fc;font:700 25px Arial}
.info{fill:#7ee787;font:500 14px Arial}.muted{fill:#8b949e;font:500 12px Arial}
.cardTitle{fill:#79c0ff;font:600 18px Arial}.legend{fill:#c9d1d9;font:500 13px Arial}
.percent{fill:#8b949e;font:500 12px Arial;text-anchor:end}
</style>
<rect width="980" height="680" rx="14" class="bg"/>
<rect x="30" y="30" width="920" height="340" rx="12" class="card"/>
<text x="55" y="72" class="title">GitHub Overview</text>
<text x="55" y="116" class="name">${esc(user.name||username)}</text>
<text x="55" y="138" class="muted">@${esc(username)}</text>
<text x="55" y="178" class="info">Contributions: ${num(cal.totalContributions)}</text>
<text x="55" y="207" class="info">Public Repositories: ${num(user.public_repos)}</text>
<text x="55" y="236" class="info">Stars Received: ${num(stars)}</text>
<text x="55" y="265" class="info">Followers: ${num(user.followers)}</text>
<text x="55" y="294" class="info">Email: ${esc(email)}</text>
<text x="55" y="323" class="muted">Joined GitHub ${yearsSince(user.created_at)} years ago</text>
<text x="${gx}" y="72" class="muted">contributions in the last year</text>
<polygon points="${area}" fill="#a371f7" opacity=".45"/>
<polyline points="${line}" fill="none" stroke="#c084fc" stroke-width="3"/>
<line x1="${gx}" y1="${gy+gh}" x2="${gx+gw}" y2="${gy+gh}" stroke="#30363d"/>
${langCard(30,"Top Languages by Repo")}
${langCard(350,"Top Languages")}
<rect x="670" y="405" width="280" height="230" rx="10" class="card"/>
<text x="692" y="438" class="cardTitle">GitHub Snapshot</text>
<text x="692" y="478" class="legend">Repositories</text><text x="925" y="478" class="percent">${num(user.public_repos)}</text>
<text x="692" y="510" class="legend">Stars</text><text x="925" y="510" class="percent">${num(stars)}</text>
<text x="692" y="542" class="legend">Followers</text><text x="925" y="542" class="percent">${num(user.followers)}</text>
<text x="692" y="574" class="legend">Contributions</text><text x="925" y="574" class="percent">${num(cal.totalContributions)}</text>
<text x="692" y="606" class="legend">Focus</text><text x="925" y="606" class="percent">Full-Stack</text>
</svg>`;

fs.mkdirSync("generated",{recursive:true});
fs.writeFileSync("generated/overview.svg",svg);
