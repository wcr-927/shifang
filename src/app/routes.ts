export type AppRoute =
  | { kind: "home" }
  | { kind: "works"; room?: "poetry" | "ci" | "song" }
  | { kind: "spaces"; room?: "poetry" | "song" }
  | { kind: "work"; workId: string }
  | { kind: "reference" }
  | { kind: "notes" }
  | { kind: "ci" };

export function parseRoute(hash: string): AppRoute {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/spaces") return { kind: "works", room: "poetry" };
  if (path === "/spaces/ci") return { kind: "works", room: "ci" };
  if (path === "/spaces/poetry" || path === "/spaces/song") return { kind: "works", room: path.endsWith("song") ? "song" : "poetry" };
  if (path === "/works") return { kind: "works" };
  const roomMatch = path.match(/^\/works\?room=(poetry|ci|song)$/u);
  if (roomMatch) return { kind: "works", room: roomMatch[1] as "poetry" | "ci" | "song" };
  if (path === "/notes") return {kind:"notes"};
  if (path === "/reference") return { kind: "reference" };
  const workMatch = path.match(/^\/works\/([^/]+)$/u);
  if (workMatch) return { kind: "work", workId: decodeURIComponent(workMatch[1]) };
  return { kind: "home" };
}

export function routeHash(route: AppRoute): string {
  if (route.kind === "spaces") return `#/spaces/${route.room ?? "poetry"}`;
  if (route.kind === "ci") return "#/spaces/ci";
  if (route.kind === "works") return `#/works${route.room ? `?room=${route.room}` : ""}`;
  if (route.kind === "notes") return "#/notes";
  if (route.kind === "reference") return "#/reference";
  if (route.kind === "work") return `#/works/${encodeURIComponent(route.workId)}`;
  return "#/";
}

let navigationHandler: ((route: AppRoute) => void) | null = null;

export function registerNavigationHandler(handler: (route: AppRoute) => void): () => void {
  navigationHandler = handler;
  return () => { if (navigationHandler === handler) navigationHandler = null; };
}

export function navigate(route: AppRoute): void {
  if(route.kind==='spaces')route={kind:'works',room:route.room??'poetry'};else if(route.kind==='ci')route={kind:'works',room:'ci'};
  if (navigationHandler) navigationHandler(route);
  else window.location.hash = routeHash(route);
}
