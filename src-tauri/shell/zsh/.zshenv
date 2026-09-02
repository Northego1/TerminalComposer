# Terminal Composer shell integration.
#
# Loaded because the terminal points ZDOTDIR here. Every file in this directory
# does the same two things: load the user's own file of that name, and stay out
# of the way otherwise. The user's ~/.zshrc is never modified.

TERMINAL_COMPOSER_USER_ZDOTDIR="${TERMINAL_COMPOSER_USER_ZDOTDIR:-$HOME}"
[[ -f "$TERMINAL_COMPOSER_USER_ZDOTDIR/.zshenv" ]] &&
  source "$TERMINAL_COMPOSER_USER_ZDOTDIR/.zshenv"
