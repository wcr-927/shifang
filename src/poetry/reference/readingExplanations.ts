import { readingEvidenceKeyId, readingEvidenceKeySchema, type ReadingEvidenceKey, type ReadingExplanation, type ReadingExplanationBundle } from '../../shared/readingExplanation';

/** An explanation never chooses a pronunciation or changes the analyzer's candidate set. */
export function getReadingExplanation(bundle:ReadingExplanationBundle,key:ReadingEvidenceKey):ReadingExplanation{
 const validKey=readingEvidenceKeySchema.parse(key);
 const entry=bundle.entries.find(entry=>readingEvidenceKeyId(entry.key)===readingEvidenceKeyId(validKey));
 return entry?structuredClone(entry):{key:validKey,status:'unavailable',senses:[],version:bundle.version};
}
