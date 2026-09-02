# The user's configuration comes first, so anything below is added on top of a
# fully set up shell rather than being overwritten by it.
[[ -f "$TERMINAL_COMPOSER_USER_ZDOTDIR/.zshrc" ]] &&
  source "$TERMINAL_COMPOSER_USER_ZDOTDIR/.zshrc"

# OSC 133: the shell reports what it is doing.
#
# This is what tells the terminal whether the keyboard belongs to the composer
# or to whatever is running -- reported by the shell itself rather than guessed
# from its output. The prompt is not touched, only hooks are added, so prompt
# frameworks keep working.
if [[ -z "$TERMINAL_COMPOSER_MARKS" ]]; then
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

# Anything started from here on should see the user's own configuration.
ZDOTDIR="$TERMINAL_COMPOSER_USER_ZDOTDIR"
