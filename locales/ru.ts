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

import type { Messages } from "./en";
import { pluralRu } from "./plural";

/** Display names have no grammatical gender, so text about a person avoids gendered words. */
const people = (count: number) => pluralRu(count, "человек", "человека", "человек");
const slots = (count: number) => pluralRu(count, "свободный слот", "свободных слота", "свободных слотов");

export const ru: Messages = {
    /* ── карточка плагина ────────────────────────────────────────────────────────────────── */
    pluginDescription: "Радар голосовых каналов. Недавние и закреплённые люди с живой информацией о голосе, быстрый вход, автоследование и уведомления о заходе. GitHub https://github.com/MrTopQ/VoiceRadar-Discord",

    /* ── настройки ───────────────────────────────────────────────────────────────────────── */
    settingLanguage: "Язык текстов самого плагина. «Авто» повторяет язык интерфейса Discord",
    settingLanguageAuto: "Авто (как в Discord)",
    settingHistoryLimit: "Сколько человек хранит список (закреплённые тоже занимают слоты)",
    settingHotkey: "Горячая клавиша, открывающая Voice Radar (например, Alt+2, Ctrl+Shift+V)",
    settingHotkeyInvalid: "Нужна собственная клавиша, а не только модификаторы. Например, Alt+2 или Ctrl+Shift+V",
    settingSilentJoin: "Выключать микрофон при автовходе. Действует при любом входе, который плагин делает за вас: быстрый переход, автозаход или занятый слот из очереди",
    settingAutoJoinOnlyWhenIdle: "Следовать за целью автозахода, только когда вы сами не в голосовом канале (никогда не выдёргивает вас из текущего разговора)",
    settingAutoJoinCooldown: "Пауза между автозаходами, в секундах. Ноль означает максимально быстро",
    settingNotifyStyle: "Как показывать уведомления о заходе в голосовой",
    notifyStyleNotification: "Уведомление в углу",
    notifyStyleToast: "Всплывающее сообщение",
    notifyStyleBoth: "И то, и другое",
    settingJoinSound: "Звук, когда человек с колокольчиком заходит в голосовой канал. Он слышен и поверх полноэкранной игры, где само уведомление Windows молча съедает",
    joinSoundJoin: "Заход, как в Discord",
    joinSoundPing: "Пинг Discord",
    joinSoundChime: "Свой сигнал плагина",
    joinSoundOff: "Выключен",
    settingJoinSoundVolume: "Громкость этого звука, в процентах",
    settingQueueForFullChannels: "Только для автозахода. Если человек, за которым вы следуете, сидит в заполненном канале, плагин ждёт в скрытой очереди и заходит в тот же момент, когда освободится слот. Очередь, поставленная вручную кнопкой входа или через правый клик, работает в любом случае",
    settingTrackAutomatically: "Автоматически запоминать всех, с кем вы оказались в одном голосовом канале",
    settingWatchedServerLimit: "За сколькими серверами следить. Discord присылает голосовые состояния только тех серверов, на которые клиент подписан, поэтому на сервере сверх этого числа чужой заход в голосовой никто не увидит. Серверы, где ваших людей видели последний раз, запрашиваются в первую очередь",
    settingKeepTimersAwake: "Держать таймеры Discord в обычном темпе, пока он в фоне. Включено, о заходе вы узнаете за секунды. Выключено, Chromium через несколько минут замедляет всё окно, и уведомление может опоздать на минуты. Это единственная настройка, которая меняет поведение всего Discord, а не только плагина, поэтому выключите её, если хотите, чтобы Discord не мешал вам в игре",
    settingMovePace: "Насколько быстро идут групповые перемещения. Каждое перемещение это строка в журнале аудита сервера, а целый канал, приехавший за секунду, выглядит как рейд-тула, а не как модератор. «Осторожно» отправляет по одному, «мгновенно» по восемь сразу",
    movePaceCareful: "Осторожно (по одному)",
    movePaceFast: "Быстро (по четыре)",
    movePaceInstant: "Мгновенно (по восемь)",
    settingModeratorMode: "Действия модератора. Перетащить человека к себе в канал, перевести к себе целый канал, повесить на кого-то магнит и отменить любое из этих действий. Всё построено на праве «Перемещать участников», поэтому пункты появляются только там, где оно у вас действительно есть",
    settingShowPanelButton: "Показывать кнопку Voice Radar на панели аккаунта (рядом с микрофоном и наушниками)",
    settingGlobalHotkey: "Клавиша срабатывает, даже пока Discord не в фокусе, в игре, в другом окне или свёрнутый в трей. Он поднимет окно и откроет радар, а повторное нажатие закроет радар и вернёт Discord туда, откуда он пришёл. Пока включено, комбинация отбирается у остальных программ, а сам Discord должен быть запущен",

    /* ── состояние плагина, в углу окна ──────────────────────────────────────────────────── */
    statusTitle: "Voice Radar прямо сейчас",
    statusLoading: "запускается",
    statusReady: "готов",
    statusProblems: (count: number) =>
        `${count} ${pluralRu(count, "часть не работает", "части не работают", "частей не работают")}`,
    statusDegraded: (count: number) =>
        `${count} ${pluralRu(count, "часть отвалилась", "части отвалились", "частей отвалилось")}`,
    statusDegradedLine: (problems: string) =>
        `Обновление Discord сдвинуло это, плагин работает дальше без них. ${problems}`,
    statusListLost: "список не прочитан",
    statusListLostLine: "Сохранённый список не удалось прочитать, поэтому он пуст в этой сессии. Обратно ничего не пишется, так что сохранённый цел.",
    statusSubscribing: (done: number, total: number) =>
        `Обходим ваши серверы, ${done} из ${total}, просим Discord присылать, кто заходит в их голосовые каналы.`,
    statusNeedsRestart: "нужен перезапуск",
    statusHotkeyTaken: "клавиша занята",
    statusStoreLoading: "Читаем сохранённый список из базы.",
    statusStoreLoaded: (people: number, live: number) =>
        `В списке ${people} ${people === 1 ? "человек" : pluralRu(people, "человек", "человека", "человек")}, в голосе сейчас ${live}.`,
    statusServersWaiting: "Серверы ещё не просили присылать голосовые состояния.",
    statusServersFirstPass: "Это первый обход после запуска, он ещё не закончен.",
    statusServers: (guilds: number, when: string) =>
        `Следим за голосом на ${guilds} ${pluralRu(guilds, "сервере", "серверах", "серверах")}. `
        + `Последняя проверка ${when}, не сбросил ли Discord эти подписки, а если сбросил, берём заново.`,
    statusHotkey: {
        global: "Клавиша работает везде, даже когда Discord свёрнут.",
        window: "Клавиша работает, пока Discord в фокусе.",
        "needs-restart": "Глобальная клавиша включена, но нужен полный перезапуск Discord.",
        taken: "Вы просили клавишу везде, но эту комбинацию уже держит другая программа,"
            + " поэтому она работает только пока Discord в фокусе. Выберите другую.",
        asking: "Спрашиваем комбинацию у системы."
    } as Record<string, string>,
    statusBroken: (problems: string) => `Обновление Discord сдвинуло вот это. ${problems}`,

    /* ── окно за индикатором состояния ───────────────────────────────────────────────────── */
    healthTitle: "Что работает",

    healthGroupFeatures: "Все функции и есть ли у Discord то, на чём они держатся",
    healthGroupAround: "Вокруг плагина",

    healthFeatureBroken: (parts: string) => `Не работает, обновление Discord это сдвинуло. ${parts}`,
    healthFeatureWeak: (parts: string) => `Работает слабее, чем должно, обновление Discord это сдвинуло. ${parts}`,
    healthFeatureOff: "Выключено в настройках, поэтому ломаться тут нечему.",
    healthFeatureUnchecked: "Не проверено. Сама проверка не отработала, обычно это значит, что обновление Discord задело и её. Причина в консоли.",

    healthWhoIsWhereTitle: "Кто в каком голосовом канале",
    healthWhoIsWhereOk: "Голосовые каналы читаются, вместе с тем, кто в них сидит и сколько там людей.",
    healthTrackerTitle: "Доходят ли события о перемещениях",
    healthTrackerOk: "Каждый заход, переход и выход доходит до плагина, и именно это наполняет список и запускает всё остальное.",
    healthNamesTitle: "Имена и аватары",
    healthNamesOk: "Имена и аватары подгружаются даже для тех, кого Discord ещё не закэшировал.",
    healthPresenceTitle: "Статусы и устройства",
    healthPresenceOk: "Кружок статуса и значки устройств приходят прямо от Discord.",
    healthJoinTitle: "Вход в канал",
    healthJoinOk: "Кнопка входа, автозаход и очередь на место в заполненном канале идут через это.",
    healthSilentJoinTitle: "Выключать микрофон при автовходе",
    healthSilentJoinOk: "Микрофон выключается на каждом входе, который плагин делает за вас.",
    healthOpenChannelTitle: "Переход в канал по чипу",
    healthOpenChannelOk: "Клик по чипу канала переводит Discord в него, не подключая вас.",
    healthPermissionsTitle: "Права на канал",
    healthPermissionsOk: "Замок, заполненный канал и те, что вам не видны, читаются из ваших же прав.",
    healthStreamsTitle: "Превью стрима",
    healthStreamsOk: "Значок LIVE, картинка по наведению и крупная по клику.",
    healthModerationTitle: "Действия модератора",
    healthModerationOk: "Перенос человека к себе, возврат обратно и магнит.",
    healthStickyMuteTitle: "Несъёмный мут",
    healthStickyMuteOk: "Серверный мут, который плагин выдаёт снова, как только его сняли или человек перезашёл.",
    healthWindowTitle: "Окно радара",
    healthWindowOk: "Открывается горячей клавишей, из любого правого клика и с панели аккаунта.",
    healthPanelButtonTitle: "Кнопка на панели аккаунта",
    healthPanelButtonOk: "Кнопка со счётчиком стоит рядом с микрофоном и наушниками.",
    healthJoinSoundTitle: "Звук, когда кто-то заходит",
    healthJoinSoundOk: "Играет через собственные звуки Discord, поэтому следует за выбранным там устройством и громкостью. Если они переедут, вместо них зазвучит сигнал самого плагина.",
    healthJoinSoundChime: "Собственный сигнал плагина, он ни на чём из Discord не держится, и обновление его не сдвинет.",
    healthToastsTitle: "Сообщения самого плагина",
    healthToastsOk: "Всплывающие сообщения о том, что плагин только что сделал.",

    healthServersTitle: "Запрос голоса у серверов",
    healthServersLine: (watched: number, mine: number, skipped: number, when: string) =>
        `Следим за голосом на ${watched} серверах из ${mine} ваших, ${skipped} без голосовых каналов пропущено. Последний запрос ${when}.`,
    healthServersCapped: (count: number) =>
        `${count} ${pluralRu(count, "сервер с голосовыми каналами", "сервера с голосовыми каналами", "серверов с голосовыми каналами")} `
        + `${pluralRu(count, "остался", "остались", "остались")} за пределом и не отслеживается, заход в голосовой там останется незамеченным. `
        + "Поднимите «За сколькими серверами следить» в настройках.",
    healthServersGuard: "Раз в минуту проверяем, что подписки живы, и берём их заново, если Discord их сбросил.",
    healthServersGuardOff: "Спросить Discord, живы ли подписки, больше нечем, поэтому обновляем их по таймеру.",

    healthListTitle: "Сохранённый список",
    healthHotkeyTitle: "Горячая клавиша",
    healthNotifyTitle: "Уведомления",
    healthNotifyReady: "Windows разрешает Discord их показывать, значит заход дойдёт до вас вне приложения.",
    healthNotifyDenied: "Уведомления запрещены, поэтому вне Discord вы ничего не увидите. Разрешите их для Discord в настройках системы.",
    healthNotifyAsk: "Разрешение ещё не спрашивали, его запросит первое же уведомление.",
    healthNotifyToastOnly: "Показываются только внутри Discord, поэтому система на них никак не влияет.",
    healthNotifyStyle: (label: string) => `Способ показа, ${label}.`,
    healthNotifyLast: (count: number, when: string) =>
        `С запуска объявлено заходов ${count}, последний ${when}.`,
    healthNotifyNone: "Пока ни одного не отправляли.",
    healthTimersTitle: "Таймеры, пока Discord в фоне",
    healthTimers: {
        awake: "Работают в обычном темпе, поэтому о заходе сообщают за секунды, а не за минуты.",
        off: "Намеренно оставлены на усмотрение Chromium, поэтому уведомление может опоздать на минуты, пока Discord в фоне. Это положение переключателя в настройках, а не поломка.",
        "needs-restart": "Переключатель включён, но эта страница так и не получила ту половину плагина, что живёт в главном процессе, поэтому Chromium никто не просил перестать замедлять окно. Discord отдаёт эту половину при запуске, так что помогает полный перезапуск, а перезагрузка страницы нет. Это тот же перезапуск, которого просит глобальная горячая клавиша.",
        refused: "Переключатель включён, главный процесс спросили, и он не смог, поэтому Chromium по-прежнему замедляет окно и уведомление может опоздать на минуты. Причина в консоли. Перезапуск стоит попробовать, но он ничего не обещает.",
        asking: "Спрашиваем главный процесс."
    } as Record<string, string>,
    healthVoiceTitle: "Приходят ли голосовые данные",
    healthVoiceLine: (guilds: number, states: number, when: string) =>
        `Прямо сейчас люди сидят в голосовых на ${guilds} ${pluralRu(guilds, "сервере", "серверах", "серверах")}, `
        + `всего ${states} ${people(states)}. Последнее событие ${when}.`,
    healthVoiceQuiet: (guilds: number, states: number) =>
        `Прямо сейчас люди сидят в голосовых на ${guilds} ${pluralRu(guilds, "сервере", "серверах", "серверах")}, `
        + `всего ${states} ${people(states)}. Событий пока не было.`,
    healthVoiceNone: "Discord ещё не отдал ни одного голосового состояния.",
    healthBuildTitle: "Сборка Discord",
    healthBuildLine: (channel: string, build: string) => `Канал ${channel}, сборка ${build}.`,
    healthBuildUnknown: "Discord не говорит, какая у него сборка. На работу плагина это не влияет.",

    /* ── окно радара ─────────────────────────────────────────────────────────────────────── */
    searchPlaceholder: "Поиск людей…",
    pressKeys: "нажмите клавиши…",
    hotkeyLabel: "Клавиша",
    settingsButton: "Настройки",
    settingsUnavailable: "Не удалось открыть настройки плагина, откройте их через Vencord, вкладка «Плагины»",
    hotkeyHint: "Нажмите, затем новое сочетание. Esc оставит как было",
    searchClear: "Очистить поиск",
    closeWindow: "Закрыть",
    windowCrashed: "Окно Voice Radar наткнулось на ошибку и закрылось. Подробности в консоли (Ctrl+Shift+I)",
    filterLabel: "Кого показывать",
    filterAll: "Все",
    filterLive: "В голосовом",
    hotkeySaved: (combo: string) => `Горячая клавиша Voice Radar теперь ${combo}`,
    globalHotkeyNeedsRestart: "Глобальная клавиша заработает только после полного перезапуска Discord, перезагрузки окна мало. Выйдите из него через трей и запустите заново.",
    globalHotkeyTaken: (combo: string) =>
        `${combo} уже занята другой программой, поэтому работает только когда Discord в фокусе.`,
    infoButton: "история",
    infoWindowLabel: "Где человека видели",
    infoButtonHint: "Где человека видели и когда",
    infoWithYou: "Последний раз с вами",
    infoWithYouNever: "ни разу не сидели вместе",
    infoWeek: "За неделю",
    infoStatus: "Статус",
    infoStatusUnknown: "Discord не сообщил",
    infoLogTitle: (count: number) => `Журнал, ${count} ${pluralRu(count, "запись", "записи", "записей")}`,
    infoLogEmpty: "Пока пусто. С этого момента сюда попадает каждый заход, переход и выход.",
    infoKindJoined: "Вход",
    infoKindMoved: "Переход",
    infoKindLeft: "Выход",
    infoCreated: "Аккаунт создан",
    infoBot: "БОТ",
    infoFriend: "В друзьях",
    infoFriendBlocked: "в чёрном списке",
    infoMutualTitle: "Общие серверы",
    infoAndMore: (count: number) => ` и ещё ${count}`,
    infoJoinedGuild: "Участник сервера, где сидит сейчас",
    infoJoinedGuildSince: (date: string, age: string) => `с ${date}, ${age}`,
    infoMutualPartial: "Discord прислал только часть списков участников, их может быть больше",
    infoIdCopy: "Нажмите, чтобы скопировать",
    infoIdCopied: "ID скопирован",
    infoIdCopyFailed: "Не удалось скопировать ID",
    infoYes: "да",
    infoNo: "нет",
    infoAgeYears: (count: number) => `${count} ${pluralRu(count, "год", "года", "лет")} назад`,
    infoAgeMonths: (count: number) => `${count} ${pluralRu(count, "месяц", "месяца", "месяцев")} назад`,
    infoAgeDays: (count: number) => count ? `${count} ${pluralRu(count, "день", "дня", "дней")} назад` : "сегодня",
    infoLiveTitle: "Сейчас в голосовом",
    infoLiveSince: (since: string) => `вход ${since}`,
    infoLivePeople: (count: number) => `в канале ${count} ${pluralRu(count, "человек", "человека", "человек")}`,
    infoOfflineTitle: "Сейчас не в голосовом",
    infoOfflineLast: (channel: string) => `последний раз в ${channel}`,
    infoAtLeast: (count: number) => `не меньше ${count}`,
    infoWeekSub: "заходов и переходов",
    infoToday: "Сегодня",
    infoYesterday: "Вчера",
    infoLogEmptyTitle: "Перемещений пока нет",
    apiConfirm: "окно подтверждения (Alerts.show)",
    confirmUnavailable: "Не удалось спросить подтверждение, обновление Discord сдвинуло это окно. Ничего не сделано",
    followTitle: (name: string) => `Автозаход за ${name}`,
    followWhere: (where: string) => `сейчас в ${where}`,
    followNotInVoice: "сейчас не в голосовом, вы пойдёте следом, как только человек зайдёт",
    followRemove: "Снять",
    silentJoinLabel: "Выключать микрофон при автовходе",
    chipSendBack: (count: number) => `Вернуть ${count}`,
    chipWaitingForSlot: (channel: string) => `Ждём слот в ${channel}`,

    modalSubtitle: (pinned: number, recent: number, total: number, limit: number) =>
        `закреплено ${pinned}, недавних ${recent}, ${total}/${limit}${total > limit ? ", сверх лимита" : ""}`,

    clearHistory: "Очистить историю",
    clearHistoryTitle: "Очистить историю?",
    clearHistoryBody: (count: number) =>
        `${pluralRu(count, "Будет удалён", "Будет удалено", "Будет удалено")} ${count} ${people(count)}, все, кто не закреплён, включая колокольчики, цель автозахода и добавленных руками. Останутся только закреплённые.`,
    clearHistoryConfirm: "Очистить",
    cancel: "Отмена",
    historyCleared: "История очищена (закреплённые остались)",

    warnApiDegraded: (problems: string) =>
        `Обновление Discord сдвинуло это, поэтому таких частей больше нет. ${problems}. Остальное работает, а обновление плагина их вернёт.`,
    warnApiProblems: (problems: string) =>
        `Обновление Discord сдвинуло то, на что опирается плагин, поэтому эти части не работают. ${problems}. Остальное продолжает работать, поищите обновление плагина.`,
    warnOverLimit: (total: number, limit: number, free: number) =>
        `${total}/${limit} в списке. Лимит режет только обычную историю. Людей, которых вы настроили вручную (закреплённые, с колокольчиком, цель автозахода, добавленные руками), он не выбрасывает никогда, поэтому список может выйти за лимит, а в самой истории сейчас ${free} ${slots(free)}. Поднимите лимит в настройках плагина или нажмите «Очистить историю», она убирает всех, кто не закреплён.`,

    emptyTitle: "Здесь пока никого.",
    emptyHint: "Зайдите с кем-нибудь в голосовой канал или добавьте людей через правый клик по ним → Voice Radar.",

    sectionPinned: "Закреплённые",
    sectionPinnedHint: (count: number, limit: number) => `${count} из ${limit} слотов · перетащите, чтобы изменить порядок`,
    sectionRecent: "Недавние",
    tabEmpty: "На этой вкладке никого.",
    tabEmptyLive: "На этой вкладке сейчас никого нет в голосовом канале.",
    tabLiveHint: "Сейчас в голосовом канале",
    sectionRecentHint: (free: number) => `${free} ${slots(free)}`,

    /* ── строка человека ─────────────────────────────────────────────────────────────────── */
    badgeAuto: "АВТО",
    badgeMuted: "МУТ",
    badgeWithYou: "С ВАМИ",
    badgeLive: "LIVE",

    notInVoice: "Не в голосовом",
    lastChannel: (channel: string) => `, последний ${channel}`,
    leftAgo: (when: string, channel: string | null) =>
        channel ? `Не в голосовом, выход ${when} из ${channel}` : `Не в голосовом, выход ${when}`,
    seenAgo: (when: string) => `виделись ${when}`,
    addedAgo: (when: string) => `добавлен ${when}`,

    tooltipInVoiceChat: "В голосовом канале",
    tooltipAndMore: (count: number) => `+${count} ещё`,
    tooltipDeafened: "Звук выключен, ничего не слышит",
    tooltipMuted: "Микрофон выключен",
    tooltipOpenChannel: "Клик открывает канал (без подключения)",
    tooltipNoChannelAccess: "У вас нет доступа к этому каналу",
    channelFull: " · заполнен",
    noChannelAccess: "У вас нет доступа к этому каналу",

    permissionUnchecked: " (не удалось проверить права)",

    magnetOff: "Удерживать в вашем канале",
    magnetIdleNoPermission: "Магнит включён, но права «Перемещать участников» здесь нет, поэтому никого не перенести. Клик выключает",
    magnetIdleNotConnected: "Магнит включён и простаивает, вы не в голосовом канале",
    magnetIdleOtherGuild: "Магнит включён и простаивает, человек на другом сервере, Discord не может перенести его сюда",
    magnetIdleTargetOffline: "Магнит включён и ждёт, человека пока нет в голосовом канале",
    magnetActive: "Магнит включён, при любом уходе человека возвращает к вам",

    stickyMuteOff: "Несъёмный мут. Плагин выдаёт серверный мут и выдаёт его снова каждый раз, когда мут снимут или человек перезайдёт, на любом сервере, где у вас есть право мутить. Держится, пока вы не выключите эту кнопку",
    stickyMuteOn: "Несъёмный мут включён на всех серверах, где вы можете мутить. Сняли мут или человек перезашёл, плагин сразу мутит снова. Нажмите, чтобы выключить",
    stickyMuteNoPermissionHere: "Несъёмный мут включён, но здесь у вас нет права отключать участникам звук, поэтому мут не выдаётся. Нажмите, чтобы выключить",
    stickyMuteLimitReached: (max: number) => `Несъёмный мут уже у ${max} из ${max} человек, это максимум. Снимите его с кого-нибудь, чтобы включить здесь`,
    stickyMuteWaiting: "Несъёмный мут включён и ждёт, человека нет в голосовом. Как только зайдёт, сразу получит мут",

    joinNotInVoice: "Не в голосовом канале",
    joinAlreadyThere: "Вы уже там",
    joinNoPermission: "Нет прав на вход в этот канал",
    joinQueued: "Ждём свободный слот, клик отменяет",
    joinChannelFull: "Канал заполнен, клик ставит вас в ожидание свободного слота",
    joinMuted: "Перейти (без микрофона)",
    join: "Перейти",

    sendBackTo: (channel: string) => `Вернуть обратно в ${channel}`,
    pullAlreadyHere: "Уже в вашем канале",
    pullToMyChannel: "Переместить в ваш канал",
    unpin: "Открепить",
    pin: "Закрепить (слот остаётся навсегда)",
    notifyOn: "Уведомления включены",
    notifyOff: "Уведомлять, когда зайдёт в голосовой",
    autoJoinOn: "Автозаход включён (клик выключает)",
    autoJoinOff: "Автозаход за этим человеком. Цель может быть только одна, предыдущая выключится",
    removeFromList: "Убрать из списка",

    userNotInVoice: (name: string) => `${name} не в голосовом канале`,
    alreadyWithUser: (name: string) => `Вы уже вместе с ${name}`,
    magnetOffFor: (name: string) => `Магнит выключен для ${name}`,
    magnetOnFor: (name: string) => `Теперь удерживаем в вашем канале ${name}`,
    stickyMuteOnFor: (name: string) => `${name} в несъёмном муте, пока вы его не выключите`,
    stickyMuteOffFor: (name: string) => `Несъёмный мут снят с ${name}`,
    stickyMuteRestored: (name: string) => `${name} снова в муте`,
    stickyMuteNoPermission: (name: string) => `Нет права отключать звук, ${name} в муте не удержать`,
    magnetGaveUp: (name: string) => `Магнит снят, ${name} уходит быстрее, чем возвращается`,
    magnetOffNoPermission: (name: string) => `Магнит снят, ${name} сюда не переместить, повторять бессмысленно`,
    magnetCoolingDown: (name: string, seconds: number) =>
        `Магнит на ${name} только что сдался, повесить снова можно через ${seconds} с`,
    autoJoinTargetSet: (name: string) => `Цель автозахода теперь ${name}`,
    autoJoinCleared: "Автозаход выключен",

    /* ── кнопка на панели аккаунта ───────────────────────────────────────────────────────── */
    panelTitle: (hotkey: string) => `Voice Radar (${hotkey})`,
    panelNobodyInVoice: "Никого из вашего списка нет в голосовых",
    panelAutoJoin: (name: string, silent: boolean) => `🎯 автозаход за ${name}${silent ? " (тихо)" : ""}`,

    /* ── превью стрима ───────────────────────────────────────────────────────────────────── */
    streamingBy: (name: string) => `${name} стримит`,
    streamPreviewAlt: "Превью стрима",
    streamPreviewLoading: "загружаем превью…",
    streamPreviewMissing: "превью недоступно",
    streamPreviewHint: "Клик открывает покрупнее",
    streamPreviewMissingFor: (name: string) => `Превью стрима недоступно для ${name}`,

    /* ── индикатор статуса и значки устройств ────────────────────────────────────────────── */
    platformDesktop: "Компьютер",
    platformMobile: "Телефон",
    platformWeb: "Браузер",
    platformConsole: "Консоль",
    platformVr: "VR",
    platformTooltip: (platform: string, status: string) => `${platform} · ${status}`,

    statusUnknownHint: "статус неизвестен, Discord не присылал присутствие этого пользователя",
    statusOnline: "в сети",
    statusIdle: "неактивен",
    statusDnd: "не беспокоить",
    statusOffline: "не в сети",
    statusMobile: (status: string) => `${status} (телефон)`,

    /* ── контекстные меню ────────────────────────────────────────────────────────────────── */
    menuRoot: "Voice Radar",
    menuRemoveFromRadar: "Убрать из радара",
    menuAddToRadar: "Добавить в радар",
    menuPin: "Закрепить",
    menuNotify: "Уведомлять о заходе в голосовой",
    menuAutoJoin: "Автозаход за этим человеком",
    menuJumpMuted: "Перейти в их канал (без микрофона)",
    menuJump: "Перейти в их канал",
    menuStopWaitingTheirChannel: "Перестать ждать свободный слот",
    menuWaitTheirChannel: "Ждать свободный слот в их канале",
    menuStopWaiting: "Перестать ждать свободный слот",
    menuWait: "Ждать свободный слот",
    menuOpenRadar: "Открыть Voice Radar",
    menuModerator: "Модератор",
    menuPullUser: "Перетащить в мой канал",
    menuPullChannel: (channel: string) => `Перетащить ко мне всех из ${channel}`,
    menuSendBatchBack: (count: number) => `↩ Вернуть ${count} по своим каналам`,
    menuMagnet: "Магнит, удерживать в моём канале",
    menuStickyMute: "Несъёмный мут, возвращается, пока вы его не выключите",
    menuTrackChannel: (count: number) => `Добавить в радар всех отсюда (${count})`,
    menuPullEveryoneHere: "Перетащить всех отсюда в мой канал",

    userAddedToRadar: (name: string) => `Voice Radar теперь следит за ${name}`,
    userRemovedFromRadar: (name: string) => `Voice Radar больше не следит за ${name}`,
    addedToRadar: (count: number) =>
        `${pluralRu(count, "Добавлен", "Добавлено", "Добавлено")} ${count} ${people(count)} в радар`,
    addedToRadarCapped: (added: number, left: number) =>
        `${pluralRu(added, "Добавлен", "Добавлено", "Добавлено")} ${added} ${people(added)} в радар, `
        + `${left} не ${pluralRu(left, "поместился", "поместились", "поместились")}, список уже у своего предела. `
        + "Поднимите «Сколько людей хранит список» в настройках или очистите историю.",

    /* ── очередь за слотом ───────────────────────────────────────────────────────────────── */
    queueCancelled: "Ожидание отменено",
    queueAutoJoinDropped: (name: string) => `автозаход за ${name} выключен`,
    queueReplaced: (channel: string) => `ожидание для ${channel} сброшено`,
    queueWaiting: (channel: string, extras: string) =>
        `⏳ Ждём свободный слот в ${channel}${extras ? `, ${extras}` : ""}`,
    queueGotSlot: (channel: string) => `✅ Слот в ${channel} занят`,
    queueStuck: (channel: string) =>
        `Перестали ждать ${channel}. Канал уже какое-то время открыт, а подключение не встаёт,`
        + " поэтому просить снова значит дёргать и без того тяжёлое голосовое соединение."
        + " Попробуйте зайти вручную.",
    queueRefused: (channel: string) =>
        `Перестали ждать ${channel}, Discord отказал в подключении, дальнейшее ожидание ничего не изменит`,
    queueCancelledForMagnet: (channel: string, name: string) => `Ожидание для ${channel} отменено, вместо этого удерживаем ${name}`,
    queueCancelledForAutoJoin: (channel: string, name: string) => `Ожидание для ${channel} отменено, теперь следуем за ${name}`,
    queueFollowGone: (name: string, channel: string) =>
        `${name} больше не в голосовом, ожидание места в ${channel} снято.`,
    queueFollowStopped: (channel: string) =>
        `Автозаход выключен, ожидание места в ${channel} снято.`,

    /* ── уведомления трекера ─────────────────────────────────────────────────────────────── */
    someone: "Кто-то",
    notifyToast: (name: string, channel: string) => `🔊 ${name} → ${channel}`,
    notifyTitle: (name: string) => `${name} в голосовом канале`,
    notifyBatchTitle: (count: number) =>
        `${count} ${people(count)} ${pluralRu(count, "зашёл", "зашли", "зашли")} в голосовые`,
    notifyBatchNames: (names: string, more: number) => (more ? `${names} и ещё ${more}` : names),
    notifyBatchToast: (names: string) => `🔊 ${names} зашли в голосовые`,
    joinedModalHint: "Только те, о ком было уведомление",
    joinedModalGone: "Этих людей больше нет в радаре",
    followingUser: (name: string, channel: string, silent: boolean) =>
        `🎯 Следуем за ${name} → ${channel}${silent ? " (без микрофона)" : ""}`,
    followGaveUpBeingRemoved: (name: string) =>
        `Автозаход выключен, вас отключают быстрее, чем следование за ${name} возвращает обратно`,

    /* ── действия модератора ─────────────────────────────────────────────────────────────── */
    refusalNotConnected: (name: string) => `${name} не в голосовом канале`,
    refusalNotInGuild: (name: string) => `${name} больше не на этом сервере`,
    refusalForbidden: (name: string) => `Нельзя переместить ${name}, либо у вас нет прав здесь, либо человек не может войти в ваш канал`,
    refusalCannotMoveInto: (name: string, channel: string) =>
        `В канале «${channel}» нет права «Перемещать участников», поэтому ${name} сюда не переместить, право нужно и в вашем канале тоже`,
    refusalCannotMoveFrom: (name: string, channel: string) =>
        `В канале «${channel}» нет права «Перемещать участников», поэтому ${name} оттуда не забрать`,
    refusalTargetCannotJoin: (name: string) => `Discord не пускает ${name} в ваш канал, у человека нет к нему доступа`,
    refusalNoGuildAccess: "Больше нет доступа к этому серверу",
    refusalGone: (name: string) => `${name} там больше нет`,
    refusalRateLimited: "Discord просит сбавить темп, попробуйте через мгновение",
    refusalWithMessage: (name: string, message: string) => `${name}, ${message}`,
    refusalGeneric: (name: string) => `Discord отказался перемещать ${name}`,

    sentUserBack: (name: string, channel: string) => `Возврат в ${channel}, ${name}`,
    sentBatchBack: (count: number) =>
        `${pluralRu(count, "Возвращён", "Возвращено", "Возвращено")} ${count} ${people(count)}`,
    sentBatchBackStopped: (count: number, left: number) =>
        `${pluralRu(count, "Возвращён", "Возвращено", "Возвращено")} ${count} ${people(count)}, `
        + `после чего Discord попросил сбавить. ${pluralRu(left, "Остался", "Осталось", "Осталось")} `
        + `${left}, попробуйте ещё раз через минуту.`,
    joinChannelFirst: "Сначала зайдите в голосовой канал, переносить некуда",
    userAlreadyWithYou: (name: string) => `${name} уже с вами`,
    sameGuildOnly: "Перемещать людей можно только внутри их собственного сервера",
    userPulled: (name: string) => `Теперь в вашем канале ${name}`,
    nobodyToPull: (where: string) => `Некого перетаскивать из ${where}`,
    pullConfirmTitle: "Перенести всех?",
    pullConfirmBody: (count: number, where: string, seconds: number) =>
        `${count} ${people(count)} из ${where} ${pluralRu(count, "будет перемещён", "будут перемещены", "будут перемещены")} `
        + `в ваш канал, примерно за ${seconds} ${pluralRu(seconds, "секунду", "секунды", "секунд")}. `
        + "Каждое перемещение оставляет строку в журнале аудита сервера.",
    pullConfirmButton: (count: number) => `Перенести ${count}`,
    noMovePermissionHere: (where: string) =>
        `Нет права «Перемещать участников» в ${where}, оттуда никого не забрать`,
    pulledUsers: (count: number, where: string) =>
        `${pluralRu(count, "Перемещён", "Перемещено", "Перемещено")} ${count} ${people(count)} из ${where}`,
    pulledUsersCapped: (count: number, where: string, skipped: number) =>
        `${pluralRu(count, "Перемещён", "Перемещено", "Перемещено")} ${count} ${people(count)} из ${where}, ${skipped} ${pluralRu(skipped, "остался", "осталось", "осталось")}, это максимум за одно нажатие. Нажмите ещё раз для остальных.`,
    pulledUsersStopped: (count: number, where: string, left: number) =>
        `${pluralRu(count, "Перемещён", "Перемещено", "Перемещено")} ${count} ${people(count)} из ${where}, `
        + `после чего Discord попросил сбавить. ${pluralRu(left, "Остался", "Осталось", "Осталось")} `
        + `${left}, попробуйте ещё раз через минуту.`,

    /* ── голосовые вспомогательные ───────────────────────────────────────────────────────── */
    unknownChannel: "Неизвестный канал",
    groupCall: "Групповой звонок",
    directCall: "Личный звонок",
    unknownUser: "Неизвестный пользователь",

    couldNotOpenChannel: "Voice Radar не смог открыть этот канал",
    couldNotOpenWindow: "Voice Radar не смог открыть окно, скорее всего, обновление Discord его сдвинуло",
    targetNotInVoice: "Voice Radar, этот пользователь не в голосовом канале",
    cannotJoinChannel: "Voice Radar, в этот голосовой канал войти нельзя",
    channelIsFull: "Voice Radar, этот голосовой канал заполнен",
    couldNotJoinChannel: "Voice Radar не смог войти в этот канал",

    hotkeyNotSet: "не задана",

    /* ── сломанные внутренности Discord, попадают в предупреждение ───────────────────────── */
    apiWhoIsInVoice: "кто сидит в голосовых (VoiceStateStore.getVoiceStateForUser)",
    apiChannelMembers: "участники канала (VoiceStateStore.getVoiceStatesForChannel)",
    apiMyChannel: "ваш собственный канал (SelectedChannelStore.getVoiceChannelId)",
    apiChannelInfo: "названия каналов и права (ChannelStore.getChannel)",
    apiUserInfo: "имена и аватары (UserStore.getUser)",
    apiStatuses: "статусы (PresenceStore.getStatus)",
    apiJoinChannel: "вход в каналы (selectVoiceChannel)",
    apiSilentJoin: "выключение микрофона при автовходе (setSelfMute и toggleSelfMute, в крайнем случае dispatch)",
    apiToasts: "всплывающие сообщения самого плагина",
    apiDevices: "с какого устройства человек в сети (PresenceStore.getClientStatus)",
    apiUserMenu: "меню Discord по правому клику на человеке (UserGenericContextMenu, GuildChannelUserContextMenu)",
    userMenuUnavailable: "Не удалось открыть меню Discord для этого человека, обновление его сдвинуло. Остальное работает",
    apiWindow: "само окно (createRoot, а запасным путём Modal), радар нельзя открыть",
    apiPanelButton: "кнопка на панели аккаунта (ищется по коду Discord)",
    apiPanelButtonPatch: "место для кнопки на панели аккаунта, куда патч не встал, поэтому кнопке там взяться неоткуда. Окно по-прежнему открывается горячей клавишей и из любого правого клика",
    apiGuildSubscriptions: "запрос голосовых состояний у серверов (GuildSubscriptionsStore), люди в неоткрытых серверах остаются невидимыми",
    apiGuildSubscriptionAction: "запрос голосовых состояний у серверов, который уходит, и ничего не происходит, поэтому люди в неоткрытых серверах остаются невидимыми",
    apiServerList: "список ваших серверов (GuildStore.getGuildIds), поэтому следим только за теми, где ваших людей видели в последний раз, а заход в голосовой где-то ещё останется незамеченным",
    apiOpenChannel: "открытие каналов (ChannelRouter.transitionToChannel)",
    apiStreamPreviews: "превью стримов (ApplicationStreamPreviewStore)",
    apiPermissions: "проверка прав (PermissionStore.can)",
    apiModeratorActions: "действия модератора (RestAPI.patch)",
    apiMoveMembersFlag: "флаг права Move Members",
    apiMuteMembersFlag: "флаг права Mute Members",
    apiVoiceEvents: "оповещения о том, что кто-то переместился (FluxDispatcher.subscribe), без них список не пополняется и ничего не объявляется",

    /* ── относительное время ─────────────────────────────────────────────────────────────── */
    timeJustNow: "только что",
    timeMinutes: (value: number) => `${value} мин назад`,
    timeHours: (value: number) => `${value} ч назад`,
    timeDays: (value: number) => `${value} дн назад`,
    timeWeeks: (value: number) => `${value} нед назад`
};
