// Plain-text buffers opened by the :help / :docs / :config ex commands —
// Vim-style: documentation lives in a split, not on a separate web page.

export const HELP_TEXT = `*vem-help*                    VEM REFERENCE MANUAL

Vem is a canvas-native modal editor. Everything below works in this
buffer right now — this help opened in a split, close it with :q.

==============================================================================
MODES

  NORMAL   Default mode. Motions and operators.       Escape returns here.
  INSERT   Press 'i' (or 'a', 'o', 'O').              Type text directly.
  VISUAL   Press 'v' (char), 'V' (line), Ctrl-v.      Select, then d/y/c/x.
  COMMAND  Press ':'.                                 Ex commands, Enter runs.

==============================================================================
MOTIONS (NORMAL / VISUAL)

  h j k l      left / down / up / right
  w b e        next word / previous word / word end
  0 $          line start / line end
  gg G         first line / last line
  dw dd yy p   delete word / delete line / yank line / paste
  u Ctrl-r     undo / redo
  x            delete char under cursor
  Ctrl-d/u     half page down / up      Ctrl-f/b   full page down / up
  q{reg} … q   record a macro           @{reg} @@  replay / repeat macro

==============================================================================
EX COMMANDS

  :w           write (save) the buffer
  :q           close the active pane
  :vsp         vertical split  (panes side-by-side)
  :sp          horizontal split (panes stacked)
  :q!          close without saving       :wq :x       write then close
  :set rnu     relative line numbers      :set nornu   absolute (default)
  :help        this manual in a split     :docs        alias for :help
  :config      open a .vemrc.json template buffer
  :Explorer    toggle the file tree       :PluginLab   toggle the plugin panel
  :Lualine     enable the statusline       :syntax on   enable highlighting (Treesitter)
  :set number  show line numbers           :set nonumber  hide (default)

==============================================================================
PLUGINS

  On by default:      Telescope, Git Signs, Autopairs, Trim, Layout Customizer
  Opt-in (Vim-style): :Lualine (statusline), :syntax on / :Treesitter (colors)

  Telescope        floating file finder / command palette
  Git Signs        add/change/delete markers in the gutter
  Autopairs        auto-closes brackets and quotes while typing
  Trim Whitespace  strips trailing spaces on :w
  Layout Customizer  cycles sidebar/status-bar layout and themes

  The Plugin Lab panel (:PluginLab) smoke-tests each one live.

==============================================================================
CONFIGURATION

  Vem loads .vemrc.json or .vemrc.js from a workspace folder opened with
  'Open Folder' in the sidebar. 'Open File' opens a single file. Edits to a
  file opened from disk write back on :w. Try :config for a template.

  Project home:  https://github.com/vemjs        Site: https://vem.run
`;

export const VEMRC_TEMPLATE = `{
  // Save this as .vemrc.json in your workspace root, then reopen the
  // folder via 'Open Folder' — Vem loads it automatically.
  // (.vemrc.js with a default-exported object works too.)

  "theme": {
    "accent": "#2dd4bf",
    "bg": "#0b1120"
  },
  "layout": {
    "sidebarPosition": "left",     // left | right | hidden
    "statusBarPosition": "bottom", // bottom | top
    "sidebarWidth": 240,
    "lineNumbers": "absolute"      // absolute | relative (:set rnu)
  },
  "keybindings": [
    { "mode": "NORMAL", "keys": " ff", "command": "telescope.findFiles" }
  ]
}
`;
