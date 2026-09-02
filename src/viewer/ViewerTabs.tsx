import type { ViewerFiles } from "../app/tabsStore";
import { useT } from "../i18n";

interface ViewerTabsProps {
  terminalName: string;
  files: ViewerFiles;
  onShow: (path: string | null) => void;
  onClose: (path: string) => void;
}

/**
 * The row above the terminal: the terminal itself, and every file opened from
 * it. Shown only once a file has been opened -- a single tab over a terminal
 * would be a label, not a choice.
 */
export function ViewerTabs({ terminalName, files, onShow, onClose }: ViewerTabsProps) {
  const t = useT();

  return (
    <nav className="viewer-tabs">
      <button
        type="button"
        className={`viewer-tabs__tab${files.active === null ? " viewer-tabs__tab--active" : ""}`}
        onClick={() => onShow(null)}
      >
        <span className="viewer-tabs__icon" aria-hidden="true">
          ›_
        </span>
        {terminalName}
      </button>

      {files.paths.map((path) => (
        <div
          key={path}
          className={`viewer-tabs__tab${
            files.active === path ? " viewer-tabs__tab--active" : ""
          }`}
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
            className="viewer-tabs__close"
            onClick={() => onClose(path)}
            title={t("viewer.close")}
          >
            ×
          </button>
        </div>
      ))}
    </nav>
  );
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}
