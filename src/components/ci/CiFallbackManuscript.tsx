import { TitleField } from "../editor/TitleField";
export function CiFallbackManuscript({ title, body, onTitleChange, onBodyChange }: {
  title: string; body: string; onTitleChange: (title: string) => void; onBodyChange: (body: string) => void;
}) {
  return <div className="free-scroll manuscript-scroll" role="region" aria-label="词稿正文滚动区" tabIndex={-1}><div className="free-composition">
    <TitleField value={title} onChange={onTitleChange} className="free-title" />
    <textarea className="free-body ci-fallback-body" aria-label="词稿正文" value={body}
      onChange={event => onBodyChange(event.target.value)} spellCheck={false} />
  </div></div>;
}
