# Terminal Composer shell integration.
#
# The terminal starts zsh with ZDOTDIR pointing here so that this file is read.
# It is the only file we shadow: the user's own .zshenv is loaded by hand, then
# ZDOTDIR is handed straight back, and zsh goes on to read .zprofile, .zshrc and
# .zlogin from the user's directory exactly as it normally would. Nothing in the
# home directory is modified, and nothing of the user's is replaced.

TERMINAL_COMPOSER_USER_ZDOTDIR="${TERMINAL_COMPOSER_USER_ZDOTDIR:-$HOME}"

[[ -f "$TERMINAL_COMPOSER_USER_ZDOTDIR/.zshenv" ]] &&
  source "$TERMINAL_COMPOSER_USER_ZDOTDIR/.zshenv"

# Handed back before anything of the user's runs, so their configuration writes
# where it expects to -- the completion cache above all, which would otherwise
# be rebuilt into a temporary directory on every start.
ZDOTDIR="$TERMINAL_COMPOSER_USER_ZDOTDIR"

# OSC 133: the shell reports what it is doing.
#
# This is what tells the terminal whether the keyboard belongs to the composer
# or to whatever is running -- reported by the shell itself rather than guessed
# from its output. The prompt is not touched, only hooks are added, so prompt
# frameworks keep working.
if [[ -o interactive ]] && [[ -z "$TERMINAL_COMPOSER_MARKS" ]]; then
  TERMINAL_COMPOSER_MARKS=1

  _terminal_composer_mark() { printf '\e]133;%s\a' "$1" }

  _terminal_composer_precmd() {
    local exit_code=$?
    _terminal_composer_mark "D;$exit_code"   # the previous command finished
    _terminal_composer_mark "A"              # a prompt is being drawn
    _terminal_composer_mark "B"              # waiting for input
  }

  _terminal_composer_preexec() {
    _terminal_composer_mark "C"              # a command started running
  }

  autoload -Uz add-zsh-hook
  add-zsh-hook precmd _terminal_composer_precmd
  add-zsh-hook preexec _terminal_composer_preexec
fi
