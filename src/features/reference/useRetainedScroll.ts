import { useLayoutEffect, useRef, type UIEvent } from "react";
/** Hidden overflow panes retain their authored viewport across tabs and sidebar navigation. */
export function useRetainedScroll(visibleKey: string | boolean): (event: UIEvent<HTMLElement>) => void {
  const positions = useRef(new Map<HTMLElement, { top: number; left: number }>());
  useLayoutEffect(() => {
    for (const [element, position] of positions.current) {
      if (!element.isConnected) positions.current.delete(element);
      else if (!element.closest("[hidden]")) { element.scrollTop = position.top; element.scrollLeft = position.left; }
    }
  }, [visibleKey]);
  return event => {
    const element = event.target;
    if (element instanceof HTMLElement && !element.closest("[hidden]")) positions.current.set(element, { top: element.scrollTop, left: element.scrollLeft });
  };
}
