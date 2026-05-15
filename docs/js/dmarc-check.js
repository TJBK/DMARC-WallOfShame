(() => {
  function getElementById(id) {
    return document.getElementById(id);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const el = {
    themeBtn: getElementById("themeBtn"),
    termBody: getElementById("termBody"),
    checkFormTemplate: getElementById("checkFormTemplate"),
    actionsTemplate: getElementById("actionsTemplate"),
  };

  function setTheme(t) {
    document.body.dataset.theme = t;
    el.themeBtn.textContent = t === "dark" ? "☀" : "◐";
    try {
      localStorage.setItem("cn_theme", t);
    } catch (e) {
      /* ignore */
    }
  }
  setTheme(localStorage.getItem("cn_theme") ?? "dark");
  el.themeBtn.addEventListener("click", () => {
    setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  });

  function appendLine(html, opts = {}) {
    const span = element("span", "session-line");
    span.innerHTML = html;
    el.termBody.appendChild(span);
    if (!opts.keepCursors) {
      for (const cursor of el.termBody.querySelectorAll(".session-line:not(:last-child) .cursor")) {
        cursor.remove();
      }
    }
    return span;
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function typeLine(html, perChar = 6) {
    const span = appendLine("");
    const tmp = document.createElement("span");
    tmp.innerHTML = html;
    const flat = tmp.textContent;
    for (let i = 1; i <= flat.length; i++) {
      span.textContent = flat.slice(0, i);
      await wait(perChar);
    }
    span.innerHTML = html;
  }

  async function bootSequence() {
    el.termBody.replaceChildren();
    appendLine('<span class="pmt">user@dmarc-shame</span> <span class="mute">~</span> $ <span class="cursor"></span>');
    await wait(500);
    await typeLine('<span class="pmt">user@dmarc-shame</span> <span class="mute">~</span> $ ./dmarc_check.sh');
    await wait(280);
    appendLine('<span class="ok">[ok]</span>  loading dmarc_check.sh v1.0.2 …');
    await wait(220);
    appendLine('<span class="ok">[ok]</span>  resolver: 1.1.1.1 (DoH) · timeout: 5s');
    await wait(220);
    appendLine('<span class="ok">[ok]</span>  ready · enter a domain to inspect <span class="cursor"></span>');
    await wait(150);
    renderForm();
  }

  function renderForm() {
    const old = document.getElementById("checkForm");
    if (old) old.remove();
    const oldQuick = el.termBody.querySelector(".quick");
    if (oldQuick) oldQuick.remove();
    const fragment = el.checkFormTemplate.content.cloneNode(true);
    const form = fragment.querySelector("#checkForm");
    const quick = fragment.querySelector(".quick");
    const input = fragment.querySelector("#domainInput");
    el.termBody.appendChild(fragment);

    window.setTimeout(() => input.focus(), 80);

    quick.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip || !quick.contains(chip)) return;
      input.value = chip.dataset.d;
      form.requestSubmit();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = normalizeDomain(input.value);
      if (!v || !v.includes(".")) {
        appendLine('<span class="hl">[err]</span> please enter a valid domain (eg. example.com)');
        return;
      }
      runCheck(v);
    });
  }

  function disableForm(disabled) {
    const inp = document.getElementById("domainInput");
    const btn = document.getElementById("runBtn");
    if (inp) inp.disabled = disabled;
    if (btn) {
      btn.disabled = disabled;
      btn.textContent = disabled ? "running …" : "run check";
    }
  }

  async function runCheck(domain) {
    disableForm(true);

    appendLine(
      `<span class="pmt">user@dmarc-shame</span> <span class="mute">~</span> $ dig +short TXT _dmarc.${escapeHtml(domain)}`
    );
    await wait(380);
    appendLine('<span class="mute">; querying 1.1.1.1 …</span>');

    let record = null;
    let error = null;
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=_dmarc.${encodeURIComponent(domain)}&type=TXT`;
      const r = await fetch(url, { headers: { accept: "application/dns-json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.Answer && j.Answer.length) {
        for (const ans of j.Answer) {
          if (ans.type !== 16) continue;
          let txt = ans.data || "";
          txt = txt.replace(/" "/g, "").replace(/^"|"$/g, "");
          if (txt.toLowerCase().startsWith("v=dmarc1")) {
            record = txt;
            break;
          }
        }
      }
    } catch (e) {
      error = e;
    }

    await wait(380);

    if (error) {
      appendLine(`<span class="hl">[err]</span> resolver error: ${escapeHtml(error.message)}`);
      finishVerdict(
        domain,
        "bad",
        "Resolver error",
        `Couldn't reach the DNS resolver. This usually means a network or CORS hiccup — try again, or use <code>dig TXT _dmarc.${escapeHtml(domain)}</code> from a terminal.`,
        null,
        []
      );
      disableForm(false);
      return;
    }

    if (!record) {
      appendLine(
        '<span class="hl">[!!]</span> no TXT record found at <span class="hl">_dmarc.' +
          escapeHtml(domain) +
          "</span>"
      );
      finishVerdict(
        domain,
        "bad",
        "No DMARC record",
        `<b>${escapeHtml(domain)}</b> has no DMARC record published. Receiving servers have no policy to apply, and anyone can spoof mail from this domain. Spoofers love this.`,
        null,
        [
          { k: "v", v: "—", cls: "bad" },
          { k: "p", v: "—", cls: "bad" },
        ]
      );
      disableForm(false);
      return;
    }

    appendLine('<span class="ok">[ok]</span>  found record · parsing …');
    await wait(260);
    const tags = parseDmarc(record);
    appendLine(
      `<span class="ok">[ok]</span>  v=${escapeHtml(tags.v || "")} · p=<b>${escapeHtml(tags.p || "")}</b>` +
        (tags.sp ? ` · sp=${escapeHtml(tags.sp)}` : "") +
        (tags.pct ? ` · pct=${escapeHtml(tags.pct)}` : "")
    );

    let cls;
    let head;
    let msg;
    const p = (tags.p || "").toLowerCase();
    if (p === "reject") {
      cls = "ok";
      head = "Enforced · reject";
      msg = `<b>${escapeHtml(domain)}</b> rejects unauthenticated mail. This is the strongest DMARC posture and the right place to be. Nothing to fix from a wall-of-shame perspective.`;
    } else if (p === "quarantine") {
      cls = "warn";
      head = "Quarantine · partial enforcement";
      msg = `<b>${escapeHtml(domain)}</b> sends unauthenticated mail to spam, but doesn't reject it. Consider moving to <code>p=reject</code> once aggregate reports look clean.`;
    } else if (p === "none") {
      cls = "warn";
      head = "p=none · monitor only";
      msg = `<b>${escapeHtml(domain)}</b> publishes a DMARC record, but it's set to monitor only. Receivers are told nothing about how to handle spoofed mail. <span class="hl">This domain qualifies for the wall.</span> Move to <code>p=quarantine</code>, then <code>p=reject</code>.`;
    } else {
      cls = "warn";
      head = "Unrecognised policy";
      msg = `Couldn't parse the policy tag. The record was: <code>${escapeHtml(record)}</code>`;
    }
    finishVerdict(
      domain,
      cls,
      head,
      msg,
      record,
      [
        {
          k: "p",
          v: tags.p || "—",
          cls: p === "reject" ? "ok" : p ? "bad" : "bad",
        },
        tags.sp ? { k: "sp", v: tags.sp } : null,
        tags.pct ? { k: "pct", v: tags.pct } : null,
        tags.adkim ? { k: "adkim", v: tags.adkim } : null,
        tags.aspf ? { k: "aspf", v: tags.aspf } : null,
        tags.rua ? { k: "rua", v: shortAddr(tags.rua) } : null,
        tags.ruf ? { k: "ruf", v: shortAddr(tags.ruf) } : null,
      ].filter(Boolean)
    );
    disableForm(false);
  }

  function normalizeDomain(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
  }

  function shortAddr(s) {
    return String(s)
      .split(",")
      .map((x) => x.trim().replace(/^mailto:/i, ""))
      .join(", ");
  }

  function parseDmarc(record) {
    const out = {};
    for (const part of record.split(";")) {
      const t = part.trim();
      if (!t) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim().toLowerCase();
      const v = t.slice(eq + 1).trim();
      out[k] = v;
    }
    return out;
  }

  function finishVerdict(domain, cls, head, msgHtml, record, tags) {
    removeResultBlocks();

    const output = document.createDocumentFragment();
    const verdict = element("div", "verdict " + cls);
    const body = element("p");
    body.innerHTML = msgHtml;
    verdict.append(element("h3", "", head), body);
    output.appendChild(verdict);

    if (record) {
      const box = element("div", "record-box");
      box.append(element("div", "lab", `_dmarc.${domain} · TXT`), element("code", "", record));
      output.appendChild(box);
    }

    if (tags && tags.length) {
      const row = element("div", "tags-row");
      for (const t of tags) {
        const tag = element("span", "tag" + (t.cls ? " " + t.cls : ""));
        tag.append(document.createTextNode(`${t.k}=`), element("b", "", t.v));
        row.appendChild(tag);
      }
      output.appendChild(row);
    }

    output.appendChild(el.actionsTemplate.content.firstElementChild.cloneNode(true));
    el.termBody.appendChild(output);
    document.getElementById("againBtn").addEventListener("click", () => {
      removeResultBlocks();
      const inp = document.getElementById("domainInput");
      if (inp) {
        inp.value = "";
        inp.focus();
      }
    });
  }

  function removeResultBlocks() {
    for (const node of document.querySelectorAll(".verdict, .record-box, .tags-row, .actions")) {
      node.remove();
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  bootSequence();
})();
