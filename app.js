const state = {
  rows: [],
  bySong: [],
  charts: [],
  latestMonthKey: null,
};

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonthKey(key) {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

function normalizeRows(rows) {
  return rows
    .map((row) => {
      const year = Number(String(row.Year || "").trim());
      const month = Number(String(row.Month || "").trim());
      const song = String(row.Song || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!year || !month || !song || month < 1 || month > 12) {
        return null;
      }
      return {
        year,
        month,
        song,
        monthKey: monthKey(year, month),
      };
    })
    .filter(Boolean);
}

function computeBySong(rows) {
  const latestMonth = rows.reduce(
    (acc, r) => (r.monthKey > acc ? r.monthKey : acc),
    "0000-00",
  );
  state.latestMonthKey = latestMonth;

  const latest = parseMonthKey(latestMonth);
  const recent12Keys = new Set(
    Array.from({ length: 12 }, (_, i) =>
      shiftMonth(latest.year, latest.month, -i),
    ),
  );
  const recent6Keys = new Set(
    Array.from({ length: 6 }, (_, i) =>
      shiftMonth(latest.year, latest.month, -i),
    ),
  );

  const grouped = new Map();

  rows.forEach((r) => {
    if (!grouped.has(r.song)) {
      grouped.set(r.song, {
        song: r.song,
        total: 0,
        months: new Set(),
        years: new Set(),
        recent12: 0,
        recent6: 0,
        lastPlayed: r.monthKey,
      });
    }
    const s = grouped.get(r.song);
    s.total += 1;
    s.months.add(r.monthKey);
    s.years.add(r.year);
    if (recent12Keys.has(r.monthKey)) s.recent12 += 1;
    if (recent6Keys.has(r.monthKey)) s.recent6 += 1;
    if (r.monthKey > s.lastPlayed) s.lastPlayed = r.monthKey;
  });

  const list = Array.from(grouped.values()).map((s) => {
    const monthCount = s.months.size;
    const concentration = s.total / Math.max(1, monthCount);
    const recencyRatio = s.recent12 / Math.max(1, s.total);

    const overplayScoreRaw =
      s.total * 0.58 +
      concentration * 6.2 +
      s.recent12 * 1.85 +
      s.recent6 * 1.25 +
      recencyRatio * 11;

    return {
      song: s.song,
      total: s.total,
      monthCount,
      yearCount: s.years.size,
      recent12: s.recent12,
      recent6: s.recent6,
      concentration,
      overplayScoreRaw,
      lastPlayed: s.lastPlayed,
    };
  });

  const maxRaw = Math.max(...list.map((s) => s.overplayScoreRaw), 1);
  list.forEach((s) => {
    s.overplayScore = Math.round((s.overplayScoreRaw / maxRaw) * 100);
  });

  return list;
}

function formatMonthKey(key) {
  const { year, month } = parseMonthKey(key);
  return `${monthLabels[month - 1]} ${year}`;
}

function buildKpis(rows, bySong) {
  const years = new Set(rows.map((r) => r.year));
  const topSong = [...bySong].sort((a, b) => b.total - a.total)[0];
  const heavySongs = bySong.filter((s) => s.overplayScore >= 70).length;

  const items = [
    { label: "Total Song Entries", value: rows.length.toLocaleString() },
    { label: "Unique Songs", value: bySong.length.toLocaleString() },
    { label: "Years Covered", value: String(years.size) },
    { label: "Most Played Song", value: topSong ? topSong.song : "-" },
    { label: "High Overplay Songs", value: heavySongs.toLocaleString() },
    { label: "Latest Month", value: formatMonthKey(state.latestMonthKey) },
  ];

  const el = document.getElementById("kpiCards");
  el.innerHTML = "";

  items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.style.animationDelay = `${90 * idx}ms`;
    card.innerHTML = `
      <div class="kpi-label">${item.label}</div>
      <div class="kpi-value">${item.value}</div>
    `;
    el.appendChild(card);
  });
}

function badgeClass(score) {
  if (score >= 70) return "badge badge-high";
  if (score >= 45) return "badge badge-mid";
  return "badge badge-low";
}

function renderTable() {
  const q = document.getElementById("songSearch").value.trim().toLowerCase();
  const minPlays = Number(document.getElementById("minPlays").value);
  const sortBy = document.getElementById("sortBy").value;

  const list = state.bySong
    .filter((s) => s.total >= minPlays)
    .filter((s) => (q ? s.song.toLowerCase().includes(q) : true))
    .sort((a, b) => {
      if (sortBy === "name") return a.song.localeCompare(b.song);
      if (sortBy === "total") return b.total - a.total;
      if (sortBy === "recent") return b.recent12 - a.recent12;
      return b.overplayScore - a.overplayScore;
    });

  const body = document.getElementById("overplayBody");
  body.innerHTML = "";

  list.slice(0, 120).forEach((s, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${s.song}</td>
      <td><span class="${badgeClass(s.overplayScore)}">${s.overplayScore}</span></td>
      <td>${s.total}</td>
      <td>${s.recent12}</td>
      <td>${formatMonthKey(s.lastPlayed)}</td>
    `;
    body.appendChild(tr);
  });
}

function destroyCharts() {
  state.charts.forEach((chart) => chart.destroy());
  state.charts = [];
}

function makeTopSongsChart(bySong) {
  const top = [...bySong].sort((a, b) => b.total - a.total).slice(0, 15);
  const chart = new Chart(document.getElementById("topSongsChart"), {
    type: "bar",
    data: {
      labels: top.map((s) => s.song),
      datasets: [
        {
          label: "Total plays",
          data: top.map((s) => s.total),
          borderRadius: 8,
          backgroundColor: top.map(
            (_, i) => `hsl(${24 + i * 5}, 84%, ${48 + (i % 3) * 6}%)`,
          ),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { ticks: { maxRotation: 65, minRotation: 30 } },
        y: { beginAtZero: true },
      },
    },
  });
  state.charts.push(chart);
}

function makeYearlyChart(rows) {
  const grouped = new Map();
  rows.forEach((r) => grouped.set(r.year, (grouped.get(r.year) || 0) + 1));

  const labels = [...grouped.keys()].sort((a, b) => a - b);
  const data = labels.map((year) => grouped.get(year));

  const chart = new Chart(document.getElementById("yearlyChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Song entries",
          data,
          tension: 0.28,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          backgroundColor: "rgba(0,122,122,0.2)",
          borderColor: "#007a7a",
          pointBackgroundColor: "#db5f00",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
  state.charts.push(chart);
}

function makeMonthChart(rows) {
  const counts = Array.from({ length: 12 }, () => 0);
  rows.forEach((r) => {
    counts[r.month - 1] += 1;
  });

  const chart = new Chart(document.getElementById("monthChart"), {
    type: "radar",
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: "Entries",
          data: counts,
          fill: true,
          backgroundColor: "rgba(219,95,0,0.20)",
          borderColor: "#db5f00",
          pointBackgroundColor: "#007a7a",
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          angleLines: { color: "rgba(31,36,48,0.15)" },
          grid: { color: "rgba(31,36,48,0.1)" },
          pointLabels: { color: "#444" },
        },
      },
    },
  });
  state.charts.push(chart);
}

function makeBubbleChart(bySong) {
  const dataset = [...bySong]
    .sort((a, b) => b.total - a.total)
    .slice(0, 42)
    .map((s) => ({
      x: s.total,
      y: s.yearCount,
      r: Math.max(4, s.recent12 * 2 + 4),
      song: s.song,
      overplay: s.overplayScore,
    }));

  const chart = new Chart(document.getElementById("bubbleChart"), {
    type: "bubble",
    data: {
      datasets: [
        {
          label: "Songs",
          data: dataset,
          backgroundColor: dataset.map(
            (d) => `hsla(${200 - d.overplay}, 78%, 44%, 0.55)`,
          ),
          borderColor: dataset.map((d) => `hsl(${200 - d.overplay}, 72%, 36%)`),
          borderWidth: 1.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label(ctx) {
              const d = ctx.raw;
              return `${d.song}: plays ${d.x}, years ${d.y}, overplay ${d.overplay}`;
            },
          },
        },
      },
      scales: {
        x: { title: { display: true, text: "Total Plays" }, beginAtZero: true },
        y: {
          title: { display: true, text: "Years Active" },
          beginAtZero: true,
          ticks: { stepSize: 1 },
        },
      },
    },
  });
  state.charts.push(chart);
}

function buildInsights(rows, bySong) {
  const el = document.getElementById("insightList");
  const topByPlays = [...bySong].sort((a, b) => b.total - a.total);
  const topByOverplay = [...bySong].sort(
    (a, b) => b.overplayScore - a.overplayScore,
  );

  const monthCounts = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: 0,
  }));
  rows.forEach((r) => {
    monthCounts[r.month - 1].count += 1;
  });
  monthCounts.sort((a, b) => b.count - a.count);

  const first = topByPlays[0];
  const second = topByPlays[1];
  const over70 = bySong.filter((s) => s.overplayScore >= 70).length;

  const insights = [
    `${first.song} is the most repeated song with ${first.total} entries, ${first.total - second.total} more than #2 (${second.song}).`,
    `${topByOverplay[0].song} currently has the highest overplay score (${topByOverplay[0].overplayScore}), with ${topByOverplay[0].recent12} plays in the most recent 12 months.`,
    `${over70} songs are in the high-overplay band (score >= 70), worth rotating out more often.`,
    `${monthLabels[monthCounts[0].month - 1]} is your busiest song month on average, while ${monthLabels[monthCounts[monthCounts.length - 1].month - 1]} is the lightest.`,
    `${topByPlays
      .slice(0, 5)
      .map((s) => s.song)
      .join(
        ", ",
      )} dominate the long-term repertoire and can anchor rotation planning.`,
  ];

  el.innerHTML = "";
  insights.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    el.appendChild(li);
  });
}

function attachControls() {
  const search = document.getElementById("songSearch");
  const minPlays = document.getElementById("minPlays");
  const minPlaysValue = document.getElementById("minPlaysValue");
  const sortBy = document.getElementById("sortBy");

  const rerender = () => {
    minPlaysValue.textContent = minPlays.value;
    renderTable();
  };

  search.addEventListener("input", rerender);
  minPlays.addEventListener("input", rerender);
  sortBy.addEventListener("change", rerender);
}

function renderAll() {
  buildKpis(state.rows, state.bySong);
  renderTable();
  destroyCharts();
  makeTopSongsChart(state.bySong);
  makeYearlyChart(state.rows);
  makeMonthChart(state.rows);
  makeBubbleChart(state.bySong);
  buildInsights(state.rows, state.bySong);
}

async function loadCsv() {
  return new Promise((resolve, reject) => {
    Papa.parse("EW_Songs.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete(result) {
        resolve(result.data);
      },
      error(err) {
        reject(err);
      },
    });
  });
}

async function init() {
  try {
    const raw = await loadCsv();
    state.rows = normalizeRows(raw);
    state.bySong = computeBySong(state.rows);

    attachControls();
    renderAll();
  } catch (error) {
    const main = document.querySelector("main");
    main.innerHTML = `<section class="panel"><h2>Could not load CSV</h2><p class="muted">${String(error.message || error)}</p></section>`;
  }
}

init();
