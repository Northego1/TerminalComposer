/**
 * Every string the user sees.
 *
 * English is the base: it is the complete dictionary, and its keys are the
 * type, so a missing Russian translation is a compile error rather than a
 * blank label.
 */
export const EN = {
  "app.error.spawn": "Could not start the shell:",

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
  "composer.hint.secret": "A password is being asked for — type it in the terminal",
  "composer.send": "Enter →",
  "composer.expand": "Open composer",

  "attachment.remove": "Remove attachment",

  "search.placeholder": "Search the terminal",
  "search.previous": "Previous (↑)",
  "search.next": "Next (↓)",
  "search.close": "Close (Esc)",

  "terminal.exited": "[process exited]",

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
  "composer.hint.secret": "Запрошен пароль — набирайте его в терминале",
  "composer.send": "Enter →",
  "composer.expand": "Открыть composer",

  "attachment.remove": "Удалить вложение",

  "search.placeholder": "Поиск по терминалу",
  "search.previous": "Предыдущее (↑)",
  "search.next": "Следующее (↓)",
  "search.close": "Закрыть (Esc)",

  "terminal.exited": "[процесс завершён]",

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
