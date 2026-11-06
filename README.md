# Skill Panel for Claude Code

A Claude Code mod that puts all of your skills in one panel beside the chat: group them,
search them, see in one line what each one does, and click one to use it.

Personal skills, project skills, plugin skills and Claude Code's own commands carry no
common marker and are easy to forget. This panel lists every slash command the session
knows, with where it comes from and the first sentence of its description, so you can find
the one you need without remembering its name.

> The panel's interface is in Turkish. The code is small and the strings sit in one file
> (`hooks/register.tsx`) if you want to translate them.

## What it does

- **A "Skill'ler" button above the message box.** Click it to open the panel; click it again
  to close it. `/sk` opens it too.
- **One line per skill:** the exact name to type (`/my:worklog`), its source (personal,
  project, a plugin's name, Claude Code) and the first sentence of its description.
- **Groups:** press "Grupları düzenle" (edit groups) to create, rename or delete groups and
  pick a group for each skill. Groups are kept across sessions on your machine; skill names
  and files are never changed.
- **Filters and search:** by group, by source, and a search box that also matches
  descriptions. Claude Code's built-in commands (`/clear`, `/help`, …) stay hidden unless you
  put one in a group.
- **Click a skill to use it:**
  - in the Claude desktop app, `/name ` is copied to the clipboard (macOS `pbcopy`); paste it
    into the message box with ⌘V and add arguments;
  - in a terminal session, `/name ` is written straight into the prompt.
  The line at the top of the panel says what happened.
- **Mobile:** a read-only list (the mobile app has no fields yet).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install skill-panel --marketplace emrahgenc/claude-skill-panel
```

Answer `y` to add the marketplace, then pick a scope. Start a new session and the
"Skill'ler" button appears above the message box.

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box,
then **Plugins**, **Add marketplace** with `emrahgenc/claude-skill-panel`, then **Add plugin**.

## Requirements

- Claude Code 2.1.317 or later (mods are an early-access feature and may change between
  releases).
- Clipboard copy in the desktop app uses `pbcopy`, so it works on macOS. Elsewhere the panel
  shows the name for you to type.

## Privacy

The panel reads the session's own command list and keeps your groups (and the outcome of
the last click, for troubleshooting) in the mod's local store. It sends nothing over the
network.

The one program it runs is macOS `pbcopy`, and only when you click a skill in the desktop
app: it hands `pbcopy` the text `/<skill name> ` to put on your clipboard. In a terminal
session it writes that text into the prompt instead and runs nothing.

## Development

```
claude plugin validate .
claude plugin test .
```

The tests (`tests/panel.test.tsx`) cover listing, grouping, search, the button, the
message-box and clipboard paths and the mobile view, on the terminal and desktop surfaces.

---

## Türkçe özet

Claude Code için, tüm skill'lerini sohbetin yanındaki bir panelde toplayan mod. Mesaj
kutusunun üstündeki **Skill'ler** düğmesi paneli açar ve kapatır (`/sk` de açar). Her
skill'in adı, kaynağı ve ne yaptığı tek satırda görünür; skill'leri gruplayabilir, arayabilir
ve tıklayarak kullanabilirsin (masaüstünde ad panoya kopyalanır, ⌘V ile yapıştırırsın).
Kurulum için yukarıdaki **Install** bölümüne bak.

## License

MIT, see [LICENSE](LICENSE).
