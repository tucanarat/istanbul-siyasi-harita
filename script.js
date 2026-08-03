/* ==========================================================================
   Istanbul District Political Map — script.js
   Vanilla JS. No frameworks, no build step.

   Responsibilities:
   1. Load map.svg and data.json
   2. Colour districts according to the active view (2024 election / current)
   3. Draw the diagonal "mayor arrested" hatch overlay (current view)
   4. Handle hover / click / keyboard interaction + the detail panel
   5. Build the legend dynamically from whatever categories are in use
   6. District search box + zoom/pan controls
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------
   * 1. Configuration — edit this section to restyle or extend the map
   * ------------------------------------------------------------------ */

  // Editorial party palette. Add a new party by adding one line here;
  // no other code needs to change. Keys must match the "party2024" /
  // "currentParty" strings used in data.json exactly.
  var PARTY_COLORS = {
    "AKP": "#F39C12",
    "CHP": "#D32F2F",
    "DEM": "#6A1B9A",
    "MHP": "#C62828",
    "İYİ Parti": "#29B6F6",
    "YRP": "#00695C",
    "YENİ Parti": "#7B1FA2",
    "Independent": "#616161",
    // Special governance states (not political parties, but need a
    // colour on the "current control" map):
    "Kayyum": "#37474F",      // state-appointed trustee administers the district
    "Belirsiz": "#9E9E9E",    // acting mayor not yet confirmed
    "__nodata__": "#D9D9D9"
  };

  // Human-readable labels for the legend / detail panel.
  var PARTY_LABELS = {
    "Kayyum": "Kayyum atandı",
    "Belirsiz": "Belirsiz"
  };

  var JUDICIAL_LABELS = {
    "arrested": "Başkan tutuklu",
    "released": "Başkan tahliye edildi",
    "suspended": "Başkan görevden uzaklaştırıldı",
    "none": ""
  };

  // Map-overlay flags for the "current control" view — each judicial status
  // that should be visually flagged on the map gets its own hatch pattern
  // (defined in injectHatchPattern) so it stays distinguishable from the
  // others while the underlying party colour remains visible.
  var JUDICIAL_FLAG = {
    "arrested": {
      pattern: "hatchArrested",
      ariaSuffix: " — belediye başkanı tutuklu",
      legendLabel: "Belediye başkanı tutuklu",
      legendClass: "hatch-arrested"
    },
    "released": {
      pattern: "hatchReleased",
      ariaSuffix: " — belediye başkanı tahliye edildi",
      legendLabel: "Belediye başkanı tahliye edildi",
      legendClass: "hatch-released"
    }
  };

  var DATA_URL = "data.json";
  var MAP_URL = "assets/map.svg";

  // Zoom behaviour
  var ZOOM_MIN = 1;
  var ZOOM_MAX = 4;
  var ZOOM_STEP = 1.4;
  var SEARCH_ZOOM_LEVEL = 2.4;

  /* ------------------------------------------------------------------
   * 2. State
   * ------------------------------------------------------------------ */

  var state = {
    view: "election2024",   // "election2024" | "current"
    records: [],
    byDistrict: {},
    selected: null,
    svgRoot: null
  };

  var zoomState = { scale: 1, x: 0, y: 0 };
  var drag = { active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0, pointerId: 0 };
  var activePointers = {};   // pointerId -> {x, y} (mapFrame-relative), for pinch tracking
  var pinch = { active: false, startDist: 0 };

  /* ------------------------------------------------------------------
   * 3. DOM refs
   * ------------------------------------------------------------------ */

  var els = {};

  function cacheEls() {
    els.mapFrame = document.getElementById("mapFrame");
    els.mapHolder = document.getElementById("mapHolder");
    els.mapLoading = document.getElementById("mapLoading");
    els.legend = document.getElementById("legend");
    els.tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
    els.detail = document.getElementById("detail");
    els.detailEmpty = document.getElementById("detailEmpty");
    els.detailCard = document.getElementById("detailCard");
    els.detailClose = document.getElementById("detailClose");
    els.detailTitle = document.getElementById("detailTitle");
    els.detailMayor = document.getElementById("detailMayor");
    els.detailLines = document.getElementById("detailLines");
    els.detailNote = document.getElementById("detailNote");
    els.zoomIn = document.getElementById("zoomIn");
    els.zoomOut = document.getElementById("zoomOut");
    els.zoomReset = document.getElementById("zoomReset");
    els.districtSearch = document.getElementById("districtSearch");
    els.districtList = document.getElementById("districtList");
  }

  /* ------------------------------------------------------------------
   * 4. Boot
   * ------------------------------------------------------------------ */

  function init() {
    cacheEls();
    attachTabHandlers();
    attachDetailHandlers();
    attachZoomHandlers();
    attachSearchHandlers();

    Promise.all([loadData(), loadMap()])
      .then(function (results) {
        state.records = results[0];
        state.byDistrict = {};
        state.records.forEach(function (r) {
          state.byDistrict[r.district] = r;
        });

        els.mapLoading.hidden = true;
        attachDistrictHandlers();
        injectHatchPattern();
        buildDatalist();
        renderView();
      })
      .catch(function (err) {
        els.mapLoading.textContent = "Harita yüklenemedi.";
        console.error(err);
      });
  }

  function loadData() {
    return fetch(DATA_URL).then(function (res) {
      if (!res.ok) throw new Error("data.json request failed: " + res.status);
      return res.json();
    });
  }

  function loadMap() {
    return fetch(MAP_URL).then(function (res) {
      if (!res.ok) throw new Error("map.svg request failed: " + res.status);
      return res.text();
    }).then(function (svgText) {
      els.mapHolder.innerHTML = svgText;
      state.svgRoot = els.mapHolder.querySelector("svg");
      return true;
    });
  }

  /* ------------------------------------------------------------------
   * 5. Hatch pattern (SVG <defs>) — used to flag arrested mayors
   * ------------------------------------------------------------------ */

  function injectHatchPattern() {
    var svgNS = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(svgNS, "defs");
    defs.innerHTML =
      '<pattern id="hatchArrested" patternUnits="userSpaceOnUse" ' +
      'width="5" height="5" patternTransform="rotate(45)">' +
      '<rect width="5" height="5" fill="none"></rect>' +
      '<line x1="0" y1="0" x2="0" y2="5" stroke="#000000" ' +
      'stroke-opacity="0.32" stroke-width="1.4"></line>' +
      '</pattern>' +
      '<pattern id="hatchReleased" patternUnits="userSpaceOnUse" ' +
      'width="5" height="5" patternTransform="rotate(45)">' +
      '<rect width="5" height="5" fill="none"></rect>' +
      '<line x1="0" y1="0" x2="0" y2="5" stroke="#00E5FF" ' +
      'stroke-opacity="1" stroke-width="1.4"></line>' +
      '</pattern>';
    state.svgRoot.insertBefore(defs, state.svgRoot.firstChild);
  }

  /* ------------------------------------------------------------------
   * 6. View → colour logic
   * ------------------------------------------------------------------ */

  // Returns { colorKey, color, flag } for a record under the given view.
  // flag is a JUDICIAL_FLAG key ("arrested" / "released") or null.
  function categorize(record, view) {
    if (view === "election2024") {
      var key = record.party2024 || "__nodata__";
      return { colorKey: key, color: colorFor(key), flag: null };
    }

    // "current" view — also flags arrested/released mayors with a hatch overlay
    var ckey = record.currentParty || "__nodata__";
    return {
      colorKey: ckey,
      color: colorFor(ckey),
      flag: JUDICIAL_FLAG[record.judicialStatus] ? record.judicialStatus : null
    };
  }

  function colorFor(key) {
    return PARTY_COLORS[key] || PARTY_COLORS.__nodata__;
  }

  function labelFor(key) {
    return PARTY_LABELS[key] || key;
  }

  /* ------------------------------------------------------------------
   * 7. Rendering
   * ------------------------------------------------------------------ */

  function renderView() {
    if (!state.svgRoot) return;

    // Remove previous hatch overlays
    var oldHatches = state.svgRoot.querySelectorAll(".district-hatch");
    oldHatches.forEach(function (n) { n.remove(); });

    var svgNS = "http://www.w3.org/2000/svg";

    state.records.forEach(function (record) {
      var path = state.svgRoot.getElementById(record.district);
      if (!path) return;

      var cat = categorize(record, state.view);
      var flagInfo = cat.flag ? JUDICIAL_FLAG[cat.flag] : null;
      path.style.fill = cat.color;
      path.setAttribute(
        "aria-label",
        record.district + (flagInfo ? flagInfo.ariaSuffix : "")
      );

      if (flagInfo) {
        // Use an independent cloned <path> (same "d") rather than <use>.
        // A <use> that references the original path would inherit that
        // path's own inline fill (which wins over the fill set on the
        // <use> itself), so the hatch pattern would never actually
        // render — and, being on top, it would silently swallow clicks
        // meant for the district underneath. A plain cloned path avoids
        // both problems; pointer-events is also disabled explicitly.
        var hatchPath = document.createElementNS(svgNS, "path");
        hatchPath.setAttribute("d", path.getAttribute("d"));
        hatchPath.setAttribute("class", "district-hatch");
        hatchPath.style.fill = "url(#" + flagInfo.pattern + ")";
        hatchPath.style.stroke = "none";
        hatchPath.style.pointerEvents = "none";
        state.svgRoot.appendChild(hatchPath);
      }
    });

    renderLegend();
  }

  function cssEscapeId(id) {
    return window.CSS && CSS.escape ? CSS.escape(id) : id;
  }

  function renderLegend() {
    var counts = {};   // colorKey -> count
    var order = [];
    var flagsSeen = {}; // JUDICIAL_FLAG key -> true

    state.records.forEach(function (record) {
      var cat = categorize(record, state.view);
      if (!counts[cat.colorKey]) {
        counts[cat.colorKey] = 0;
        order.push(cat.colorKey);
      }
      counts[cat.colorKey]++;
      if (cat.flag) flagsSeen[cat.flag] = true;
    });

    // Sort categories by frequency, descending.
    order.sort(function (a, b) {
      return counts[b] - counts[a];
    });

    var html = "";
    order.forEach(function (key) {
      var color = colorFor(key);
      var label = labelFor(key);
      html +=
        '<span class="legend-item"><span class="legend-swatch" style="background:' +
        color + '"></span>' + escapeHtml(label) + "</span>";
    });

    Object.keys(JUDICIAL_FLAG).forEach(function (flag) {
      if (!flagsSeen[flag]) return;
      var info = JUDICIAL_FLAG[flag];
      html +=
        '<span class="legend-item"><span class="legend-swatch ' + info.legendClass +
        '"></span>' + escapeHtml(info.legendLabel) + "</span>";
    });

    els.legend.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ------------------------------------------------------------------
   * 8. Tabs (segmented control) with 200ms fade transition
   * ------------------------------------------------------------------ */

  function attachTabHandlers() {
    els.tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        selectTab(tab);
      });
      tab.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          var dir = e.key === "ArrowRight" ? 1 : -1;
          var next = els.tabs[(i + dir + els.tabs.length) % els.tabs.length];
          next.focus();
          selectTab(next);
        }
      });
    });
  }

  function selectTab(tab) {
    var view = tab.getAttribute("data-view");
    if (view === state.view) return;

    els.tabs.forEach(function (t) {
      var active = t === tab;
      t.setAttribute("aria-selected", active ? "true" : "false");
      t.tabIndex = active ? 0 : -1;
    });

    state.view = view;

    var holder = els.mapHolder;
    holder.classList.add("fade");
    window.setTimeout(function () {
      renderView();
      holder.classList.remove("fade");
    }, 200);
  }

  /* ------------------------------------------------------------------
   * 9. District interaction: hover + click/keyboard → detail panel
   * ------------------------------------------------------------------ */

  function attachDistrictHandlers() {
    var paths = state.svgRoot.querySelectorAll(".district");
    paths.forEach(function (path) {
      path.addEventListener("mouseenter", function () {
        path.classList.add("is-hovered");
      });
      path.addEventListener("mouseleave", function () {
        path.classList.remove("is-hovered");
      });
      path.addEventListener("click", function () {
        if (drag.moved) { drag.moved = false; return; }
        openDetail(path.getAttribute("data-district"), path);
      });
      path.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail(path.getAttribute("data-district"), path);
        }
      });
    });
  }

  function attachDetailHandlers() {
    els.detailClose.addEventListener("click", closeDetail);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDetail();
    });
  }

  function openDetail(districtName, pathEl) {
    var record = state.byDistrict[districtName];
    if (!record) return;

    // Update selection highlight
    if (state.svgRoot) {
      var prev = state.svgRoot.querySelector(".district.is-selected");
      if (prev) prev.classList.remove("is-selected");
    }
    if (pathEl) pathEl.classList.add("is-selected");
    state.selected = districtName;

    els.detailEmpty.hidden = true;
    els.detailCard.hidden = false;

    els.detailTitle.textContent = record.district;
    els.detailMayor.textContent = record.mayor ? record.mayor : "";

    var linesHtml = "";
    linesHtml += detailRow("2024", record.party2024 || "—");
    linesHtml += detailRow(
      "Mevcut",
      record.currentParty ? labelFor(record.currentParty) : "—"
    );

    var statusText = record.changed
      ? record.party2024 + " → " + labelFor(record.currentParty) + " (değişiklik oldu)"
      : "2024'ten bu yana değişiklik yok";

    var judicialText = JUDICIAL_LABELS[record.judicialStatus] || "";

    var statusHtml = '<span class="detail-row detail-status">' +
      escapeHtml(statusText) + "</span>";

    if (judicialText) {
      statusHtml += '<span class="detail-row detail-status is-flag">' +
        escapeHtml(judicialText) + "</span>";
    }

    els.detailLines.innerHTML = linesHtml + statusHtml;

    if (record.note) {
      els.detailNote.textContent = record.note;
      els.detailNote.hidden = false;
    } else {
      els.detailNote.textContent = "";
      els.detailNote.hidden = true;
    }

    els.detailCard.focus();
  }

  function detailRow(label, value) {
    return '<span class="detail-row"><dt>' + escapeHtml(label) +
      "</dt><dd>" + escapeHtml(value) + "</dd></span>";
  }

  function closeDetail() {
    if (state.svgRoot) {
      var prev = state.svgRoot.querySelector(".district.is-selected");
      if (prev) prev.classList.remove("is-selected");
    }
    state.selected = null;
    els.detailCard.hidden = true;
    els.detailEmpty.hidden = false;
  }

  /* ------------------------------------------------------------------
   * 10. Zoom & pan
   * ------------------------------------------------------------------ */

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function applyTransform() {
    els.mapHolder.style.transform =
      "translate(" + zoomState.x + "px, " + zoomState.y + "px) scale(" + zoomState.scale + ")";
    els.mapFrame.classList.toggle("is-zoomed", zoomState.scale > 1.001);
  }

  // Zoom so that the base-space point (bx, by) stays under screen point (mx, my).
  function zoomAt(mx, my, factor) {
    var w = els.mapHolder.clientWidth;
    var h = els.mapHolder.clientHeight;
    if (!w || !h) return;
    var ox = w / 2;
    var oy = h / 2;

    // Base-space point currently under (mx, my).
    var bx = ox + (mx - ox - zoomState.x) / zoomState.scale;
    var by = oy + (my - oy - zoomState.y) / zoomState.scale;

    var newScale = clamp(zoomState.scale * factor, ZOOM_MIN, ZOOM_MAX);

    zoomState.x = mx - ox - newScale * (bx - ox);
    zoomState.y = my - oy - newScale * (by - oy);
    zoomState.scale = newScale;

    if (zoomState.scale <= 1.001) {
      zoomState.scale = 1;
      zoomState.x = 0;
      zoomState.y = 0;
    }
    applyTransform();
  }

  function centerOn(baseX, baseY, scale) {
    var w = els.mapHolder.clientWidth;
    var h = els.mapHolder.clientHeight;
    if (!w || !h) return;
    var ox = w / 2;
    var oy = h / 2;
    zoomState.scale = clamp(scale, ZOOM_MIN, ZOOM_MAX);
    zoomState.x = -zoomState.scale * (baseX - ox);
    zoomState.y = -zoomState.scale * (baseY - oy);
    applyTransform();
  }

  function zoomToDistrict(path) {
    if (!path || !path.getBBox || !state.svgRoot.viewBox) return;
    var bbox = path.getBBox();
    var vb = state.svgRoot.viewBox.baseVal;
    var w = els.mapHolder.clientWidth;
    var h = els.mapHolder.clientHeight;
    if (!w || !h || !vb.width || !vb.height) return;

    var fx = (bbox.x + bbox.width / 2 - vb.x) / vb.width;
    var fy = (bbox.y + bbox.height / 2 - vb.y) / vb.height;
    centerOn(fx * w, fy * h, SEARCH_ZOOM_LEVEL);
  }

  function attachZoomHandlers() {
    els.zoomIn.addEventListener("click", function () {
      var w = els.mapHolder.clientWidth, h = els.mapHolder.clientHeight;
      zoomAt(w / 2, h / 2, ZOOM_STEP);
    });
    els.zoomOut.addEventListener("click", function () {
      var w = els.mapHolder.clientWidth, h = els.mapHolder.clientHeight;
      zoomAt(w / 2, h / 2, 1 / ZOOM_STEP);
    });
    els.zoomReset.addEventListener("click", function () {
      zoomState.scale = 1;
      zoomState.x = 0;
      zoomState.y = 0;
      applyTransform();
    });

    els.mapFrame.addEventListener("wheel", function (e) {
      e.preventDefault();
      var rect = els.mapFrame.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(mx, my, factor);
    }, { passive: false });

    els.mapFrame.addEventListener("pointerdown", function (e) {
      activePointers[e.pointerId] = framePoint(e);

      var count = Object.keys(activePointers).length;

      if (count === 2) {
        // Second finger landed — switch from panning to pinch-zoom.
        // Capture both pointers so we keep getting their moves even if a
        // finger strays outside the frame bounds mid-gesture.
        Object.keys(activePointers).forEach(function (id) {
          try { els.mapFrame.setPointerCapture(Number(id)); } catch (err) {}
        });
        drag.active = false;
        drag.moved = true; // suppress the click that would otherwise open a district
        els.mapFrame.classList.remove("is-dragging");
        els.mapHolder.classList.remove("is-panning");
        pinch.active = true;
        pinch.startDist = pointerDistance();
        return;
      }

      if (count > 2 || pinch.active) return;

      if (zoomState.scale <= 1.001) return;
      drag.active = true;
      drag.moved = false;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.originX = zoomState.x;
      drag.originY = zoomState.y;
      drag.pointerId = e.pointerId;
      els.mapFrame.classList.add("is-dragging");
      els.mapHolder.classList.add("is-panning");
      // Pointer capture is deferred to the first real movement (below) —
      // capturing here would retarget the eventual "click" to mapFrame
      // instead of the district path underneath, breaking taps while zoomed.
    });

    els.mapFrame.addEventListener("pointermove", function (e) {
      if (activePointers[e.pointerId]) activePointers[e.pointerId] = framePoint(e);

      if (pinch.active && Object.keys(activePointers).length >= 2) {
        var dist = pointerDistance();
        if (pinch.startDist > 0 && dist > 0) {
          var mid = pointerMidpoint();
          zoomAt(mid.x, mid.y, dist / pinch.startDist);
        }
        pinch.startDist = dist;
        return;
      }

      if (!drag.active) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        drag.moved = true;
        try { els.mapFrame.setPointerCapture(drag.pointerId); } catch (err) {}
      }
      zoomState.x = drag.originX + dx;
      zoomState.y = drag.originY + dy;
      applyTransform();
    });

    function endDrag(e) {
      if (e) delete activePointers[e.pointerId];
      if (Object.keys(activePointers).length < 2) pinch.active = false;
      drag.active = false;
      els.mapFrame.classList.remove("is-dragging");
      els.mapHolder.classList.remove("is-panning");
    }
    els.mapFrame.addEventListener("pointerup", endDrag);
    els.mapFrame.addEventListener("pointercancel", endDrag);
  }

  function framePoint(e) {
    var rect = els.mapFrame.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pointerDistance() {
    var ids = Object.keys(activePointers);
    var a = activePointers[ids[0]], b = activePointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerMidpoint() {
    var ids = Object.keys(activePointers);
    var a = activePointers[ids[0]], b = activePointers[ids[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* ------------------------------------------------------------------
   * 11. District search
   * ------------------------------------------------------------------ */

  function buildDatalist() {
    var names = state.records.map(function (r) { return r.district; }).sort(function (a, b) {
      return a.localeCompare(b, "tr");
    });
    var html = "";
    names.forEach(function (name) {
      html += '<option value="' + escapeHtml(name) + '"></option>';
    });
    els.districtList.innerHTML = html;
  }

  function goToDistrictByName(name) {
    var record = state.byDistrict[name];
    if (!record) return false;
    var path = state.svgRoot.getElementById(name);
    openDetail(name, path);
    zoomToDistrict(path);
    return true;
  }

  function findDistrictMatch(query) {
    var q = query.trim().toLocaleLowerCase("tr");
    if (!q) return null;
    var exact = state.records.find(function (r) {
      return r.district.toLocaleLowerCase("tr") === q;
    });
    if (exact) return exact;
    var starts = state.records.find(function (r) {
      return r.district.toLocaleLowerCase("tr").indexOf(q) === 0;
    });
    if (starts) return starts;
    return state.records.find(function (r) {
      return r.district.toLocaleLowerCase("tr").indexOf(q) !== -1;
    }) || null;
  }

  function attachSearchHandlers() {
    els.districtSearch.addEventListener("input", function () {
      var exact = state.records.find(function (r) {
        return r.district.toLocaleLowerCase("tr") === els.districtSearch.value.trim().toLocaleLowerCase("tr");
      });
      if (exact) goToDistrictByName(exact.district);
    });

    els.districtSearch.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var match = findDistrictMatch(els.districtSearch.value);
      if (match) {
        els.districtSearch.value = match.district;
        goToDistrictByName(match.district);
      }
    });
  }

  /* ------------------------------------------------------------------
   * 12. Go
   * ------------------------------------------------------------------ */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
