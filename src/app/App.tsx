import { flushSync } from "react-dom";
import { ReferenceSessionProvider } from "../components/reference/ReferenceSession";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { navigate, parseRoute, routeHash, registerNavigationHandler, type AppRoute } from "./routes";
import { HomePage } from "../pages/HomePage";
import { AppNavigation } from "../components/navigation/AppNavigation";
import { BackupDialog } from "../components/works/BackupDialog";
import { type ReadingLaunch } from "../features/reference/readingLaunch";
const ReferencePage = lazy(() => import("../pages/ReferencePage").then(module => ({ default: module.ReferencePage })));
import { WorkEditorPage } from "../pages/WorkEditorPage";
import type { SourceViewState } from "../features/works/useSourceView";
import { WorksPage, emptyWorkFilters, type LibraryViewState } from "../pages/WorksPage";
import { createNavigationCoordinator } from "./navigationCoordinator";
import { canLeave } from "../shared/close";
import { flushBeforeClose } from "../services/closeCoordinator";

function routeLabel(route: AppRoute): string {
  if (route.kind === "home") return "首页";
  if (route.kind === "spaces") return route.room === "song" ? "歌房" : "诗房";
  if (route.kind === "ci") return "词房";
  if (route.kind === "reference") return "阅读";
  if (route.kind === "notes") return "摘记";
  return "诗稿";
}

export function App(): JSX.Element {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.hash));
  const committedRoute = useRef(route);
  const pageTransition = useRef<{ skipTransition(): void } | null>(null);
  const referenceVisited = useRef(false);
  if (route.kind === "reference"||route.kind === "notes") referenceVisited.current = true;
  const [backupOpen,setBackupOpen]=useState(false),[dataRevision,setDataRevision]=useState(0),[readingLaunch,setReadingLaunch]=useState<ReadingLaunch|null>(null);
  const [motion,setMotion]=useState(()=>{try{return localStorage.getItem("shifang.home.motion")!=="off"&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches}catch{return true}});
  const [leaveError, setLeaveError] = useState("");
  const libraryView=useRef<LibraryViewState>({filters:{...emptyWorkFilters,room:route.kind==="works"&&route.room?route.room:"all"},scrollTop:0,loadedPages:1});
  const homeView = useRef<SourceViewState>({ scrollTop: 0 });
  const editorReturnRoute=useRef<AppRoute>({kind:"works"});

  useEffect(() => {
    const historyKey = "shifangNavigationIndex";
    let committedIndex = Number.isInteger(window.history.state?.[historyKey]) ? window.history.state[historyKey] as number : 0;
    let restoring: { route: AppRoute; index?: number } | null = null;
    window.history.replaceState({ ...window.history.state, [historyKey]: committedIndex }, "");
    const navigation = createNavigationCoordinator(flushBeforeClose, (next, replace, historyIndex) => {
      const returningToSource=committedRoute.current.kind === "work" && routeHash(next) === routeHash(editorReturnRoute.current);
      if(next.kind === "works" && next.room && !returningToSource) libraryView.current={filters:{...emptyWorkFilters,room:next.room},scrollTop:0,loadedPages:1,density:libraryView.current.density};
      const hash = routeHash(next);
      if (historyIndex !== undefined && historyIndex !== committedIndex) {
        window.history.go(historyIndex - committedIndex);
        committedIndex = historyIndex;
      } else if (replace) window.history.replaceState({ ...window.history.state, [historyKey]: committedIndex }, "", hash);
      else if (hash !== routeHash(committedRoute.current)) {
        committedIndex += 1;
        window.history.pushState({ [historyKey]: committedIndex }, "", hash);
      }
      const previous = committedRoute.current;
      committedRoute.current = next;
      pageTransition.current?.skipTransition();
      pageTransition.current = null;
      const primary = (r: AppRoute) => ["home", "works", "reference", "notes"].includes(r.kind);
      const transitions = document as Document & { startViewTransition?: (update: () => void) => { skipTransition(): void; ready: Promise<void>; finished: Promise<void> } };
      if (primary(previous) && primary(next) && previous.kind !== next.kind && transitions.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.documentElement.dataset.pageMotion = previous.kind === "home" || next.kind === "home" ? "home" : "paper";
        const transition = transitions.startViewTransition(() => { if (committedRoute.current === next) flushSync(() => setRoute(next)); });
        pageTransition.current = transition;
        void transition.ready.catch(() => {}); // Interrupted snapshots are expected during quick navigation.
        void transition.finished.catch(() => {}).finally(() => {
          if (pageTransition.current === transition) pageTransition.current = null;
        });
      } else setRoute(next);
    }, setLeaveError);
    const disposeNavigation = registerNavigationHandler((next) => {
      if (restoring) restoring = { route: next };
      else navigation.request(next);
    });
    const onLocationChange = () => {
      const index = window.history.state?.[historyKey];
      if (restoring) {
        if (index === committedIndex) {
          const target = restoring;
          restoring = null;
          navigation.request(target.route, false, target.index);
        }
        return;
      }
      const next = parseRoute(window.location.hash);
      if (routeHash(next) === routeHash(committedRoute.current)) return;
      if (Number.isInteger(index) && index !== committedIndex) {
        // Restore the history position as well as the URL, so a failed back/
        // forward attempt remains retryable without overwriting its destination.
        restoring = { route: next, index };
        window.history.go(committedIndex - index);
        return;
      }
      // Browser hash/back/forward has already moved the URL. Keep the mounted
      // editor and restore its URL until the same save barrier grants the move.
      window.history.replaceState(window.history.state, "", routeHash(committedRoute.current));
      navigation.request(next, true);
    };
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    if (!window.location.hash) window.history.replaceState(window.history.state, "", routeHash(committedRoute.current));
    const disposeClose = window.shifang.app.onBeforeClose(async (requestId) => {
      setLeaveError("");
      const result = await flushBeforeClose();
      if (!canLeave(result) && "message" in result) setLeaveError(result.message);
      window.shifang.app.completeClose(requestId, result);
    });
    const disposeCancelled = window.shifang.app.onCloseCancelled((result) => {
      if ("message" in result) setLeaveError(result.message);
    });
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
      disposeNavigation(); navigation.dispose(); disposeClose(); disposeCancelled();
    };
  }, []);

  function openWork(id: string): void {
    if(route.kind!=="work")editorReturnRoute.current=route;
    navigate({ kind: "work", workId: id });
  }

  return (
    <ReferenceSessionProvider><main className={`app-shell unified-shell${route.kind==='home'?' is-home':''}`}>
      <div className="window-atmosphere" aria-hidden="true" />
      <div className="window-drag-strip" aria-hidden="true" />
      <AppNavigation route={route} onBackup={()=>setBackupOpen(true)} motion={motion} onMotion={()=>setMotion(old=>{try{localStorage.setItem('shifang.home.motion',old?'off':'on')}catch{}return !old})} onError={setLeaveError}/>
      <section className="workspace">
        {leaveError ? <div className="operation-error" role="alert">{leaveError}</div> : null}
        {route.kind === "home" ? <HomePage viewState={homeView} onOpenWork={openWork} onCreateWork={()=>navigate({kind:"works"})} motion={motion} onRead={target=>{setReadingLaunch({...target,revision:Date.now(),returnHome:true});navigate({kind:"reference"})}} /> : null}

        {route.kind === "works" ? <WorksPage key={(route.room ?? "library")+dataRevision} viewState={libraryView} onOpenWork={openWork} onCreateWork={()=>{}} /> : null}
        {route.kind === "work" ? <WorkEditorPage key={route.workId} workId={route.workId} backLabel={routeLabel(editorReturnRoute.current)} onBack={() => navigate(editorReturnRoute.current)} onArchived={() => navigate({ kind: "works" })} /> : null}

        {referenceVisited.current ? <Suspense fallback={route.kind === "reference" ? <p role="status">正在打开资料…</p> : null}><ReferencePage key={dataRevision} active={route.kind === "reference"||route.kind === "notes"} mode={route.kind==='notes'?'notes':'reading'} launch={readingLaunch} /></Suspense> : null}
      </section>
      {backupOpen?<BackupDialog onClose={()=>setBackupOpen(false)} onRestored={()=>{setBackupOpen(false);setDataRevision(v=>v+1);libraryView.current={filters:{...emptyWorkFilters},scrollTop:0,loadedPages:1};navigate({kind:"works"})}}/>:null}
    </main></ReferenceSessionProvider>
  );
}
