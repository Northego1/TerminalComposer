import { convertFileSrc } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";

import { useT } from "../i18n";
import { openExternal, readFile, type FileContents } from "./fileClient";

/**
 * Raw HTML in a file is shown as text rather than rendered: the viewer opens
 * whatever the terminal pointed at, and that is not something to trust.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });

const MARKDOWN = /\.(md|markdown)$/i;

/**
 * A link in a viewed file opens in the browser, never in this window.
 *
 * The window has no address bar and no way back: following a link in it would
 * replace the application with a page from a file it was told to open. So the
 * navigation is always cancelled, and the address is handed to the desktop --
 * which refuses anything that is not http or https.
 */
function followLink(event: ReactMouseEvent<HTMLDivElement>): void {
  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute("href") ?? "";
  if (/^https?:\/\//i.test(href)) void openExternal(href);
}

/** One file, read-only, filling the space the terminal would have. */
export function FileViewer({ path }: { path: string }) {
  const t = useT();
  const [file, setFile] = useState<FileContents | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    readFile(path)
      .then((contents) => !cancelled && setFile(contents))
      .catch((cause: unknown) => !cancelled && setError(String(cause)));
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="viewer">
      {error && <p className="viewer__note viewer__note--error">{error}</p>}
      {file?.kind === "image" && (
        <img className="viewer__image" src={convertFileSrc(file.path)} alt={file.name} />
      )}
      {file?.kind === "binary" && <p className="viewer__note">{t("viewer.binary")}</p>}
      {file?.kind === "text" &&
        (MARKDOWN.test(file.name) ? (
          <div
            className="viewer__markdown"
            onClick={followLink}
            dangerouslySetInnerHTML={{ __html: markdown.render(file.text ?? "") }}
          />
        ) : (
          <pre className="viewer__text">{file.text}</pre>
        ))}
      {file?.truncated && <p className="viewer__note">{t("viewer.truncated")}</p>}
    </div>
  );
}
