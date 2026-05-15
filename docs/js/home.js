(() => {
  function getElementById(id) {
    return document.getElementById(id);
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const compareText = collator.compare;
  let data = [];
  let filtered = [];
  const PAGE = 100;
  let renderFrame = 0;
  let searchTimer = 0;
  let filteredDirty = true;
  const smoothPageScroll =
    !/firefox/i.test(navigator.userAgent) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = { q: "", status: "all", tld: "", industry: "", sort: "az", page: 1 };

  const el = {
    themeBtn: getElementById("themeBtn"),
    session: getElementById("session"),
    list: getElementById("list"),
    stTotal: getElementById("stTotal"),
    stNo: getElementById("stNo"),
    stP: getElementById("stP"),
    lastChecked: getElementById("lastChecked"),
    tldSel: getElementById("tldSel"),
    indSel: getElementById("indSel"),
    sortSel: getElementById("sortSel"),
    q: getElementById("q"),
    controls: getElementById("controls"),
    filterToggle: getElementById("filterToggle"),
    statusSeg: getElementById("statusSeg"),
    prev: getElementById("prev"),
    next: getElementById("next"),
    resultCount: getElementById("resultCount"),
    pageLabel: getElementById("pageLabel"),
    exportBtn: getElementById("exportBtn"),
    rowTemplate: getElementById("resultRowTemplate"),
    resultsTable: document.querySelector(".results-table"),
  };

  function scheduleRender() {
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      render();
    });
  }

  function refreshResults() {
    clearTimeout(searchTimer);
    filteredDirty = true;
    scheduleRender();
  }

  function scrollResultsTop() {
    if (!el.resultsTable) return;
    const top = el.resultsTable.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: smoothPageScroll ? "smooth" : "auto" });
  }

  function pageResults() {
    scheduleRender();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollResultsTop);
    });
  }

  function compute() {
    const q = state.q.trim().toLowerCase();
    const status = state.status;
    const tld = state.tld;
    const industry = state.industry;
    const rows = [];

    for (const d of data) {
      if (status !== "all" && d.status !== status) continue;
      if (tld && d._tld !== tld) continue;
      if (industry === "__unclassified__") {
        if (d.industry) continue;
      } else if (industry && d.industry !== industry) {
        continue;
      }
      if (q && !d._search.includes(q)) continue;
      rows.push(d);
    }
    filtered = rows;

    const ord = state.sort;
    filtered.sort((a, b) => {
      const an = a._nameLower;
      const bn = b._nameLower;
      if (ord === "az") return compareText(an, bn);
      if (ord === "za") return compareText(bn, an);
      if (ord === "tld") return compareText(a._tld, b._tld) || compareText(an, bn);
      if (ord === "industry") {
        return compareText(a._industryLower || "\uffff", b._industryLower || "\uffff") || compareText(an, bn);
      }
      if (ord === "status") return compareText(a.status || "", b.status || "") || compareText(an, bn);
      return 0;
    });
  }

  function createResultRow(d) {
    const row = el.rowTemplate.content.firstElementChild.cloneNode(true);
    const cls = d.status === "no_dmarc" ? "no" : "pn";
    const name = row.cells[0];
    const domain = row.cells[1];
    const tld = row.cells[2];
    const industry = row.cells[3];
    const status = row.cells[4].firstElementChild;
    const checked = row.cells[5];

    name.textContent = d.name || "";
    domain.textContent = d.domain || "";
    tld.textContent = d._tld;
    industry.textContent = d.industry || "";
    industry.classList.toggle("empty", !d.industry);
    status.textContent = cls === "no" ? "NO RECORD" : "p=none";
    status.className = "st " + cls;
    checked.textContent = window.formatDate(d.last_checked);
    return row;
  }

  function createMessageRow(message, className) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = className;
    cell.colSpan = 6;
    cell.textContent = message;
    row.appendChild(cell);
    return row;
  }

  function csvCell(s) {
    return `"${String(s ?? "").replace(/"/g, '""')}"`;
  }

  function render() {
    if (filteredDirty) {
      compute();
      filteredDirty = false;
    }
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE;
    const end = Math.min(start + PAGE, total);
    el.resultCount.textContent = `${total.toLocaleString()} match${total === 1 ? "" : "es"}`;
    el.pageLabel.textContent = `page ${state.page} / ${pages}`;
    if (start === end) {
      el.list.replaceChildren(createMessageRow("// no matches", "empty"));
      return;
    }
    const rows = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      rows.appendChild(createResultRow(filtered[i]));
    }
    el.list.replaceChildren(rows);
  }

  function setTheme(t) {
    document.body.dataset.theme = t;
    el.themeBtn.textContent = t === "dark" ? "☀" : "◐";
    try {
      localStorage.setItem("cn_theme", t);
    } catch (e) {
      /* storage unavailable */
    }
  }
  setTheme(localStorage.getItem("cn_theme") ?? "dark");
  el.themeBtn.addEventListener("click", () => {
    setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  });

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
      el.list.replaceChildren(createMessageRow("connection error · retry", "empty"));
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

    el.stTotal.textContent = data.length.toLocaleString();
    el.stNo.textContent = noDmarcCount.toLocaleString();
    el.stP.textContent = pNoneCount.toLocaleString();
    el.lastChecked.textContent = data[0] ? window.formatDate(data[0].last_checked) : "—";

    const tlds = Object.entries(tldCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    const tldOptions = document.createDocumentFragment();
    for (const [t, n] of tlds) {
      tldOptions.appendChild(new Option(`${t}  (${n})`, t));
    }
    el.tldSel.appendChild(tldOptions);

    const industryEntries = Object.entries(indCounts).sort((a, b) => b[1] - a[1]);
    const industryOptions = document.createDocumentFragment();
    for (const [t, n] of industryEntries) {
      industryOptions.appendChild(new Option(`${t}  (${n})`, t));
    }
    industryOptions.appendChild(new Option("(unclassified)", "__unclassified__"));
    el.indSel.appendChild(industryOptions);

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

    el.exportBtn.addEventListener("click", () => {
      compute();
      const csv = [
        "name,domain,industry,status,tld,last_checked",
        ...filtered.map((d) =>
          [csvCell(d.name), csvCell(d.domain), csvCell(d.industry), csvCell(d.status), csvCell(d._tld), csvCell(d.last_checked)].join(",")
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
