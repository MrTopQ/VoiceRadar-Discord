# VoiceRadar-Discord

Vencord plugin. Remembers everyone you shared a voice channel with and shows where they are now.

## Features

- **List.** Everyone you met in voice, newest first, up to the limit (15 by default). Anything you
  switched on by hand keeps its slot: a pin, a bell, the auto-join target, the magnet, and people you
  added yourself.
- **Two tabs.** Pinned and Recent, each with its own count plus a green one for who is in voice right
  now. Pinned rows drag into any order.
- **Per row.** Channel, server, headcount, status, activity chip, mic, headphones, camera, when you
  last sat together, when they left voice, and one icon per device the person is online from. A right
  click opens Discord's own menu for that person.
- **Join.** A button on every row and in the right-click menu. Padlock on channels you cannot enter,
  a queue on full ones, and hidden channels still name their members on hover.
- **Mute mic on auto-join** (off by default). Joins the plugin makes start with your mic off.
- **Auto-join.** Pick one person and you follow them, with no other switch to turn on. The target sits
  on its own card at the top of the window, with a button to stop. You follow them into a full
  channel once a slot opens, and the wait moves with them. Walking out of their channel, or out of
  voice altogether, leaves that channel alone until they move somewhere else. Somebody else
  disconnecting you or moving you out is undone instead, up to six times a minute.
- **Queue.** Holds your place in a full channel until you get in or cancel.
- **Info.** A button under each name, and an entry in the right-click menu, opens what is known
  about the person. Every join, move and leave with the time, your own joins and leaves next to
  theirs with how long you sat together, how often they showed up this week, when the account was made and the servers you share. A button in
  its header opens the person on a lookup site, discord-sensor.com unless you set another, in a
  window of its own inside Discord. You sign in to the site there once and it remembers you. The
  plugin reads nothing from the site, it only shows the page when you click.
  <sub>The log keeps the last 80 entries per person, only on your computer.</sub>
- **Mod View.** A double button on the row, in the info window and in the right-click menu opens
  Discord's own Mod View panel for the person. The shield half picks the server they sit on, the
  arrow half lists your other shared servers. Discord keeps that panel for moderators, so the plugin
  lifts the check the way Vencord's ShowHiddenThings does, only for the panels it opens itself, and
  it works on any shared server with no rights at all.
- **Notifications.** A bell per person, naming the channel. Several joins collapse into one. A card
  in the corner of Discord shows who joined, with a Join button, and waits until you look at Discord,
  since Windows hides its own notification during a game. A sound goes with it, the plugin chime
  or a file of your own, and a button in the settings shows how it all looks.
- **Stream preview.** `LIVE` badge, thumbnail on hover, full size on click.
- **Search.** Nickname, display name or username, and a switch between everybody and only whoever
  is in voice this second. Typing anywhere in the window goes into the search, and the first `Esc`
  empties it.
- **Hotkey.** `Alt+2` opens and closes the window. Rebindable, and claimable system wide.
- **Windows.** The radar, the history, the join list and the health page are drawn on their own
  rather than as Discord modals, which is what lets them open without a stall. A row's buttons sit in
  two strips, voice first and the list second, and whatever Discord opens from a window still comes
  up on top of it.
- **Startup.** Servers are asked for voice states ten at a time, so the radar is ready a few seconds
  after Discord logs in.
- **Moderator mode** (on by default, shows nothing where you lack the rights). Pull one person or a whole channel to you (99 per click,
  confirmation past eight, four moves at a time by default), undo a pull, magnet one person back each
  time they leave. Pulling needs Move Members in both channels of the same server. The magnet shows
  wherever you may move the person and waits while you sit somewhere it cannot pull them to. A sticky mute server-mutes
  a person again whenever the mute is lifted or they rejoin, in any server where you hold Mute
  Members, until you switch it off.
- **UI.** Account panel button with a counter, submenu in user menus and profiles, entry in voice and
  stage channel menus.
- **Languages.** English and Russian, following Discord by default.

## Install

Needs a [Vencord dev install](https://docs.vencord.dev/installing/). From the root of that checkout:

```bash
git clone https://github.com/MrTopQ/VoiceRadar-Discord src/userplugins/VoiceRadar-Discord
```

```bash
pnpm build && pnpm inject
```

`pnpm inject` only the first time. Restart Discord, then enable **VoiceRadar-Discord** in Vencord
settings, Plugins. Without git, download the ZIP into `src/userplugins/` by hand.

## Settings

Eighteen, in panel order. Vencord prints a longer description beside each.

| Setting | Control | Default | What it does |
|---|---|---|---|
| Language | dropdown | Auto | Auto (follow Discord), English, Русский |
| People the list keeps | slider, 5 to 200 | 15 | Pinned people take slots too |
| Hotkey | text | `Alt+2` | Opens and closes the window |
| Mute mic on auto-join | switch | off | Mutes your mic on every join the plugin makes |
| Only follow when idle | switch | off | Never pulls you out of a call |
| Auto-join cooldown | seconds | 5 | Gap between two auto-joins, clamped to 2s and 5min |
| Join alert | dropdown | With the plugin chime | A card in Discord plus a Windows notification while Discord is in the background, with the plugin chime or your own sound, or off |
| Your own sound | file | none | Shown for the own-sound choice. mp3, ogg, wav or m4a up to 2 MB, cut at 5 seconds |
| Join sound volume | slider, 0 to 100 | 60 | How loud that sound is |
| Test | button | | Shows the card and plays the sound, as if somebody joined |
| Highlight joins and leaves | slider, 1 to 5 min | 1 | How long a row stays marked after the person joined or left your voice channel |
| Queue for full channels | switch | on | Auto-join only. Queueing by hand works either way |
| Track automatically | switch | on | Remembers everyone you share a voice channel with |
| Servers watched for voice | slider, 10 to 200 | 100 | Discord only sends voice states for subscribed servers, so joins past this number go unseen. Your people's servers come first, and the window says how many did not fit |
| Keep timers awake | switch | on | Holds Discord's timers at normal pace in the background, so a join reaches you in seconds instead of minutes |
| Group move speed | dropdown | Fast | Careful sends one move at a time, Fast four, Instant eight. Every move is a line in the server's audit log |
| Moderator mode | switch | on | Adds pull, undo, magnet and sticky mute where you hold the permission |
| Lookup site | text | discord-sensor.com/members/{id} | The info window's button, {id} becomes the person's ID, empty removes it |
| Panel button | switch | on | Goes away at once, needs a restart to come back |
| Hotkey system wide | switch | off | The hotkey fires while Discord sits in the background and brings it up. Needs a full restart |

## Notes

- The list stays on your machine, in IndexedDB through Vencord's DataStore. The plugin talks to
  Discord and to nothing else.
- One auto-join target or one magnet at a time. Arming either disarms the other and drops your queue.
- Requests go through the client's own REST and gateway paths, spaced out: names 250ms apart,
  statuses in one batch of up to 100 people, one server subscription every 1.2s, and group moves at
  the pace you pick. A rate limit waits itself out once, and the magnet stops after ten returns in a
  minute.
- The status chip opens a page listing every feature, the Discord internals behind it and whether
  they still sit where the plugin expects, plus how much of Discord's voice picture the client holds.
- The panel button coexists with other plugins that add buttons there.

## License

GPL-3.0. See [LICENSE](LICENSE).

## Screenshots

![Radar Window](screenshots/radar-window.png)

![Panel Button](screenshots/panel-button.png)

![Right-Click Menu](screenshots/context-menu.png)

![Info](screenshots/history.png)
