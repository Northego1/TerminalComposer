import { convertFileSrc } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
import { useEffect, useState } from "react";

import type { ViewerFiles } from "../app/tabsStore";
import { useT } from "../i18n";
import { readFile, type FileContents } from "./fileClient";

/**
 * Raw HTML in a file is shown as text rather than rendered: the viewer opens
 * whatever the terminal pointed at, and that is not something to trust.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });

const MARKDOWN = /\.(md|markdown)$/i;

interface FileViewerProps {
  files: ViewerFiles;
  onShow: (path: string) => void;
  onClose: (path: string) => void;
}

/** The files opened beside a terminal, each on its own tab. */
export function FileViewer({ files, onShow, onClose }: FileViewerProps) {
  const t = useT();

  return (
    <section className="viewer">
      <nav className="viewer__tabs">
        {files.paths.map((path) => (
          <div
            key={path}
            className={`viewer__tab${path === files.active ? " viewer__tab--active" : ""}`}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              onClose(path);
            }}
          >
            <button type="button" onClick={() => onShow(path)} title={path}>
              {basename(path)}
            </button>
            <button
              type="button"
              className="viewer__close"
              onClick={() => onClose(path)}
              title={t("viewer.close")}
            >
              ×
            </button>
          </div>
        ))}
      </nav>

      <FileContentsView key={files.active} path={files.active} />
    </section>
  );
}

function FileContentsView({ path }: { path: string }) {
  const t = useT();
  const [file, setFile] = useState<FileContents | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readFile(path)
      .then((contents) => !cancelled && setFile(contents))
      .catch((cause: unknown) => !cancelled && setError(String(cause)));
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="viewer__body">
      {error && <p className="viewer__note viewer__note--error">{error}</p>}
      {file?.kind === "image" && (
        <img className="viewer__image" src={convertFileSrc(file.path)} alt={file.name} />
      )}
      {file?.kind === "binary" && <p className="viewer__note">{t("viewer.binary")}</p>}
      {file?.kind === "text" &&
        (MARKDOWN.test(file.name) ? (
          <div
            className="viewer__markdown"
            dangerouslySetInnerHTML={{ __html: markdown.render(file.text ?? "") }}
          />
        ) : (
          <pre className="viewer__text">{file.text}</pre>
        ))}
      {file?.truncated && <p className="viewer__note">{t("viewer.truncated")}</p>}
    </div>
  );
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}
