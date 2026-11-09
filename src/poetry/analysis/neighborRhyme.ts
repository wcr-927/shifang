import type { RhymeFootAnalysis } from './poemAnalyzer.ts';

export const NEIGHBOR_RHYME_SOURCE = '王力《诗词格律》诗词余论·二、关于押韵的问题（OEBPS/Text/scgl-ch5-02.html，第20行）';

/** Directed first-line → body pairs, individually attested by the cited examples.
 * No numerical adjacency, transitive closure, or automatic reverse inference.
 */
export const SOURCED_NEIGHBOR_RHYME_PAIRS = [
  { first: 'ping-01dong', main: 'ping-02dong', example: '张籍《秋思》：风／重／封' },
  { first: 'ping-02dong', main: 'ping-01dong', example: '李颀《送李回》：农／雄／宫／中／东' },
  { first: 'ping-03jiang', main: 'ping-01dong', example: '李贺《马诗》：江／风／雄' },
  { first: 'ping-03jiang', main: 'ping-02dong', example: '张说《送萧都督》：江／宗／逢／冬／重' },
  { first: 'ping-13yuan', main: 'ping-12wen', example: '许浑《游维山新兴寺》：村／曛／闻／云／军' },
  { first: 'ping-12wen', main: 'ping-13yuan', example: '韦庄《柳谷道中作却寄》：纷／魂／村／门／孙' },
  { first: 'ping-11zhen', main: 'ping-12wen', example: '郑谷《少华甘露寺》：邻／闻／云／分／群' },
  { first: 'ping-14han', main: 'ping-01xian', example: '李咸用《题王处士山居》：寒／年／船／烟／仙' },
  { first: 'ping-15shan', main: 'ping-14han', example: '章碣《春别》：山／残／看／漫／寒' },
  { first: 'ping-01xian', main: 'ping-15shan', example: '白居易《白云泉》：泉／闲／间' },
  { first: 'ping-05wei', main: 'ping-04zhi', example: '杜秋娘《金缕衣》：衣／时／枝' },
  { first: 'ping-04zhi', main: 'ping-05wei', example: '武昌妓《续韦蟾句》：离／归／飞' },
] as const;

export interface FirstLineNeighborRhymeEvidence {
  rule: 'first-line-neighbor';
  status: 'confirmed' | 'possible';
  mainGroupId: string;
  firstGroupId: string | null;
  candidateFirstGroups: string[];
  source: string;
}

export function analyzeFirstLineNeighborRhyme(
  feet: readonly RhymeFootAnalysis[],
  requiredLineIndexes: readonly number[],
): FirstLineNeighborRhymeEvidence | undefined {
  if (!requiredLineIndexes.includes(0)) return undefined;
  const bodyIndexes = [...new Set(requiredLineIndexes.filter(index => index !== 0))];
  if (bodyIndexes.length < 2) return undefined;
  const body = bodyIndexes.map(index => feet.find(foot => foot.lineIndex === index));
  if (body.some(foot => !foot?.character || foot.toneStatus !== 'match' || !foot.selectedGroupId)) return undefined;
  const mainGroupId = body[0]!.selectedGroupId!;
  if (body.some(foot => foot!.selectedGroupId !== mainGroupId)) return undefined;
  const first = feet.find(foot => foot.lineIndex === 0);
  if (!first?.character || first.toneStatus !== 'match') return undefined;
  const candidates = first.selectedGroupId ? [first.selectedGroupId] : first.candidateGroupIds;
  const pairs = SOURCED_NEIGHBOR_RHYME_PAIRS.filter(pair => pair.main === mainGroupId && candidates.includes(pair.first));
  if (!pairs.length) return undefined;
  return {
    rule: 'first-line-neighbor',
    status: first.selectedGroupId ? 'confirmed' : 'possible',
    mainGroupId,
    firstGroupId: first.selectedGroupId,
    candidateFirstGroups: [...new Set(pairs.map(pair => pair.first))],
    source: `${NEIGHBOR_RHYME_SOURCE}；${pairs.map(pair => pair.example).join('；')}`,
  };
}
