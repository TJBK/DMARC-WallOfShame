// Validates data/companies.json for CI (pull requests). Ensures the file is
// parseable and every row matches the shape expected by scripts/check_dmarc.mjs:
// an array of { name, domain } with non-empty strings. Domains must not
// contain whitespace so DNS lookups are unambiguous. No DMARC / network I/O.

import { readFile } from "node:fs/promises";

const INPUT_FILE = "data/companies.json";

const raw = await readFile(INPUT_FILE, "utf8");

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message);
  process.exit(1);
}

/** @type {unknown} */
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  fail(`companies.json is not valid JSON: ${msg}`);
}

// check_dmarc.mjs treats the file as a JSON array of company records.
if (!Array.isArray(parsed)) {
  fail("companies.json must be a JSON array");
}

for (const [i, row] of parsed.entries()) {
  // Reject null, primitives, arrays; require plain objects only.
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    fail(`Entry ${i}: must be an object`);
  }

  const { name, domain } = /** @type {{ name?: unknown; domain?: unknown }} */ (row);

  if (typeof name !== "string" || name.trim() === "") {
    fail(`Entry ${i}: "name" must be a non-empty string`);
  }

  if (typeof domain !== "string" || domain.trim() === "") {
    fail(`Entry ${i}: "domain" must be a non-empty string`);
  }

  // After trim, no spaces/tabs/newlines remain — hostnames must be a single token for resolveTxt.
  if (/\s/.test(domain.trim())) {
    fail(`Entry ${i}: "domain" must not contain whitespace`);
  }
}

console.log(`OK: ${parsed.length} companies`);
