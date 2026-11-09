import type { ReferenceSystem } from "./reference";
import type { WorkGenre } from "./work";

export type ReferencePatternContext =
  | { kind:"metre"; templateId:WorkGenre; variantId?:string; mode:"locked"|"adopted"|"reference" }
  | { kind:"ci"; formId:string; version:string; available?:boolean };
export type ReferenceIntent =
  | { kind:"character"; system:ReferenceSystem; character:string }
  | { kind:"group"; system:ReferenceSystem; groupId:string; character?:string }
  | { kind:"pattern"; pattern:ReferencePatternContext };
export type ReferenceContextRequest = ReferenceIntent & { id:string };
export const REFERENCE_CONTEXT_EVENT="shifang:reference-context";
let sequence=0;
/** Explicit user actions only; the event does not mutate manuscript state. */
export function dispatchReferenceIntent(source:Element|null,intent:ReferenceIntent):void {
  const owner=source?.closest(".editor-page")??source;
  owner?.dispatchEvent(new CustomEvent<ReferenceContextRequest>(REFERENCE_CONTEXT_EVENT,{bubbles:true,detail:{...intent,id:`reference-context-${++sequence}`}}));
}
export function completeSelectedCharacter(value:string,start:number|null,end:number|null):string|undefined {
  if(start===null||end===null||start===end)return;
  const character=value.slice(Math.min(start,end),Math.max(start,end));
  return Array.from(character).length===1&&!/^[\uD800-\uDFFF]$/u.test(character)?character:undefined;
}
