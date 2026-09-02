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

# Writing to a pipe blocks while nothing is reading it, and a hook that blocks
# holds up the agent that ran it. The pipe outlives a terminal that has been
# closed, so the wait is capped rather than trusted.
#
# Short enough to be written atomically, so concurrent hooks cannot interleave.
if command -v timeout >/dev/null 2>&1; then
  timeout 1 sh -c 'printf "%s %s\n" "$1" "$2" >> "$3"' _ \
    "$TERMINAL_COMPOSER_SESSION" "$1" "$TERMINAL_COMPOSER_EVENTS"
else
  printf '%s %s\n' "$TERMINAL_COMPOSER_SESSION" "$1" >> "$TERMINAL_COMPOSER_EVENTS"
fi
