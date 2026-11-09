import { workTypeLabel } from '../../shared/work';
import type { WorkSummary } from '../../shared/workSummary';
export function workDisplayTitle(work:WorkSummary){return work.title.trim()||work.preview.trim().split(/\r?\n/u)[0]?.slice(0,40)||`未题 · ${workTypeLabel(work)}`;}
