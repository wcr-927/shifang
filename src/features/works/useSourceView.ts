import { useLayoutEffect, useRef, type MutableRefObject, type UIEvent } from "react";

export interface SourceViewState { scrollTop: number }

/** Restore after the asynchronous list has mounted, without overwriting memory while loading. */
export function useSourceView(ready: boolean, viewState?: MutableRefObject<SourceViewState>) {
  const local = useRef<SourceViewState>({ scrollTop: 0 });
  const memory = viewState ?? local;
  const page = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (ready && page.current) page.current.scrollTop = memory.current.scrollTop;
  }, [ready, memory]);
  const capture = () => { if (ready && page.current) memory.current.scrollTop = page.current.scrollTop; };
  const onScroll = (event: UIEvent<HTMLElement>) => { if (ready) memory.current.scrollTop = event.currentTarget.scrollTop; };
  return { page, capture, onScroll };
}
