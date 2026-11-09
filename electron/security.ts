import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { isTrustedDocument } from "./securityPolicy.js";

type SenderEvent=IpcMainEvent|IpcMainInvokeEvent;
let window:()=>BrowserWindow|null=()=>null;
let documentUrl="";
export function configureIpcSecurity(getWindow:()=>BrowserWindow|null,url:string):void { window=getWindow;documentUrl=url; }
export function isTrustedSender(event:SenderEvent):boolean {
  const main=window();
  return !!main && !main.isDestroyed() && event.sender===main.webContents &&
    event.senderFrame===main.webContents.mainFrame && isTrustedDocument(event.senderFrame?.url??"",documentUrl);
}
/** Every channel, including health and close, uses the same frame and window boundary. */
export function handleTrusted(channel:string,handler:(event:IpcMainInvokeEvent,...args:any[])=>unknown):void {
  ipcMain.handle(channel,(event,...args)=>{
    if(!isTrustedSender(event))throw new Error("Untrusted IPC sender");
    return handler(event,...args);
  });
}
