import type { ReadingExplanation as Entry } from '../../shared/readingExplanation';

export function ReadingExplanation({entry}: {entry: Entry}): JSX.Element {
  if (entry.status === 'unavailable' || !entry.senses.length) {
    return <p className="explanation-unavailable">暂无释义资料</p>;
  }
  return <div className="reading-explanation">{entry.senses.map(sense =>
    <div className="explanation-sense" key={sense.id}><p>{sense.meaning}</p></div>
  )}</div>;
}
