/**
 * Home page (index): theme toggle, decorative “terminal” intro, loads wall data,
 * builds filters, paginates the list, and exports CSV.
 */
(() => {
  /** @param {string} id */
  const $ = (id) => document.getElementById(id);

  /** Shared text collator for the table sort modes. */
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  /** Full dataset after fetch; each row may gain `.industry` from optional map. */
  let data = [];
  /** Subset after search/filter/sort; used for pagination and export. */
  let filtered = [];
  /** Rows per results page. */
  const PAGE = 100;
  /** RequestAnimationFrame id for coalescing repeated UI updates. */
  let renderFrame = 0;
  /** Debounce timer for search input. */
  let searchTimer = 0;
  /** Whether filters or sort changed since the last recompute. */
  let filteredDirty = true;

  /** UI state: search text, filters, sort key, current page. */
  const state = { q: "", status: "all", tld: "", industry: "", sort: "az", page: 1 };

  /** Cached DOM nodes. */
  const el = {
    themeBtn: $("themeBtn"),
    session: $("session"),
    list: $("list"),
    stTotal: $("stTotal"),
    stNo: $("stNo"),
    stP: $("stP"),
    lastChecked: $("lastChecked"),
    tldSel: $("tldSel"),
    indSel: $("indSel"),
    sortSel: $("sortSel"),
    q: $("q"),
    controls: $("controls"),
    filterToggle: $("filterToggle"),
    statusSeg: $("statusSeg"),
    prev: $("prev"),
    next: $("next"),
    resultCount: $("resultCount"),
    pageLabel: $("pageLabel"),
    exportBtn: $("exportBtn"),
    resultsTable: document.querySelector(".results-table"),
  };

  /** Schedules a single render on the next animation frame. */
  function scheduleRender() {
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      render();
    });
  }

  /** Marks the filtered dataset stale and redraws the current view. */
  function refreshResults() {
    clearTimeout(searchTimer);
    filteredDirty = true;
    scheduleRender();
  }

  /** Moves the viewport back to the results table without Firefox's janky smooth-scroll path. */
  function scrollResultsTop() {
    if (!el.resultsTable) return;
    const top = el.resultsTable.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }

  /** Redraws the current page, then scrolls after the DOM update has finished. */
  function pageResults() {
    scheduleRender();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollResultsTop);
    });
  }

  /**
   * Rebuilds `filtered` from `data` using `state`, then sorts in place.
   */
  function compute() {
    const q = state.q.trim().toLowerCase();
    filtered = data.filter((d) => {
      if (state.status !== "all" && d.status !== state.status) return false;
      if (state.tld && d._tld !== state.tld) return false;
      if (state.industry === "__unclassified__") {
        if (d.industry) return false;
      } else if (state.industry && d.industry !== state.industry) return false;
      return !q || d._search.includes(q);
    });

    const ord = state.sort;
    filtered.sort((a, b) => {
      const an = a._nameLower;
      const bn = b._nameLower;
      if (ord === "az") return collator.compare(an, bn);
      if (ord === "za") return collator.compare(bn, an);
      if (ord === "tld") return collator.compare(a._tld, b._tld) || collator.compare(an, bn);
      if (ord === "industry") {
        return collator.compare(a._industryLower || "\uffff", b._industryLower || "\uffff") || collator.compare(an, bn);
      }
      if (ord === "status") return collator.compare(a.status || "", b.status || "") || collator.compare(an, bn);
      return 0;
    });
  }

  /** Escapes text before inserting into HTML template literals. */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  /** Builds one table row as HTML. */
  function rowHtml(d) {
    const cls = d.status === "no_dmarc" ? "no" : "pn";
    const indCls = d.industry ? "" : "empty";
    return `<tr class="row">
        <td class="nm">${escapeHtml(d.name || "")}</td>
        <td class="dm">${escapeHtml(d.domain || "")}</td>
        <td class="tld">${d._tld}</td>
        <td class="ind ${indCls}">${escapeHtml(d.industry || "")}</td>
        <td><span class="st ${cls}">${cls === "no" ? "NO RECORD" : "p=none"}</span></td>
        <td class="ts">${window.formatDate(d.last_checked)}</td>
      </tr>`;
  }

  /**
   * Runs compute() when needed, updates pager UI, renders current page of rows into `#list`.
   */
  function render() {
    if (filteredDirty) {
      compute();
      filteredDirty = false;
    }
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE;
    const slice = filtered.slice(start, start + PAGE);
    el.resultCount.textContent = `${total.toLocaleString()} match${total === 1 ? "" : "es"}`;
    el.pageLabel.textContent = `page ${state.page} / ${pages}`;
    el.list.innerHTML = slice.length ? slice.map(rowHtml).join("") : '<tr><td class="empty" colspan="6">// no matches</td></tr>';
  }

  /* ---------- Dark / light theme (persisted) ---------- */
  const setTheme = (t) => {
    document.body.dataset.theme = t;
    el.themeBtn.textContent = t === "dark" ? "☀" : "◐";
    try {
      localStorage.setItem("cn_theme", t);
    } catch (e) {
      /* storage unavailable */
    }
  };
  setTheme(localStorage.getItem("cn_theme") ?? "dark");
  el.themeBtn.addEventListener("click", () => {
    setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  });

  /* ---------- Fake CLI session: timed lines for atmosphere ---------- */
  const lines = [
    { txt: '<span class="pmt">$</span> ./audit.sh --scope global --policy missing,none', delay: 0 },
    { txt: '<span class="ok">[ok]</span> connecting to dns resolvers …', delay: 280 },
    { txt: '<span class="ok">[ok]</span> querying _dmarc.* TXT records', delay: 280 },
    { txt: '<span class="hl">[!!]</span> domains with no DMARC record detected', delay: 320 },
    { txt: '<span class="wn">[!]</span> domains with p=none policy detected', delay: 280 },
    { txt: '<span class="ok">[ok]</span> stream open · <span class="cursor"></span>', delay: 280, keepCursor: true },
  ];
  let i = 0;
  function nextLine() {
    if (i >= lines.length) return;
    const ln = document.createElement("span");
    ln.className = "ln";
    ln.innerHTML = lines[i].txt;
    el.session.appendChild(ln);
    for (const cursor of el.session.querySelectorAll(".ln:not(:last-child) .cursor")) {
      cursor.remove();
    }
    i++;
    if (i < lines.length) setTimeout(nextLine, lines[i].delay);
  }
  setTimeout(nextLine, 200);

  (async () => {
    try {
      data = await window.fetchDmarcData();
    } catch (e) {
      el.list.innerHTML = '<tr><td class="empty" colspan="6">connection error · retry</td></tr>';
      return;
    }

    let noDmarcCount = 0;
    let pNoneCount = 0;
    const tldCounts = Object.create(null);
    const indCounts = Object.create(null);

    for (const d of data) {
      d.industry = d.industry || "";
      d._search = `${d.name || ""} ${d.domain || ""} ${d.industry}`.toLowerCase();
      d._nameLower = (d.name || "").toLowerCase();
      d._industryLower = d.industry.toLowerCase();
      d._tld = window.tldOf(d.domain);

      if (d.status === "no_dmarc") noDmarcCount++;
      else if (d.status === "p_none") pNoneCount++;

      tldCounts[d._tld] = (tldCounts[d._tld] || 0) + 1;
      if (d.industry) indCounts[d.industry] = (indCounts[d.industry] || 0) + 1;
    }

    /* Summary stats in the header */
    el.stTotal.textContent = data.length.toLocaleString();
    el.stNo.textContent = noDmarcCount.toLocaleString();
    el.stP.textContent = pNoneCount.toLocaleString();
    el.lastChecked.textContent = data[0] ? window.formatDate(data[0].last_checked) : "—";

    /* TLD dropdown: top 30 suffixes by count */
    const tlds = Object.entries(tldCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    for (const [t, n] of tlds) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = `${t}  (${n})`;
      el.tldSel.appendChild(o);
    }

    /* Industry dropdown from inferred labels + “unclassified” sentinel */
    const industryEntries = Object.entries(indCounts).sort((a, b) => b[1] - a[1]);
    for (const [t, n] of industryEntries) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = `${t}  (${n})`;
      el.indSel.appendChild(o);
    }
    const oU = document.createElement("option");
    oU.value = "__unclassified__";
    oU.textContent = "(unclassified)";
    el.indSel.appendChild(oU);

    /* Collapsible filter panel + badge when non-default filters active */
    const statusButtons = [...el.statusSeg.querySelectorAll("button")];
    el.filterToggle.addEventListener("click", () => {
      const open = el.controls.classList.toggle("open");
      el.filterToggle.setAttribute("aria-expanded", String(open));
    });
    function setStatusButton(button) {
      for (const x of statusButtons) {
        x.classList.toggle("on", x === button);
      }
    }
    function updateFilterBadge() {
      const active = state.status !== "all" || state.tld || state.industry || state.sort !== "az";
      el.filterToggle.classList.toggle("active", active);
    }

    el.statusSeg.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !el.statusSeg.contains(button)) return;
      if (state.status === button.dataset.v) return;
      setStatusButton(button);
      state.status = button.dataset.v;
      state.page = 1;
      refreshResults();
      updateFilterBadge();
    });

    el.q.addEventListener("input", (e) => {
      state.q = e.target.value;
      state.page = 1;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(refreshResults, 120);
    });
    el.tldSel.addEventListener("change", (e) => {
      state.tld = e.target.value;
      state.page = 1;
      refreshResults();
      updateFilterBadge();
    });
    el.indSel.addEventListener("change", (e) => {
      state.industry = e.target.value;
      state.page = 1;
      refreshResults();
      updateFilterBadge();
    });
    el.sortSel.addEventListener("change", (e) => {
      state.sort = e.target.value;
      refreshResults();
      updateFilterBadge();
    });
    el.prev.addEventListener("click", () => {
      if (state.page <= 1) return;
      state.page = Math.max(1, state.page - 1);
      pageResults();
    });
    el.next.addEventListener("click", () => {
      const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
      if (state.page >= pages) return;
      state.page = state.page + 1;
      pageResults();
    });

    /** Export all rows matching current filters as RFC-style CSV download. */
    el.exportBtn.addEventListener("click", () => {
      compute();
      const cell = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const csv = [
        "name,domain,industry,status,tld,last_checked",
        ...filtered.map((d) =>
          [cell(d.name), cell(d.domain), cell(d.industry), cell(d.status), cell(d._tld), cell(d.last_checked)].join(",")
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dmarc-shame.csv";
      a.click();
      URL.revokeObjectURL(url);
    });

    setStatusButton(statusButtons[0]);
    updateFilterBadge();
    render();
  })();
})();
