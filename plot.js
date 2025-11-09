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

        //console.log(event.currentTarget);
        if (selectedState.length == 0) {
          selectedState.push(event.currentTarget);
        }
        if (isSelected) {
          if (event.currentTarget.classList.contains("selected")) {
            event.currentTarget.classList.remove("selected");
            isSelected = false;
            selectState();
            selectedState.pop();
          }
        } else {
          if (!event.currentTarget.classList.contains("selected")) {
            event.currentTarget.classList.add("selected");
            isSelected = true;
            selectState();
            moveStateToLeft(selectedState[0]);
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
      subplot(filtered);
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

function moveStateToLeft(selection) {
  const container = d3.select("#chart");
  const containerWidth = container.node().getBoundingClientRect().width;

  // Calculate target position as percentage of container
  const targetX = containerWidth * 0.1; // 10% from left
  const targetY = 300; // Fixed y or calculate dynamically

  // Get state's bounding box
  const bbox = selection.getBBox();
  const currentCenterX = bbox.x + bbox.width / 2;
  const currentCenterY = bbox.y + bbox.height / 2;

  const translateX = targetX - currentCenterX;
  const translateY = targetY - currentCenterY;

  const selectClass = document.querySelector(".selected");

  let offset = 0;
  switch (plotName) {
    case "California":
      offset = 75;
      break;
    case "Montana":
    case "Texas":
      offset = 100;
      break;
    case "Nevada":
    case "Idaho":
    case "New York":
      offset = 50;
      break;
    case "Utah":
      offset = 30;
      break;
    case "Arizona":
    case "New Mexico":
      offset = 40;
      break;
    case "Oregon":
    case "Washington":
    case "Colorado":
    case "Minnesota":
    case "Wyoming":
      offset = 60;
      break;
    case "Oklahoma":
    case "Nebraska":
    case "Florida":
    case "North Carolina":
      offset = 80;
      break;
    case "Kansas":
    case "South Dakota":
    case "North Dakota":
    case "Tennessee":
    case "Michigan":
    case "Kentucky":
    case "Virginia":
      offset = 70;
      break;
    case "Iowa":
    case "Missouri":
      offset = 50;
      break;
    case "Arkansas":
    case "Louisiana":
    case "Mississippi":
      offset = 30;
      break;
    case "Illinois":
    case "Wisconsin":
    case "Pennsylvania":
      offset = 40;
      break;
    case "Indiana":
    case "Massachusetts":
    case "Maine":
      offset = 20;
      break;
    case "Alabama":
    case "Georgia":
    case "South Carolina":
    case "West Virginia":
    case "Ohio":
    case "Maryland":
      offset = 30;
      break;
    default:
      break;
  }

  selectClass.style.setProperty("--x", translateX - offset + "px");
  selectClass.style.setProperty("--y", translateY + "px");
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
