# Skill Panel for Claude Code

A Claude Code mod that helps you go from "there was a skill for this…" to running it in two
seconds: a panel beside the chat to find, understand, compare, run and group your skills.

Personal skills, project skills, plugin skills and Claude Code's own commands carry no common
marker and are easy to forget. The panel follows the steps you actually take (notice, find,
choose, call, organize) and gives each one a screen.

The interface speaks English and Turkish: it follows your system language, and you can switch it
under ⚙.

## The journey, screen by screen

1. **Notice: the band above the message box.** A **Skills** button opens and closes the panel
   (`/sk` and Esc work too). Next to it, the skills you use most in this repository, one click to
   put in the message box, and on the right the one you used last and when.
2. **Find.** The search box has the keyboard as soon as the panel opens and matches names and
   descriptions. The **best match** stands out with **▶ Run**, **Put in box** and **Details**;
   Enter puts it in the message box. Other matches follow, the match marked in each name. Chips narrow the list by
   source (this repo, personal, plugin, project, Claude Code). Without a query you see your most
   used skills and your groups, folded.
3. **Choose: details.** The full description; how to call it, with the arguments the skill's own
   SKILL.md asks for; a warning when Claude never starts it on its own (manual-only); how often
   you used it, here and overall, with the last eight weeks; skills that share its name; and
   where its file is.
4. **Choose: compare.** Two skills with the same name under different prefixes (say
   `design:design-critique` and `design-skills:design-critique`) side by side: what each does,
   its arguments, whether Claude starts it itself, your use. **Use this** on either, and hide the
   one you do not use: it leaves the panel, not the `/` menu.
5. **Call: the run form.** The argument field shows the skill's own hint and warns when a
   required one is empty; your last arguments are one click away; the exact command is
   previewed. **Run now** starts it as if you typed it; **Put it in the box, I will send it**
   leaves it in the message box for you to edit and send. A click on a name never runs anything.
6. **Putting a skill in the message box.** **Put in box** writes the command into the message
   box where your cursor stands, keeping what you had typed on either side and a space between
   them; with no cursor in the box, at the end. This works the same in the desktop app and in a
   terminal session. If the box does not take it, the desktop app shows the command dim in an
   empty box (press **Tab** to take it), and otherwise it goes to the clipboard (macOS) for ⌘V.
   Every action says what happened in a line at the foot of the panel.
7. **Organize: groups.** Create groups, order them with ▲▼, rename, delete, add the ungrouped
   skills, and bring hidden skills back. Each group becomes a command in the `/` menu:
   `/sk-review` opens the panel on the "review" group.
8. **First open.** How many skills you have and from where, and groups suggested by prefix
   (your personal skills, each plugin, your project's skills), ticked to choose. One press sets
   them up; or arrange them yourself.

Skill names and files never change. On mobile the panel is a read-only list.

The design these screens follow, with the user journey behind it, is a Claude design canvas;
the component vocabulary board there says which parts the mod API draws exactly and which it
adapts.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install skill-panel --marketplace emrahgenc/claude-skill-panel
```

Answer `y` to add the marketplace, then pick a scope. Start a new session and the "Skills"
button appears above the message box.

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `emrahgenc/claude-skill-panel`, then **Add plugin**.

## Requirements

- Claude Code 2.1.317 or later (mods are an early-access feature and may change between
  releases).
- The fallbacks: the dim suggestion needs **Prompt suggestions** on in the desktop app
  (Settings → Claude Code); the clipboard uses `pbcopy` (macOS); elsewhere the panel shows the
  command to type. **Run now** works everywhere.

## What it reads, stores and runs

Nothing leaves your machine: the panel sends nothing over the network.

- **Reads:** the session's own command list; the message box's text and cursor position, only
  when you put a skill in it, to place the command and the spaces around it; the repository root (or folder) the session runs
  in, to count use per repository; the `LANG`, `LC_ALL` and `LC_MESSAGES` environment
  variables, to pick the interface language on first use; `HOME` and the frontmatter of the
  SKILL.md files in your skills folders (`~/.claude/skills/…` and the repository's
  `.claude/skills/…`), for each skill's argument hint, whether it is manual-only and where it is.
- **Stores** in the mod's local store: your groups and hidden skills; how often and when you used
  each skill (overall and per repository path); the last three arguments you gave each skill;
  the last skill list read, so the panel draws at once; your language and whether you turned
  down the suggested groups; and the outcome of the last "put in box", for troubleshooting
  (lengths and positions only, never what you typed).
- **Runs:**
  - macOS `pbcopy`, only when a command could not go into the message box, with the command to
    put on your clipboard.
  - The skill you chose, only when you press **Run** in its run form, with the arguments you
    typed.

## Development

```
claude plugin validate .
claude plugin test .
```

`hooks/model.ts` holds the data, search and actions; `hooks/register.tsx` the hooks and the
screens; `hooks/strings.ts` every word in both languages. The tests (`tests/panel.test.tsx`)
walk the journey: the band, the first open, find, details, compare and hide, the run form, the
message-box paths, groups, both languages, earlier stored values and mobile.

---

## Türkçe özet

Claude Code için, "bunun için bir skill vardı…" anından skill'i çalıştırmaya iki saniyede
götüren bir mod. Mesaj kutusunun üstündeki bant bu repoda en sık kullandığın skill'leri ve en
son kullandığını gösterir. Panel açılınca arama hazırdır; en iyi eşleşme **▶ Çalıştır**,
**Kutuya yaz** ve **Ayrıntı** ile öne çıkar; Enter onu mesaj kutusunda imlecin olduğu yere yazar. Ayrıntı ekranı ne yaptığını, nasıl
çağrıldığını, yalnızca elle mi çalıştığını ve ne kadar kullandığını gösterir; aynı adı taşıyan
skill'ler yan yana karşılaştırılır, kullanmadığın gizlenir. Çalıştırma formu argümanı skill'in
kendi ipucuyla ister, komutu önizler ve doğrudan başlatır. Gruplar ayrı bir ekranda yönetilir,
her grup `/sk-<grup>` komutu olur; ilk açılışta grup önerisi gelir. Arayüz Türkçe ve İngilizce.
Kurulum için yukarıdaki **Install** bölümüne bak.

## License

MIT, see [LICENSE](LICENSE).
