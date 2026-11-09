import { z } from 'zod';
export const ciChoiceSchema=z.object({line:z.number().int().nonnegative(),offset:z.number().int().nonnegative(),source:z.string().max(100000),character:z.string().min(1).max(2),candidate:z.string().max(100)}).strict();
export const ciStateSchema=z.object({formId:z.string().max(100),version:z.string().max(100),rhymeVersion:z.string().max(100),choices:z.array(ciChoiceSchema).max(1000)}).strict();
export type CiState=z.infer<typeof ciStateSchema>;
export type CiChoice=z.infer<typeof ciChoiceSchema>;
