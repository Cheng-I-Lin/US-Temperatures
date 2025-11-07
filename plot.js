import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

/*async function loadData() {
  const data = await d3.csv("annual_states_model.csv");
  console.log(data);
  return data;
}

let data = await loadData();
console.log(data);*/

// config
const width = 1000,
  height = 600;
//const svg = d3.select("#map");

const svg = d3
  .select("#chart")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .style("overflow", "visible");

const svg_state = d3
  .select("#state-chart")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .style("overflow", "visible");

const tooltip = d3.select("#tooltip");
const stateName = document.querySelector("#state-name");

const geoURL =
  "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";
const dataURL = "avg_states_model.csv"; // <-- your CSV filename

var plotName;

Promise.all([d3.json(geoURL), d3.csv(dataURL)]).then(([geo, data]) => {
  // cast numeric
  data.forEach((d) => {
    d.tas_degree = +d.tas_degree;
    d.year = +d.year;
  });

  // build model list
  const models = Array.from(new Set(data.map((d) => d.model)));
  const modelSelect = d3.select("#modelSelect");
  modelSelect
    .selectAll("option")
    .data(models)
    .join("option")
    .text((d) => d);

  // year slider domain from data
  const years = Array.from(new Set(data.map((d) => d.year))).sort(
    (a, b) => a - b
  );
  d3.select("#yearSlider")
    .attr("min", years[0])
    .attr("max", years[years.length - 1])
    .attr("value", years[0]);
  d3.select("#yearLabel").text(years[0]);

  // projection
  // Filter out Alaska and Puerto Rico
  const mainlandStates = geo.features.filter((feature) => {
    const name = feature.properties.name || feature.properties.NAME;
    return name !== "Alaska" && name !== "Puerto Rico" && name !== "Hawaii";
    // If the property names are different, check your GeoJSON:
    // console.log("Properties:", feature.properties);
  });
  const mainlandGeo = {
    type: "FeatureCollection",
    features: mainlandStates,
  };
  const projection = d3.geoIdentity().fitSize([width, height], mainlandGeo);
  const path = d3.geoPath().projection(projection);

  // color scale (absolute tas)
  //const colors = d3.schemeSpectral[9].slice().reverse();
  const color = d3
    .scaleThreshold()
    .domain([-20, -15, -10, -5, 0, 5, 10, 15, 20])
    .range(d3.schemeRdYlBu[10].reverse());
  /*.scaleQuantile()
    .domain(data.map((d) => d.tas_degree))
    .range(colors);*/
  makeLegend(color);
  /*d3
    .scaleSequential(d3.interpolateTurbo)
    .domain(d3.extent(data, (d) => d.tas_degree)); // absolute tas*/

  // draw states (one time)
  const g = svg
    .append("g")
    .attr("transform", `scale(1, -1) translate(0, -${height})`);
  //console.log(geo.features);

  const states = g
    .selectAll("path")
    .data(mainlandStates)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .attr("class", "states")
    .on("mouseenter", (event) => {
      d3.select(event.currentTarget)
        //.style("fill-opacity", 1)
        .style("stroke-width", 1);
    })
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget)
        //.style("fill-opacity", 0.7)
        .style("stroke-width", 0.5);
    });

  function update() {
    const model = modelSelect.node().value;
    const year = +d3.select("#yearSlider").node().value;
    d3.select("#yearLabel").text(year);

    // filter df
    const filtered = data.filter((d) => d.model === model && d.year === year);

    // build lookup: stateName → tas
    const lookup = {};
    filtered.forEach((d) => (lookup[d.state] = d.tas_degree));

    // color states
    states
      .style("fill-opacity", 0.7)
      .attr("fill", (d) => {
        const name = d.properties.name;
        return lookup[name] ? color(lookup[name]) : "#ccc";
      })
      .on("mouseover", (event, d) => {
        const name = d.properties.name;
        const val = lookup[name];
        tooltip
          .style("display", "block")
          .style("left", event.clientX + 5 + "px")
          .style("top", event.clientY + 5 + "px")
          .html(
            `<b>${name}</b><br>${val ? val.toFixed(2) + " °C" : "No Data"}`
          );
      })
      .on("mouseout", () => tooltip.style("display", "none"))
      .on("click", (event, d) => {
        const name = d.properties.name;
        const filtered = data.filter(
          (d) => d.model === model && d.state === name
        );
        plotName = name;
        stateName.innerHTML =
          "Average Annual Near Surface Temperature of " +
          name +
          " (2015 ~ 2100)";
        subplot(filtered);
      });
  }

  // interactions
  modelSelect.on("change", (event) => {
    update();
    if(plotName){
        const filtered = data.filter(
          (d) => d.model === event.target.value && d.state === plotName
        );
        subplot(filtered);
    }
  });
  d3.select("#yearSlider").on("input", update);
  update();
});

// color = d3.scaleQuantile() or d3.scaleThreshold()

function makeLegend(scale) {
  const thresholds = scale.domain(); // 9 domain breaks
  const colors = scale.range(); // 10 colors

  const w = 350;
  const h = 15;
  const boxWidth = w / colors.length;

  const svgLegend = d3
    .select("#legend")
    .html("")
    .append("svg")
    .attr("width", w + 50) // give margin for labels
    .attr("height", h + 50);

  // colored boxes
  svgLegend
    .selectAll("rect")
    .data(colors)
    .join("rect")
    .attr("x", (d, i) => i * boxWidth + 40) // 40px left margin
    .attr("y", 0)
    .attr("width", boxWidth)
    .attr("height", h)
    .attr("fill", (d) => d);

  // scale for ticks
  const x = d3
    .scaleLinear()
    .domain([thresholds[0], thresholds[thresholds.length - 1]])
    .range([40, w + 40]);

  // axis
  const axis = d3
    .axisBottom(x)
    .tickValues(thresholds)
    .tickFormat(d3.format("d"));

  svgLegend
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(axis)
    .selectAll("text")
    .attr("dy", "1em") // push labels down a bit
    .style("font-size", "10px");

  svgLegend
    .append("text")
    .attr("x", w / 2 + 40)
    .attr("y", h + 35)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .text("Temperature (°C)");
}

function subplot(stateData) {
  svg_state.selectAll("path").remove();
  svg_state.selectAll("g").remove();
  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.tas_degree));

  const x = d3.scaleLinear().range([0, width]).nice();
  const y = d3.scaleLinear().range([height, 0]).nice();
  //console.log(stateData);

  const years = d3.extent(stateData, (d) => d.year);
  const temps = d3.extent(stateData, (d) => d.tas_degree);

  x.domain(years);
  y.domain([temps[0] - 0.3, temps[1] + 0.3]);

  svg_state
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg_state
    .append("g")
    .attr("transform", `translate(0,0)`)
    .call(d3.axisLeft(y));

  const path = svg_state
    .append("path")
    .datum(stateData)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2);
}
