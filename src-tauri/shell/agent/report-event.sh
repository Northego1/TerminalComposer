#!/bin/sh
# Reports a Claude Code hook event back to the terminal that started the session.
#
# Claude Code runs hooks as separate processes and keeps their output for
# itself, so the event has to travel out of band. The terminal leaves a named
# pipe and the session id in the environment; the shell passes them on to
# everything it starts, so this needs no arguments beyond the event name and no
# tools beyond the shell itself.

[ -p "$TERMINAL_COMPOSER_EVENTS" ] || exit 0
[ -n "$TERMINAL_COMPOSER_SESSION" ] || exit 0

# Short enough to be written atomically, so concurrent hooks cannot interleave.
printf '%s %s\n' "$TERMINAL_COMPOSER_SESSION" "$1" >> "$TERMINAL_COMPOSER_EVENTS"
