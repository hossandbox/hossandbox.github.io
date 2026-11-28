/**
 * Offline per-ELD guide dataset for Clock 14's "Refresh from ELD screenshot" help flow.
 *
 * Sourced strictly from ~/hos-build/RESEARCH-ELD-GUIDES.md:
 *  - 31 documented ELDs with verified driver-facing steps
 *  - 4 FMCSA-registered ELDs whose exact driver UI steps are not publicly documented
 *    (ELD Mandate, Lytx, Netradyne, Anytrek) — labeled as generic steps, never invented
 *  - 1 final "Don't see your ELD?" generic 3-step fallback entry
 *
 * Important OCR alignment: Clock 14's on-device reader (eldocr.ts) reads the four labeled
 * remaining-time clocks (Drive, Shift, Break, Cycle), not pixel lines on a 24-hour RODS grid.
 * Where an ELD splits clocks and graph grid across screens, steps land on the clocks screen
 * and explain why in one plain line. No external links ship in this module; all content is
 * 100% offline.
 */

export type EldGuideKind = 'documented' | 'undocumented' | 'generic';

export interface EldGuide {
  id: string;
  name: string;
  app: string;
  kind: EldGuideKind;
  aliases: readonly string[];
  /** True when the ELD splits countdown clocks and the 24-hour log graph onto different screens. */
  splitScreen?: true;
  /** True when primary hardware is a dash-mounted cab terminal with no phone screenshot. */
  noPhoneGraph?: true;
  /** Honest 1–2 line note for dash-mounted cab terminals or undocumented/generic entries. */
  notice?: string;
  /** Step-by-step taps (or generic 3-step pattern for undocumented/generic entries). */
  steps: readonly string[];
  /** Plain one-line note telling the driver which screen to screenshot and why. */
  whichScreen: string;
  /** How to switch the day being viewed (always one day at a time; no stitching claims). */
  switchDay: string;
  /** Optional short practical caveat (e.g. inspection-mode PIN lock, circular dials). */
  caveat?: string;
}

export const GENERIC_3_STEPS: readonly string[] = [
  'Park first — most ELDs lock HOS and log screens while the truck is rolling (above 5 mph).',
  'Open HOS or Logs — from your home screen or top-left menu (☰), tap HOS, Logs, Daily Log, Logbook, or RODS.',
  'Stay on the screen with your 4 countdown clocks — screenshot the screen showing Drive, Shift, Break, and Cycle time left. (If you land on a 24-hour graph grid or event list without the four clocks, step back one screen to your HOS summary or dashboard.)',
];

export const GENERIC_WHICH_SCREEN =
  'Screenshot the screen showing your 4 labeled countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the 24-hour graph lines.';

export const GENERIC_SWITCH_DAY =
  'On your ELD’s log screen, tap the date, the < > arrows, or the Calendar icon at the top to view past days — screenshot one day at a time.';

export const DISCONTINUED_SEARCH_TERMS: readonly string[] = [
  'stoneridge',
  'ez-eld',
  'ezeld',
  'vdo',
  'roadlog',
  'continental',
];

export const DISCONTINUED_NOTE =
  'Stoneridge EZ-ELD (shut down July 2024) and Continental VDO RoadLog are discontinued and no longer supported. Type your 4 clocks manually instead.';

/** 31 documented ELDs (ordered by US interstate prevalence), 4 undocumented-generic, + 1 final generic entry. */
export const ELD_GUIDES: readonly EldGuide[] = [
  {
    id: 'samsara',
    name: 'Samsara',
    app: 'Samsara Driver App',
    kind: 'documented',
    aliases: ['samsara driver'],
    splitScreen: true,
    steps: [
      'Park first — Samsara locks log screens above 5 mph.',
      'From the Home screen, tap HoS. Stop right here — your 4 live HOS Dials (Break, Drive, Shift, Cycle) sit on this screen.',
    ],
    whichScreen:
      'Screenshot the HoS clocks screen, not Daily Log — Clock 14 reads your four countdown clocks, not the graph lines.',
    switchDay:
      'To check another day’s log graph, tap Daily Log (log/graph icon) and use the left/right arrows at the top (7–8 days back). Screenshot one day at a time.',
    caveat: 'Circular dials can occasionally confuse auto-read — double-check the 4 numbers before applying.',
  },
  {
    id: 'motive',
    name: 'Motive (KeepTruckin)',
    app: 'Motive Driver App',
    kind: 'documented',
    aliases: ['keeptruckin', 'keep truckin', 'kt'],
    steps: [
      'From the Home screen (or main menu), tap Logs.',
      'Tap today’s date (or any date along the top date bar) to open that day’s log and hours.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 labeled countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph lines.',
    switchDay:
      'Tap any date along the top date bar (7–8 days on US rules). Screenshot one day at a time.',
    caveat: 'Red violation text can sit right over the log — double-check the 4 numbers after reading.',
  },
  {
    id: 'geotab',
    name: 'Geotab GO / Geotab Drive',
    app: 'Geotab Drive',
    kind: 'documented',
    aliases: ['geotab drive', 'geotab go'],
    splitScreen: true,
    steps: [
      'Park first — Geotab locks detailed log screens above 5 mph.',
      'From the main Dashboard, tap the HOS tile. Stop right here to screenshot your remaining countdown clocks.',
    ],
    whichScreen:
      'Screenshot the main HOS clocks screen, not the Logs tab — Clock 14 reads your four countdown clocks, not the graph grid.',
    switchDay:
      'To check another day’s graph, tap the Logs tab near the top, then swipe the graph, tap < or >, or tap the date for the calendar picker (last 14 days). Screenshot one day at a time.',
    caveat: 'Color-coded and striped PC/Yard Move lines live on the Logs tab — verify imported clocks against your ELD.',
  },
  {
    id: 'platform-science',
    name: 'Platform Science',
    app: 'PS HOS tablet / PS Driver app',
    kind: 'documented',
    aliases: ['ps hos', 'ps driver'],
    splitScreen: true,
    noPhoneGraph: true,
    notice:
      'PS HOS usually runs on a dash-mounted cab tablet with no phone screenshot. Use the PS Driver companion app on your phone if your carrier turns it on — otherwise snap a straight-on photo of the tablet screen or type your 4 clocks.',
    steps: [
      'From the tablet Home screen or app tray (or the PS Driver phone app), tap HOS.',
      'Stop on the opening HOS screen — your 4 big HOS Clocks sit right there.',
    ],
    whichScreen:
      'Screenshot (or photograph) the opening HOS Clocks screen, not the Logs tab — Clock 14 reads your four countdown clocks, not the graph grid.',
    switchDay:
      'To check another day’s graph, tap the Logs tab and pick an earlier date from the daily log list. Capture one day at a time.',
  },
  {
    id: 'omnitracs',
    name: 'Omnitracs (One / XRS / IVG)',
    app: 'Omnitracs Drive / XRS Mobile / IVG',
    kind: 'documented',
    aliases: ['omnitracs one', 'omnitracs drive', 'xrs', 'ivg', 'qualcomm'],
    noPhoneGraph: true,
    notice:
      'Omnitracs IVG is a dash-mounted cab terminal — there is no phone screenshot. If your fleet uses Omnitracs One/Drive or XRS on your phone, use those steps below; on IVG, park first and take a straight-on photo of the Summary/Status screen or type your 4 clocks.',
    steps: [
      'Omnitracs One / Drive (phone/tablet): Tap HOS on the Dashboard (for graphs: open ELD Activities → View Logs → Graph / Day Log).',
      'Omnitracs XRS (phone app): Tap top-left menu (☰) → Hours of Service (or Logs) → View Logs.',
      'Omnitracs IVG (mounted cab screen): Park first, tap Hours of Service (HOS) on Home — use Summary/Status for your 4 clocks, or Graph / Day Log for the grid.',
    ],
    whichScreen:
      'Capture the HOS clocks / Summary screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph lines.',
    switchDay:
      'Tap the left/right arrows on the Day Log screen (or swipe/pick a date on XRS/One). Capture one day at a time.',
    caveat: 'On a mounted IVG terminal, detailed log views lock while rolling — park first.',
  },
  {
    id: 'trimble',
    name: 'Trimble (PeopleNet)',
    app: 'Trimble Driver / eDriver Logs',
    kind: 'documented',
    aliases: ['peoplenet', 'edriver logs', 'trimble duo', 'instinct'],
    noPhoneGraph: true,
    notice:
      'Trimble / PeopleNet usually runs on a dash-mounted cab tablet with no phone screenshot. Park first and snap a straight-on photo of the cab screen, or type your 4 clocks directly into Clock 14.',
    steps: [
      'From Driver Overview (Home), check your HOS clocks, or tap Logs / eDriver Logs (some tablets: top-corner menu → View Logs).',
      'For the 24-hour graph, tap Grid View (switch off Events / List View if you see a text list).',
    ],
    whichScreen:
      'Capture the screen showing your 4 remaining-time clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the grid lines.',
    switchDay:
      'Use the date selector or arrows on the Logs screen (last 7–14 days). Capture one day at a time.',
    caveat: 'Backup route for clean daily grids: Options → Roadside Inspection (or Inspect Logs).',
  },
  {
    id: 'jj-keller',
    name: 'J.J. Keller Encompass',
    app: 'Encompass ELD App',
    kind: 'documented',
    aliases: ['jj keller', 'keller', 'encompass', 'kellermobile'],
    splitScreen: true,
    steps: [
      'Open the Encompass ELD App to the main Dashboard where your HOS clocks show.',
      'To view the 24-hour grid instead, tap View Log (Edit Log on older versions), then tap the View Grid tab.',
    ],
    whichScreen:
      'Screenshot the Dashboard screen showing your 4 countdown clocks — Clock 14 reads the four labeled clocks, not the View Grid lines.',
    switchDay:
      'On View Log → View Grid, tap the left/right arrows or tap the Log Date at the top. Screenshot one day at a time.',
    caveat: 'Avoid Roadside Inspection for quick checks — exiting locks you in until you enter your Encompass password.',
  },
  {
    id: 'verizon-connect',
    name: 'Verizon Connect Reveal',
    app: 'Reveal ELD Logbook',
    kind: 'documented',
    aliases: ['verizon', 'reveal', 'reveal eld'],
    splitScreen: true,
    steps: [
      'Open Reveal ELD Logbook to the main Dashboard.',
      'Stop right here — your 4 color-coded countdown clocks sit on the Dashboard.',
    ],
    whichScreen:
      'Screenshot the main Dashboard clocks screen, not Logs → Graph — Clock 14 reads your four countdown timers, not the graph grid.',
    switchDay:
      'To view another day’s graph, tap Logs on the bottom bar → Graph tab → tap the Calendar icon (past 6 months). Screenshot one day at a time.',
    caveat: 'Circular gauges can occasionally confuse auto-read — double-check the 4 numbers before applying.',
  },
  {
    id: 'zonar',
    name: 'Zonar',
    app: 'Zonar Logs / ZLogs (Zonar Connect tablet)',
    kind: 'documented',
    aliases: ['zonar connect', 'zonar logs', 'zlogs'],
    noPhoneGraph: true,
    notice:
      'Zonar Connect is a dash-mounted cab tablet — there is no phone screenshot without a carrier companion app. Park first (never undock while rolling), then snap a straight-on photo of the tablet screen or type your 4 clocks.',
    steps: [
      'From the Zonar Connect Home screen, tap the Zonar Logs tile.',
      'Tap Daily Logs — your live Break, Drive, Shift, and Cycle clocks stay visible right at the top/side of the screen.',
    ],
    whichScreen:
      'Photograph the Daily Logs screen so the 4 live clocks (Break, Drive, Shift, Cycle) at the top/side are crisp and straight-on — Clock 14 reads those four clocks.',
    switchDay:
      'Tap the left/right arrows next to the date (up to 14 days back). Capture one day at a time.',
    caveat: 'Never undock or sleep the Zonar Connect tablet while the truck is rolling.',
  },
  {
    id: 'isaac',
    name: 'ISAAC Instruments',
    app: 'ISAAC InControl (cab tablet)',
    kind: 'documented',
    aliases: ['isaac incontrol', 'incontrol'],
    noPhoneGraph: true,
    notice:
      'ISAAC InControl runs on a rugged dash-mounted cab tablet — there is no phone screenshot to grab. Park first, snap a straight-on photo of the tablet screen with your phone, or type your 4 clocks directly.',
    steps: [
      'Tap your current Duty Status in the lower-left corner of the ISAAC screen.',
      'That opens the Activities page showing your hours left alongside the logbook graph.',
    ],
    whichScreen:
      'Photograph the Activities screen so your remaining-hours clocks are sharp and straight-on — Clock 14 reads those four clocks, not the graph lines.',
    switchDay:
      'Scroll or tap the on-screen arrows to step through past days. Capture one day at a time.',
    caveat: 'Avoid Roadside Inspection mode (Display Driver Report → Display) for quick checks — exiting asks for your driver PIN.',
  },
  {
    id: 'garmin-elog',
    name: 'Garmin eLog',
    app: 'Garmin eLog App / dēzl OTR',
    kind: 'documented',
    aliases: ['garmin', 'dezl', 'dēzl'],
    splitScreen: true,
    steps: [
      'Park first — Garmin eLog locks detailed log views while rolling.',
      'From the Garmin eLog Home screen, tap HOS.',
      'Tap Drive hours to show your remaining driving and on-duty clocks.',
    ],
    whichScreen:
      'Screenshot HOS → Drive hours, not Hours of service chart — Clock 14 reads your four remaining-time clocks, not the graph lines.',
    switchDay:
      'To check another day’s graph, tap HOS → Hours of service chart (tap the chart to zoom full-screen) and use the date arrows or calendar. Screenshot one day at a time.',
  },
  {
    id: 'bigroad',
    name: 'BigRoad DashLink',
    app: 'BigRoad Mobile App',
    kind: 'documented',
    aliases: ['big road', 'dashlink', 'fleet complete'],
    splitScreen: true,
    steps: [
      'Open BigRoad Mobile App to the Home screen where your HOS clocks show.',
      'To view daily log grids: tap Daily Logs (or Logs) → View Logs → tap today’s date.',
    ],
    whichScreen:
      'Screenshot the Home / HOS clocks screen showing your 4 countdown clocks — Clock 14 reads the four labeled clocks, not the graph grid.',
    switchDay:
      'Go back one step to the View Logs list and tap any other day (today + past 14 days). Screenshot one day at a time.',
  },
  {
    id: 'transflo',
    name: 'Transflo ELD T7 / T9',
    app: 'Transflo Mobile+ / Transflo HOS',
    kind: 'documented',
    aliases: ['transflo mobile', 'transflo hos', 't7', 't9'],
    steps: [
      'From the Home screen, tap the central HOS status dial or the HOS tile to show your clocks.',
      'For the 24-hour graph grid, tap Logs (or the Graph tab).',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph lines.',
    switchDay:
      'Select an earlier date from the Logs screen to review past days. Screenshot one day at a time.',
    caveat: 'Circular HOS dials can occasionally confuse auto-read — double-check the 4 numbers before applying.',
  },
  {
    id: 'eroad',
    name: 'EROAD',
    app: 'EROAD Driver App / EROAD Assist + Ehubo2',
    kind: 'documented',
    aliases: ['eroad assist', 'ehubo', 'ehubo2'],
    splitScreen: true,
    noPhoneGraph: true,
    notice:
      'Your dash-mounted Ehubo2 has no phone screenshot on its own — use the EROAD Driver App (or EROAD Assist) on your phone if your carrier enabled it. Otherwise snap a straight-on photo or type your 4 clocks.',
    steps: [
      'Open the EROAD Driver App (or EROAD Assist) on your phone or tablet to see your HOS clocks.',
      'For the 24-hour graph grid, open the main menu, tap Logbook (or Logs), and stay on the Logbook tab (the Logs tab is the text event list).',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 remaining-time clocks — Clock 14 reads those four labeled clocks, not the Logbook graph lines.',
    switchDay:
      'On Logbook, tap the left/right arrows at the top (today + last 7–8 days). Screenshot one day at a time.',
  },
  {
    id: 'rand-mcnally',
    name: 'Rand McNally ELD 50 / OverDryve',
    app: 'DriverConnect App',
    kind: 'documented',
    aliases: ['eld 50', 'overdryve', 'driverconnect', 'driver connect'],
    steps: [
      'Open DriverConnect and tap Logbook from the Main Menu (or tap the HOS graph summary widget right on the Dashboard).',
      'Pick today’s date — your real-time HOS timers show right alongside the 24-hour grid.',
    ],
    whichScreen:
      'Screenshot the view where your 4 real-time HOS timers (Drive, Shift, Break, Cycle) are clearly visible — Clock 14 reads those four clocks.',
    switchDay:
      'Select any day from the 8-day history list or date bar. Screenshot one day at a time.',
  },
  {
    id: 'blue-ink-tech',
    name: 'Blue Ink Tech (BIT ELD)',
    app: 'Blue Ink Tech App',
    kind: 'documented',
    aliases: ['bit', 'bit eld', 'blue ink'],
    steps: [
      'Park first — Blue Ink Tech locks log views while rolling.',
      'From the Home screen (Current Load Out), open the menu (☰ three white lines) and tap HOS / Logs.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks. Turn your phone sideways (landscape) if viewing the full 24-hour grid.',
    switchDay:
      'Swipe or select previous dates on the HOS screen (today + past 7–30 days). Screenshot one day at a time.',
    caveat: 'Circular blue status gauges can confuse auto-read — double-check the 4 numbers before applying.',
  },
  {
    id: 'hos247',
    name: 'HOS247',
    app: 'HOS247 ELD App',
    kind: 'documented',
    aliases: ['hos 247'],
    steps: [
      'From the main screen, tap Driver Logs (or Logbook) to open today’s available-hours summary and 24-hour graph grid.',
    ],
    whichScreen:
      'Screenshot the available-hours clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four labeled clocks, not the graph lines.',
    switchDay:
      'Tap the arrows, swipe, or tap the calendar icon near the top (up to 14 days). Screenshot one day at a time.',
  },
  {
    id: 'gpstab',
    name: 'GPSTab',
    app: 'GPSTab ELD App',
    kind: 'documented',
    aliases: ['gps tab'],
    steps: [
      'From the main Dashboard navigation, tap LOGS. Today’s Break, Driving, Shift, and Cycle clocks open right around the 24-hour grid.',
    ],
    whichScreen:
      'Screenshot the LOGS screen with your Break, Driving, Shift, and Cycle clocks in frame — Clock 14 reads all four directly.',
    switchDay:
      'Scroll or select earlier dates on the LOGS screen (today + past 7–14 days). Screenshot one day at a time.',
  },
  {
    id: 'trackensure',
    name: 'TrackEnsure',
    app: 'TrackEnsure ELD App',
    kind: 'documented',
    aliases: ['track ensure'],
    steps: [
      'From the main menu, tap Logs to open today’s HOS log and clocks.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph grid.',
    switchDay:
      'Tap the arrow buttons right underneath or beside the graph grid (up to 14 days). Screenshot one day at a time.',
  },
  {
    id: 'switchboard',
    name: 'Switchboard',
    app: 'Switchboard ELD App',
    kind: 'documented',
    aliases: ['onswitchboard'],
    steps: [
      'From the Home screen, view your HOS clocks or tap View Logs to open today’s log.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph grid.',
    switchDay:
      'Toggle back through earlier dates on View Logs (last 14 days). Tap Recap near the bottom for 7/8-day recap numbers. Screenshot one day at a time.',
  },
  {
    id: 'gorilla-safety',
    name: 'Gorilla Safety',
    app: 'Gorilla Safety / Gorilla Safety Plus',
    kind: 'documented',
    aliases: ['gorilla'],
    steps: [
      'From the main Dashboard, check your HOS clocks or tap Logs to pull up today’s duty-status log.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph grid.',
    switchDay:
      'Pick any earlier day from your Logs history list. Screenshot one day at a time.',
  },
  {
    id: 'azuga',
    name: 'Azuga ELD',
    app: 'Azuga eLogs (VisTracks-based)',
    kind: 'documented',
    aliases: ['azuga elogs'],
    steps: [
      'From the main Dashboard, tap LOGS.',
      'Tap to the right of the date you want to open that day’s remaining hours and graph grid.',
    ],
    whichScreen:
      'Screenshot the screen showing your remaining hours (Drive, Shift, Break, Cycle) — Clock 14 reads those four labeled clocks.',
    switchDay:
      'Swipe sideways or tap the arrows to move between days, or go back to the date list. Screenshot one day at a time.',
    caveat: 'Avoid Options → Roadside Inspection for quick checks — exiting requires your driver password.',
  },
  {
    id: 'vistracks',
    name: 'VisTracks',
    app: 'VisTracks HOS (white-label engine)',
    kind: 'documented',
    aliases: ['vis tracks'],
    steps: [
      'From the main Dashboard, tap Log (or Driver Logs). Today’s log opens already expanded with your hours and graph grid.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 remaining-time clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph lines.',
    switchDay:
      'Previous days sit collapsed below today — tap any past date to expand it. Screenshot one day at a time.',
    caveat: 'White-labeled VisTracks apps show your vendor’s brand on the icon, but the layout is the same.',
  },
  {
    id: 'pedigree-oneview',
    name: 'Pedigree Technologies OneView',
    app: 'OneView Mobile / POV',
    kind: 'documented',
    aliases: ['pedigree', 'oneview', 'one view', 'pov'],
    splitScreen: true,
    noPhoneGraph: true,
    notice:
      'If you only have the mounted POV cab tablet without OneView Mobile on your phone, there is no phone screenshot — snap a straight-on photo of the cab screen or type your 4 clocks.',
    steps: [
      'Open OneView Mobile to check your HOS clocks.',
      'For the 24-hour graph grid, tap the top-left 3-bar menu (☰) → My Logs.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the My Logs grid.',
    switchDay:
      'In My Logs, tap the calendar arrows to step day-by-day, or tap the Calendar icon to pick a date. Screenshot one day at a time.',
  },
  {
    id: 'konexial-my20',
    name: 'Konexial My20',
    app: 'My20 ELD App',
    kind: 'documented',
    aliases: ['konexial', 'my20', 'my 20'],
    steps: [
      'Tap the RODS shortcut near the top of the main Dashboard.',
      'Select the view showing your clocks (or Timeline / Graph Grid / Daily Log PDF for the log page).',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 labeled countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks.',
    switchDay:
      'Pick an earlier date from the RODS log screen to review past shifts. Screenshot one day at a time.',
  },
  {
    id: 'trucker-path',
    name: 'Trucker Path ELD',
    app: 'Trucker Path ELD Pro',
    kind: 'documented',
    aliases: ['truckerpath', 'eld pro'],
    steps: [
      'From the main Dashboard, tap Logs to open today’s shift/cycle timers alongside the 24-hour graph grid.',
    ],
    whichScreen:
      'Screenshot the Logs screen with your 4 shift/cycle timers in view — Clock 14 reads those four labeled clocks.',
    switchDay:
      'Select an earlier day inside the Logs section (or step through past 7 days in DOT Inspection Mode). Screenshot one day at a time.',
  },
  {
    id: 'matrack',
    name: 'Matrack',
    app: 'Matrack ELD Driver App',
    kind: 'documented',
    aliases: ['matrack eld'],
    steps: [
      'From the Dashboard, check your clocks or tap Today’s Log (or menu → Logbook / Logs) to view today’s log.',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph grid.',
    switchDay:
      'Tap the left/right arrows or swipe to move through past days. Screenshot one day at a time.',
  },
  {
    id: 'fleetup',
    name: 'FleetUp',
    app: 'FleetUp Driver',
    kind: 'documented',
    aliases: ['fleet up'],
    steps: [
      'Park first — FleetUp locks detailed log screens above 5 mph.',
      'From the Home screen (or main menu), tap HOS for your clocks (or tap the Logs tab for today’s 24-hour grid).',
    ],
    whichScreen:
      'Screenshot the HOS clocks screen showing your 4 countdown clocks — Clock 14 reads those four clocks, not the Logs grid.',
    switchDay:
      'On the Logs tab, tap the Calendar icon to jump to any previous date. Screenshot one day at a time.',
  },
  {
    id: 'linxup',
    name: 'Linxup',
    app: 'Linxup ELD (powered by Apollo)',
    kind: 'documented',
    aliases: ['linxup eld'],
    steps: [
      'From Driver Overview, view your clocks or tap Logs to open today’s graph grid and totals (tap Events only for the text list).',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph lines.',
    switchDay:
      'Tap the < and > arrows beside the date at the top of the screen. Screenshot one day at a time.',
  },
  {
    id: 'apollo-eld',
    name: 'Apollo ELD (Assured Techmatics)',
    app: 'Apollo ELD App',
    kind: 'documented',
    aliases: ['apollo', 'assured techmatics'],
    steps: [
      'Open the Main Menu and tap Logbook.',
      'Stay on the Logbook tab to view your summary hours alongside the 24-hour graph grid (swipe or tap Logs for the event list).',
    ],
    whichScreen:
      'Screenshot the view showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four labeled clocks.',
    switchDay:
      'Tap the < and > arrows beside the date at the top of the screen. Screenshot one day at a time.',
    caveat: 'Many smaller brands say "Powered by Apollo" — these same taps apply.',
  },
  {
    id: 'truckingoffice',
    name: 'TruckingOffice ELD',
    app: 'TruckingOffice ELD App',
    kind: 'documented',
    aliases: ['trucking office'],
    steps: [
      'Open TruckingOffice ELD — your Dashboard shows your HOS hours and a thumbnail of today’s graph grid (tap the thumbnail to expand the grid full-screen).',
    ],
    whichScreen:
      'Screenshot the screen showing your 4 countdown clocks (Drive, Shift, Break, Cycle) — Clock 14 reads those four clocks, not the graph lines.',
    switchDay:
      'Use the past-logs controls on the log screen to view today + the previous 7 days. Screenshot one day at a time.',
  },
  /* ---- 4 FMCSA-registered ELDs without public step-by-step driver UI docs (generic steps, labeled honestly) ---- */
  {
    id: 'eld-mandate',
    name: 'ELD Mandate',
    app: 'ELD Mandate Pro · Generic steps',
    kind: 'undocumented',
    aliases: ['eldmandate', 'eld mandate pro'],
    notice:
      'Generic steps — ELD Mandate is FMCSA-registered, but its exact screen labels aren’t publicly documented. Use the standard 3-step pattern below.',
    steps: GENERIC_3_STEPS,
    whichScreen: GENERIC_WHICH_SCREEN,
    switchDay: GENERIC_SWITCH_DAY,
  },
  {
    id: 'lytx',
    name: 'Lytx',
    app: 'Lytx Driver App · Generic steps',
    kind: 'undocumented',
    aliases: ['lytx driver', 'drivecam', 'sf300', 'sf400'],
    notice:
      'Generic steps — Lytx’s exact driver menu steps sit behind its carrier portal (many SF300/SF400 units follow a Geotab-style HOS layout). Use the standard 3-step pattern below.',
    steps: GENERIC_3_STEPS,
    whichScreen: GENERIC_WHICH_SCREEN,
    switchDay: GENERIC_SWITCH_DAY,
  },
  {
    id: 'netradyne',
    name: 'Netradyne',
    app: 'Driver•i App · Generic steps',
    kind: 'undocumented',
    aliases: ['driveri', 'driver•i', 'driver-i', 'dri430', 'd430'],
    notice:
      'Generic steps — Netradyne Driver•i’s exact driver menu steps sit behind its carrier portal. Use the standard 3-step pattern below.',
    steps: GENERIC_3_STEPS,
    whichScreen: GENERIC_WHICH_SCREEN,
    switchDay: GENERIC_SWITCH_DAY,
  },
  {
    id: 'anytrek',
    name: 'Anytrek',
    app: 'AnyFleet / AnyDash · Generic steps',
    kind: 'undocumented',
    aliases: ['anyfleet', 'anydash'],
    notice:
      'Generic steps — Anytrek hardware pairs with third-party ELD software and has no standalone public driver logbook guide. Use the 3-step pattern below, or pick the ELD app your fleet paired it with.',
    steps: GENERIC_3_STEPS,
    whichScreen: GENERIC_WHICH_SCREEN,
    switchDay: GENERIC_SWITCH_DAY,
  },
  /* ---- Final generic fallback entry ---- */
  {
    id: 'generic',
    name: "Don't see your ELD?",
    app: 'Generic 3-step pattern · works on almost every ELD',
    kind: 'generic',
    aliases: ['other', 'generic', 'unlisted', 'ups', 'fedex', 'walmart', 'jb hunt', 'proprietary'],
    notice:
      'Every FMCSA-registered ELD must show your HOS clocks and 24-hour log. On a dash-mounted cab tablet or carrier-built terminal (UPS, FedEx, Walmart, etc.), use your fleet’s companion phone app if you have one, snap a straight-on photo of the screen, or type your 4 clocks straight into Clock 14.',
    steps: GENERIC_3_STEPS,
    whichScreen: GENERIC_WHICH_SCREEN,
    switchDay: GENERIC_SWITCH_DAY,
    caveat: 'Still stuck? DOT / Roadside Inspection mode always shows your log — heads up, some ELDs ask for your password or PIN to exit inspection mode.',
  },
];

export const DOCUMENTED_ELD_COUNT = ELD_GUIDES.filter((g) => g.kind === 'documented').length;
export const UNDOCUMENTED_ELD_COUNT = ELD_GUIDES.filter((g) => g.kind === 'undocumented').length;

/** Case-insensitive filter across ELD name, app subtitle, and aliases; keeps the generic fallback reachable. */
export function filterEldGuides(query: string): readonly EldGuide[] {
  const q = query.trim().toLowerCase();
  if (!q) return ELD_GUIDES;
  const matched = ELD_GUIDES.filter(
    (g) =>
      g.name.toLowerCase().includes(q)
      || g.app.toLowerCase().includes(q)
      || g.aliases.some((a) => a.toLowerCase().includes(q)),
  );
  if (matched.some((g) => g.id === 'generic')) return matched;
  const fallback = ELD_GUIDES.find((g) => g.id === 'generic');
  return fallback ? [...matched, fallback] : matched;
}

/** True when the search query mentions a discontinued ELD (Stoneridge EZ-ELD or Continental VDO RoadLog). */
export function matchesDiscontinuedEld(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return DISCONTINUED_SEARCH_TERMS.some((term) => q.includes(term) || (q.length >= 3 && term.includes(q)));
}
