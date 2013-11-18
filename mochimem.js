/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var CONFIG = {
  colors: {
    resident: "#1f77b4",
    vsize: "#9467bd",
    heapAllocated: "#d62728",
    largestContiguousVMBlock: "#8c564b"
  }
};

function resetDisplay() {
  document.getElementById("main").innerHTML = '<div id="graph"></div><div id="slider"></div>';
  document.getElementById("legend").innerHTML = "";
}

function showMessage(message) {
  document.getElementById("main").style.display = "none";
  document.getElementById("message").style = "";
  document.getElementById("message").innerHTML = message;
}

function hideMessage() {
  document.getElementById("message").style.display = "none";
  document.getElementById("main").style = "";
}

function visualize(url) {
  var xhr = new XMLHttpRequest();

  xhr.onload = function () {
    if (xhr.status !== 200) {
      showMessage("<span style='color: #d62728;'>Error</span>");
      return;
    }

    showMessage("Loading...");
    renderStats(extractStats(xhr.response));
  };

  xhr.open("GET", url, true);
  xhr.send(null);
}

function formatBytes(bytes) {
  if (bytes === 0)
    return "";
  var mb = bytes / (1024 * 1024);
  if (mb > 1024)
    return (mb / 1024).toFixed(2) + " GB";
  return mb.toFixed(2) + " MB";
}

function renderStats(stats) {
  var supported = stats.supported;
  var tests = stats.tests;
  var series = [];

  // Extract data series for each of the reported stats.
  for (var instrument in supported) {
    if (!supported[instrument])
      continue;

    var data = [];
    for (var i = 0; i < tests.length; i++)
      data.push({ x: i, y: tests[i].memory[instrument] });

    series.push({
      color: CONFIG.colors[instrument] || "black",
      name: instrument,
      data: data
    });
  }

  resetDisplay();

  // FIXME: I can't figure out an elegant way to use CSS and DOM to figure
  // out the graph width.
  var graph = new Rickshaw.Graph({
    element: document.getElementById("graph"),
    width: document.body.offsetWidth - 80,
    height: window.innerHeight - document.getElementById("url").offsetHeight - 125,
    renderer: "line",
    series: series
  });

  var yAxis = new Rickshaw.Graph.Axis.Y({
    graph: graph,
    tickFormat: formatBytes
  });

  var slider = new Rickshaw.Graph.RangeSlider({
    graph: graph,
    element: document.getElementById("slider"),
  });

  var hoverDetail = new Rickshaw.Graph.HoverDetail({
    graph: graph,
    xFormatter: function (x) { return tests[x].url; },
    yFormatter: formatBytes
  });

  var legend = new Rickshaw.Graph.Legend({
    graph: graph,
    element: document.getElementById("legend")
  });

  var shelving = new Rickshaw.Graph.Behavior.Series.Toggle({
    graph: graph,
    legend: legend
  });

  graph.render();
  hideMessage();
}

function extractStats(buf) {
  var pos = 0, end = 0;
  var tests = [];
  var supported = {};
  var mem = {};

  while (pos < buf.length) {
    if ((end = buf.indexOf("\n", pos)) === -1)
      end = buf.indexOf("\r\n", pos);
    var line = buf.substring(pos, end);
    pos = end + 1;

    // Accumulate all memory stats until we see a TEST-END.
    //
    // N.B. This is so much faster than regexps it's not even funny.
    var i, j;
    if ((i = line.indexOf("MEMORY STAT ")) !== -1) {
      // "MEMORY STAT " .length == 12
      // " after test: ".length == 13
      //
      // If we don't support the stat on the particular platform, record a
      // NaN. We only see such messages on the first test.
      if ((j = line.indexOf(" after test: ", i + 12)) !== -1) {
        mem[line.substring(i + 12, j)] = parseInt(line.substr(j + 13));
        if (tests.length === 0)
          supported[line.substring(i + 12, j)] = true;
      } else if (tests.length === 0 && (j = line.indexOf(" not supported")) !== -1) {
        supported[line.substring(i + 12, j)] = false;
      }
    } else if ((i = line.indexOf("TEST-END | ")) !== -1) {
      // "TEST-END | "  .length == 11
      tests.push({ url: line.substring(i + 11, line.indexOf(" |", i + 11)),
                   memory: mem });
      mem = {};
    }
  }

  return { supported: supported, tests: tests };
}

function onTypeURL(e)
{
  if (e.keyCode === 13) {
    var url = document.getElementById("url").value;
    visualize(url);
  }
}
