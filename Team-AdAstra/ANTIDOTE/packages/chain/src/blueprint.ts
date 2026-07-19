import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The compiled Aiken blueprint (contracts/plutus.json). Loading it here means
 * the running system reports the *real* script hashes of the validators that
 * enforce quarantine — not hardcoded strings.
 */

export interface BlueprintValidator {
  title: string;
  hash: string;
  compiledCode: string;
}

interface Blueprint {
  preamble: { title: string; version: string; plutusVersion: string };
  validators: BlueprintValidator[];
}

const here = dirname(fileURLToPath(import.meta.url));
const BLUEPRINT_PATH = join(here, "../../../contracts/plutus.json");

let cached: Blueprint | undefined;

export function blueprint(): Blueprint | undefined {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(BLUEPRINT_PATH, "utf8")) as Blueprint;
    return cached;
  } catch {
    return undefined;
  }
}

/** Script hash of a validator by name, e.g. "quarantine_gate". */
export function scriptHash(name: string): string | undefined {
  return blueprint()?.validators.find((v) => v.title.includes(`${name}.spend`))?.hash;
}

export function validatorSummary(): {
  plutusVersion: string;
  validators: { name: string; hash: string }[];
} | undefined {
  const bp = blueprint();
  if (!bp) return undefined;
  return {
    plutusVersion: bp.preamble.plutusVersion,
    validators: bp.validators
      .filter((v) => v.title.endsWith(".spend"))
      .map((v) => ({ name: v.title.replace(/^quarantine\./, "").replace(/\.spend$/, ""), hash: v.hash })),
  };
}
