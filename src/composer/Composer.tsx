import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { useFocusStore } from "../app/focusStore";
import { useTabsStore } from "../app/tabsStore";
import { scheduleWorkspaceSave } from "../app/workspace";
import { t as translate, useT } from "../i18n";
import { isEmptyMessage, type Message } from "../message/types";
import type { Attachment } from "../message/types";
import { SessionContextLine, useSessionContext } from "./SessionContextLine";
import { attachmentsFromClipboard, attachmentsFromPaths } from "./attachments/ingest";
import { useFileDrop } from "./attachments/useFileDrop";
import { CompletionList } from "./completion/CompletionList";
import { useCompletion } from "./completion/useCompletion";
import { attachmentNodeFor } from "./editor/AttachmentNode";
import { composerExtensions, type ComposerHandlers } from "./editor/createEditor";
import { docToText, needsFullComposer } from "./editor/documentText";
import {
  loadComposerState,
  pruneComposerStates,
  saveComposerState,
} from "./state/drafts";
import {
  EMPTY_HISTORY,
  next,
  previous,
  remember,
  type Draft,
} from "./state/history";
import { toMessage } from "./state/toMessage";

/** How long after a submission Esc still means "take it back". */
const UNDO_WINDOW_MS = 4000;

interface ComposerProps {
  onSubmit: (message: Message) => void;
  /** Asks the target to stop what the last submission started. */
  onAbort: () => void;
  /** Ctrl+C: interrupt the target outright. */
  onInterrupt: () => void;
  disabled?: boolean;
}

/**
 * The composer: a small rich-text editor whose only output is a `Message`.
 *
 * It has no reference to the terminal, the PTY or any particular target --
 * see `src/message/adapters` for who turns a message into bytes.
 */
export function Composer({
  onSubmit,
  onAbort,
  onInterrupt,
  disabled = false,
}: ComposerProps) {
  const [undoable, setUndoable] = useState<Draft | null>(null);
  /**
   * Compact while the content is one command line, full once it is a message.
   * Derived from the document on every edit, so erasing back to one line
   * returns to the compact shape without anything to switch.
   */
  const [full, setFull] = useState(false);
  const t = useT();
  const pane = useFocusStore((state) => state.pane);
  const focusPane = useFocusStore((state) => state.focusPane);
  const pinned = useFocusStore((state) => state.pinned);
  const togglePinned = useFocusStore((state) => state.togglePinned);

  // Keyboard handlers run outside React's render, so everything they touch
  // lives in refs and stays current without rebuilding the editor.
  const history = useRef(EMPTY_HISTORY);
  const undoableRef = useRef<Draft | null>(null);
  const callbacks = useRef({ onSubmit, onAbort, onInterrupt });
  useEffect(() => {
    callbacks.current = { onSubmit, onAbort, onInterrupt };
  });

  const rememberUndoable = (draft: Draft | null) => {
    undoableRef.current = draft;
    setUndoable(draft);
  };

  /** Which session's state the editor currently holds. */
  const loadedId = useRef<string | null>(null);

  const handlers = useRef<ComposerHandlers>({
    submit: () => false,
    cancel: () => false,
    recallPrevious: () => false,
    recallNext: () => false,
    interrupt: () => false,
    completionMove: () => false,
    completionAccept: () => false,
    completionClose: () => false,
    completionRequest: () => false,
  });

  // Paste handling needs the editor from inside options built before it
  // exists, so it goes through a ref.
  const editorRef = useRef<Editor | null>(null);
  /** Guards the text fallback below from re-entering the paste handler. */
  const repasting = useRef(false);

  const insertAttachments = (attachments: Attachment[]) => {
    if (!attachments.length) return;
    editorRef.current
      ?.chain()
      .focus()
      .insertContent(attachments.map(attachmentNodeFor))
      .run();
  };

  const completionRef = useRef<ReturnType<typeof useCompletion> | null>(null);

  const editor = useEditor({
    extensions: composerExtensions(() => handlers.current, () =>
      translate("composer.placeholder"),
    ),
    editorProps: {
      attributes: { class: "composer__editor" },
      handlePaste: (view, event) => {
        if (repasting.current) return false;
        if (!mayCarryFiles(event)) return false;

        // The webview cannot tell us where a pasted file lives, so the native
        // side is asked instead. The event is consumed while that answer is in
        // flight; if it turns out there were no files after all, the text is
        // pasted the way ProseMirror would have done it.
        const text = event.clipboardData?.getData("text/plain") ?? "";
        void attachmentsFromClipboard()
          .catch(() => [])
          .then((attachments) => {
            if (attachments.length) return insertAttachments(attachments);
            if (!text) return;
            repasting.current = true;
            try {
              view.pasteText(text);
            } finally {
              repasting.current = false;
            }
          });
        return true;
      },
    },
    onFocus: () => focusPane("composer"),
    onUpdate: ({ editor: updated }) => {
      rememberUndoable(null);
      completionRef.current?.refresh();
      setFull(needsFullComposer(updated.state.doc));
      // Keeping the session's draft current on every edit is what lets both
      // switching sessions and quitting the app pick it up unchanged.
      saveComposerState(loadedId.current, {
        doc: updated.getJSON(),
        history: history.current,
      });
      scheduleWorkspaceSave();
    },
  });

  editorRef.current = editor;

  // While the composer is a command line, commands complete on their own;
  // once it is a message, completion waits to be asked.
  const completion = useCompletion(editor, !full);
  completionRef.current = completion;

  handlers.current = {
    submit: () => {
      if (!editor) return false;
      const message = toMessage(editor.state.doc);
      if (isEmptyMessage(message)) return true;

      const sent = currentDraft();
      callbacks.current.onSubmit(message);
      history.current = remember(history.current, sent);
      editor.commands.clearContent(true);
      rememberUndoable(sent);
      return true;
    },

    // Esc right after a submission puts the text back and interrupts the
    // target; then, if a program is waiting for it, Esc belongs to that
    // program; otherwise it just leaves the composer.
    cancel: () => {
      const restore = undoableRef.current;
      if (restore === null) {
        focusPane("terminal");
        return true;
      }
      callbacks.current.onAbort();
      replaceContent(restore);
      return true;
    },

    recallPrevious: () => {
      if (!editor) return false;
      const recalled = previous(history.current, currentDraft());
      if (!recalled) return false;
      history.current = recalled.history;
      replaceContent(recalled.draft);
      return true;
    },

    recallNext: () => {
      if (!editor) return false;
      const recalled = next(history.current);
      if (!recalled) return false;
      history.current = recalled.history;
      replaceContent(recalled.draft);
      return true;
    },

    completionMove: (by) => (completion.state.items.length ? completion.move(by) : false),
    completionAccept: () => completion.accept(),
    completionClose: () => {
      if (!completion.state.items.length) return false;
      completion.close();
      return true;
    },
    completionRequest: () => {
      completion.request();
      return true;
    },

    // Clearing goes through the editor, so Ctrl+Z brings the draft back.
    interrupt: () => {
      editor?.commands.clearContent(true);
      callbacks.current.onInterrupt();
      return true;
    },
  };

  /** The editor document as a draft: what history and undo store. */
  function currentDraft(): Draft {
    return {
      doc: editor?.getJSON() ?? EMPTY_HISTORY.draft.doc,
      text: editor ? docToText(editor.state.doc) : "",
    };
  }

  /** Restored content lands with the caret at the end, ready to be edited. */
  function replaceContent(draft: Draft) {
    editor?.commands.setContent(draft.doc);
    if (editor) setFull(needsFullComposer(editor.state.doc));
    editor?.commands.focus("end");
    rememberUndoable(null);
  }

  // Files dropped anywhere over the composer become attachments. A drag
  // entering the window opens the composer, so the target is not a 44px strip.
  const dropTarget = useRef<HTMLDivElement>(null);
  const { dragging, over } = useFileDrop(dropTarget, (paths) => {
    void attachmentsFromPaths(paths).then(insertAttachments);
  });

  useEffect(() => {
    if (dragging) focusPane("composer");
  }, [dragging, focusPane]);

  // Each terminal has its own draft and its own history: what is in the editor
  // belongs to the session that is open, and comes back when it is again.
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const sessionContext = useSessionContext(activeId);

  useEffect(() => {
    if (!editor || loadedId.current === activeId) return;

    if (loadedId.current !== null) {
      saveComposerState(loadedId.current, {
        doc: editor.getJSON(),
        history: history.current,
      });
    }

    const restored = loadComposerState(activeId);
    editor.commands.setContent(restored.doc);
    setFull(needsFullComposer(editor.state.doc));
    history.current = restored.history;
    rememberUndoable(null);
    loadedId.current = activeId;
  }, [editor, activeId]);

  useEffect(() => {
    pruneComposerStates(tabs.map((tab) => tab.id));
  }, [tabs]);

  useEffect(() => {
    if (!editor) return;
    if (pane === "composer") editor.commands.focus();
    else editor.commands.blur();
  }, [pane, editor]);

  // The placeholder is a decoration, so a language change has to ask for one.
  useEffect(() => {
    editor?.view.dispatch(editor.state.tr);
  }, [editor, t]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (undoable === null) return;
    const timer = setTimeout(() => rememberUndoable(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoable]);

  const empty = !editor || editor.isEmpty;

  return (
    <div
      ref={dropTarget}
      className={[
        "composer",
        full ? "composer--full" : "composer--flat",
        pane === "composer" ? "composer--active" : "",
        over ? "composer--drop" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={() => focusPane("composer")}
    >
      {full && <SessionContextLine context={sessionContext} />}

      <div className="composer__row">
        {!full && (
          <span className="composer__chevron" aria-hidden="true">
            ❯
          </span>
        )}
          <EditorContent editor={editor} className="composer__surface" />
        <CompletionList
          state={completion.state}
          onChoose={(index) => {
            completion.move(index - completion.state.selected);
            completion.accept();
          }}
        />
        {!full && <SessionContextLine context={sessionContext} />}
      </div>

      {full && (
        <div className="composer__footer">
          <span
            className={`composer__hint${
              undoable !== null || over ? " composer__hint--undo" : ""
            }`}
          >
            {over
              ? t("composer.hint.drop")
              : undoable !== null
                ? t("composer.hint.undo")
                : pinned
                  ? t("composer.pinned")
                  : t("composer.hint")}
          </span>
          <button
            type="button"
            className={`composer__pin${pinned ? " composer__pin--on" : ""}`}
            onClick={togglePinned}
            title={t("composer.pin")}
            aria-pressed={pinned}
          >
            ⌾
          </button>
          <button
            type="button"
            className="composer__send"
            onClick={() => handlers.current.submit()}
            disabled={disabled || empty}
          >
            {t("composer.send")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Whether a paste might be carrying files, and is therefore worth asking the
 * native side about.
 *
 * Ordinary text is left to ProseMirror -- it pastes correctly and without a
 * round trip. What a webview reports for a file manager's copy varies: it may
 * announce a file list, or it may expose nothing but the path as plain text.
 * A path-shaped text is treated as a maybe and verified natively, which is
 * safe because the fallback still pastes it as text.
 */
function mayCarryFiles(event: ClipboardEvent): boolean {
  const types = Array.from(event.clipboardData?.types ?? []);
  if (
    types.includes("Files") ||
    types.includes("text/uri-list") ||
    types.includes("x-special/gnome-copied-files") ||
    types.some((type) => type.startsWith("image/"))
  ) {
    return true;
  }
  if (!types.includes("text/plain")) return true;
  return looksLikePath(event.clipboardData?.getData("text/plain") ?? "");
}

/** A single line that is a `file://` URI or an absolute/home-relative path. */
function looksLikePath(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.includes("\n")) return false;
  return (
    trimmed.startsWith("file://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/")
  );
}
