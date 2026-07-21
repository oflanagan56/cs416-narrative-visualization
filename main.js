const state = {
  scene: 0,
  season: 2019,
  team: "All"
};

const scenes = [
  {
    title: "The Surge",
    narration: "League-wide home run totals from 1998 to today.",
    render() {}
  },
  {
    title: "The Barrel Zone",
    narration: "Where exit velocity and launch angle turn contact into home runs.",
    render() {}
  },
  {
    title: "Swinging Up",
    narration: "The leaguewide rise in average launch angle.",
    render() {}
  },
  {
    title: "Explore",
    narration: "Pick a season and team, then hover any point for the details.",
    render() {}
  }
];

const svg = d3.select("#chart");

function clearChart() {
  svg.selectAll("*").remove();
}

function goTo(i) {
  state.scene = Math.max(0, Math.min(scenes.length - 1, i));
  const scene = scenes[state.scene];

  d3.selectAll(".nav-btn").classed("active", (_, idx, nodes) =>
    +d3.select(nodes[idx]).attr("data-scene") === state.scene
  );

  d3.select("#scene-title").text(scene.title);
  d3.select("#scene-narration").text(scene.narration);
  d3.select("#scene-progress").text(`Scene ${state.scene + 1} of ${scenes.length}`);
  d3.select("#controls").property("hidden", state.scene !== 3);

  d3.select("#prev-btn").property("disabled", state.scene === 0);
  d3.select("#next-btn").property("disabled", state.scene === scenes.length - 1);

  clearChart();
  scene.render();
}

d3.selectAll(".nav-btn").on("click", function () {
  goTo(+d3.select(this).attr("data-scene"));
});
d3.select("#prev-btn").on("click", () => goTo(state.scene - 1));
d3.select("#next-btn").on("click", () => goTo(state.scene + 1));

goTo(0);
