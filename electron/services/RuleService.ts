import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRules } from "./validateRules.ts";
import type { MetreDataset } from "../../src/poetry/analysis/poemAnalyzer.ts";
import type { PingzeDataset, ReadingRulesDataset } from "../../src/poetry/analysis/readingResolver.ts";

type RhymeDataset = { schemaVersion: number; datasetVersion: string; groups: unknown[]; characterIndex: Record<string, string[]> };

export interface RuleBundle {
  rhyme: RhymeDataset;
  pingze: PingzeDataset;
  metre: MetreDataset;
  readingRules: ReadingRulesDataset;
  datasetVersions: Record<string, string>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export class RuleService {
  private bundle: RuleBundle | null = null;
  private readonly rulesDirectory: string;

  constructor(rulesDirectory: string) {
    this.rulesDirectory = rulesDirectory;
  }

  load(): RuleBundle {
    if (this.bundle) return this.bundle;
    const bundle: RuleBundle = {
      rhyme: readJson<RhymeDataset>(join(this.rulesDirectory, "rhyme.json")),
      pingze: readJson<PingzeDataset>(join(this.rulesDirectory, "pingze.json")),
      metre: readJson<MetreDataset>(join(this.rulesDirectory, "metre.json")),
      readingRules: readJson<ReadingRulesDataset>(join(this.rulesDirectory, "reading_rules.json")),
      datasetVersions: {},
    };
    bundle.datasetVersions = validateRules(bundle);
    this.bundle = bundle;
    return bundle;
  }

  resetForTests(): void {
    this.bundle = null;
  }
}

export function defaultRulesDirectory(isPackaged: boolean, resourcesPath: string): string {
  if (isPackaged) return join(resourcesPath, "app.asar", "src", "rules");
  return join(process.cwd(), "src", "rules");
}
