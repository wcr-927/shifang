import { useEffect, useRef, forwardRef, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
export const ManuscriptPage = forwardRef<HTMLElement, ComponentPropsWithoutRef<'section'>>(function ManuscriptPage({ className = '', ...props }, ref) { return <section {...props} ref={ref} data-manuscript-ui data-editor-root className={`editor-page new-manuscript ${className}`}/>; });
export function ManuscriptPaper({ children, scrollRef, label, syllables }: {
    children: ReactNode;
    scrollRef?: RefObject<HTMLDivElement>;
    label: string;
    syllables?: number;
}) { return <div className="manuscript-column" data-syllables={syllables}><div ref={scrollRef} className="manuscript-scroll" role="region" aria-label={label} tabIndex={0}>{children}</div></div>; }
export function ManuscriptStamp(props: ComponentPropsWithoutRef<'button'>) { return <button type="button" {...props} className={`manuscript-stamp ${props.className ?? ''}`}/>; }
export function ManuscriptStampSummary(props: ComponentPropsWithoutRef<'summary'>) { return <summary {...props} className={`manuscript-stamp ${props.className ?? ''}`}/>; }
export const ManuscriptHeader = forwardRef<HTMLElement, {
    onBack: () => void;
    context: string;
    children: ReactNode;
}>(function ManuscriptHeader({ onBack, children }, ref) { return <header ref={ref} className="editor-header manuscript-topline manuscript-paper-toolbar"><div className="editor-location"><button className="back-button book-brand" onClick={onBack} aria-label="返回来源页面">返回</button></div><div className="editor-actions">{children}</div></header>; });
/** Legacy detail/export/history content is explicitly outside the new page's style boundary. */
export function LegacyEditorPortal({ children }: {
    children: ReactNode;
}) { return createPortal(<div className="legacy-editor-portal editor-page">{children}</div>, document.body); }
export const ManuscriptAuxiliary = forwardRef<HTMLElement, ComponentPropsWithoutRef<'aside'>>(function ManuscriptAuxiliary({ className = '', ...props }, ref) { return <aside {...props} ref={ref} className={`manuscript-inspector ${className}`}/>; });
export function ManuscriptAuxiliarySection({ children, ...props }: ComponentPropsWithoutRef<'section'>) { const ref = useRef<HTMLElement>(null); useEffect(() => { const scroll = ref.current?.querySelector<HTMLElement>('.manuscript-inspector-scroll'); if (!scroll)
    return; const measure = () => ref.current?.style.setProperty('--rail-gutter', `${scroll.offsetWidth - scroll.clientWidth}px`); measure(); const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure); observer?.observe(scroll); return () => observer?.disconnect(); }, []); return <section {...props} ref={ref} className="manuscript-inspector-zone">{children}</section>; }

export function ManuscriptTopline({children}:{children:ReactNode}){return <div className="manuscript-topline"><div className="manuscript-breadcrumb">我的作品</div><div className="manuscript-heading-actions">{children}</div></div>;}
