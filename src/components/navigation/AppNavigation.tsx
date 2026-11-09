import { useState } from 'react';
import { navigate, type AppRoute } from '../../app/routes';
import { PaperPopover } from '../common/PaperPopover';
import { flushBeforeClose } from '../../services/closeCoordinator';
import { canLeave } from '../../shared/close';
export function AppNavigation({route,onBackup,motion,onMotion,onError}:{route:AppRoute;onBackup:()=>void;motion:boolean;onMotion:()=>void;onError:(message:string)=>void}){
 const [anchor,setAnchor]=useState<HTMLElement|null>(null);const section=route.kind==='work'?'works':route.kind;
 return <header className="app-navigation"><button className="app-brand" aria-label="诗房首页" onClick={()=>navigate({kind:'home'})}>诗房</button><nav aria-label="主导航" data-section={section}>{([['works','创作'],['reference','阅读'],['notes','摘记']] as const).map(([kind,label])=><button key={kind} aria-current={section===kind?'page':undefined} onClick={()=>navigate({kind})}>{label}</button>)}<span className="app-nav-indicator" aria-hidden="true"/></nav><button className="app-more" aria-label="更多设置" aria-expanded={!!anchor} onClick={e=>setAnchor(anchor?null:e.currentTarget)}>···</button>{anchor?<PaperPopover anchor={anchor} label="更多设置" onClose={()=>setAnchor(null)}>{route.kind==='home'?<button role="menuitem" onClick={()=>{onMotion();setAnchor(null)}}>{motion?'暂停动态':'开启动画'}</button>:null}<button role="menuitem" onClick={async()=>{setAnchor(null);const result=await flushBeforeClose();if(canLeave(result))onBackup();else if('message'in result)onError(result.message)}}>备份与恢复</button></PaperPopover>:null}</header>;
}
