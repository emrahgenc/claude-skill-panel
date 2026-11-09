import type { Lang, Scope } from '../types'

type SourceKey = 'my' | 'project' | 'plugin' | 'builtin' | 'mcp'

/** Every word the panel shows, in Turkish and English. Skill descriptions stay as their authors wrote them. */
export type Strings = {
  locale: string
  title: string
  // Band
  bandButton: string
  bandHint: string
  chipsHere: string
  chipsAll: string
  lastUsed: string
  // Commands
  commandDescription: string
  opened: string
  openedHidden: string
  openFailed: string
  groupCommand: (group: string, skills: string) => string
  groupGone: (group: string) => string
  // Header
  groupsLink: string
  options: string
  optionsHide: string
  close: string
  language: string
  refresh: string
  reshowSuggestion: string
  // Find
  search: string
  searchSubmit: string
  searchIcon: string
  scopes: Record<Scope, string>
  sourceLabel: Record<SourceKey, string>
  bestMatch: string
  topHere: string
  topAll: string
  otherMatches: (n: number) => string
  frequentHere: string
  frequentAll: string
  groupsHeading: string
  run: string
  runEllipsis: string
  copy: string
  copySmall: string
  details: string
  uses: (n: number, here: number) => string
  argument: string
  noResults: (q: string) => string
  noResultsHelp: string
  noResultsHidden: string
  searchHidden: string
  loading: string
  legend: string
  ungrouped: string
  ungroupedChoice: string
  manualOnly: string
  similar: (n: number) => string
  // Detail
  back: (label: string) => string
  backResults: (q: string) => string
  groupChip: (group: string) => string
  group: string
  howToCall: string
  hintHelp: string
  knowThis: string
  manualExplain: string
  yourUse: string
  total: string
  here: string
  last: string
  never: string
  sameName: string
  compareLink: string
  // Compare
  compareTitle: string
  rowWhat: string
  rowArg: string
  /** The word before a skill's argument on the best match's line. */
  argWord: string
  rowAuto: string
  rowSource: string
  rowUse: string
  autoNo: string
  autoYes: string
  unknown: string
  useThis: string
  simplify: string
  simplifyHelp: string
  hideIt: (name: string) => string
  hiddenDone: (name: string) => string
  keepBoth: string
  // Run
  runEyebrow: string
  args: string
  argsPlaceholder: string
  argRequired: (hint: string) => string
  recent: string
  preview: string
  how: string
  modeRun: string
  modeRunHelp: string
  modeCopy: string
  modeCopyHelp: string
  copyCommand: string
  runCancel: string
  started: (command: string) => string
  startedHelp: string
  runFailed: (command: string, why: string) => string
  // Copy outcomes
  filled: (command: string) => string
  inBox: (command: string) => string
  boxBusy: (command: string) => string
  pbcopied: (command: string) => string
  copied: (command: string) => string
  typeIt: string
  // Groups
  groupsTitle: string
  groupsHint: string
  newGroupPlaceholder: string
  create: string
  skillsCount: (n: number) => string
  remove: string
  rename: string
  renameSave: string
  deleteGroup: string
  addToGroup: string
  more: (n: number) => string
  hiddenHeading: (n: number) => string
  hiddenHelp: string
  unhide: string
  moveUp: (group: string) => string
  moveDown: (group: string) => string
  personalGroup: string
  projectGroup: string
  // Welcome
  welcomeEyebrow: string
  found: (skills: number, sources: number) => string
  welcomeLead: string
  suggested: (picked: number) => string
  setUp: (n: number) => string
  continueWithout: string
  ownGroups: string
  groupCommandsNote: string
  overlap: (n: number, other: string) => string
  hiddenByDefault: string
  // Time and counts
  ago: (ms: number) => string
  times: (n: number) => string
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const STRINGS: Record<Lang, Strings> = {
  tr: {
    locale: 'tr',
    title: "Skill'ler",
    bandButton: "Skill'ler",
    bandHint: 'ara, grupla, hangi skill ne yapıyor gör',
    chipsHere: 'bu repoda sık',
    chipsAll: 'sık',
    lastUsed: 'son:',
    commandDescription: "Skill panelini açar: ara, karşılaştır, çalıştır, grupla",
    opened: 'Skill paneli açıldı.',
    openedHidden: 'Skill paneli açıldı ama bu ekranda gösterilemiyor.',
    openFailed: 'Skill paneli açılamadı; ayrıntı hata kaydında.',
    groupCommand: (group, skills) => `Skill grubu "${group}": ${skills}`,
    groupGone: group => `"${group}" grubu silinmiş; tüm skill'leri gösteriyorum. Komut yeni oturumda menüden kalkar.`,
    groupsLink: 'Gruplar',
    options: '⚙',
    optionsHide: '⚙ kapat',
    close: '✕',
    language: 'Dil',
    refresh: 'Listeyi yenile',
    reshowSuggestion: 'Grup önerisini göster',
    search: 'Ara: ad ya da iş',
    searchSubmit: '↵ kutuya yaz',
    searchIcon: 'Ara',
    scopes: { all: 'Tümü', here: 'Bu repo', my: 'Kişisel', plugin: 'Plugin', project: 'Proje', builtin: 'Claude Code', mcp: 'MCP' },
    sourceLabel: { my: 'Kişisel', project: 'Proje', plugin: 'Plugin', builtin: 'Claude Code', mcp: 'MCP' },
    bestMatch: 'EN İYİ EŞLEŞME',
    topHere: 'BU REPODA EN SIK',
    topAll: 'EN SIK',
    otherMatches: n => `DİĞER EŞLEŞMELER · ${n}`,
    frequentHere: 'BU REPODA SIK KULLANDIKLARIN',
    frequentAll: 'SIK KULLANDIKLARIN',
    groupsHeading: 'GRUPLAR',
    run: '▶ Çalıştır',
    runEllipsis: '▶ Çalıştır…',
    copy: 'Kutuya yaz',
    copySmall: 'kutuya yaz',
    details: 'Ayrıntı →',
    uses: (n, here) => (n === 0 ? 'henüz kullanmadın' : `${n} kez kullandın${here ? ` · bu repoda ${here}` : ''}`),
    argument: 'argüman',
    noResults: q => `“${q}” için skill yok`,
    noResultsHelp: 'Adlarda ve açıklamalarda aradım.',
    noResultsHidden: 'Gizlenenler aramaya dahil değil.',
    searchHidden: 'Gizlenenlerde de ara',
    loading: 'Liste okunuyor…',
    legend: '↵ en iyisini kutuya yaz · ▶ çalıştır · esc kapat',
    ungrouped: 'Grupsuz',
    ungroupedChoice: '— grupsuz —',
    manualOnly: 'elle',
    similar: n => `benzer: ${n}`,
    back: label => `← ${label}`,
    backResults: q => (q ? `“${q}” sonuçları` : "Skill'ler"),
    groupChip: group => `Grup: ${group}`,
    group: 'Grup',
    howToCall: 'NASIL ÇAĞRILIR',
    hintHelp: 'Argümansız çağırırsan skill ihtiyaç duyduğunu sohbette sorabilir.',
    knowThis: 'BİLMEN GEREKEN',
    manualExplain: "Claude bu skill'i kendiliğinden başlatmaz. Yalnızca sen çağırırsın: panelden ya da / menüsünden.",
    yourUse: 'KULLANIMIN',
    total: 'toplam',
    here: 'bu repoda',
    last: 'son',
    never: 'hiç',
    sameName: 'AYNI ADI TAŞIYANLAR',
    compareLink: 'Karşılaştır →',
    compareTitle: 'Hangisi bu iş için?',
    rowWhat: 'Ne yapar',
    rowArg: 'Argüman',
    argWord: 'argüman',
    rowAuto: 'Claude kendisi başlatır mı',
    rowSource: 'Kaynak',
    rowUse: 'Kullanımın',
    autoNo: 'Hayır, yalnızca elle',
    autoYes: 'Evet, uygun görürse',
    unknown: 'bilinmiyor',
    useThis: 'Bunu kullan',
    simplify: 'Listeyi sadeleştir',
    simplifyHelp: "Kullanmadığın kopyayı panelde gizleyebilirsin. Silinmez; / menüsünden çağrılmaya devam eder, Gruplar › Gizlenenler'den geri alınır.",
    hideIt: name => `/${name} gizle`,
    hiddenDone: name => `/${name} panelden gizlendi. Gruplar › Gizlenenler'den geri alırsın.`,
    keepBoth: 'İkisi de kalsın',
    runEyebrow: 'ÇALIŞTIR',
    args: 'Argümanlar',
    argsPlaceholder: 'isteğe bağlı',
    argRequired: hint => `Bu skill ${hint} bekliyor. Boş bırakırsan sohbette sorabilir.`,
    recent: 'son kullandıkların',
    preview: 'GÖNDERİLECEK KOMUT',
    how: 'NASIL',
    modeRun: 'Hemen çalıştır',
    modeRunHelp: 'Claude bunu sen yazmışsın gibi başlatır; sohbette yeni bir tur açılır.',
    modeCopy: 'Mesaj kutusuna yaz, ben gönderirim',
    modeCopyHelp: 'Komut mesaj kutusunda imlecin olduğu yere yazılır; istediğin gibi değiştirir, sen gönderirsin.',
    copyCommand: 'Kutuya yaz',
    runCancel: 'Vazgeç',
    started: command => `${command} başladı.`,
    startedHelp: 'Sohbette görüyorsun. Panel açık kalır; kapatmak için Esc.',
    runFailed: (command, why) => `${command} başlamadı: ${why}`,
    filled: command => `${command} mesaj kutusuna, imlecin olduğu yere yazıldı.`,
    inBox: command => `${command} mesaj kutusunda: Tab ile al, gerekirse argüman ekle, gönder.`,
    boxBusy: command => `Mesaj kutusu yazıyı almadı; ${command} panoya kopyalandı, ⌘V ile yapıştır.`,
    pbcopied: command => `${command} kopyalandı. Mesaj kutusuna tıklayıp ⌘V'ye bas.`,
    copied: command => `${command} panoya kopyalandı; mesaj kutusuna yapıştır.`,
    typeIt: 'Panoya ulaşamadım. Komut aşağıda; mesaj kutusuna kendin yaz.',
    groupsTitle: 'Gruplar',
    groupsHint: 'her grup / menüsünde bir komut olur',
    newGroupPlaceholder: 'Yeni grup adı',
    create: 'Oluştur',
    skillsCount: n => `${n} skill`,
    remove: 'Çıkar',
    rename: 'Yeniden adlandır',
    renameSave: 'Kaydet',
    deleteGroup: 'Grubu sil',
    addToGroup: 'Gruba ekle',
    more: n => `+ ${n} skill daha`,
    hiddenHeading: n => `Gizlenenler · ${n}`,
    hiddenHelp: 'panelde görünmez, / menüsünde durur',
    unhide: 'Geri al',
    moveUp: group => `${group} grubunu yukarı taşı`,
    moveDown: group => `${group} grubunu aşağı taşı`,
    personalGroup: 'Kişisel',
    projectGroup: 'Proje',
    welcomeEyebrow: 'İLK AÇILIŞ',
    found: (skills, sources) => `${skills} skill buldum, ${sources} kaynaktan`,
    welcomeLead: 'Kaynaklar adlarında hep ön ek taşımadığı için karışıyor. Önce gruplayalım; sonra ihtiyacın olanı bir aramayla bulursun.',
    suggested: picked => `ÖNERİLEN GRUPLAR · ${picked} seçili`,
    setUp: n => `${n} grubu kur`,
    continueWithout: 'Grupsuz devam et',
    ownGroups: 'Kendim düzenlerim',
    groupCommandsNote: "Her grup / menüsünde /sk-<grup> komutu olur. Skill'lerin adı ve dosyası değişmez.",
    overlap: (n, other) => `${n} skill ${other} ile aynı adda`,
    hiddenByDefault: 'gizli',
    ago: ms =>
      ms < MIN ? 'şimdi'
        : ms < HOUR ? `${Math.floor(ms / MIN)} dk önce`
          : ms < DAY ? `${Math.floor(ms / HOUR)} sa önce`
            : ms < 2 * DAY ? 'dün'
              : ms < 14 * DAY ? `${Math.floor(ms / DAY)} gün önce`
                : `${Math.floor(ms / (7 * DAY))} hf önce`,
    times: n => `${n} kez`,
  },
  en: {
    locale: 'en',
    title: 'Skills',
    bandButton: 'Skills',
    bandHint: 'search, group, see what each skill does',
    chipsHere: 'often here',
    chipsAll: 'often',
    lastUsed: 'last:',
    commandDescription: 'Opens the skill panel: search, compare, run, group',
    opened: 'Skill panel opened.',
    openedHidden: 'Skill panel opened, but this screen cannot show it.',
    openFailed: 'The skill panel could not open; the debug log has the details.',
    groupCommand: (group, skills) => `Skill group "${group}": ${skills}`,
    groupGone: group => `The group "${group}" was deleted; showing every skill. The command leaves the menu in a new session.`,
    groupsLink: 'Groups',
    options: '⚙',
    optionsHide: '⚙ close',
    close: '✕',
    language: 'Language',
    refresh: 'Refresh the list',
    reshowSuggestion: 'Show the group suggestion',
    search: 'Search: name or task',
    searchSubmit: '↵ to box',
    searchIcon: 'Search',
    scopes: { all: 'All', here: 'This repo', my: 'Personal', plugin: 'Plugin', project: 'Project', builtin: 'Claude Code', mcp: 'MCP' },
    sourceLabel: { my: 'Personal', project: 'Project', plugin: 'Plugin', builtin: 'Claude Code', mcp: 'MCP' },
    bestMatch: 'BEST MATCH',
    topHere: 'MOST USED HERE',
    topAll: 'MOST USED',
    otherMatches: n => `OTHER MATCHES · ${n}`,
    frequentHere: 'OFTEN USED IN THIS REPO',
    frequentAll: 'OFTEN USED',
    groupsHeading: 'GROUPS',
    run: '▶ Run',
    runEllipsis: '▶ Run…',
    copy: 'Put in box',
    copySmall: 'to box',
    details: 'Details →',
    uses: (n, here) => (n === 0 ? 'not used yet' : `used ${n} ${n === 1 ? 'time' : 'times'}${here ? ` · ${here} here` : ''}`),
    argument: 'argument',
    noResults: q => `No skill for “${q}”`,
    noResultsHelp: 'I searched names and descriptions.',
    noResultsHidden: 'Hidden skills are left out.',
    searchHidden: 'Search hidden skills too',
    loading: 'Reading the list…',
    legend: '↵ best to the box · ▶ run · esc close',
    ungrouped: 'Ungrouped',
    ungroupedChoice: '— ungrouped —',
    manualOnly: 'manual',
    similar: n => `similar: ${n}`,
    back: label => `← ${label}`,
    backResults: q => (q ? `results for “${q}”` : 'Skills'),
    groupChip: group => `Group: ${group}`,
    group: 'Group',
    howToCall: 'HOW TO CALL IT',
    hintHelp: 'Called without arguments, the skill may ask for what it needs in the chat.',
    knowThis: 'GOOD TO KNOW',
    manualExplain: 'Claude never starts this skill on its own. Only you call it: from the panel or the / menu.',
    yourUse: 'YOUR USE',
    total: 'total',
    here: 'here',
    last: 'last',
    never: 'never',
    sameName: 'SAME NAME ELSEWHERE',
    compareLink: 'Compare →',
    compareTitle: 'Which one for this job?',
    rowWhat: 'What it does',
    rowArg: 'Argument',
    argWord: 'argument',
    rowAuto: 'Claude starts it itself',
    rowSource: 'Source',
    rowUse: 'Your use',
    autoNo: 'No, only by hand',
    autoYes: 'Yes, when it fits',
    unknown: 'unknown',
    useThis: 'Use this',
    simplify: 'Tidy the list',
    simplifyHelp: 'Hide the copy you do not use. It is not deleted: the / menu still calls it, and Groups › Hidden brings it back.',
    hideIt: name => `Hide /${name}`,
    hiddenDone: name => `/${name} is hidden from the panel. Groups › Hidden brings it back.`,
    keepBoth: 'Keep both',
    runEyebrow: 'RUN',
    args: 'Arguments',
    argsPlaceholder: 'optional',
    argRequired: hint => `This skill expects ${hint}. Left empty, it may ask in the chat.`,
    recent: 'recent',
    preview: 'COMMAND TO SEND',
    how: 'HOW',
    modeRun: 'Run now',
    modeRunHelp: 'Claude starts it as if you typed it; a new turn opens in the chat.',
    modeCopy: 'Put it in the box, I will send it',
    modeCopyHelp: 'The command is written into the message box at the cursor; you change it as you like and send.',
    copyCommand: 'Put in box',
    runCancel: 'Cancel',
    started: command => `${command} started.`,
    startedHelp: 'You see it in the chat. The panel stays open; Esc closes it.',
    runFailed: (command, why) => `${command} did not start: ${why}`,
    filled: command => `${command} written into the message box at the cursor.`,
    inBox: command => `${command} is in the message box: press Tab to take it, add arguments, send.`,
    boxBusy: command => `The message box did not take it; ${command} is on the clipboard, paste it with ⌘V.`,
    pbcopied: command => `${command} copied. Click the message box and press ⌘V.`,
    copied: command => `${command} copied to the clipboard; paste it into the message box.`,
    typeIt: 'Could not reach the clipboard. The command is below; type it into the message box.',
    groupsTitle: 'Groups',
    groupsHint: 'each group becomes a command in the / menu',
    newGroupPlaceholder: 'New group name',
    create: 'Create',
    skillsCount: n => (n === 1 ? '1 skill' : `${n} skills`),
    remove: 'Remove',
    rename: 'Rename',
    renameSave: 'Save',
    deleteGroup: 'Delete group',
    addToGroup: 'Add to group',
    more: n => `+ ${n} more`,
    hiddenHeading: n => `Hidden · ${n}`,
    hiddenHelp: 'out of the panel, still in the / menu',
    unhide: 'Bring back',
    moveUp: group => `Move ${group} up`,
    moveDown: group => `Move ${group} down`,
    personalGroup: 'Personal',
    projectGroup: 'Project',
    welcomeEyebrow: 'FIRST OPEN',
    found: (skills, sources) => `I found ${skills} skills, from ${sources} sources`,
    welcomeLead: 'Their names do not always carry a prefix, so they blur together. Let us group them first; then a search finds what you need.',
    suggested: picked => `SUGGESTED GROUPS · ${picked} picked`,
    setUp: n => (n === 1 ? 'Set up 1 group' : `Set up ${n} groups`),
    continueWithout: 'Continue without groups',
    ownGroups: 'I will arrange them',
    groupCommandsNote: 'Each group becomes /sk-<group> in the / menu. Skill names and files never change.',
    overlap: (n, other) => `${n} share a name with ${other}`,
    hiddenByDefault: 'hidden',
    ago: ms =>
      ms < MIN ? 'now'
        : ms < HOUR ? `${Math.floor(ms / MIN)} min ago`
          : ms < DAY ? `${Math.floor(ms / HOUR)} h ago`
            : ms < 2 * DAY ? 'yesterday'
              : ms < 14 * DAY ? `${Math.floor(ms / DAY)} days ago`
                : `${Math.floor(ms / (7 * DAY))} wk ago`,
    times: n => (n === 1 ? '1 time' : `${n} times`),
  },
}

export const LANG_OPTIONS = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
]
