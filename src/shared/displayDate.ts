export function displayDate(value:string):string {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"时间不详":new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(date);
}
