import { readFile, writeFile } from "node:fs/promises";

const ASSETS = [
  ["docs/css/home.css", minifyCss],
  ["docs/css/dmarc-check.css", minifyCss],
  ["docs/js/shared.js", minifyJs],
  ["docs/js/home.js", minifyJs],
  ["docs/js/dmarc-check.js", minifyJs],
];

function outputPath(input) {
  return input.replace(/\.(css|js)$/u, ".min.$1");
}

function isWordChar(ch) {
  return /[A-Za-z0-9_$]/u.test(ch);
}

function needsSpace(prev, next) {
  if (!prev || !next) return false;
  if (isWordChar(prev) && isWordChar(next)) return true;
  if ((prev === "+" && next === "+") || (prev === "-" && next === "-")) return true;
  return false;
}

function canStartRegex(prev) {
  return !prev || "([{:;,=!?&|+-*~^<>%".includes(prev);
}

function minifyJs(source) {
  let out = "";
  let pendingSpace = false;
  let prev = "";
  let state = "code";
  let regexClass = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "line-comment") {
      if (ch === "\n") pendingSpace = true;
      continue;
    }

    if (state === "block-comment") {
      if (ch === "*" && next === "/") {
        i++;
        state = "code";
        pendingSpace = true;
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      out += ch;
      prev = ch;
      if (ch === "\\") {
        i++;
        out += source[i] || "";
        prev = source[i] || prev;
        continue;
      }
      if ((state === "single" && ch === "'") || (state === "double" && ch === '"') || (state === "template" && ch === "`")) {
        state = "code";
      }
      continue;
    }

    if (state === "regex") {
      out += ch;
      prev = ch;
      if (ch === "\\") {
        i++;
        out += source[i] || "";
        prev = source[i] || prev;
        continue;
      }
      if (ch === "[") regexClass = true;
      else if (ch === "]") regexClass = false;
      else if (ch === "/" && !regexClass) state = "code";
      continue;
    }

    if (/\s/u.test(ch)) {
      pendingSpace = true;
      continue;
    }

    if (ch === "/" && next === "/") {
      i++;
      state = "line-comment";
      continue;
    }

    if (ch === "/" && next === "*") {
      i++;
      state = "block-comment";
      continue;
    }

    if (pendingSpace && needsSpace(prev, ch)) out += " ";
    pendingSpace = false;
    out += ch;

    if (ch === "'") state = "single";
    else if (ch === '"') state = "double";
    else if (ch === "`") state = "template";
    else if (ch === "/" && canStartRegex(prev)) {
      state = "regex";
      regexClass = false;
    }

    prev = ch;
  }

  return out.trim() + "\n";
}

function minifyCss(source) {
  let out = "";
  let state = "code";
  let quote = "";
  let pendingSpace = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "comment") {
      if (ch === "*" && next === "/") {
        i++;
        state = "code";
      }
      continue;
    }

    if (state === "string") {
      out += ch;
      if (ch === "\\") {
        i++;
        out += source[i] || "";
        continue;
      }
      if (ch === quote) state = "code";
      continue;
    }

    if (ch === "/" && next === "*") {
      i++;
      state = "comment";
      continue;
    }

    if (ch === "'" || ch === '"') {
      if (pendingSpace && needsCssSpace(out.at(-1), ch)) out += " ";
      pendingSpace = false;
      state = "string";
      quote = ch;
      out += ch;
      continue;
    }

    if (/\s/u.test(ch)) {
      pendingSpace = true;
      continue;
    }

    if ("{}:;,>+~()".includes(ch)) {
      out = out.trimEnd();
      out += ch;
      pendingSpace = false;
      continue;
    }

    if (pendingSpace && needsCssSpace(out.at(-1), ch)) out += " ";
    pendingSpace = false;
    out += ch;
  }

  return out.replace(/;\}/gu, "}").trim() + "\n";
}

function needsCssSpace(prev, next) {
  if (!prev || !next) return false;
  if ("{}:;,>+~(".includes(prev) || "{}:;,>+~)".includes(next)) return false;
  return true;
}

for (const [input, minify] of ASSETS) {
  const source = await readFile(input, "utf8");
  const minified = minify(source);
  const target = outputPath(input);
  await writeFile(target, minified);
  const saved = source.length - minified.length;
  const pct = Math.round((saved / source.length) * 100);
  console.log(`${target}: ${source.length} -> ${minified.length} bytes (${pct}% smaller)`);
}
