const COL = {
  hr: "#e0313a",
  other: "#64788f",
  muted: "#9db0c3",
  ink: "#e8eef5",
  grid: "#2a3a4d",
  up: "#3fb56b",
  down: "#5b8fd6",
  soft: "#f2a6ab",
};

const state = {
  scene: 0,
  hrMode: "total",     // total | per_game
  season: 2025,        // scatter season for Explore
  team: "All",
  highlight: "all",    // all | hr
};

const svg = d3.select("#chart");
const canvas = document.getElementById("scatter");
const cctx = canvas.getContext("2d");
const tooltip = d3.select("#tooltip");
const controlsEl = d3.select("#controls");

let DATA = {};

Promise.all([
  d3.csv("data/hr_by_season.csv", d => ({
    season: +d.season,
    team_games: +d.team_games,
    home_runs: +d.home_runs,
    hr_per_game: +d.hr_per_game,
    runs_per_game: +d.runs_per_game,
  })),
  d3.csv("data/league_launch_angle.csv", d => ({
    season: +d.season,
    launch_angle: +d.avg_launch_angle,
    barrel_rate: +d.barrel_rate,
    hard_hit_rate: +d.hard_hit_rate,
  })),
  d3.csv("data/team_statcast.csv", d => ({
    season: +d.season,
    team: d.team,
    team_name: d.team_name,
    launch_angle: +d.launch_angle,
    flyball_pct: +d.flyball_pct,
    groundball_pct: +d.groundball_pct,
    home_runs: +d.home_runs,
  })),
  d3.csv("data/batted_balls.csv", d => ({
    player: d.player,
    date: d.date,
    season: +(d.season || 2025),
    team: d.team,
    ev: +d.ev,
    la: +d.la,
    distance: d.distance === "" ? null : +d.distance,
    bb_type: d.bb_type,
    events: d.events,
    is_hr: +d.is_hr === 1,
  })),
]).then(([hr, launch, teams, balls]) => {
  DATA = { hr, launch, teams, balls };
  DATA.seasons = Array.from(new Set(balls.map(d => d.season))).sort((a, b) => a - b);
  if (!DATA.seasons.includes(state.season)) state.season = DATA.seasons[DATA.seasons.length - 1];
  DATA.teams_list = Array.from(new Set(balls.map(d => d.team))).sort();
  goTo(0);
});

// ---- shared helpers ----

function frame(margin) {
  const box = document.querySelector("main");
  const W = box.clientWidth, H = box.clientHeight;
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const width = W - margin.left - margin.right;
  const height = H - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  return { W, H, width, height, g };
}

function useCanvas(on) {
  if (!on) { canvas.style.display = "none"; return null; }
  canvas.style.display = "block";
  const box = document.querySelector("main");
  const W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, W, H);
  return cctx;
}

function annotate(g, annotations, type) {
  const maker = d3.annotation()
    .type(type || d3.annotationCallout)
    .annotations(annotations);
  g.append("g").attr("class", "annotation-layer").call(maker);
}

function hideTooltip() { tooltip.style("display", "none").attr("hidden", true); }

function showTooltip(html, x, y) {
  tooltip.attr("hidden", null).style("display", "block").html(html);
  const box = document.querySelector("main").getBoundingClientRect();
  const tw = tooltip.node().offsetWidth, th = tooltip.node().offsetHeight;
  let left = x + 14, top = y - th - 8;
  if (left + tw > box.width) left = x - tw - 14;
  if (top < 0) top = y + 14;
  tooltip.style("left", left + "px").style("top", top + "px");
}

// ---- scenes ----

function sceneSurge(f) {
  useCanvas(false);
  hideTooltip();
  const data = DATA.hr;
  const yKey = state.hrMode === "total" ? "home_runs" : "hr_per_game";

  const x = d3.scaleLinear().domain([1997.5, 2025.5]).range([0, f.width]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d[yKey]) * 1.12]).nice().range([f.height, 0]);

  f.g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-f.width).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(10));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6)
    .tickFormat(state.hrMode === "total" ? d3.format(",") : d3.format(".2f")));
  f.g.append("text").attr("class", "axis-label").attr("x", 0).attr("y", -12)
    .text(state.hrMode === "total" ? "League home runs" : "Home runs per team per game");

  const line = d3.line().x(d => x(d.season)).y(d => y(d[yKey]));
  f.g.append("path").datum(data).attr("class", "series-line")
    .attr("stroke", COL.hr).attr("d", line);
  f.g.selectAll("circle.pt").data(data).join("circle")
    .attr("class", "pt").attr("r", 3)
    .attr("cx", d => x(d.season)).attr("cy", d => y(d[yKey]))
    .attr("fill", COL.hr);

  const at = s => data.find(d => d.season === s);
  const P = (s, k) => [x(s), y(at(s)[k])];
  let notes;
  if (state.hrMode === "total") {
    notes = [
      { note: { title: "2019: 6,776 home runs", label: "An all-time record — 62% more than 2014.", wrap: 170 },
        x: P(2019, yKey)[0], y: P(2019, yKey)[1], dx: -20, dy: -46 },
      { note: { title: "2014: the trough", label: "4,186 HR, the fewest since 1992.", wrap: 150 },
        x: P(2014, yKey)[0], y: P(2014, yKey)[1], dx: -10, dy: 60 },
      { note: { title: "2020", label: "Shortened 60-game season.", wrap: 130 },
        x: P(2020, yKey)[0], y: P(2020, yKey)[1], dx: 34, dy: -20 },
    ];
  } else {
    notes = [
      { note: { title: "2019: 1.39 / game", label: "The peak of the launch-angle era.", wrap: 160 },
        x: P(2019, yKey)[0], y: P(2019, yKey)[1], dx: -20, dy: -44 },
      { note: { title: "2020 rejoins the pack", label: "Its low total was a short season — the rate (1.28) sits right in the modern band.", wrap: 175 },
        x: P(2020, yKey)[0], y: P(2020, yKey)[1], dx: 24, dy: 40 },
      { note: { title: "2014", label: "0.86 — the ground-ball era.", wrap: 130 },
        x: P(2014, yKey)[0], y: P(2014, yKey)[1], dx: -10, dy: 54 },
    ];
  }
  annotate(f.g, notes);
}

function surgeControls(el) {
  const wrap = el.append("div").attr("class", "control");
  wrap.append("label").text("Show:");
  const tog = wrap.append("div").attr("class", "toggle");
  const opts = [["total", "Total"], ["per_game", "Per game"]];
  tog.selectAll("button").data(opts).join("button")
    .text(d => d[1])
    .classed("on", d => d[0] === state.hrMode)
    .on("click", (e, d) => { state.hrMode = d[0]; goTo(state.scene); });
}

function sceneBarrel(f) {
  const ctx = useCanvas(true);
  const balls = DATA.balls.filter(d => d.season === 2025);

  const x = d3.scaleLinear().domain([25, 122]).range([0, f.width]);
  const y = d3.scaleLinear().domain([-60, 65]).range([f.height, 0]);
  const ox = 60, oy = 24;  // canvas is offset by svg margins via translate below

  f.g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-f.width).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.height})`)
    .call(d3.axisBottom(x).ticks(8));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(8));
  f.g.append("text").attr("class", "axis-label").attr("x", f.width).attr("y", f.height - 8)
    .attr("text-anchor", "end").text("Exit velocity (mph) →");
  f.g.append("text").attr("class", "axis-label").attr("y", -12).text("Launch angle (°)");

  // draw points on canvas (offset to match the g translate)
  drawScatter(ctx, balls, x, y, ox, oy, null);

  legend(f.g, [["Home run", COL.hr], ["Other batted ball", COL.other]], f.width - 160, 4);

  const hrs = balls.filter(d => d.is_hr);
  const cx = x(d3.mean(hrs, d => d.ev));
  const cy = y(d3.mean(hrs, d => d.la));
  annotate(f.g, [
    { note: { title: "The barrel zone", label: "High exit velocity (~98+ mph) at a 10–35° launch. Almost every home run lives in this pocket.", wrap: 200 },
      x: cx, y: cy, dx: -150, dy: -70 },
    { note: { title: "Weak contact", label: "Low speed or bad angle — these stay in the park.", wrap: 150 },
      x: x(70), y: y(-30), dx: 60, dy: 20 },
  ]);
}

function sceneSwing(f) {
  useCanvas(false);
  hideTooltip();
  const data = DATA.launch;
  const x = d3.scaleLinear().domain([2015, 2025]).range([0, f.width]);
  const yL = d3.scaleLinear().domain([9, 15]).range([f.height, 0]);
  const yR = d3.scaleLinear().domain([30, 43]).range([f.height, 0]);

  f.g.append("g").attr("class", "grid")
    .call(d3.axisLeft(yL).ticks(6).tickSize(-f.width).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(10));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(yL).ticks(6).tickFormat(d => d + "°"));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(${f.width},0)`)
    .call(d3.axisRight(yR).ticks(6).tickFormat(d => d + "%"));
  f.g.append("text").attr("class", "axis-label").attr("y", -12).text("Avg launch angle");

  const lineL = d3.line().x(d => x(d.season)).y(d => yL(d.launch_angle));
  const lineR = d3.line().x(d => x(d.season)).y(d => yR(d.hard_hit_rate));
  f.g.append("path").datum(data).attr("class", "series-line").attr("stroke", COL.hr).attr("d", lineL);
  f.g.append("path").datum(data).attr("class", "series-line").attr("stroke", COL.up)
    .attr("stroke-dasharray", "5 4").attr("d", lineR);
  f.g.selectAll("circle.la").data(data).join("circle").attr("r", 3)
    .attr("cx", d => x(d.season)).attr("cy", d => yL(d.launch_angle)).attr("fill", COL.hr);

  legend(f.g, [["Launch angle", COL.hr], ["Hard-hit %", COL.up]], 12, 12);

  const at = s => data.find(d => d.season === s);
  annotate(f.g, [
    { note: { title: "+2.6° since 2015", label: "League launch angle climbed from 10.9° to 13.5° — hitters swinging up on purpose.", wrap: 180 },
      x: x(2024), y: yL(at(2024).launch_angle), dx: -30, dy: 78 },
    { note: { title: "Harder, too", label: "Hard-hit rate rose from 33% to 41%.", wrap: 150 },
      x: x(2018), y: yR(at(2018).hard_hit_rate), dx: -20, dy: -70 },
  ]);
}

function sceneTeams(f) {
  useCanvas(false);
  hideTooltip();
  const s0 = 2015, s1 = 2025;
  const t0 = new Map(DATA.teams.filter(d => d.season === s0).map(d => [d.team, d]));
  const t1 = new Map(DATA.teams.filter(d => d.season === s1).map(d => [d.team, d]));
  const rows = [...t1.keys()].filter(k => t0.has(k)).map(k => ({
    team: k, a: t0.get(k).launch_angle, b: t1.get(k).launch_angle,
    delta: t1.get(k).launch_angle - t0.get(k).launch_angle,
  }));
  rows.sort((p, q) => q.delta - p.delta);

  const x = d3.scalePoint().domain([String(s0), String(s1)]).range([0, f.width]).padding(0.5);
  const y = d3.scaleLinear().domain(d3.extent(rows.flatMap(r => [r.a, r.b]))).nice().range([f.height, 0]);

  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.height})`).call(d3.axisBottom(x));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "°"));
  f.g.append("text").attr("class", "axis-label").attr("y", -12).text("Team average launch angle");

  const risers = new Set(rows.slice(0, 2).map(r => r.team));
  const holdouts = new Set(rows.slice(-2).map(r => r.team));
  const colorOf = r => risers.has(r.team) ? COL.up : holdouts.has(r.team) ? COL.down : COL.grid;
  const emph = r => risers.has(r.team) || holdouts.has(r.team);

  f.g.selectAll("line.slope").data(rows).join("line")
    .attr("x1", x(String(s0))).attr("y1", d => y(d.a))
    .attr("x2", x(String(s1))).attr("y2", d => y(d.b))
    .attr("stroke", colorOf).attr("stroke-width", d => emph(d) ? 2.5 : 1)
    .attr("opacity", d => emph(d) ? 1 : 0.35);
  f.g.selectAll("circle.b").data(rows).join("circle").attr("r", d => emph(d) ? 4 : 2.5)
    .attr("cx", x(String(s1))).attr("cy", d => y(d.b)).attr("fill", colorOf).attr("opacity", d => emph(d) ? 1 : 0.4);
  f.g.selectAll("text.lbl").data(rows.filter(emph)).join("text").attr("class", "axis-label")
    .attr("x", x(String(s1)) + 8).attr("y", d => y(d.b) + 3).attr("fill", colorOf)
    .text(d => `${d.team} ${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(1)}°`);

  legend(f.g, [["Biggest adopters", COL.up], ["Held out / dropped", COL.down]], 12, 16);

  const top = rows[0];
  annotate(f.g, [
    { note: { title: "Nobody bought in more", label: `${top.team} lifted its team launch angle +${top.delta.toFixed(1)}° — the league's steepest climb.`, wrap: 190 },
      x: x(String(s1)), y: y(top.b), dx: -110, dy: 30 },
  ]);
}

function sceneExplore(f) {
  const ctx = useCanvas(true);
  let balls = DATA.balls.filter(d => d.season === state.season);
  if (state.team !== "All") balls = balls.filter(d => d.team === state.team);

  const x = d3.scaleLinear().domain([25, 122]).range([0, f.width]);
  const y = d3.scaleLinear().domain([-60, 65]).range([f.height, 0]);
  const ox = 60, oy = 24;

  f.g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(6).tickSize(-f.width).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.height})`).call(d3.axisBottom(x).ticks(8));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(8));
  f.g.append("text").attr("class", "axis-label").attr("x", f.width).attr("y", f.height - 8)
    .attr("text-anchor", "end").text("Exit velocity (mph) →");
  f.g.append("text").attr("class", "axis-label").attr("y", -12).text("Launch angle (°)");

  const dim = state.highlight === "hr";
  drawScatter(ctx, balls, x, y, ox, oy, dim);
  legend(f.g, [["Home run", COL.hr], ["Other batted ball", COL.other]], f.width - 160, 4);

  // hover
  const pts = balls.map(d => ({ d, px: ox + x(d.ev), py: oy + y(d.la) }));
  const tree = d3.quadtree().x(p => p.px).y(p => p.py).addAll(pts);
  const ring = f.g.append("circle").attr("r", 6).attr("fill", "none")
    .attr("stroke", COL.ink).attr("stroke-width", 1.5).style("display", "none");

  svg.append("rect").attr("width", f.W).attr("height", f.H).attr("fill", "transparent")
    .attr("transform", null)
    .on("mousemove", function (e) {
      const [mx, my] = d3.pointer(e, svg.node());
      const p = tree.find(mx, my, 18);
      if (!p) { ring.style("display", "none"); hideTooltip(); return; }
      ring.style("display", null)
        .attr("cx", p.px - 60).attr("cy", p.py - 24);  // ring lives inside translated g
      const b = p.d;
      const result = (b.events || "").replace(/_/g, " ") || b.bb_type.replace(/_/g, " ");
      showTooltip(
        `<strong>${b.player}</strong> · ${b.team}<br>${b.date}<br>` +
        `EV ${b.ev} mph · LA ${b.la}°${b.distance ? ` · ${b.distance} ft` : ""}<br>` +
        `<span style="color:${b.is_hr ? COL.soft : COL.muted}">${result}</span>`,
        mx, my);
    })
    .on("mouseleave", () => { ring.style("display", "none"); hideTooltip(); });
}

function exploreControls(el) {
  const c1 = el.append("div").attr("class", "control");
  c1.append("label").text("Season:");
  const tog = c1.append("div").attr("class", "toggle");
  tog.selectAll("button").data(DATA.seasons).join("button")
    .text(d => d).classed("on", d => d === state.season)
    .on("click", (e, d) => { state.season = d; state.team = "All"; goTo(state.scene); });

  const c2 = el.append("div").attr("class", "control");
  c2.append("label").text("Team:");
  const sel = c2.append("select").on("change", function () { state.team = this.value; goTo(state.scene); });
  sel.selectAll("option").data(["All", ...DATA.teams_list]).join("option")
    .attr("value", d => d).property("selected", d => d === state.team).text(d => d);

  const c3 = el.append("div").attr("class", "control");
  c3.append("label").text("Highlight:");
  const tog2 = c3.append("div").attr("class", "toggle");
  tog2.selectAll("button").data([["all", "Everything"], ["hr", "HRs only"]]).join("button")
    .text(d => d[1]).classed("on", d => d[0] === state.highlight)
    .on("click", (e, d) => { state.highlight = d[0]; goTo(state.scene); });

  el.append("span").attr("class", "hint").text("Hover any point for the play →");
}

// ---- scatter + legend drawing ----

function drawScatter(ctx, balls, x, y, ox, oy, dimNonHr) {
  const others = balls.filter(d => !d.is_hr);
  const hrs = balls.filter(d => d.is_hr);
  ctx.globalAlpha = dimNonHr ? 0.08 : 0.28;
  ctx.fillStyle = COL.other;
  for (const d of others) {
    ctx.beginPath();
    ctx.arc(ox + x(d.ev), oy + y(d.la), 2, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = COL.hr;
  for (const d of hrs) {
    ctx.beginPath();
    ctx.arc(ox + x(d.ev), oy + y(d.la), 2.4, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function legend(g, items, lx, ly) {
  const lg = g.append("g").attr("class", "legend").attr("transform", `translate(${lx}, ${ly})`);
  items.forEach((it, i) => {
    const row = lg.append("g").attr("transform", `translate(0, ${i * 20})`);
    row.append("circle").attr("r", 5).attr("cx", 6).attr("cy", -4).attr("fill", it[1]);
    row.append("text").attr("x", 18).attr("y", 0).text(it[0]);
  });
}

// ---- router ----

const scenes = [
  { title: "The Surge", subtitle: "League home runs, 1998 to today. The game climbed out of a ground-ball slump into a record-setting power era.", render: sceneSurge, controls: surgeControls },
  { title: "The Barrel Zone", subtitle: "Every batted ball of 2025, by exit velocity and launch angle. Home runs cluster in one tight pocket.", render: sceneBarrel },
  { title: "Swinging Up", subtitle: "Hitters league-wide changed their swings — launch angle and hard contact both trended up.", render: sceneSwing },
  { title: "Who Bought In", subtitle: "Not every team embraced the fly-ball turn. Each line is a team's launch angle, 2015 to 2025.", render: sceneTeams },
  { title: "Explore", subtitle: "Pick a season and team, then hover any point to see the hitter, the play, and the numbers.", render: sceneExplore, controls: exploreControls },
];

function goTo(i) {
  state.scene = Math.max(0, Math.min(scenes.length - 1, i));
  const scene = scenes[state.scene];

  d3.selectAll(".nav-btn").classed("active", function () {
    return +d3.select(this).attr("data-scene") === state.scene;
  });
  d3.select("#scene-title").text(scene.title);
  d3.select("#scene-narration").text(scene.subtitle);
  d3.select("#scene-progress").text(`Scene ${state.scene + 1} of ${scenes.length}`);
  d3.select("#prev-btn").property("disabled", state.scene === 0);
  d3.select("#next-btn").property("disabled", state.scene === scenes.length - 1);

  controlsEl.selectAll("*").remove();
  if (scene.controls) { controlsEl.attr("hidden", null); scene.controls(controlsEl); }
  else controlsEl.attr("hidden", true);

  const margin = { top: 24, right: 30, bottom: 40, left: 60 };
  scene.render(frame(margin));
}

d3.selectAll(".nav-btn").on("click", function () { goTo(+d3.select(this).attr("data-scene")); });
d3.select("#prev-btn").on("click", () => goTo(state.scene - 1));
d3.select("#next-btn").on("click", () => goTo(state.scene + 1));

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (DATA.hr) goTo(state.scene); }, 150);
});
