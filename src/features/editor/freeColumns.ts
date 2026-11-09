import { emptyAssistance, type WorkAssistanceState } from '../../shared/assistanceState';
/** UTF-16 offset of the two literal newlines separating columns; never trim manuscript text. */
export function freeColumns(body:string, assistance?:WorkAssistanceState):[string,string] {
 const saved=assistance?.freeColumns?.breakOffset;
 if(saved===body.length)return[body,''];
 const offset=saved!==undefined&&body.slice(saved,saved+2)==='\n\n'?saved:body.indexOf('\n\n');
 return offset<0?[body,'']:[body.slice(0,offset),body.slice(offset+2)];
}
export function updateFreeColumn(body:string,assistance:WorkAssistanceState|undefined,index:0|1,value:string):{body:string;assistance:WorkAssistanceState} {
 const parts=freeColumns(body,assistance);parts[index]=value;
 const state={...(assistance??emptyAssistance())};
 // Until the right column is used, preserve the one-column manuscript byte-for-byte.
 if(!parts[1]&&(body.indexOf('\n\n')<0||assistance?.freeColumns?.breakOffset===body.length)&&index===0){state.freeColumns={breakOffset:parts[0].length};return{body:parts[0],assistance:state};}
 state.freeColumns={breakOffset:parts[0].length};
 return{body:parts.join('\n\n'),assistance:state};
}
