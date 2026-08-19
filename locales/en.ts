/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { pluralEn } from "./plural";

/**
 * The English dictionary doubles as the shape every other language must satisfy, so a missing or
 * misspelled key in a translation is a type error rather than a blank label at runtime.
 *
 * "Voice Radar" is the product name and stays as-is in every language.
 */
export const en = {
    /* ── plugin card ─────────────────────────────────────────────────────────────────────── */
    pluginDescription: "Voice radar. Recent and pinned people with live voice info, quick and silent join, auto-follow and join notifications. GitHub https://github.com/MrTopQ/VoiceRadar-Discord",

    /* ── settings ────────────────────────────────────────────────────────────────────────── */
    settingLanguage: "Language of the plugin's own text. Auto follows the language Discord is set to",
    settingLanguageAuto: "Auto (follow Discord)",
    settingHistoryLimit: "How many people the list keeps (pinned users take slots too)",
    settingHotkey: "Hotkey that opens Voice Radar (e.g. Alt+2, Ctrl+Shift+V)",
    settingHotkeyInvalid: "That needs a key of its own, not only modifiers. For example Alt+2 or Ctrl+Shift+V",
    settingSilentJoin: "Silent join. Mutes your mic on every join the plugin makes for you, whether that is a quick jump, an auto-join, or a slot you queued for",
    settingAutoJoinEnabled: "Master switch for auto-join. When your target enters a voice channel, you get pulled in after them. There can only be one target, and picking somebody new switches the previous one off",
    settingAutoJoinOnlyWhenIdle: "Only follow the auto-join target when you are not in a voice channel yourself (never yanks you out of a call you are already in)",
    settingAutoJoinCooldown: "Cooldown between auto-joins, in seconds. 0 is as fast as it gets",
    settingNotifyStyle: "How voice notifications are shown",
    notifyStyleNotification: "Corner notification",
    notifyStyleToast: "Toast",
    notifyStyleBoth: "Both",
    settingJoinSound: "Sound when somebody you gave a bell joins a voice channel. It plays over a fullscreen game, which is where Windows quietly swallows the notification itself",
    joinSoundJoin: "Discord join blip",
    joinSoundPing: "Discord ping",
    joinSoundChime: "Plugin chime",
    joinSoundOff: "Off",
    settingJoinSoundVolume: "How loud that sound is, in percent",
    settingQueueForFullChannels: "Auto-join only. When the person you follow sits in a full channel, the plugin waits in a hidden queue and jumps in the moment a slot frees up. Queueing by hand from the join button or the right-click menu works either way",
    settingTrackAutomatically: "Automatically remember everyone you share a voice channel with",
    settingWatchedServerLimit: "How many servers are watched for voice. Discord only sends voice states for servers the client is subscribed to, and a server past this number is one nobody can be seen joining. Servers your people were last seen in are always asked for first",
    settingKeepTimersAwake: "Keep Discord's timers running at their normal pace while it sits in the background. On, a join reaches you in seconds. Off, Chromium slows the whole window down after a few minutes in the background and a notification can be minutes late. This is the one setting that changes Discord as a whole rather than only this plugin, so turn it off if you would rather Discord stayed out of the way while you are in a game",
    settingMovePace: "How fast group moves run. Every move is one line in the server's audit log, and a whole channel arriving in a second looks like a raid tool rather than a moderator. Careful sends one at a time, instant sends eight at once",
    movePaceCareful: "Careful (one at a time)",
    movePaceFast: "Fast (four at once)",
    movePaceInstant: "Instant (eight at once)",
    settingModeratorMode: "Moderator actions. Pull somebody into your channel, bring a whole channel over, put a magnet on one person, and undo any of it. All of it is built on Move Members, so the entries only show up where you actually hold that permission",
    settingShowPanelButton: "Show the Voice Radar button in the account panel (next to mic/headphones)",
    settingGlobalHotkey: "Lets the hotkey work while Discord is in the background, in a game, in another window or closed to the tray. It brings Discord up and opens the radar, and pressing it again closes the radar and puts Discord back where it was. While this is on, the combination is taken from every other program, and Discord itself has to be running",

    /* ── what the plugin is doing, in the corner of the window ───────────────────────────── */
    statusTitle: "Voice Radar right now",
    statusLoading: "starting up",
    statusReady: "ready",
    statusProblems: (count: number) => `${count} ${pluralEn(count, "part is", "parts are")} broken`,
    statusDegraded: (count: number) => `${count} ${pluralEn(count, "part is", "parts are")} missing`,
    statusDegradedLine: (problems: string) =>
        `A Discord update moved these, and the plugin carries on without them. ${problems}`,
    statusListLost: "list not read",
    statusListLostLine: "The saved list could not be read, so it is empty this session. Nothing is written back, so the stored one is safe.",
    statusSubscribing: (done: number, total: number) =>
        `Going through your servers, ${done} of ${total}, asking Discord to send who joins voice in them.`,
    statusNeedsRestart: "restart needed",
    statusHotkeyTaken: "hotkey taken",
    statusStoreLoading: "Reading the saved list from the database.",
    statusStoreLoaded: (people: number, live: number) =>
        `${people} ${pluralEn(people, "person", "people")} in the list, ${live} in voice right now.`,
    statusServersWaiting: "Servers have not been asked to keep sending voice states yet.",
    statusServersFirstPass: "This is the first pass since startup, and it has not finished yet.",
    statusServers: (guilds: number, when: string) =>
        `${guilds} ${pluralEn(guilds, "server is", "servers are")} being watched for voice. `
        + `Last checked ${when}, whether Discord has dropped those subscriptions, and taking them again if it has.`,
    statusHotkey: {
        global: "The hotkey works everywhere, even while Discord is in the background.",
        window: "The hotkey works while Discord is focused.",
        "needs-restart": "The system wide hotkey is on but needs a full restart of Discord.",
        /* the switch is on and the machine said no, which used to read as the plain window line */
        taken: "You asked for the hotkey everywhere and another program already holds that"
            + " combination, so it only works while Discord is focused. Pick another one.",
        asking: "Asking the system for the combination."
    } as Record<string, string>,
    statusBroken: (problems: string) => `A Discord update moved these. ${problems}`,

    /* ── the window behind the status chip ───────────────────────────────────────────────── */
    healthTitle: "What is working",

    /* one heading per half of the window. What the plugin does, and what it runs inside */
    healthGroupFeatures: "Every feature, and whether Discord still has what it needs",
    healthGroupAround: "Around the plugin",

    /**
     * What a feature says when a part it stands on has moved. The parts name themselves, since a
     * reader who has come this far wants the name to search for, not a shrug.
     */
    healthFeatureBroken: (parts: string) => `Does not work, a Discord update moved this. ${parts}`,
    healthFeatureWeak: (parts: string) => `Weaker than it should be, a Discord update moved this. ${parts}`,
    /** the checks themselves did not run, so a green tick here would be a guess rather than an answer */
    healthFeatureOff: "Switched off in the settings, so there is nothing here to go wrong.",
    healthFeatureUnchecked: "Not checked. The check itself did not run, which usually means a Discord update took it down too. The console has the reason.",

    healthWhoIsWhereTitle: "Who is in which voice channel",
    healthWhoIsWhereOk: "Voice channels are readable, along with who is sitting in them and how many.",
    healthTrackerTitle: "Being told when somebody moves",
    healthTrackerOk: "Every join, move and leave reaches the plugin, which is what fills the list and fires everything else.",
    healthNamesTitle: "Names and avatars",
    healthNamesOk: "Names and avatars load even for people Discord has not cached yet.",
    healthPresenceTitle: "Statuses and devices",
    healthPresenceOk: "The status dot and the per device icons come straight from Discord.",
    healthJoinTitle: "Joining a channel",
    healthJoinOk: "The join button, auto join and the queue for a full channel all go through this.",
    healthSilentJoinTitle: "Silent join",
    healthSilentJoinOk: "The mic goes off on every join the plugin makes for you.",
    healthOpenChannelTitle: "Opening a channel from the chip",
    healthOpenChannelOk: "Clicking the channel chip moves Discord to it without connecting you.",
    healthPermissionsTitle: "Channel permissions",
    healthPermissionsOk: "The padlock, the full channel and the ones you cannot see are read from your own rights.",
    healthStreamsTitle: "Stream preview",
    healthStreamsOk: "The LIVE badge, the thumbnail on hover and the full size one on click.",
    healthModerationTitle: "Moderator actions",
    healthModerationOk: "Pulling somebody over, putting them back and the magnet.",
    healthWindowTitle: "The radar window",
    healthWindowOk: "It opens from the hotkey, from every right click menu and from the account panel.",
    healthPanelButtonTitle: "The account panel button",
    healthPanelButtonOk: "The button with the counter sits next to the mic and the headphones.",
    healthToastsTitle: "The plugin's own messages",
    healthToastsOk: "The little messages saying what the plugin has just done.",

    healthServersTitle: "Asking servers for voice",
    healthServersLine: (watched: number, mine: number, skipped: number, when: string) =>
        `Watching voice on ${watched} servers out of your ${mine}, ${skipped} skipped for having no voice channels. Last request ${when}.`,
    healthServersCapped: (count: number) =>
        `${count} ${pluralEn(count, "server with voice channels is", "servers with voice channels are")} `
        + "over the limit and not watched, so somebody joining voice there will not be noticed. "
        + "Raise the watched servers limit in the settings.",
    healthServersGuard: "Every minute the subscriptions are checked and taken again if Discord dropped them.",
    healthServersGuardOff: "There is nothing left to ask Discord whether the subscriptions are alive, so they are refreshed on a timer.",

    healthListTitle: "The saved list",
    healthHotkeyTitle: "Hotkey",
    healthNotifyTitle: "Notifications",
    healthNotifyReady: "Windows lets Discord show them, so a join reaches you outside the app.",
    healthNotifyDenied: "Notifications are blocked, so nothing reaches you outside Discord. Allow them for Discord in the system settings.",
    healthNotifyAsk: "Permission has not been asked for yet. The first notification will ask.",
    healthNotifyToastOnly: "Shown inside Discord only, so the operating system has no say in it.",
    healthNotifyStyle: (label: string) => `Shown as ${label}.`,
    /** Joins, not popups, because a group arriving together is one popup and several joins. */
    healthNotifyLast: (count: number, when: string) =>
        `${count} joins announced since start, the last one ${when}.`,
    healthNotifyNone: "None sent so far.",
    healthTimersTitle: "Timers while Discord is in the background",
    /**
     * One line per state, because the four of them want four different things from the reader and
     * the row used to answer three of them with "restart Discord".
     */
    healthTimers: {
        awake: "Kept running, so a join is announced in seconds rather than minutes.",
        off: "Left to Chromium on purpose, so a notification can be minutes late while Discord is in the background. That is the switch in the settings, not a fault.",
        "needs-restart": "The switch is on, but this page never received the plugin's main-process half, so nothing has asked Chromium to stop slowing the window down. Discord hands that half over while it starts, so a full restart fixes it and reloading the page does not. This is the same restart the system wide hotkey asks for.",
        refused: "The switch is on and the main process was asked, and it could not do it, so Chromium is still slowing the window down and a notification can be minutes late. The reason is in the console. A restart is worth trying and is not promised to help.",
        asking: "Asking the main process."
    } as Record<string, string>,
    healthVoiceTitle: "Voice data arriving",
    /**
     * Servers with somebody in voice this second, not servers being watched. A watched server where
     * every voice channel is empty holds nothing, and the number read as a coverage failure.
     */
    healthVoiceLine: (guilds: number, states: number, when: string) =>
        `Somebody is in voice on ${guilds} ${pluralEn(guilds, "server", "servers")} right now, ${states} people in total. `
        + `Last event ${when}.`,
    healthVoiceQuiet: (guilds: number, states: number) =>
        `Somebody is in voice on ${guilds} ${pluralEn(guilds, "server", "servers")} right now, ${states} people in total. `
        + "Nothing has come in yet.",
    healthVoiceNone: "Discord has not handed over a single voice state yet.",
    healthBuildTitle: "Discord build",
    healthBuildLine: (channel: string, build: string) => `Channel ${channel}, build ${build}.`,
    healthBuildUnknown: "Discord is not saying which build it is. Nothing here depends on it.",

    /* ── radar window ────────────────────────────────────────────────────────────────────── */
    searchPlaceholder: "Search people…",
    pressKeys: "press keys…",
    hotkeyChip: (combo: string) => `hotkey ${combo}`,
    hotkeySaved: (combo: string) => `Voice Radar hotkey is now ${combo}`,
    globalHotkeyNeedsRestart: "The system wide hotkey needs a full restart of Discord, not a reload. Quit it from the tray and start it again.",
    globalHotkeyTaken: (combo: string) =>
        `${combo} is already held by another program, so it only works while Discord is focused.`,
    chipSilentJoinOn: "🔇 silent join on",
    chipSilentJoinOff: "🎙 silent join off",
    /** both states are spelled out, because a filter that hides people must not be only a colour */
    chipLiveOnlyOn: "🟢 in voice only",
    chipLiveOnlyOff: "⚪ everybody",
    chipAutoJoinDisabled: (name: string | null) => `🎯 auto-join off${name ? ` (${name})` : ""}`,
    chipAutoJoinTarget: (name: string) => `🎯 auto-join ${name}`,
    chipAutoJoinNobody: "🎯 auto-join nobody",
    chipSendBack: (count: number) => `↩ send ${count} back`,
    chipWaitingForSlot: (channel: string) => `⏳ waiting for a slot in ${channel} ✕`,

    modalSubtitle: (pinned: number, recent: number, total: number, limit: number) =>
        `${pinned} pinned, ${recent} recent, ${total}/${limit}${total > limit ? ", over limit" : ""}`,

    clearHistory: "Clear history",
    clearHistoryTitle: "Clear history?",
    clearHistoryBody: (count: number) =>
        `${count} ${pluralEn(count, "person", "people")} will be removed, everyone who is not pinned, bells, auto-join target and hand-added entries included. Only pinned people stay.`,
    clearHistoryConfirm: "Clear",
    cancel: "Cancel",
    historyCleared: "History cleared (pinned people kept)",

    warnApiDegraded: (problems: string) =>
        `A Discord update moved these, so these parts are gone. ${problems}. Everything else works, and a plugin update should bring them back.`,
    warnApiProblems: (problems: string) =>
        `A Discord update moved things this plugin relies on, so these parts are dead. ${problems}. The rest keeps working, look for a plugin update.`,
    warnOverLimit: (total: number, limit: number, free: number) =>
        `${total}/${limit} in the list. The limit only cuts plain history. People you set up by hand (pinned, bells, auto-join target, added manually) are never cut by it, so the list can pass the limit, and history itself has ${free} free ${pluralEn(free, "slot", "slots")} right now. Raise it in the plugin settings, or use "Clear history", which removes everything that is not pinned.`,

    emptyTitle: "Nobody here yet.",
    emptyHint: "Join a voice channel with someone, or add people from their right-click menu → Voice Radar.",

    sectionPinned: "Pinned",
    sectionPinnedHint: (count: number, limit: number) => `${count} of ${limit} slots · drag to reorder`,
    sectionRecent: "Recent",
    /** the other tab still has people, so the window is not empty, only this list is */
    tabEmpty: "Nobody in this tab.",
    /** the tab is not empty, the filter is hiding it, and those are not the same answer */
    tabEmptyLive: "Nobody in this tab is in a voice channel right now.",
    /** on the green count beside a tab */
    tabLiveHint: "In a voice channel right now",
    sectionRecentHint: (free: number) => `${free} free ${pluralEn(free, "slot", "slots")}`,

    /* ── a person's row ──────────────────────────────────────────────────────────────────── */
    badgePinned: "PINNED",
    badgeAuto: "AUTO",
    badgeWithYou: "WITH YOU",
    badgeLive: "LIVE",

    notInVoice: "Not in voice",
    lastChannel: (channel: string) => `, last seen in ${channel}`,
    seenAgo: (when: string) => `seen ${when}`,
    /** for somebody put in the list by hand, who has not been sat with yet */
    addedAgo: (when: string) => `added ${when}`,

    tooltipInVoiceChat: "In Voice Chat",
    tooltipAndMore: (count: number) => `+${count} more`,
    tooltipDeafened: "Deafened, hears nothing",
    tooltipMuted: "Mic is off",
    tooltipOpenChannel: "Click to open the channel (without joining)",
    tooltipNoChannelAccess: "You have no access to this channel",
    channelFull: " · full",
    noChannelAccess: "You have no access to that channel",

    permissionUnchecked: " (permission could not be checked)",

    magnetOff: "Keep them in your channel",
    magnetIdleNoPermission: "Magnet on, but you have no Move Members here, so nobody can be brought over. Click to switch it off",
    magnetIdleNotConnected: "Magnet on, idle, because you are not in a voice channel",
    magnetIdleOtherGuild: "Magnet on, idle, because they are in another server and Discord cannot move them here",
    /** armed, but nobody to move yet. It fires the moment they turn up in voice */
    magnetIdleTargetOffline: "Magnet on, waiting, because they are not in a voice channel yet",
    magnetActive: "Magnet on, they get dragged back whenever they wander off",

    joinNotInVoice: "Not in a voice channel",
    joinAlreadyThere: "You are already there",
    joinNoPermission: "No permission to join this channel",
    joinQueued: "Waiting for a free slot, click to cancel",
    joinChannelFull: "Channel is full, click to wait for a free slot",
    joinMuted: "Jump in (muted)",
    join: "Jump in",

    sendBackTo: (channel: string) => `Send them back to ${channel}`,
    pullAlreadyHere: "Already in your channel",
    pullToMyChannel: "Move them to your channel",
    unpin: "Unpin",
    pin: "Pin (keeps the slot forever)",
    notifyOn: "Notifications on",
    notifyOff: "Notify me when they join voice",
    autoJoinOn: "Auto-join on (click to disable)",
    autoJoinOnButDisabled: "Target set, but the auto-join master switch is off, so nothing follows them. Turn it on in the radar toolbar",
    autoJoinOff: "Auto-join this person. There can only be one target, arming it switches the previous one off",
    removeFromList: "Remove from the list",

    userNotInVoice: (name: string) => `${name} is not in a voice channel`,
    alreadyWithUser: (name: string) => `You are already with ${name}`,
    magnetOffFor: (name: string) => `Magnet off for ${name}`,
    magnetOnFor: (name: string) => `${name} is now stuck to your channel`,
    magnetGaveUp: (name: string) => `Magnet off, ${name} is leaving faster than they can be brought back`,
    magnetOffNoPermission: (name: string) => `Magnet off, ${name} cannot be moved here, so retrying would change nothing`,
    magnetCoolingDown: (name: string, seconds: number) =>
        `The magnet on ${name} just gave up, you can put it back in ${seconds}s`,
    autoJoinTargetSet: (name: string) => `Auto-join target is now ${name}`,
    /** armed while the master switch is off, so nothing would happen. Say so, do not claim success */
    autoJoinTargetSetButOff: (name: string) =>
        `Auto-join target is now ${name}, but auto-join itself is switched off, turn it on in the radar toolbar`,
    autoJoinCleared: "Auto-join disabled",

    /* ── account panel button ────────────────────────────────────────────────────────────── */
    panelTitle: (hotkey: string) => `Voice Radar (${hotkey})`,
    panelNobodyInVoice: "Nobody from your list is in voice",
    panelAutoJoin: (name: string, silent: boolean) => `🎯 auto-join ${name}${silent ? " (silent)" : ""}`,

    /* ── stream preview ──────────────────────────────────────────────────────────────────── */
    streamingBy: (name: string) => `${name} is streaming`,
    streamPreviewAlt: "Stream preview",
    streamPreviewLoading: "loading preview…",
    streamPreviewMissing: "no preview available",
    streamPreviewHint: "Click for a bigger preview",
    streamPreviewMissingFor: (name: string) => `No preview available for ${name}'s stream`,

    /* ── status dot and device icons ─────────────────────────────────────────────────────── */
    platformDesktop: "Desktop",
    platformMobile: "Phone",
    platformWeb: "Browser",
    platformConsole: "Console",
    platformVr: "VR",
    platformTooltip: (platform: string, status: string) => `${platform} · ${status}`,

    statusUnknownHint: "status unknown, Discord has not sent this user's presence",
    statusOnline: "online",
    statusIdle: "idle",
    statusDnd: "do not disturb",
    statusOffline: "offline",
    statusMobile: (status: string) => `${status} (mobile)`,

    /* ── context menus ───────────────────────────────────────────────────────────────────── */
    menuRoot: "Voice Radar",
    menuRemoveFromRadar: "Remove from radar",
    menuAddToRadar: "Add to radar",
    menuPin: "Pin",
    menuNotify: "Notify when they join voice",
    menuAutoJoin: "Auto-join this person",
    menuJumpMuted: "Jump to their channel (muted)",
    menuJump: "Jump to their channel",
    menuStopWaitingTheirChannel: "Stop waiting for a free slot",
    menuWaitTheirChannel: "Wait for a free slot in their channel",
    menuStopWaiting: "Stop waiting for a free slot",
    menuWait: "Wait for a free slot",
    menuOpenRadar: "Open Voice Radar",
    menuModerator: "Moderator",
    menuPullUser: "Pull them into my channel",
    menuPullChannel: (channel: string) => `Pull everyone from ${channel} to me`,
    menuSendBatchBack: (count: number) => `↩ Send ${count} back to their channels`,
    menuMagnet: "Magnet, keep them in my channel",
    menuTrackChannel: (count: number) => `Add everyone here to the radar (${count})`,
    menuPullEveryoneHere: "Pull everyone here into my channel",

    userAddedToRadar: (name: string) => `${name} added to Voice Radar`,
    userRemovedFromRadar: (name: string) => `${name} removed from Voice Radar`,
    addedToRadar: (count: number) => `Added ${count} ${pluralEn(count, "person", "people")} to the radar`,
    addedToRadarCapped: (added: number, left: number) =>
        `Added ${added} ${pluralEn(added, "person", "people")} to the radar, ${left} did not fit, `
        + "because the list is already at its limit. Raise how many people the list keeps in the "
        + "settings, or clear the history.",

    /* ── slot queue ──────────────────────────────────────────────────────────────────────── */
    queueCancelled: "Queue cancelled",
    queueAutoJoinDropped: (name: string) => `auto-join for ${name} turned off`,
    queueReplaced: (channel: string) => `queue for ${channel} dropped`,
    queueWaiting: (channel: string, extras: string) =>
        `⏳ Waiting for a free slot in ${channel}${extras ? `, ${extras}` : ""}`,
    queueGotSlot: (channel: string) => `✅ Got a slot in ${channel}`,
    queueStuck: (channel: string) =>
        `Stopped waiting for ${channel}. It has been open for a while and the connection is not`
        + " landing, so asking again would only keep pulling at a voice connection that is"
        + " already struggling. Try joining it by hand.",
    queueRefused: (channel: string) =>
        `Stopped waiting for ${channel}, Discord refused the connection, so waiting longer would not change anything`,
    queueCancelledForMagnet: (channel: string, name: string) => `Queue for ${channel} cancelled, holding ${name} instead`,
    queueCancelledForAutoJoin: (channel: string, name: string) => `Queue for ${channel} cancelled, now following ${name}`,
    /** a wait that belonged to a person, ended because there is no longer a person to wait for */
    queueFollowGone: (name: string, channel: string) =>
        `${name} is out of voice, so the wait for a slot in ${channel} is off.`,
    queueFollowStopped: (channel: string) =>
        `Auto-join is off, so the wait for a slot in ${channel} is off.`,

    /* ── tracker notifications ───────────────────────────────────────────────────────────── */
    someone: "Someone",
    notifyToast: (name: string, channel: string) => `🔊 ${name} → ${channel}`,
    notifyTitle: (name: string) => `${name} joined voice`,
    notifyBatchTitle: (count: number) =>
        `${count} ${pluralEn(count, "person", "people")} joined voice`,
    notifyBatchNames: (names: string, more: number) => (more ? `${names} and ${more} more` : names),
    notifyBatchToast: (names: string) => `🔊 ${names} joined voice`,
    joinedModalHint: "Only the people this popup was about",
    joinedModalGone: "These people are no longer on the radar",
    followingUser: (name: string, channel: string, silent: boolean) =>
        `🎯 Following ${name} → ${channel}${silent ? " (muted)" : ""}`,
    followGaveUpBeingRemoved: (name: string) =>
        `Auto-join off, you are being disconnected faster than following ${name} can put you back`,

    /* ── moderator actions ───────────────────────────────────────────────────────────────── */
    refusalNotConnected: (name: string) => `${name} is not connected to voice`,
    refusalNotInGuild: (name: string) => `${name} is not on that server any more`,
    refusalForbidden: (name: string) => `Not allowed to move ${name}, either you lack the permission here, or they cannot enter your channel`,
    refusalCannotMoveInto: (name: string, channel: string) =>
        `No Move Members in ${channel}, so ${name} cannot be brought in, the permission is needed in your own channel too`,
    refusalCannotMoveFrom: (name: string, channel: string) =>
        `No Move Members in ${channel}, so ${name} cannot be taken out of there`,
    refusalTargetCannotJoin: (name: string) => `Discord will not let ${name} into your channel, they have no access to it`,
    refusalNoGuildAccess: "No access to that server any more",
    refusalGone: (name: string) => `${name} is no longer there`,
    refusalRateLimited: "Discord asked to slow down, try again in a moment",
    refusalWithMessage: (name: string, message: string) => `${name}, ${message}`,
    refusalGeneric: (name: string) => `Discord refused to move ${name}`,

    sentUserBack: (name: string, channel: string) => `${name} sent back to ${channel}`,
    sentBatchBack: (count: number) => `Sent ${count} ${pluralEn(count, "person", "people")} back`,
    /** a run cut short by a rate limit. The red toast that said why is already gone */
    sentBatchBackStopped: (count: number, left: number) =>
        `Sent ${count} ${pluralEn(count, "person", "people")} back, then Discord asked to slow down. `
        + `${left} left, try again in a moment.`,
    joinChannelFirst: "Join a voice channel first, there is nowhere to pull them",
    userAlreadyWithYou: (name: string) => `${name} is already with you`,
    sameGuildOnly: "They can only be moved inside their own server",
    userPulled: (name: string) => `${name} pulled into your channel`,
    nobodyToPull: (where: string) => `Nobody to pull from ${where}`,
    /** a whole channel at once is a line per person in the server's audit log, so it is confirmed */
    pullConfirmTitle: "Move everyone over?",
    pullConfirmBody: (count: number, where: string, seconds: number) =>
        `${count} ${pluralEn(count, "person", "people")} from ${where} will be moved into your channel, `
        + `in about ${seconds} ${pluralEn(seconds, "second", "seconds")}. `
        + "Every move is a line in the server's audit log.",
    pullConfirmButton: (count: number) => `Move ${count}`,
    noMovePermissionHere: (where: string) =>
        `No Move Members in ${where}, nobody can be taken out of there`,
    pulledUsers: (count: number, where: string) =>
        `Pulled ${count} ${pluralEn(count, "person", "people")} from ${where}`,
    /** the group move is capped per click, so the ones left behind have to be named */
    pulledUsersCapped: (count: number, where: string, skipped: number) =>
        `Pulled ${count} ${pluralEn(count, "person", "people")} from ${where}, ${skipped} left behind, that is the most one go can move. Click again for the rest.`,
    /** same, but the run was cut short by a rate limit rather than by the cap */
    pulledUsersStopped: (count: number, where: string, left: number) =>
        `Pulled ${count} ${pluralEn(count, "person", "people")} from ${where}, then Discord asked to `
        + `slow down. ${left} left, try again in a moment.`,

    /* ── voice helpers ───────────────────────────────────────────────────────────────────── */
    unknownChannel: "Unknown channel",
    groupCall: "Group call",
    directCall: "Direct call",
    unknownUser: "Unknown user",

    couldNotOpenChannel: "Voice Radar could not open that channel",
    couldNotOpenWindow: "Voice Radar could not open the window, a Discord update probably moved it",
    targetNotInVoice: "Voice Radar, this user is not in a voice channel",
    cannotJoinChannel: "Voice Radar, you cannot join that voice channel",
    channelIsFull: "Voice Radar, that voice channel is full",
    couldNotJoinChannel: "Voice Radar could not join that channel",

    hotkeyNotSet: "not set",

    /* ── broken Discord internals, listed in the warning banner ──────────────────────────── */
    apiWhoIsInVoice: "who is in voice (VoiceStateStore.getVoiceStateForUser)",
    apiChannelMembers: "channel members (VoiceStateStore.getVoiceStatesForChannel)",
    apiMyChannel: "your own channel (SelectedChannelStore.getVoiceChannelId)",
    apiChannelInfo: "channel names and permissions (ChannelStore.getChannel)",
    apiUserInfo: "names and avatars (UserStore.getUser)",
    apiStatuses: "statuses (PresenceStore.getStatus)",
    apiJoinChannel: "joining channels (selectVoiceChannel)",
    apiSilentJoin: "silent join (setSelfMute and toggleSelfMute, with a dispatch as the last resort)",
    apiToasts: "toasts (the plugin's own messages)",
    apiDevices: "which device somebody is online from (PresenceStore.getClientStatus)",
    apiWindow: "the window itself (Modal), so the radar cannot be opened",
    apiPanelButton: "the button in the account panel (found by matching Discord's code)",
    apiPanelButtonPatch: "the button's place in the account panel, where the patch did not go in, so no button can appear there. The window still opens from the hotkey and every right-click menu",
    apiGuildSubscriptions: "asking servers for voice states (GuildSubscriptionsStore), so people in servers you have not opened stay invisible",
    apiGuildSubscriptionAction: "asking servers for voice states, where the request goes out and nothing comes of it, so people in servers you have not opened stay invisible",
    apiServerList: "the list of your servers (GuildStore.getGuildIds), so only the servers your people were last seen in are watched and a join anywhere else goes unnoticed",
    apiOpenChannel: "opening channels (ChannelRouter.transitionToChannel)",
    apiStreamPreviews: "stream previews (ApplicationStreamPreviewStore)",
    apiJoinSound: "Discord's own sounds (SoundUtils.playSound), so the join sound falls back to the plugin's chime",
    apiPermissions: "permission checks (PermissionStore.can)",
    apiModeratorActions: "moderator actions (RestAPI.patch)",
    apiMoveMembersFlag: "the Move Members permission flag",
    apiVoiceEvents: "being told when somebody moves (FluxDispatcher.subscribe), without which the list never grows and nothing is ever announced",

    /* ── relative time ───────────────────────────────────────────────────────────────────── */
    timeJustNow: "just now",
    timeMinutes: (value: number) => `${value}m ago`,
    timeHours: (value: number) => `${value}h ago`,
    timeDays: (value: number) => `${value}d ago`,
    timeWeeks: (value: number) => `${value}w ago`
};

/** Every translation must provide exactly these keys, with exactly these signatures. */
export type Messages = typeof en;
