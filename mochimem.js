/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Singleton graph instance.
var graph;

function formatBytes(bytes) {
  if (bytes === 0)
    return "";
  var mb = bytes / (1024 * 1024);
  if (mb > 1024) {
    var gb = mb / 1024;
    if (gb > 1024) {
        var tb = gb / 1024;
        return tb.toFixed(2) + " TB";
    }
    return gb.toFixed(2) + " GB";
  }
  return mb.toFixed(2) + " MB";
}

// Custom hover.
var Hover = Rickshaw.Class.create(Rickshaw.Graph.HoverDetail, {
  render: function (args) {
    document.getElementById("test-name").innerHTML = args.formattedXValue;

    var details = args.detail;
    var maxX = 0;
    for (var i = 0; i < details.length; i++)
      maxX = Math.max(maxX, details[i].value.x);

    for (var i = 0; i < details.length; i++) {
      var d = details[i];

      if (d.value.x < maxX) {
        graph._hoverValues[d.name].innerHTML = "N/A";
        continue;
      }

      // Display the y value in the legend.
      graph._hoverValues[d.name].innerHTML = d.formattedYValue;

      // Display a dot on every line.
      var dot = document.createElement("div");
      dot.className = "dot";
      dot.style.top = graph.y(d.value.y0 + d.value.y) + "px";
      dot.style.borderColor = d.series.color;

      this.element.appendChild(dot);

      dot.className = "dot active";

      this.show();
    }
  },

  update: function (e) {
    if (this._hoverHold)
      return;
    Rickshaw.Graph.HoverDetail.prototype.update.call(this, e);
  },

  hide: function () {
    if (this._hoverHold)
      return;
    document.getElementById("test-name").classList.add("inactive");
    Rickshaw.Graph.HoverDetail.prototype.hide.call(this);
  },

  show: function () {
    if (this._hoverHold)
      return;
    document.getElementById("test-name").classList.remove("inactive");
    Rickshaw.Graph.HoverDetail.prototype.show.call(this);
  },

  _addListeners: function() {
    Rickshaw.Graph.HoverDetail.prototype._addListeners.call(this);

    // Hide held points when sliding the viewport.
    this.graph.onUpdate(function () {
      this._hoverHold = false;
      this.hide();
    }.bind(this));

    // Hold on click.
    this.graph.element.addEventListener(
      "click",
      function (e) {
        this.visible = true;
        this.update(e);
        this._hoverHold = !this._hoverHold;
        if (!this._hoverHold)
          this.update(e);
      }.bind(this),
      false
    );
  }
});

function showMessage(message) {
  document.getElementById("main").style.display = "none";
  document.getElementById("message").style = "";
  document.getElementById("message").innerHTML = message;
}

function showError(message) {
    showMessage('<h1 style="color: #d62728;">' + message + "</h1>");
}

function hideMessage() {
  document.getElementById("message").style.display = "none";
  document.getElementById("main").style = "";
}

function downloadLog(xhrs, url, idx, stats) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4)
      return;

    if (xhr.status !== 200) {
      // Cancel all existing downloads
      for (var i = 0; i < xhrs.length; i++)
        xhrs[i].abort();

      console.log("Failed to load log `" + url + "'" + " got: " + xhr.status);
      showError("Failed to load log");
      return;
    }

    stats[idx] = extractStats(xhr.response);

    var allDone = true;
    for (var i = 0; i < stats.length; i++)
      allDone = allDone && stats[i] !== null;
    if (allDone) {
      // Sort by number of tests run.
      stats = stats.sort(function (s1, s2) {
        return s2.tests.length - s1.tests.length;
      });
      if (validateStats(stats))
        renderStats(stats);
    }
  };

  xhr.open("GET", url, true);
  xhr.send(null);
  xhrs.push(xhr);
}

function visualize(urls) {
  var xhrs = [];
  var stats = [];
  for (var i = 0; i < urls.length; i++)
    stats.push(null);
  for (var i = 0; i < urls.length; i++)
    downloadLog(xhrs, urls[i], i, stats);
}

function validateStats(stats) {
  var tests0 = stats[0].tests;

  // Make sure all runs prefix match on the names.
  for (var n = 0; n < stats.length; n++) {
    var tests = stats[n].tests;
    for (var i = 0; i < tests.length; i++) {
      if (tests0[i].url !== tests[i].url) {
        showError("All logs must agree on names of the tests run.")
        return false;
      }
    }
  }
  return true;
}

function computeGraphHeight() {
  var mainContainer = document.getElementById("main");
  mainContainer.style.bottom = "0";
  mainContainer.style.bottom = document.getElementById("panel").offsetHeight + "px";
  return mainContainer.offsetHeight - 80;
}

function renderStats(stats) {
  function h(s) {
    var c = 0;
    for (var i = 0; i < s.length; i++)
      c += s.charCodeAt(i);
    return c;
  }

  var palette = new Rickshaw.Color.Palette({ scheme: "colorwheel" });
  var series = [];

  for (var n = 0; n < stats.length; n++) {
    var supported = stats[n].supported;
    var tests = stats[n].tests;

    if (Object.keys(stats[n].supported).length === 0) {
      showError("No memory stats found");
      return;
    }

    // Extract data series for each of the reported stats.
    for (var instrument in supported) {
      if (!supported[instrument])
        continue;

      var data = [];
      for (var i = 0; i < tests.length; i++)
        data.push({ x: i, y: tests[i].memory[instrument] });

      series.push({
        color: palette.color(h(n + instrument)),
        name: stats.length > 1 ? n + ":" + instrument : instrument,
        data: data
      });
    }
  }

  graph = new Rickshaw.Graph({
    element: document.getElementById("graph"),
    width: document.getElementById("main").offsetWidth,
    height: computeGraphHeight(),
    renderer: "line",
    interpolation: "linear",
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

  var hoverDetail = new Hover({
    graph: graph,
    xFormatter: function (x) { return stats[0].tests[x].url; },
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

  var hoverValues = {};
  var hoverLines = legend.lines;
  for (var i = 0; i < hoverLines.length; i++) {
    var hoverValue = document.createElement("div");
    hoverValue.className = "hover-value";
    hoverValue.innerHTML = "N/A"
    hoverLines[i].element.appendChild(hoverValue);
    hoverValues[hoverLines[i].series.name] = hoverValue;
  }
  graph._hoverValues = hoverValues;

  // Recompute the height since the the panel height may have changed.
  graph.setSize({ width: graph.width, height: computeGraphHeight() });
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

function addLogControls(url) {
  var logControls = document.createElement("div");
  logControls.className = "log-controls";
  logControls.innerHTML =
    '<input type="text" onkeypress="onTypeLogURL(event);" value="' +
    (url ? url : "") + '"></input>';
  document.getElementById("controls").appendChild(logControls);

  if (graph) {
    graph.setSize({ width: graph.width, height: computeGraphHeight() });
    graph.render();
  }
}

function onTypeLogURL(e) {
  if (e.keyCode === 13) {
    var inputs = document.getElementsByTagName("input");
    var query = "?";
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value)
        query += "url=" + escape(inputs[i].value) + "&";
    }

    window.location.search = query;
  }
}

function checkLogURLFromQuery() {
  if (window.location.search.length > 1) {
    var urls = [];
    var pairs = window.location.search.substr(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i].split("=");
      var k = unescape(p[0]);
      if (k === "url") {
        var url = unescape(p[1]);
        urls.push(url);

        if (urls.length === 1)
          document.getElementById("first-log").value = url;
        else
          addLogControls(url);
      }
    }

    if (urls.length > 0)
      visualize(urls);
    else
      showError("No URLs given");

    return;
  }

  showMessage("<h1>Please enter the TBPL full log URL(s) to mochitest run(s) below.</h1>" +
              "<p>Look for the &ldquo;Download Full Log&rdquo; link in getParsedLog.php</p>");
}
