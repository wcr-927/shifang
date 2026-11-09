import data from './forms.json';
import cilin from './cilin.json';
import { loadCiRulesSafe } from './validate';
export const ciRuleData=loadCiRulesSafe(data,cilin);
export const ciRuleError=ciRuleData.error;
export interface CiLine { example:string; pattern:string; rhyme:string|null; rhymeTone:string|null; caesura:number|null }
export interface CiForm { id:string; name:string; author:string; summary:string; total:number; sections:number[]; lines:CiLine[]; repeat:number[][]; rhymeChanges:number[][]; source:string; book:string; version:string; scope:string; notes:string; sourceRhymeGaps?:{rhyme:string;groups:number[];tone:"R";source:string;note:string}[] }
export const ciForms=ciRuleData.forms as CiForm[];
export const ciForm=(id:string)=>ciForms.find(f=>f.id===id);
