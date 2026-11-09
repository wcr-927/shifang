import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCiRulesSafe, type validateCiRules } from "../../src/ci/validate.ts";
import { RuleService, type RuleBundle } from "./RuleService.ts";
import { hasRhymeUsage, rhymeUsageBundleSchema, type RhymeUsageBundle } from "../../src/shared/rhymeUsage.ts";
import { rankRhymeCharacters } from "../../src/poetry/reference/rhymeUsage.ts";

import {
  referenceLookupSchema, referenceSystemSchema, referenceGroupSchema, referencePatternSchema,
  type ReferenceSource, type ReferenceReading, type ReferenceLookup, type ReferenceGroup,
  type ReferenceGroupPage, type ReferencePattern, type ReferenceSystem,
} from "../../src/shared/reference.ts";
import type { z } from "zod";


type CiBundle = ReturnType<typeof validateCiRules>;
type AncientTone = "ping" | "shang" | "qu" | "ru";
type RhymeGroup = {
  id: string; name: string; section: string; toneCategory: AncientTone;
  toneType: "ping" | "ze"; characters: string[];
};
const CI_TONES = { P: "平声", S: "上声", Q: "去声", R: "入声" } as const;
const TONE_NAMES = { ping: "平声", shang: "上声", qu: "去声", ru: "入声" } as const;
const GROUP_NUMBERS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九"];
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const sourceDescriptions: ReferenceSource[] = [
  ['pingshui', '平水韵'], ['metre', '近体诗谱式'], ['ci', '词谱'], ['cilin', '词林正韵']
].map(([id, title]) => ({
  id, title, author: '所载资料包', version: '1', description: title,
  boundary: '以当前资料包收录范围为准。', context: title, metadata: {}, urls: [],
}));

/** Read-only, bounded queries. Constructing this service never loads either dictionary. */
export class ReferenceRuleService {
  private ci: CiBundle | null = null;
  private ciFailure: string | null = null;
  private ciGroups: Map<string, string[]> | null = null;
  private readonly rules: RuleService;
  private readonly ciDirectory: string;
  private readonly usagePath: string;
  private usage: RhymeUsageBundle | null = null;

  constructor(rules: RuleService | string, ciDirectory: string, usagePath?: string) {
    this.rules = typeof rules === "string" ? new RuleService(rules) : rules;
    this.ciDirectory = ciDirectory;
    // Both development and packaged app.asar keep src/ci and src/rules as siblings.
    this.usagePath = usagePath ?? join(typeof rules === "string" ? rules : join(ciDirectory, "..", "rules"), "rhyme_usage.json");
  }

  private rhymeUsage(system: ReferenceSystem, groupId: string, characters: readonly string[]): RhymeUsageBundle {
    if (!this.usage) {
      try { this.usage = rhymeUsageBundleSchema.parse(readJson(this.usagePath)); }
      catch { this.usage = { version: "unavailable", sourceIds: [], coverage: [], entries: [] }; }
    }
    // A bad browsing layer must never prevent full-table or dictionary queries.
    const known = new Set(characters);
    if (this.usage.entries.some(entry => entry.system === system && entry.groupId === groupId && !known.has(entry.character))) {
      return { version: this.usage.version, sourceIds: [], coverage: [], entries: [] };
    }
    return this.usage;
  }

  private pingshui(): RuleBundle { return this.rules.load(); }

  private ciRules(): CiBundle {
    if (this.ciFailure) throw new Error(this.ciFailure);
    if (!this.ci) {
      let forms: unknown, dictionary: unknown;
      try {
        forms = readJson(join(this.ciDirectory, "forms.json"));
        dictionary = readJson(join(this.ciDirectory, "cilin.json"));
      } catch {
        this.ciFailure = "词谱或词韵资料读取失败；其他资料仍可查询。";
        throw new Error(this.ciFailure);
      }
      const result = loadCiRulesSafe(forms, dictionary);
      if (result.error) {
        this.ciFailure = "词谱或词韵资料校验未通过；其他资料仍可查询。";
        throw new Error(this.ciFailure);
      }
      this.ci = result as CiBundle;
    }
    return this.ci;
  }

  private cilinIndex(): Map<string, string[]> {
    if (!this.ciGroups) {
      const groups = new Map(GROUP_NUMBERS.map((_, i) => [`cilin-${i + 1}`, [] as string[]]));
      for (const [character, readings] of Object.entries(this.ciRules().dictionary.readings)) {
        for (const number of new Set(readings.map(reading => reading.group))) groups.get(`cilin-${number}`)!.push(character);
      }
      this.ciGroups = groups;
    }
    return this.ciGroups;
  }

  private readings(system: ReferenceSystem, character: string): ReferenceReading[] {
    if (system === "pingshui") {
      return (this.pingshui().pingze.characters[character]?.candidates ?? []).map(candidate => ({
        id: candidate.id, tone: TONE_NAMES[candidate.toneCategory], groupId: candidate.rhymeGroupId,
        groupName: candidate.rhymeGroupName, glosses: [...candidate.glosses],
      }));
    }
    return (this.ciRules().dictionary.readings[character] ?? []).map(candidate => ({
      id: candidate.id, tone: CI_TONES[candidate.tone], groupId: `cilin-${candidate.group}`,
      groupName: `第${GROUP_NUMBERS[candidate.group - 1]}部 · ${candidate.subgroup}`, glosses: candidate.gloss ? [candidate.gloss] : [],
    }));
  }

  lookup(raw: z.input<typeof referenceLookupSchema>): ReferenceLookup {
    const request = referenceLookupSchema.parse(raw);
    if (/^[\uD800-\uDFFF]$/u.test(request.character)) throw new Error("请输入一个完整Unicode字符。");
    const version = request.system === "pingshui" ? this.pingshui().datasetVersions.pingze : this.ciRules().dictionary.version;
    const readings = this.readings(request.system, request.character);
    // Preserve candidates that share an ID but carry distinct source glosses.
    return { ...request, readings: readings.slice(0, 64), total: readings.length, truncated: readings.length > 64, sourceId: request.system, version };
  }

  groups(raw: z.input<typeof referenceSystemSchema>): ReferenceGroup[] {
    const { system } = referenceSystemSchema.parse(raw);
    if (system === "pingshui") return (this.pingshui().rhyme.groups as RhymeGroup[]).map(group => ({
      id: group.id, name: `${group.section} · ${group.name}`, tone: TONE_NAMES[group.toneCategory], count: group.characters.length,
    }));
    return [...this.cilinIndex()].map(([id, characters], i) => ({
      id, name: `第${GROUP_NUMBERS[i]}部`, tone: i < 14 ? "平上去" : "入", count: characters.length,
    }));
  }

  group(raw: z.input<typeof referenceGroupSchema>): ReferenceGroupPage {
    const request = referenceGroupSchema.parse(raw);
    const group = this.groups({ system: request.system }).find(item => item.id === request.id);
    if (!group) throw new Error("所选韵部不属于当前韵系或不存在。");
    const characters = request.system === "pingshui"
      ? (this.pingshui().rhyme.groups as RhymeGroup[]).find(item => item.id === request.id)!.characters
      : this.cilinIndex().get(request.id)!;
    const usage = this.rhymeUsage(request.system, request.id, characters);
    const filtered = rankRhymeCharacters(characters, usage, { system: request.system, groupId: request.id, view: request.view });
    const end = Math.min(filtered.length, request.offset + request.limit);
    return {
      group, items: filtered.slice(request.offset, end).map(character => ({ character, readings: this.readings(request.system, character).filter(reading => reading.groupId === request.id).slice(0, 64) })),
      nextOffset: end < filtered.length ? end : null,
      view: request.view, filteredCount: filtered.length, usageVersion: usage.version,
      usageAvailable: hasRhymeUsage(usage, { system: request.system, groupId: request.id }),
    };
  }

  patterns(raw: z.input<typeof referencePatternSchema>): ReferencePattern[] {
    const { kind } = referencePatternSchema.parse(raw);
    if (kind === "metre") {
      const bundle = this.pingshui();
      return bundle.metre.templates.flatMap(template => template.variants.map(variant => ({
        id: `${template.id}:${variant.id}`, kind, name: template.name, variant: variant.name,
        summary: `${template.lineCount}句，每句${template.lineLength}字，平声韵`,
        lines: variant.patterns.map((pattern, i) => ({
          pattern: Array.from(pattern).map((tone, j) => variant.flexiblePositions[i].includes(j) ? "中" : tone).join(""),
          section: 1, rhyme: variant.rhymePositions.includes(i), rhymeGroup: variant.rhymePositions.includes(i) ? "a" : null, rhymeTone: variant.rhymePositions.includes(i) ? "平声" : null, note: template.lineRoles[i],
        })),
        flexiblePositions: structuredClone(variant.flexiblePositions), rhymePositions: [...variant.rhymePositions],
        notes: [variant.note, `起式：${variant.style}；推荐变体：${template.recommendedVariantId}。`, "中：此位置可变，须受孤平等条件限制。位置数据保留原始从0起计索引，分片显示从1起计。", ...(template.coupletPairs ?? []).map(([a, b]) => `第${a + 1}、${b + 1}句成联`), ...(template.nianPositions ?? []).map(i => `第${i + 1}句与上一句检查粘；当前粘位采用第二字`)],
        sourceId: "metre", internalPath: template.kind === "jueju" ? "OEBPS/Text/scgl-ch2-05.html" : "OEBPS/Text/scgl-ch2-03.html",
        scope: sourceDescriptions[1].boundary, version: bundle.datasetVersions.metre,
      })));
    }
    return this.ciRules().forms.map(form => {
      let section = 0, boundary = form.sections[0];
      return {
        id: form.id, kind, name: form.name, variant: `${form.author}体`, summary: form.summary,
        lines: form.lines.map((line, i) => {
          if (i >= boundary) { section++; boundary += form.sections[section]; }
          return {
            pattern: Array.from(line.pattern).map(position => ({ P: "平", Z: "仄", A: "中", I: "平/入" }[position])).join(""),
            section: section + 1, rhyme: line.rhyme !== null, rhymeGroup: line.rhyme, rhymeTone: line.rhymeTone === null ? null : line.rhymeTone === "P" ? "平声" : "仄声", caesura: line.caesura, example: line.example,
            note: [line.rhyme ? `${line.rhymeTone === "P" ? "平" : "仄"}韵 · ${line.rhyme}` : "", line.caesura === null ? "" : `第${line.caesura}字后句读`].filter(Boolean).join("；"),
          };
        }),
        repeat: structuredClone(form.repeat), rhymeChanges: structuredClone(form.rhymeChanges),
        rhymePositions: form.lines.flatMap((line, i) => line.rhyme === null ? [] : [i]),
        flexiblePositions: form.lines.map(line => Array.from(line.pattern).flatMap((position, i) => position === "A" ? [i] : [])),
        notes: [form.notes, "中：可平可仄；平/入：只允许平声或入声。句位、字位及句读数据保留原始从0起计索引，分片显示从1起计。", ...form.repeat.map(([a, b]) => `第${a + 1}句叠第${b + 1}句`), ...form.rhymeChanges.map(([a, b]) => `第${a + 1}句与第${b + 1}句换韵`)].filter(Boolean),
        sourceId: "ci", sourceUrl: form.source, scope: form.scope, version: form.version,
      };
    });
  }

  sources(): ReferenceSource[] { return structuredClone(sourceDescriptions); }
}

export function defaultCiDirectory(isPackaged: boolean, resourcesPath: string): string {
  return isPackaged ? join(resourcesPath, "app.asar", "src", "ci") : join(process.cwd(), "src", "ci");
}
