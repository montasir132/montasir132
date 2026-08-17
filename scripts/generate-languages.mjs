import fs from "node:fs";

const username =
  process.env.GITHUB_USERNAME || "montasir132";

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${username}-language-stats`
};


// ============================================================
// GitHub REST API
// ============================================================

async function githubRest(path) {
  const res = await fetch(
    `https://api.github.com${path}`,
    { headers }
  );

  if (!res.ok) {
    const body = await res.text();

    throw new Error(
      `GitHub API ${res.status}: ${body}`
    );
  }

  return res.json();
}


// ============================================================
// Helpers
// ============================================================

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}


// ============================================================
// Get Public Repositories
// ============================================================

let repos = [];
let page = 1;

while (true) {

  const batch = await githubRest(
    `/users/${username}/repos?per_page=100&page=${page}&type=owner&sort=updated`
  );

  repos.push(...batch);

  if (batch.length < 100) {
    break;
  }

  page++;
}


console.log(
  `Found ${repos.length} public repositories`
);


// ============================================================
// Language Statistics
// ============================================================

const languageBytes = {};

let processedRepos = 0;


for (const repo of repos) {

  // Ignore forks
  if (repo.fork) {
    continue;
  }

  try {

    const languages =
      await githubRest(
        `/repos/${username}/${encodeURIComponent(repo.name)}/languages`
      );

    for (
      const [language, bytes]
      of Object.entries(languages)
    ) {

      languageBytes[language] =
        (languageBytes[language] || 0) +
        bytes;
    }

    processedRepos++;

  } catch (error) {

    console.log(
      `Skipping ${repo.name}: ${error.message}`
    );
  }
}


// ============================================================
// Sort Languages
// ============================================================

const languages =
  Object.entries(languageBytes)
    .sort(
      (a, b) => b[1] - a[1]
    )
    .slice(0, 8);


const totalBytes =
  languages.reduce(
    (sum, [, bytes]) =>
      sum + bytes,
    0
  );


// ============================================================
// Colors
// ============================================================

const colors = [
  "#58A6FF",
  "#F2CC60",
  "#A371F7",
  "#3FB950",
  "#F85149",
  "#79C0FF",
  "#FF7B72",
  "#D2A8FF"
];


// ============================================================
// Donut Settings
// ============================================================

const width = 900;
const height = 420;

const centerX = 450;
const centerY = 190;

const outerRadius = 120;
const innerRadius = 78;


// ============================================================
// Polar Coordinates
// ============================================================

function polarToCartesian(
  cx,
  cy,
  radius,
  angle
) {

  const radians =
    (angle - 90) *
    Math.PI /
    180;

  return {
    x:
      cx +
      radius *
      Math.cos(radians),

    y:
      cy +
      radius *
      Math.sin(radians)
  };
}


// ============================================================
// Donut Path
// ============================================================

function donutPath(
  startAngle,
  endAngle
) {

  const outerStart =
    polarToCartesian(
      centerX,
      centerY,
      outerRadius,
      endAngle
    );

  const outerEnd =
    polarToCartesian(
      centerX,
      centerY,
      outerRadius,
      startAngle
    );

  const innerStart =
    polarToCartesian(
      centerX,
      centerY,
      innerRadius,
      endAngle
    );

  const innerEnd =
    polarToCartesian(
      centerX,
      centerY,
      innerRadius,
      startAngle
    );

  const largeArc =
    endAngle - startAngle > 180
      ? 1
      : 0;

  return `
    M ${outerEnd.x} ${outerEnd.y}

    A ${outerRadius}
      ${outerRadius}
      0
      ${largeArc}
      1
      ${outerStart.x}
      ${outerStart.y}

    L ${innerStart.x} ${innerStart.y}

    A ${innerRadius}
      ${innerRadius}
      0
      ${largeArc}
      0
      ${innerEnd.x}
      ${innerEnd.y}

    Z
  `;
}


// ============================================================
// Donut
// ============================================================

let currentAngle = 0;

let donut = "";


languages.forEach(
  ([language, bytes], index) => {

    const percentage =
      totalBytes
        ? bytes / totalBytes
        : 0;

    const angle =
      percentage * 360;

    donut += `
      <path
        d="${donutPath(
          currentAngle,
          currentAngle + angle
        )}"
        fill="${
          colors[
            index % colors.length
          ]
        }"
      />
    `;

    currentAngle += angle;
  }
);


// ============================================================
// Legend
// ============================================================

let legend = "";


languages.forEach(
  ([language, bytes], index) => {

    const percentage =
      totalBytes
        ? (bytes / totalBytes) * 100
        : 0;

    const column =
      index < 4
        ? 0
        : 1;

    const row =
      index % 4;

    const x =
      column === 0
        ? 55
        : 500;

    const y =
      285 + row * 27;

    legend += `
      <circle
        cx="${x}"
        cy="${y - 5}"
        r="5"
        fill="${
          colors[
            index % colors.length
          ]
        }"
      />

      <text
        x="${x + 14}"
        y="${y}"
        class="language"
      >
        ${esc(language)}
      </text>

      <text
        x="${x + 190}"
        y="${y}"
        class="percentage"
      >
        ${percentage.toFixed(1)}%
      </text>
    `;
  }
);


// ============================================================
// SVG
// ============================================================

const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  role="img"
  aria-label="Most used programming languages"
>

  <rect
    width="${width}"
    height="${height}"
    rx="16"
    fill="#0d1117"
  />


  <style>

    .title {
      fill: #79c0ff;
      font: 700 24px Arial, sans-serif;
    }

    .language {
      fill: #c9d1d9;
      font: 600 13px Arial, sans-serif;
    }

    .percentage {
      fill: #8b949e;
      font: 500 12px Arial, sans-serif;
      text-anchor: end;
    }

    .centerNumber {
      fill: #ffffff;
      font: 700 26px Arial, sans-serif;
      text-anchor: middle;
    }

    .centerLabel {
      fill: #8b949e;
      font: 500 11px Arial, sans-serif;
      text-anchor: middle;
    }

    .footer {
      fill: #8b949e;
      font: 500 11px Arial, sans-serif;
      text-anchor: end;
    }

  </style>


  <!-- Title -->

  <text
    x="55"
    y="55"
    class="title"
  >
    Most Used Languages
  </text>


  <!-- Donut -->

  ${donut}


  <!-- Donut Center -->

  <text
    x="${centerX}"
    y="${centerY - 2}"
    class="centerNumber"
  >
    ${languages.length}
  </text>

  <text
    x="${centerX}"
    y="${centerY + 18}"
    class="centerLabel"
  >
    Languages
  </text>


  <!-- Language Legend -->

  ${legend}


  <!-- Footer -->

  <text
    x="845"
    y="390"
    class="footer"
  >
    ${processedRepos} repositories analyzed
  </text>

</svg>
`;


// ============================================================
// Write SVG
// ============================================================

fs.mkdirSync(
  "generated",
  {
    recursive: true
  }
);


fs.writeFileSync(
  "generated/languages.svg",
  svg.trim(),
  "utf8"
);


console.log(
  "Generated generated/languages.svg"
);