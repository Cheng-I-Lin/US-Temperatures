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
  .attr("viewBox", `0 0 ${width} ${height}`)
  .style("overflow", "visible");

const svg_state = d3
  .select("#state-chart")
  //.append("svg")
  .attr("viewBox", `${width} ${-height / 10} ${width * 1.25} ${height * 1.25}`)
  .style("overflow", "visible")
  .style("display", "none");

const tooltip = d3.select("#tooltip");
const stateName = document.querySelector("#state-name");

const geoURL =
  "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";
const dataURL = "new_avg_states_model.csv"; // <-- your CSV filename

var plotName;
var selectedState = [];
var isSelected = false;
var legendVisible = true;

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

  // Compute U.S. mean (by year) for each model
  const usSeriesByModel = {};
  for (const m of models) {
    const arr = data.filter((d) => d.model === m);
    const rolled = d3.rollups(
      arr,
      (v) => d3.mean(v, (d) => d.tas_degree),
      (d) => d.year
    );
    usSeriesByModel[m] = rolled
      .map(([year, mean]) => ({ year: +year, mean: +mean }))
      .sort((a, b) => a.year - b.year);
  }

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
    .domain([3, 6, 9, 12, 15, 18, 21, 24])
    .range(d3.schemeRdYlBu[9].reverse());
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

  let legendHover;
  const states = g
    .selectAll("path")
    .data(mainlandStates)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .attr("class", "states")
    .on("mouseenter", (event) => {
      hoverOver(event.currentTarget);
      let hoverColor = event.currentTarget.getAttribute("fill");
      d3.select("#legend")
        .selectAll("rect")
        .nodes()
        .forEach((d) => {
          if (d.getAttribute("fill") === hoverColor) {
            hoverOver(d);
            legendHover = d;
          }
        });
    })
    .on("mouseleave", (event) => {
      hoverOut(event.currentTarget);
      if (legendHover) {
        hoverOut(legendHover);
      }
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
        const usSeries = usSeriesByModel[model]; // <-- national mean for this model

        //console.log(event.currentTarget);
        if (event.currentTarget.getAttribute("fill") != "#ccc") {
          if (selectedState.length == 0) {
            selectedState.push(event.currentTarget);
          }
          if (isSelected) {
            if (event.currentTarget.classList.contains("selected")) {
              event.currentTarget.classList.remove("selected");
              isSelected = false;
              selectState();
              selectedState.pop();
              stateName.innerHTML = "Click a state to see temperature data aggregated by the chosen state";
            }
          } else {
            if (!event.currentTarget.classList.contains("selected")) {
              const name = d.properties.name;
              plotName = name;
              const filtered = data.filter(
                (d) => d.model === model && d.state === name
              );
              event.currentTarget.classList.add("selected");
              isSelected = true;
              selectState();
              moveStateToLeft(selectedState[0]);
              subplot(filtered, usSeries);
              stateName.innerHTML = "Click " + plotName + " to deselect";
            }
          }
        }
      });
  }

  // interactions
  modelSelect.on("change", (event) => {
    update();
    if (plotName) {
      const filtered = data.filter(
        (d) => d.model === event.target.value && d.state === plotName
      );
      const usSeries = usSeriesByModel[event.target.value];
      subplot(filtered, usSeries);
    }
  });
  d3.select("#yearSlider").on("input", update);
  update();
});

function selectState() {
  d3.select("#chart")
    .selectAll("path")
    .nodes()
    .forEach((s) => {
      if (s != selectedState[0]) {
        if (selectedState[0].classList.contains("selected")) {
          d3.select(s).style("opacity", "0");
          d3.select(s).style("visibility", "hidden");
        } else {
          d3.select(s).style("opacity", "1");
          d3.select(s).style("visibility", "visible");
        }
      }
    });
  legendVisible = !legendVisible;
  d3.select("#legend")
    .style("opacity", legendVisible ? 1 : 0)
    .style("visibility", legendVisible ? "visible" : "hidden");
  svg_state.style("display", legendVisible ? "none" : "block");
}

function hoverOver(target) {
  d3.select(target).style("fill-opacity", 1).style("stroke-width", 1.5);
}

function hoverOut(target) {
  d3.select(target).style("fill-opacity", 0.7).style("stroke-width", 0.5);
}

function makeLegend(colorScale) {
  const domain = colorScale.domain(); // 9 thresholds
  const range = colorScale.range(); // 10 colors

  const boxH = 22; // height of each color box
  const boxW = 25;
  const labelOffset = 35;

  const svgLengend = d3
    .select("#legend")
    .attr("width", 100 + labelOffset)
    .attr("height", range.length * boxH)
    .style("transition", "200ms")
    .style("overflow", "visible");

  // group (for top margin)
  const g = svgLengend.append("g").attr("transform", "translate(30,20)");
  let legendHover = [];

  // draw each box + tick label
  range.forEach((color, i) => {
    g.append("rect")
      .attr("x", 0)
      .attr("y", (range.length - i - 1) * boxH)
      .attr("width", boxW)
      .attr("height", boxH)
      .attr("fill", color)
      .style("fill-opacity", 0.7)
      .attr("stroke", "#333")
      .style("stroke-width", 0.5)
      .attr("class", "states")
      .on("mouseenter", (event) => {
        hoverOver(event.currentTarget);
        d3.select("#chart")
          .selectAll("path")
          .nodes()
          .forEach((d) => {
            if (d.getAttribute("fill") === color) {
              hoverOver(d);
              legendHover.push(d);
            }
          });
      })
      .on("mouseleave", (event) => {
        hoverOut(event.currentTarget);
        legendHover.forEach((c) => {
          hoverOut(c);
        });
        legendHover = [];
      });

    // label: use threshold boundary for the lower edge except first/last
    let label;
    if (i === 0) {
      label = "< " + domain[0];
    } else if (i === range.length - 1) {
      label = "> " + domain[domain.length - 1];
    } else {
      label = domain[i - 1] + " to " + domain[i];
    }

    g.append("text")
      .attr("x", boxW + 5)
      .attr("y", (range.length - i - 1) * boxH + boxH / 1.5)
      .style("font-size", "11px")
      .text(label);
  });

  // title
  svgLengend
    .append("text")
    .attr("x", 0)
    .attr("y", 12)
    .style("font-weight", "bold")
    .style("font-size", "11px")
    .text("Temperature (°C)");
}

function subplot(stateData, usSeries) {
  svg_state.selectAll("*").remove();

  // --- Margins and inner dimensions ---
  // ↑ Increased top margin from 40 → 70 to give space for title & summary
  const margin = { top: 70, right: 40, bottom: 60, left: 70 },
    innerWidth = width - margin.left - margin.right,
    innerHeight = height - margin.top - margin.bottom;

  const g = svg_state
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // --- Scales ---
  const x = d3
    .scaleLinear()
    .domain(
      d3.extent(
        d3.merge([stateData.map((d) => d.year), usSeries.map((d) => d.year)])
      )
    )
    .range([0, innerWidth])
    .nice();

  const allTemps = [
    ...stateData.map((d) => d.tas_degree),
    ...usSeries.map((d) => d.mean),
  ];
  const y = d3
    .scaleLinear()
    .domain([d3.min(allTemps) - 0.3, d3.max(allTemps) + 0.3])
    .range([innerHeight, 0])
    .nice();

  // --- Axes ---
  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")))
    .call((g) =>
      g
        .append("text")
        .attr("x", innerWidth / 2)
        .attr("y", 45)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text("Year")
    );

  g.append("g")
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("x", -innerHeight / 2)
        .attr("y", -50)
        .attr("transform", "rotate(-90)")
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text("Temperature (°C)")
    );

  // --- Gridlines ---
  g.append("g")
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""))
    .attr("stroke-opacity", 0.08);

  // --- Line generators ---
  const stateLine = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.tas_degree))
    .curve(d3.curveMonotoneX);

  const usLine = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.mean))
    .curve(d3.curveMonotoneX);

  // --- Draw lines ---
  g.append("path")
    .datum(usSeries)
    .attr("fill", "none")
    .attr("stroke", "#444")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6 4")
    .attr("d", usLine);

  g.append("path")
    .datum(stateData)
    .attr("fill", "none")
    .attr("stroke", "#007acc")
    .attr("stroke-width", 2.5)
    .attr("d", stateLine);

  // --- Compute linear trends ---
  function linearTrend(data, xKey, yKey) {
    const n = data.length;
    const sumX = d3.sum(data, (d) => d[xKey]);
    const sumY = d3.sum(data, (d) => d[yKey]);
    const sumXY = d3.sum(data, (d) => d[xKey] * d[yKey]);
    const sumXX = d3.sum(data, (d) => d[xKey] * d[xKey]);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  const trendState = linearTrend(stateData, "year", "tas_degree");
  const trendUS = linearTrend(usSeries, "year", "mean");

  const slopeStateDecade = trendState.slope * 10;
  const slopeUSDecade = trendUS.slope * 10;

  const compare =
    slopeStateDecade > slopeUSDecade
      ? "Rising faster than the U.S. average"
      : "Rising slower than the U.S. average";

  // --- Title ---
  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", -40) // was -10 → moved up to fit new margin
    .attr("text-anchor", "middle")
    .attr("font-size", 16)
    .attr("font-weight", "bold")
    .text(
      "Average Annual Near Surface Temperature of " +
        plotName +
        " (2015 ~ 2100)"
    );

  // --- Summary text under title ---
  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", -18) // was 15 → moved above the chart area
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .attr("fill", "#555")
    .text(
      `${stateData[0].state} warming at ${slopeStateDecade.toFixed(
        2
      )}°C per decade under ${
        stateData[0].model
      } (2015–2100). ${compare} (${slopeUSDecade.toFixed(2)}°C).`
    );

  /*g.append("path")
    .datum(trendLineState)
    .attr("fill", "none")
    .attr("stroke", "#007acc")
    .attr("stroke-dasharray", "4 4")
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.7)
    .attr("d", stateLine);*/

  // --- Legend (top-left corner) ---
  const legend = g.append("g").attr("transform", `translate(10, 10)`);

  // background box
  legend
    .append("rect")
    .attr("x", -5)
    .attr("y", -5)
    .attr("width", 140)
    .attr("height", 45)
    .attr("fill", "white")
    .attr("stroke", "#ccc")
    .attr("opacity", 0.8);

  // state line
  legend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 24)
    .attr("y1", 8)
    .attr("y2", 8)
    .attr("stroke", "#007acc")
    .attr("stroke-width", 2.5);
  legend
    .append("text")
    .attr("x", 32)
    .attr("y", 12)
    .attr("font-size", 12)
    .text("State");

  // US mean line
  legend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 24)
    .attr("y1", 28)
    .attr("y2", 28)
    .attr("stroke", "#444")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6 4");
  legend
    .append("text")
    .attr("x", 32)
    .attr("y", 32)
    .attr("font-size", 12)
    .text("U.S. mean");
}

function moveStateToLeft(selection) {
  const container = d3.select("#chart");
  const containerWidth = container.node().getBoundingClientRect().width;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate target position as percentage of viewport (vw)
  const targetXPercent = 5; // 5% from left of viewport
  const targetX = (viewportWidth * targetXPercent) / 100;

  // For Y, you can use vh or keep as fixed percentage of viewport height
  const targetYPercent = 37.5; // 37.5% from top of viewport
  const targetY = (viewportHeight * targetYPercent) / 100;

  /*
  // Calculate target position as percentage of container
  const targetX = containerWidth * 0.1; // 10% from left
  const targetY = 300; // Fixed y or calculate dynamically*/

  // Get state's bounding box
  const bbox = selection.getBBox();
  const currentCenterX = bbox.x + bbox.width / 2;
  const currentCenterY = bbox.y + bbox.height / 2;

  // const translateX = targetX - currentCenterX;
  // const translateY = targetY - currentCenterY;

  // Calculate translation in pixels first
  const translateXPixels = targetX - currentCenterX;
  const translateYPixels = targetY - currentCenterY;

  // Convert pixels to viewport units
  const translateXvw = (translateXPixels / viewportWidth) * 100;
  const translateYvh = (translateYPixels / viewportHeight) * 100;

  const selectClass = document.querySelector(".selected");

  let offset = 0;
  switch (plotName) {
    case "Montana":
    case "Texas":
      offset = 5;
      break;
    case "Iowa":
    case "Missouri":
    case "Nevada":
    case "Idaho":
    case "New York":
      offset = 2.5;
      break;
    case "Illinois":
    case "Wisconsin":
    case "Pennsylvania":
    case "Arizona":
    case "New Mexico":
      offset = 2;
      break;
    case "Oregon":
    case "Washington":
    case "Colorado":
    case "Minnesota":
    case "Wyoming":
      offset = 3.5;
      break;
    case "Oklahoma":
    case "Nebraska":
    case "Florida":
    case "North Carolina":
      offset = 4.25;
      break;
    case "California":
    case "Kansas":
    case "South Dakota":
    case "North Dakota":
    case "Tennessee":
    case "Michigan":
    case "Kentucky":
    case "Virginia":
      offset = 4;
      break;
    case "Utah":
    case "Arkansas":
    case "Louisiana":
    case "Mississippi":
    case "Alabama":
    case "Georgia":
    case "South Carolina":
    case "West Virginia":
    case "Ohio":
    case "Maryland":
      offset = 1.5;
      break;
    case "Indiana":
    case "Massachusetts":
    case "Maine":
      offset = 1;
      break;
    default:
      break;
  }

  if (selectClass) {
    selectClass.style.setProperty("--x", translateXvw - offset + "vw");
    selectClass.style.setProperty("--y", translateYvh + "vh");
  }
}

/*
function createBrushSelector(svg) {
  svg.call(d3.brush().on("start brush end", brushed));

  // Raise dots and everything after overlay
  svg.selectAll(".dots, .overlay ~ *").raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll("circle").classed("selected", (d) =>
    isCommitSelected(selection, d)
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}*/
