import type { CiForm } from "./catalogue";

export function ciStanzas(body: string, form: Pick<CiForm, "sections" | "lines">) {
  const lines = body.split("\n");
  let start = 0;
  const stanzas = form.sections.map((count, section) => {
    const first = start; start += count;
    return { start: first, count, label: form.sections.length === 1 ? "单片" : form.sections.length === 2 ? (section === 0 ? "上片" : "下片") : `第${section + 1}片`, lines: Array.from({ length: count }, (_, i) => lines[first + i] ?? "") };
  });
  return { stanzas, overflow: lines.slice(start), lines };
}
export function ciLineLabel(form: CiForm, index: number): string {
  let start = 0;
  for (const stanza of ciStanzas("", form).stanzas) {
    if (index < start + stanza.count) return `${stanza.label}第${index - start + 1}句`;
    start += stanza.count;
  }
  return `谱外第${index - start + 1}行`;
}
/** A reading copy only. Never write this back to body or use it as a backup. */
export function formatCiReading(title: string, body: string, form: CiForm, options: { title: boolean; form: boolean }): string {
  const { stanzas, overflow } = ciStanzas(body, form);
  const paragraphs = stanzas.map(stanza => stanza.lines.join(""));
  if (overflow.length) paragraphs.push(overflow.join("\n"));
  const heading = [options.title && title ? title : "", options.form ? `${form.name} · ${form.author}体（谱式）` : ""].filter(Boolean);
  return [...heading, paragraphs.join("\n\n")].join("\n\n");
}
