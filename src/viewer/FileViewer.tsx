import { convertFileSrc } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { readFile, type FileContents } from "./fileClient";

/**
 * Raw HTML in a file is shown as text rather than rendered: the viewer opens
 * whatever the terminal pointed at, and that is not something to trust.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });

const MARKDOWN = /\.(md|markdown)$/i;

interface FileViewerProps {
  path: string;
  onClose: () => void;
}

/** Read-only look at a file, next to the terminal that named it. */
export function FileViewer({ path, onClose }: FileViewerProps) {
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
    <section className="viewer">
      <header className="viewer__header">
        <span className="viewer__name" title={path}>
          {file?.name ?? path}
        </span>
        <button type="button" onClick={onClose} title={t("viewer.close")}>
          ×
        </button>
      </header>

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
    </section>
  );
}
