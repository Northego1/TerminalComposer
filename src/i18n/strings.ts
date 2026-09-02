/**
 * Every string the user sees.
 *
 * English is the base: it is the complete dictionary, and its keys are the
 * type, so a missing Russian translation is a compile error rather than a
 * blank label.
 */
export const EN = {
  "app.error.spawn": "Could not start the shell:",
  "app.shell.prompt": "shell · waiting",
  "app.shell.running": "shell · running",

  "sidebar.newTerminal": "New terminal (Ctrl+Shift+T)",
  "sidebar.closeTab": "Close tab",
  "sidebar.newSettings": "Open settings in a new tab",
  "sidebar.settings": "Settings",
  "sidebar.terminalName": "Terminal {n}",

  "composer.placeholder": "Write a message or a command…",
  "composer.hint":
    "Enter — send · Shift+Enter — new line · ↑↓ — history · Ctrl+C — reset · Esc — collapse",
  "composer.hint.undo": "Esc — take the message back",
  "composer.hint.drop": "Release to attach the files",
  "composer.send": "Enter →",
  "composer.expand": "Open composer",

  "attachment.image": "Image {n}",
  "attachment.remove": "Remove attachment",

  "search.placeholder": "Search the terminal",
  "search.previous": "Previous (↑)",
  "search.next": "Next (↓)",
  "search.close": "Close (Esc)",

  "terminal.exited": "[process exited]",

  "viewer.close": "Close (the file stays where it is)",
  "viewer.binary": "Not a text file.",
  "viewer.truncated": "Shown from the beginning; the file is longer.",

  "settings.title": "Settings",
  "settings.tab.general": "General",
  "settings.tab.terminal": "Terminal",
  "settings.tab.composer": "Composer",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.fontFamily": "Font",
  "settings.fontFamily.system": "System monospace",
  "settings.fontSize": "Font size",
  "settings.scrollback": "Scrollback, lines",
  "settings.shellIntegration": "Shell integration",
  "settings.shellIntegration.note":
    "Lets the shell say whether it is waiting for a command or running one, which is what decides where the keyboard goes. Only zsh for now; your ~/.zshrc is not modified.",
  "settings.shell": "Shell for new tabs",
  "settings.shell.placeholder": "$SHELL",
  "settings.cwd": "Directory for new tabs",
  "settings.cwd.placeholder": "home directory",
  "settings.composerMaxHeight": "Max height, % of the window",
  "settings.note.terminal":
    "Shell and directory apply to new tabs. Everything else applies at once.",
  "settings.note.composer":
    "The composer grows with its text and starts scrolling at this height.",

  "number.decrease": "Decrease",
  "number.increase": "Increase",
} as const;

export type StringKey = keyof typeof EN;

export const RU: Record<StringKey, string> = {
  "app.error.spawn": "Не удалось запустить shell:",
  "app.shell.prompt": "shell · ждёт",
  "app.shell.running": "shell · выполняется",

  "sidebar.newTerminal": "Новый терминал (Ctrl+Shift+T)",
  "sidebar.closeTab": "Закрыть вкладку",
  "sidebar.newSettings": "Открыть настройки новой вкладкой",
  "sidebar.settings": "Настройки",
  "sidebar.terminalName": "Терминал {n}",

  "composer.placeholder": "Напишите сообщение или команду…",
  "composer.hint":
    "Enter — отправить · Shift+Enter — строка · ↑↓ — история · Ctrl+C — сброс · Esc — свернуть",
  "composer.hint.undo": "Esc — отменить отправку и вернуть текст",
  "composer.hint.drop": "Отпустите — файлы станут вложениями",
  "composer.send": "Enter →",
  "composer.expand": "Открыть composer",

  "attachment.image": "Изображение {n}",
  "attachment.remove": "Удалить вложение",

  "search.placeholder": "Поиск по терминалу",
  "search.previous": "Предыдущее (↑)",
  "search.next": "Следующее (↓)",
  "search.close": "Закрыть (Esc)",

  "terminal.exited": "[процесс завершён]",

  "viewer.close": "Закрыть (файл остаётся на месте)",
  "viewer.binary": "Это не текстовый файл.",
  "viewer.truncated": "Показано начало — файл длиннее.",

  "settings.title": "Настройки",
  "settings.tab.general": "Общее",
  "settings.tab.terminal": "Терминал",
  "settings.tab.composer": "Composer",
  "settings.language": "Язык",
  "settings.theme": "Тема",
  "settings.theme.dark": "Тёмная",
  "settings.theme.light": "Светлая",
  "settings.fontFamily": "Шрифт",
  "settings.fontFamily.system": "Системный моноширинный",
  "settings.fontSize": "Размер шрифта",
  "settings.scrollback": "Глубина scrollback, строк",
  "settings.shellIntegration": "Интеграция с shell",
  "settings.shellIntegration.note":
    "Позволяет шеллу сообщать, ждёт он команду или выполняет её — от этого зависит, кому достаётся клавиатура. Пока только zsh; ваш ~/.zshrc не меняется.",
  "settings.shell": "Shell для новых вкладок",
  "settings.shell.placeholder": "$SHELL",
  "settings.cwd": "Каталог для новых вкладок",
  "settings.cwd.placeholder": "домашний каталог",
  "settings.composerMaxHeight": "Макс. высота, % окна",
  "settings.note.terminal":
    "Shell и каталог применяются к новым вкладкам. Остальное — сразу ко всем.",
  "settings.note.composer":
    "Composer растёт вместе с текстом и на этой высоте начинает скроллиться.",

  "number.decrease": "Уменьшить",
  "number.increase": "Увеличить",
};
