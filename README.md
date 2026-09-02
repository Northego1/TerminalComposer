# Terminal Composer

Linux-терминал с многострочным ChatGPT-подобным полем ввода вместо однострочного
shell prompt. Обычный terminal emulator (xterm.js + PTY) плюс composer, который
одинаково работает и с обычным shell, и с любым CLI-агентом (Claude Code, Codex,
Aider, …).

## Запуск в dev-режиме

Инструкция рассчитана на человека без опыта в Rust. Проверено на Ubuntu 24.04.

### 1. Системные библиотеки

Tauri рендерит окно через WebKitGTK, поэтому нужны dev-пакеты системных
библиотек:

```bash
sudo apt install -y \
  pkg-config \
  libwebkit2gtk-4.1-dev \
  libsoup-3.0-dev \
  librsvg2-dev \
  libxdo-dev \
  libayatana-appindicator3-dev \
  libdbus-1-dev
```

### 2. Rust

Если `rustc --version` ничего не выводит:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Отдельно ставить `tauri-cli` не нужно — он подключён как npm-зависимость проекта.

### 3. Node.js

Нужен Node 20+ (`node -v`).

### 4. Запуск

```bash
npm install
npm run tauri dev
```

Первая сборка Rust занимает несколько минут, последующие — секунды.

Полезные команды:

| Команда | Что делает |
|---|---|
| `npm run tauri dev` | запустить приложение |
| `npm test` | юнит-тесты фронтенда (vitest) |
| `npm run typecheck` | проверка типов TypeScript |
| `cd src-tauri && cargo test` | юнит-тесты Rust |

## Клавиатура

| Клавиши | Действие |
|---|---|
| `Enter` | отправить содержимое composer в терминал |
| `Shift+Enter` | новая строка в composer |
| `Esc` | из composer в терминал |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | переключение фокуса терминал / composer |

## Как устроен репозиторий

```
src/                        frontend: весь UI и UX
├── app/                    состояние уровня приложения
│   ├── focusStore.ts        какая панель активна (единственный источник правды)
│   └── useFocusHotkeys.ts   глобальные клавиши переключения панелей
├── terminal/               слой терминала
│   ├── ptyClient.ts         единственное место, знающее про Tauri IPC для PTY
│   ├── TerminalInstance.ts  xterm.js + PTY, DOM живёт вне React
│   └── TerminalView.tsx     монтирование инстанса в разметку
├── composer/               composer (главный приоритет продукта)
│   └── Composer.tsx
├── message/                доменная модель — без React и без Tauri
│   ├── types.ts             Message / Block / Attachment
│   └── adapters/            Message -> байты для конкретного target
│       ├── Adapter.ts
│       ├── shellAdapter.ts
│       └── registry.ts
└── styles/

src-tauri/src/              Rust: только системная часть, без UI-логики
├── lib.rs                   регистрация команд, завершение сессий при выходе
└── pty/
    ├── mod.rs               реестр сессий + четыре tauri-команды
    ├── session.rs           spawn / write / resize / close одной PTY
    ├── pump.rs              чтение вывода с батчингом
    └── terminate.rs         корректное убийство дерева процессов
```

### Ключевое архитектурное правило

Composer никогда не обращается к терминалу напрямую:

```
Composer → Message → Adapter → Target (shell / Claude Code / Codex / …)
```

Composer формирует `Message` и не знает, кто на другом конце. `Adapter`
сериализует `Message` в то, что ожидает конкретный target. Поддержка нового
CLI-агента = новый файл в `src/message/adapters/`, без изменений в composer.

### Границы frontend / Rust

| | Отвечает за |
|---|---|
| Frontend | UI, composer, клавиатура, состояние редактора, attachments, layout |
| Rust | PTY, процессы, shell, файловая система, нативные события |

UI-логики в Rust нет; PTY- и процессной логики в React-коде нет.

## Заметки по реализации

**Bracketed paste.** Многострочный текст отправляется как paste
(`ESC[200~ … ESC[201~`), иначе обычный shell выполнил бы его построчно.
Поддерживает ли это программа на другом конце, определяется по режимам,
которые она включила (`Terminal.modes.bracketedPasteMode` в xterm.js), и
передаётся адаптеру как `TargetCapabilities`. Если bracketed paste выключен,
текст уходит как есть — мы не подсовываем target escape-последовательности,
которых он не просил.

**Батчинг вывода PTY.** Вывод не пересылается во frontend по чанку на событие:
поток-читатель складывает данные в канал, второй поток склеивает их и отдаёт
не чаще, чем раз в 8 мс (или сразу при накоплении 64 КБ). Многобайтовые
UTF-8 символы, разорванные между чтениями, склеиваются, а не превращаются в
кракозябры.

**Завершение процессов.** При закрытии сессии убивается не только shell:
интерактивная задача (например `claude`) живёт в собственной process group,
поэтому мы находим все процессы PTY-сессии через `/proc` и шлём им `SIGHUP`,
а через 150 мс — `SIGKILL`.

**Сессия рабочего стола.** Разработка и проверка идут в **Wayland**-сессии
(GNOME, Ubuntu 24.04). Поведение системного буфера обмена и drag & drop для
файлов на X11 отличается — это будет отдельно отмечено, когда дойдём до
Slice 3–4.
