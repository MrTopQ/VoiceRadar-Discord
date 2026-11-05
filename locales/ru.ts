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
const secondsRu = (count: number) => (Number.isInteger(count) ? pluralRu(count, "секунду", "секунды", "секунд") : "секунды");
const numberRu = (value: number) => String(value).replace(".", ",");
const slots = (count: number) => pluralRu(count, "свободный слот", "свободных слота", "свободных слотов");
const duration = (minutes: number) => minutes < 1
    ? "меньше минуты"
    : minutes < 60
        ? `${minutes} мин`
        : `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ""}`;
const together = (minutes: number) => `вместе ${duration(minutes)}`;

export const ru: Messages = {
    /* ── карточка плагина ────────────────────────────────────────────────────────────────── */
    pluginDescription: "Радар голосовых каналов. Недавние и закреплённые люди с живой информацией о голосе, быстрый вход, автоследование и уведомления о заходе. GitHub https://github.com/MrTopQ/VoiceRadar-Discord",

    /* ── настройки ───────────────────────────────────────────────────────────────────────── */
    settingLanguage: "Язык текстов самого плагина. «Авто» повторяет язык интерфейса Discord",
    settingLanguageAuto: "Авто (как в Discord)",
    settingPluginSize: "Насколько крупно показывать окна, подсказки и меню плагина, в процентах от исходного размера. Кнопка в заголовке радара меняет то же самое и сразу показывает результат",
    sizeTitle: "Размер плагина",
    sizeSmaller: "Меньше",
    sizeLarger: "Больше",
    sizeReset: "Вернуть 100%",
    settingHistoryLimit: "Сколько человек хранит список (закреплённые тоже занимают слоты)",
    settingHotkey: "Горячая клавиша, открывающая Voice Radar (например, Alt+2, Ctrl+Shift+V)",
    settingHotkeyInvalid: "Нужна собственная клавиша, а не только модификаторы. Например, Alt+2 или Ctrl+Shift+V",
    settingSilentJoin: "Выключать микрофон при автовходе. Действует при любом входе, который плагин делает за вас: быстрый переход, автозаход или занятый слот из очереди",
    settingAutoJoinOnlyWhenIdle: "Следовать за целью автозахода, только когда вы сами не в голосовом канале (никогда не выдёргивает вас из текущего разговора)",
    settingAutoJoinCooldown: "Пауза между автозаходами, в секундах, от 0 до 300. 0 значит заходить сразу",
    settingJoinAlert: "Когда человек с колокольчиком заходит в голосовой канал. Пока вы в Discord, в углу появляется карточка, а когда Discord в фоне, вдобавок приходит уведомление Windows. Звук слышен и поверх полноэкранной игры",
    joinAlertChime: "Уведомление со звуком плагина",
    joinAlertCustom: "Уведомление со своим звуком",
    joinAlertOff: "Выключено",
    settingJoinSoundVolume: "Громкость этого звука, в процентах",
    customSoundTitle: "Свой звук",
    customSoundHint: "mp3, ogg, wav или m4a до 2 МБ, играет не дольше 5 секунд. Пока файла нет, звучит сигнал плагина",
    customSoundNone: "Файл не выбран",
    customSoundPick: "Выбрать файл",
    customSoundRemove: "Убрать",
    customSoundTooBig: "Файл больше 2 МБ. Возьмите покороче",
    customSoundNotAudio: "Это не похоже на звук. Подойдут mp3, ogg, wav или m4a",
    customSoundFailed: "Не удалось сохранить файл",
    settingRecentMarkMinutes: "Сколько минут радар подсвечивает тех, кто недавно зашёл в ваш голосовой канал или вышел из него",
    badgeRecentJoined: (ago: string) => `вход ${ago}`,
    badgeRecentLeft: (ago: string) => `выход ${ago}`,
    joinTestTitle: "Проверка",
    joinTestHint: "Покажет карточку и сыграет выбранный звук, как будто зашёл человек с колокольчиком",
    joinTestButton: "Проверить заход",
    joinPreviewBody: "Так будет выглядеть заход",
    cardJoin: "Зайти",
    cardDismiss: "Скрыть",
    settingQueueForFullChannels: "Только для автозахода. Если человек, за которым вы следуете, сидит в заполненном канале, плагин ждёт в скрытой очереди и заходит в тот же момент, когда освободится слот. Очередь, поставленная вручную кнопкой входа или через правый клик, работает в любом случае",
    settingTrackAutomatically: "Автоматически запоминать всех, с кем вы оказались в одном голосовом канале",
    settingWatchedServerLimit: "За сколькими серверами следить. Discord присылает голосовые состояния только тех серверов, на которые клиент подписан, поэтому на сервере сверх этого числа чужой заход в голосовой никто не увидит. Серверы, где ваших людей видели последний раз, запрашиваются в первую очередь",
    settingKeepTimersAwake: "Держать таймеры Discord в обычном темпе, пока он в фоне. Включено, о заходе вы узнаете за секунды. Выключено, Chromium через несколько минут замедляет всё окно, и уведомление может опоздать на минуты. Это единственная настройка, которая меняет поведение всего Discord, а не только плагина, поэтому выключите её, если хотите, чтобы Discord не мешал вам в игре",
    settingMovePace: "Насколько быстро идут групповые перемещения. Каждое перемещение это строка в журнале аудита сервера, а целый канал, приехавший за секунду, выглядит как рейд-тула, а не как модератор. «Осторожно» отправляет по одному, «мгновенно» по восемь сразу",
    movePaceCareful: "Осторожно (по одному)",
    movePaceFast: "Быстро (по четыре)",
    movePaceInstant: "Мгновенно (по восемь)",
    settingModeratorMode: "Действия модератора. Перетащить человека к себе в канал, перевести к себе целый канал, повесить на кого-то магнит и отменить любое из этих действий. Рядом с теми, кто сидит с вами, появляются кнопки серверного мута, отключения звука и отключения от канала. Каждая видна только там, где у вас действительно есть такое право",
    settingOpenInOwnWindow: "Открывать радар сразу в отдельном окне. Клавиша и кнопка на панели открывают и закрывают его там, а не внутри Discord",
    settingHideOwnWindow: "Когда радар открывается сразу в отдельном окне, клавиша, кнопка на панели и крестик прячут его, а не закрывают. Окно появляется сразу, но всё время живёт в памяти",
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

    healthRecheck: "Проверить заново",
    healthChecked: (when: string) => `Проверено ${when}`,
    healthSummaryGood: "Всё работает",
    healthSummaryStarting: "Почти готово, плагин ещё запускается",
    healthSummaryIssues: (count: number) =>
        `${count} ${pluralRu(count, "пункт требует", "пункта требуют", "пунктов требуют")} внимания`,
    healthSummaryCounts: (counts: Record<"good" | "off" | "pending" | "waiting" | "bad", number>) => [
        counts.good && `${counts.good} ${pluralRu(counts.good, "работает", "работают", "работают")}`,
        counts.off && `${counts.off} ${pluralRu(counts.off, "выключена", "выключены", "выключено")} в настройках`,
        counts.pending && `${counts.pending} ${pluralRu(counts.pending, "ждёт", "ждут", "ждут")}`,
        counts.waiting && `${counts.waiting} частично`,
        counts.bad && `${counts.bad} ${pluralRu(counts.bad, "сломана", "сломаны", "сломано")}`
    ].filter(Boolean).join(", "),
    healthAttention: "Нужно внимание",
    healthGroups: {
        voice: "Голос",
        people: "Люди",
        join: "Вход в каналы",
        windows: "Окна и меню",
        moderation: "Модерация",
        alerts: "Уведомления",
        system: "Discord и система"
    } as Record<string, string>,
    healthGroupCount: (working: number, total: number) => `${working} из ${total}`,
    healthPill: {
        good: "работает",
        off: "выключено",
        pending: "ждёт",
        waiting: "частично",
        bad: "сломано"
    } as Record<string, string>,
    healthOpenSetting: "Открыть настройку",
    healthFixUpdate: "Скорее всего Discord обновился и сдвинул то, на чём это держится. Обновите плагин и перезапустите Discord, а если не помогло, напишите автору.",
    healthFixServersCapped: "Поднимите в настройках лимит серверов, за которыми следит плагин.",
    healthFixNotifyDenied: "Откройте Параметры Windows, раздел Уведомления, и включите их для Discord, потом нажмите «Проверить заново». "
        + "Или оставьте оповещение только внутри Discord.",
    healthFixVoiceQuiet: "Если за это время никто не заходил и не выходил, всё в порядке. Если люди двигаются, а событий нет, перезапустите Discord.",
    healthFixListLost: "Перезапустите Discord, и сохранённый список прочитается заново. Сам он не тронут.",

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
    healthOpenChannelTitle: "Подсветка канала по чипу",
    healthOpenChannelOk: "Клик по чипу переводит Discord в канал, не подключая вас, и подсвечивает его в списке.",
    healthUserMenuTitle: "Меню Discord по правому клику",
    healthUserMenuOk: "Правый клик по строке открывает родное меню Discord для этого человека.",
    healthMenuEntriesTitle: "Пункты в меню правого клика",
    healthMenuEntriesOk: "Voice Radar есть в меню Discord на людях и на голосовых каналах. Проверяется, когда вы открываете такие меню.",
    healthLookupTitle: "Сайт в окне информации",
    healthLookupOk: "Кнопка в окне информации открывает сайт в окне внутри Discord, и вход на сайт запоминается.",
    healthSpeakingTitle: "Кольцо у говорящих",
    healthSpeakingOk: "Зелёное кольцо вокруг тех, кто сейчас говорит в вашем канале.",
    healthMutualTitle: "Общие серверы в окне информации",
    healthMutualOk: "Полный список общих серверов приходит от Discord, когда открываете информацию о человеке.",
    healthModViewTitle: "Доступ модератора",
    healthModViewOk: "Кнопка открывает окно Discord «Открыть с доступом модератора» для человека на любом общем сервере, даже без прав модератора.",
    healthMainProcessTitle: "Часть плагина в главном процессе",
    healthMainProcessOk: "Загружена, поэтому глобальная клавиша, таймеры в фоне и окно сайта работают.",
    healthMainProcessMissing: "Ещё не загружена. Discord отдаёт её только при полном запуске, перезагрузки страницы мало. До тех пор ждут глобальная клавиша, таймеры в фоне и окно сайта.",
    healthLookupNeedsRestart: "Заработает после полного перезапуска Discord, а пока сайт открывается в браузере.",
    healthJoinCardTitle: "Карточка о заходе",
    healthJoinCardOk: "Карточка в углу Discord ждёт, пока вы туда вернётесь, и в ней есть кнопка входа.",
    healthJoinCardWindows: "Когда Discord в фоне, вдобавок приходит уведомление Windows.",
    healthPermissionsTitle: "Права на канал",
    healthPermissionsOk: "Замок, заполненный канал и те, что вам не видны, читаются из ваших же прав.",
    healthStreamsTitle: "Превью стрима",
    healthStreamsOk: "Значок LIVE, картинка по наведению и крупная по клику.",
    healthModerationTitle: "Действия модератора",
    healthModerationOk: "Перенос человека к себе, возврат обратно и магнит.",
    healthWindowTitle: "Окно радара",
    healthWindowOk: "Открывается горячей клавишей, из любого правого клика и с панели аккаунта.",
    healthPanelButtonTitle: "Кнопка на панели аккаунта",
    healthPanelButtonOk: "Кнопка со счётчиком стоит рядом с микрофоном и наушниками.",
    healthJoinSoundTitle: "Звук, когда кто-то заходит",
    healthJoinSoundCustom: "Ваш собственный файл, его играет сам плагин, поэтому обновление Discord его не сдвинет.",
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
    healthNotifyDenied: "Уведомления запрещены, поэтому вне Discord вы ничего не увидите.",
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
    healthBuildLine: (channel: string, build: string) => `Канал ${channel}, сборка ${build}.`,

    /* ── окно радара ─────────────────────────────────────────────────────────────────────── */
    searchPlaceholder: "Поиск людей…",
    pressKeys: "нажмите клавиши…",
    hotkeyLabel: "Клавиша",
    settingsButton: "Настройки",
    settingsUnavailable: "Не удалось открыть настройки плагина, откройте их через Vencord, вкладка «Плагины»",
    hotkeyHint: "Нажмите, затем новое сочетание. Esc оставит как было",
    searchClear: "Очистить поиск",
    everywhereLabel: "Во всех войсах",
    everywhereOffHint: "Искать и тех, кого нет в радаре, во всех голосовых каналах на серверах, за которыми следит плагин",
    everywhereOnHint: "Поиск идёт по всем голосовым каналам. Нажмите, чтобы искать только по списку",
    foundTitle: "Во всех голосовых",
    foundTooShort: "Напишите хотя бы две буквы ника или ID, и поиск пройдёт по всем голосовым каналам",
    foundNone: "Больше никого с таким ником в голосовых каналах нет",
    foundMore: (count: number) => `И ещё ${count} ${pluralRu(count, "человек", "человека", "человек")}, уточните ник`,
    badgeTracked: "В РАДАРЕ",
    foundPull: "Перетащить к себе в канал и добавить в радар",
    closeWindow: "Закрыть",
    windowCrashed: "Окно Voice Radar наткнулось на ошибку и закрылось. Подробности в консоли (Ctrl+Shift+I)",
    filterLabel: "Кого показывать",
    filterAll: "Все",
    filterLive: "В голосовом",
    hotkeySaved: (combo: string) => `Горячая клавиша Voice Radar теперь ${combo}`,
    globalHotkeyNeedsRestart: "Глобальная клавиша заработает только после полного перезапуска Discord, перезагрузки окна мало. Выйдите из него через трей и запустите заново.",
    globalHotkeyTaken: (combo: string) =>
        `${combo} уже занята другой программой, поэтому работает только когда Discord в фокусе.`,
    infoButton: "информация",
    infoWindowLabel: "Информация",
    infoButtonHint: "Всё о человеке, где бывает и когда заходил",
    infoWithYou: "Последний раз видели вместе",
    infoWithYouNow: "сейчас, вы вместе",
    infoWithYouNever: "ни разу не сидели вместе",
    infoWeek: "За 7 дней",
    infoWeekValue: (joins: number, moves: number) =>
        `${joins} ${pluralRu(joins, "вход", "входа", "входов")} · ${moves} ${pluralRu(moves, "переход", "перехода", "переходов")}`,
    infoStatus: "Статус",
    infoStatusUnknown: "Discord не сообщил",
    infoLogTitle: (count: number, limit: number) => `Журнал, ${count} из ${limit} ${pluralRu(limit, "записи", "записей", "записей")}`,
    infoLogOrder: "новое сверху, стрелки показывают порядок",
    infoPause: (minutes: number) => `в голосовых не видно ${duration(minutes)}`,
    infoLogEmpty: "Пока пусто. С этого момента сюда попадает каждый заход, переход и выход.",
    infoKindJoined: "Вход",
    infoKindMovedFrom: (place: string) => `Сюда из «${place}»`,
    infoKindMovedTo: (place: string) => `Отсюда в «${place}»`,
    infoKindLeft: "Выход",
    youTag: "Вы",
    infoKindYouJoined: "зашли",
    infoKindYouLeft: "вышли",
    infoCameToYou: "к вам",
    infoTogether: together,
    infoTogetherSince: (time: string, minutes: number) => `вместе с ${time} · ${duration(minutes)}`,
    infoKindSeen: "Уже там",
    infoKindSeenAgain: "Всё ещё тут",
    infoKindStreamOn: "Стрим",
    infoKindStreamOff: "Конец стрима",
    infoKindVideoOn: "Камера",
    infoKindVideoOff: "Без камеры",
    infoSeenWithYou: "с вами",
    infoAfterConnect: "после подключения Discord",
    infoBetween: (from: string, to: string) => `между ${from} и ${to}`,
    infoGoneTitle: (noticed: string) => `Точный момент неизвестен. Плагин заметил, что человека нет, в ${noticed}`,
    infoLateTitle: "Discord прислал это после обрыва связи, поэтому точный момент неизвестен",
    infoLasted: duration,
    infoShowMore: (count: number) => `Показать ещё, скрыто ${count} ${pluralRu(count, "запись", "записи", "записей")}`,
    journalThen: "Тогда там были",
    journalStayed: "Там остались",
    journalStayedNobody: "Никого не осталось",
    journalNow: "Сейчас там",
    journalNowEmpty: "Сейчас там никого",
    infoCreated: "Аккаунт создан",
    infoBot: "БОТ",
    infoFriend: "В друзьях",
    infoFriendBlocked: "в чёрном списке",
    infoMutualTitle: "Общие серверы",
    infoJoinedGuild: "Участник сервера, где сидит сейчас",
    infoJoinedGuildSince: (date: string, age: string) => `с ${date}, ${age}`,
    infoMutualLoading: "Загружаем полный список у Discord",
    infoMutualPartial: "Discord прислал только часть списков участников, их может быть больше",
    infoIdCopy: "Нажмите, чтобы скопировать",
    infoIdCopied: "ID скопирован",
    infoIdCopyFailed: "Не удалось скопировать ID",
    infoYes: "да",
    infoNo: "нет",
    infoAge: (years: number, months: number, days: number) => {
        const unit = (count: number, one: string, few: string, many: string) => (count ? `${count} ${pluralRu(count, one, few, many)}` : "");
        const parts = years ? [unit(years, "год", "года", "лет"), unit(months, "месяц", "месяца", "месяцев")]
            : months ? [unit(months, "месяц", "месяца", "месяцев"), unit(days, "день", "дня", "дней")]
                : [days ? unit(days, "день", "дня", "дней") : "меньше дня"];
        return parts.filter(Boolean).join(" ");
    },
    infoLiveTitle: "Сейчас в голосовом",
    infoLiveSince: (when: string) => `вход ${when}`,
    infoLiveFound: (when: string) => `в канале с ${when} или раньше`,
    infoLivePeople: (count: number) => `в канале ${count} ${pluralRu(count, "человек", "человека", "человек")}`,
    infoOfflineTitle: "Сейчас не в голосовом",
    infoOfflineLast: (channel: string) => `последний раз в ${channel}`,
    infoAtLeast: (count: number) => `не меньше ${count}`,
    infoWeekSub: "пока Discord был включён",
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
    badgeWithYou: "С ВАМИ",
    withYouTitle: (count: number) => `С вами сейчас · ${count}`,
    activityButton: "Активность",
    activityHint: "Всё, что плагин заметил у людей из списка, новое сразу сверху",
    activityInChannel: (count: number) => `в канале ${count} ${people(count)}`,
    activityStayed: (count: number) => `в канале осталось ${count} ${people(count)}`,
    activityKindMoved: "Переход",
    activityFilterLabel: "Чьи активности показывать",
    activityEmptyFiltered: "В этой группе пока ничего не было",
    activityEmptyTitle: "Пока ничего нет",
    activityEmpty: "Как только кто-то из списка зайдёт в войс, это появится здесь",
    withYouMuteForMe: "Заглушить только для себя",
    withYouUnmuteForMe: "Вернуть звук",
    withYouServerMute: "Выключить микрофон на сервере",
    withYouServerUnmute: "Вернуть микрофон на сервере",
    withYouServerDeafen: "Отключить звук на сервере",
    withYouServerUndeafen: "Вернуть звук на сервере",
    withYouDisconnect: "Отключить от канала",
    badgeLive: "LIVE",

    notInVoice: "Не в голосовом",
    lastChannel: (channel: string) => `, последний ${channel}`,
    leftAt: (when: string, channel: string | null) =>
        channel ? `Не в голосовом, выход ${when} из ${channel}` : `Не в голосовом, выход ${when}`,
    seenAt: (when: string) => `виделись ${when}`,
    addedAt: (when: string) => `добавлен ${when}`,

    tooltipInVoiceChat: "В голосовом канале",
    tooltipAndMore: (count: number) => `+${count} ещё`,
    tooltipDeafened: "Звук выключен, ничего не слышит",
    tooltipMuted: "Микрофон выключен",
    tooltipOpenChannel: "Клик открывает канал (без подключения) и подсвечивает его в списке Discord",
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
    magnetLimit: (returns: number, seconds: number) =>
        `Не больше ${returns} ${pluralRu(returns, "возврата", "возвратов", "возвратов")} в минуту. Если человек уходит чаще, магнит снимается сам, `
        + `и снова его можно включить через ${seconds} ${secondsRu(seconds)}. Эти числа не настраиваются`,
    autoJoinPace: (seconds: number) =>
        `Заходит не чаще раза в ${numberRu(seconds)} ${secondsRu(seconds)}. Эту паузу можно поменять в настройках плагина.`,
    autoJoinNoPause: "Заходит сразу, без паузы. Паузу можно поставить в настройках плагина.",
    autoJoinPaceCeiling: (set: number, used: number) =>
        `В настройках пауза на ${numberRu(set)} ${secondsRu(set)}, но плагин ждёт самое большее ${numberRu(used)} ${secondsRu(used)}.`,
    autoJoinReturns: (returns: number) =>
        `Если вас выкинули или перетащили, возвращает до ${returns} раз в минуту, это число не настраивается`,


    joinNotInVoice: "Не в голосовом канале",
    joinAlreadyThere: "Вы уже там",
    joinNoPermission: "Нет прав на вход в этот канал",
    joinQueued: "Ждём свободный слот, клик отменяет",
    joinChannelFull: "Канал заполнен, клик ставит вас в ожидание свободного слота",
    joinFullWithRights: "Канал заполнен, но у вас есть право «Перемещать участников», поэтому войти можно сверх лимита",
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
    modViewRowHint: "Открыть с доступом модератора",
    modViewButton: "Доступ модератора",
    modViewHint: (guild: string) => `Открыть с доступом модератора на сервере ${guild}. Окно Discord откроется справа от чата`,
    modViewGuildHint: (guild: string) => `Открыть с доступом модератора на сервере ${guild}`,
    modViewNoSharedGuild: (name: string) => `У вас с ${name} нет общего сервера, поэтому окно модератора открыть негде`,
    modViewNoAccess: "Discord перестал пускать в окно модератора без прав, а на общих серверах их у вас нет. Пока можно включить в Vencord плагин ShowHiddenThings и перезапустить Discord",
    modViewNoChannel: "На этом сервере нет текстового канала, рядом с которым Discord может показать окно модератора",
    modViewFailed: "Не удалось открыть окно модератора, обновление Discord это сдвинуло",
    modViewClosedByDiscord: "Discord сразу закрыл окно модератора, обход его проверки прав перестал работать. Пока можно включить в Vencord плагин ShowHiddenThings и перезапустить Discord",
    modViewClosed: "Discord сразу закрыл окно модератора",
    modViewOtherHint: "На другом сервере",
    modViewTheyAreHere: "сейчас здесь в голосовом",
    modViewNoRightsHere: "нет прав модератора",
    modViewNoOtherGuild: "Других общих серверов нет",
    modViewMenuFailed: "Не удалось показать список серверов, обновление Discord это сдвинуло",
    menuModView: "Открыть с доступом модератора",
    menuModViewOther: "С доступом модератора на другом сервере",

    userNotInVoice: (name: string) => `${name} не в голосовом канале`,
    alreadyWithUser: (name: string) => `Вы уже вместе с ${name}`,
    magnetOffFor: (name: string) => `Магнит выключен для ${name}`,
    magnetOnFor: (name: string) => `Теперь удерживаем в вашем канале ${name}`,
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
    platformInvisible: "В невидимке",
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
    settingLookupUrl: "Сайт для кнопки в окне информации. {id} заменяется на ID человека, пустое поле убирает кнопку",
    lookupHint: (host: string) => `Открыть этого человека на ${host} в окне внутри Discord. Войти на сайте нужно один раз`,
    lookupNeedsRestart: "Окно сайта внутри Discord заработает после полного перезапуска Discord, пока открываю в браузере",
    restartNotice: "Часть плагина, которая работает в главном процессе Discord, загрузится только после полного перезапуска. До тех пор ждут глобальная клавиша, таймеры в фоне и окно сайта.",
    restartButton: "Перезапустить Discord",
    restartConfirmTitle: "Перезапустить Discord?",
    restartConfirmBody: "Вы в голосовом канале, и на время перезапуска звонок прервётся.",
    restartConfirmButton: "Перезапустить",
    restartByHand: "Отсюда перезапустить не вышло. Закройте Discord через трей и откройте снова",
    popOut: "Вынести в отдельное окно. Его можно утащить куда угодно, хоть на другой монитор, а Discord рядом работает как обычно",
    popoutOptions: "Настройки отдельного окна",
    popoutDirect: "Открывать сразу в отдельном окне",
    popoutDirectHint: "Клавиша и кнопка на панели открывают и закрывают радар в его окне, а не внутри Discord",
    popoutHideInstead: "Прятать, а не закрывать",
    popoutHideInsteadHint: "Клавиша, кнопка на панели и крестик убирают окно с экрана и панели задач, а следующее нажатие сразу показывает его. Окно живёт в памяти, даже когда его не видно",
    popIn: "Вернуть радар в Discord",
    popoutOnTop: "Держать поверх всех окон",
    popoutOnTopOn: "Поверх всех окон, нажмите, чтобы выключить",
    popoutFailed: "Discord не открыл отдельное окно, радар остаётся внутри Discord",
    lookupFailed: "Не удалось открыть сайт в браузере",
    menuHistory: "Информация в Voice Radar",
    menuTrackChannel: (count: number) => `Добавить в радар всех отсюда (${count})`,
    menuPullEveryoneHere: "Перетащить всех отсюда в мой канал",
    menuMoveGroupHere: "Переехать сюда всей компанией",
    menuMoveGroupTo: (channel: string) => `Переехать всей компанией в ${channel}`,

    pullMoreHint: "Перетащить больше",
    peopleThere: (count: number) => `там ${count} ${people(count)}`,
    groupMoveHint: (count: number) => (count ? `вы и ещё ${count} ${people(count)} из вашего канала` : "только вы, в вашем канале больше никого"),
    pullSomeOfThem: (moving: number, there: number) => `переместятся ${moving} из ${there}`,
    pullNobodyMovable: "отсюда переместить некого",
    menuYou: "Вы",
    listNames: (names: readonly string[], hidden: number) => hidden
        ? `${names.join(", ")} и ещё ${hidden}`
        : names.length > 1 ? `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}` : names[0] ?? "",
    returnMoreHint: "Вернуть больше",
    returnAllLabel: "Вернуть всех перетащенных по своим каналам",
    peopleCount: (count: number) => `${count} ${people(count)}`,
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
    notifyTitle: (name: string) => `${name} в голосовом канале`,
    notifyBatchTitle: (count: number) =>
        `${count} ${people(count)} ${pluralRu(count, "зашёл", "зашли", "зашли")} в голосовые`,
    notifyBatchNames: (names: string, more: number) => (more ? `${names} и ещё ${more}` : names),
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
    refusalVoiceAction: "Discord отказал. Возможно, у вас нет на это прав",

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
    pullConfirmWho: (names: string) => `Переместятся ${names}.`,
    groupMoveConfirmWho: (names: string) => `С вами переедут ${names}.`,
    groupMoveConfirmTitle: "Переехать всей компанией?",
    groupMoveConfirmBody: (count: number, where: string, seconds: number) =>
        `${count} ${people(count)} из вашего канала ${pluralRu(count, "переедет", "переедут", "переедут")} в ${where}, а вы следом, `
        + `примерно за ${seconds} ${pluralRu(seconds, "секунду", "секунды", "секунд")}. `
        + "Каждое перемещение оставляет строку в журнале аудита сервера.",
    groupMoveConfirmButton: (count: number) => `Перевести ${count}`,
    groupMoved: (count: number, where: string) => `Вы и ещё ${count} ${people(count)} теперь в ${where}`,
    groupMovedPartly: (count: number, where: string, left: number) =>
        `В ${where} ${pluralRu(count, "переехал", "переехали", "переехали")} ${count} ${people(count)}, `
        + `${left} ${pluralRu(left, "остался", "осталось", "осталось")} на месте. Нажмите ещё раз для остальных`,
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
    apiShowChannel: "подсветка канала в списке Discord (разметка списка каналов), канал открывается, только без подсветки",
    apiUserMenuEntries: "пункты Voice Radar в меню на человеке (user-context), Discord переименовал это меню",
    apiChannelMenuEntries: "пункты Voice Radar в меню голосового канала (channel-context), Discord переименовал это меню",
    apiLookupWindow: "окно сайта внутри Discord (помощник Vencord в главном процессе), пока сайт открывается в браузере. Обычно помогает полный перезапуск Discord",
    apiSpeaking: "кто сейчас говорит (SpeakingStore), без зелёного кольца вокруг говорящих",
    apiJoinCard: "карточка захода в углу Discord, вместо неё приходит обычное уведомление Vencord",
    apiMutualGuilds: "общие серверы в окне информации (профиль через RestAPI), видно только то, что Discord уже прислал",
    apiModView: "окно модератора Discord (ChannelSectionStore и событие SIDEBAR_VIEW_GUILD)",
    apiModViewKind: "номер окна модератора в Discord, взят по памяти и может не совпасть",
    apiModViewMenu: "список серверов для окна модератора (ContextMenuApi)",
    apiModViewBypass: "обход проверки прав у окна модератора (тот же патч, что в ShowHiddenThings), без него Discord закрывает окно там, где у вас нет прав",
    apiPopout: "отдельное окно радара (PopoutWindowStore и событие POPOUT_WINDOW_OPEN), без него радар открывается только внутри Discord",
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
    apiLocalMute: "заглушить только для себя (MediaEngineStore), кнопка не покажет состояние",
    apiMuteFlags: "флаги прав Mute Members и Deafen Members",
    apiVoiceEvents: "оповещения о том, что кто-то переместился (FluxDispatcher.subscribe), без них список не пополняется и ничего не объявляется",

    /* ── относительное время ─────────────────────────────────────────────────────────────── */
    timeJustNow: "только что",
    momentToday: (time: string) => `в ${time}`,
    momentYesterday: (time: string) => `вчера в ${time}`,
    momentOn: (date: string, time: string) => `${date} в ${time}`,
    dayToday: (time: string) => `сегодня ${time}`,
    dayYesterday: (time: string) => `вчера ${time}`,
    timeMinutes: (value: number) => `${value} мин назад`,
    timeHours: (value: number) => `${value} ч назад`,
    timeDays: (value: number) => `${value} дн назад`,
    timeWeeks: (value: number) => `${value} нед назад`
};
