/**
 * LAYER 6 — RESPONSE (template-based)
 * 
 * RESPONSIBILITY: Generate natural language replies.
 * NO logic, NO decisions — just text formatting.
 * 
 * TONE: Concise, neutral, human. No emojis. No filler.
 */

// ============================================================================
// GREETINGS
// ============================================================================

const GREETINGS: Record<string, string[]> = {
  it: ["Ciao. Dimmi.", "Ciao. Come posso aiutarti?"],
  en: ["Hi. What do you need?", "Hi. How can I help?"],
  es: ["Hola. Dime.", "Hola. ¿En qué puedo ayudarte?"],
  fr: ["Salut. Dis-moi.", "Salut. Comment puis-je t'aider ?"],
  de: ["Hallo. Was brauchst du?", "Hallo. Wie kann ich helfen?"],
  pt: ["Olá. Diga.", "Olá. Como posso ajudar?"],
  ru: ["Привет. Говори.", "Привет. Чем могу помочь?"],
  zh: ["你好。说吧。", "你好。需要什么帮助？"],
  ja: ["こんにちは。何でしょう？", "こんにちは。お手伝いします。"],
  ko: ["안녕하세요. 말씀하세요.", "안녕하세요. 어떻게 도와드릴까요?"],
  hi: ["नमस्ते। बताइए।", "नमस्ते। कैसे मदद कर सकता हूं?"],
  nl: ["Hoi. Zeg het maar.", "Hoi. Hoe kan ik helpen?"],
  pl: ["Cześć. Mów.", "Cześć. Jak mogę pomóc?"],
  sv: ["Hej. Berätta.", "Hej. Hur kan jag hjälpa?"],
  no: ["Hei. Si ifra.", "Hei. Hvordan kan jeg hjelpe?"],
  da: ["Hej. Sig til.", "Hej. Hvordan kan jeg hjælpe?"],
  ro: ["Salut. Spune.", "Salut. Cum te pot ajuta?"],
  hr: ["Bok. Reci.", "Bok. Kako ti mogu pomoći?"],
  sq: ["Përshëndetje. Thuaj.", "Përshëndetje. Si mund të ndihmoj?"],
  lt: ["Sveiki. Sakykite.", "Sveiki. Kuo galiu padėti?"],
  lv: ["Sveiki. Sakiet.", "Sveiki. Kā varu palīdzēt?"],
  et: ["Tere. Ütle.", "Tere. Kuidas saan aidata?"],
};

export function randomGreeting(lang = "it"): string {
  const list = GREETINGS[lang] || GREETINGS["en"];
  return list[Math.floor(Math.random() * list.length)];
}

// ============================================================================
// TRANSLATED REPLIES
// ============================================================================

const TRANSLATIONS: Record<string, Record<string, string>> = {
  it: {
    howCanIHelp: "Dimmi.",
    showTasks: "Mostra task",
    addEvent: "Aggiungi evento",
    showExpenses: "Mostra spese",
    cancelled: "Ok, annullato.",
    noTasks: "Nessun task.",
    noEvents: "Nessun evento.",
    advice: "Posso gestire task, eventi e spese. Prova: \"padel domani alle 20\" o \"sigarette 5 euro\".",
    done: "Fatto.",
    missingTime: "Manca l'orario. Me lo dici?",
    missingDate: "Manca la data. Quando?",
    missingAmount: "Manca l'importo. Quanto?",
  },
  en: {
    howCanIHelp: "What do you need?",
    showTasks: "Show tasks",
    addEvent: "Add event",
    showExpenses: "Show expenses",
    cancelled: "Ok, cancelled.",
    noTasks: "No tasks.",
    noEvents: "No events.",
    advice: "I can manage tasks, events and expenses. Try: \"meeting tomorrow at 3pm\" or \"lunch 12 euros\".",
    done: "Done.",
    missingTime: "What time?",
    missingDate: "What date?",
    missingAmount: "How much?",
  },
  es: {
    howCanIHelp: "Dime.",
    showTasks: "Mostrar tareas",
    addEvent: "Agregar evento",
    showExpenses: "Mostrar gastos",
    cancelled: "Ok, cancelado.",
    noTasks: "Sin tareas.",
    noEvents: "Sin eventos.",
    advice: "Puedo gestionar tareas, eventos y gastos. Prueba: \"reunión mañana a las 15\" o \"almuerzo 12 euros\".",
    done: "Hecho.",
    missingTime: "¿A qué hora?",
    missingDate: "¿Qué día?",
    missingAmount: "¿Cuánto?",
  },
  fr: {
    howCanIHelp: "Dis-moi.",
    showTasks: "Voir les tâches",
    addEvent: "Ajouter un événement",
    showExpenses: "Voir les dépenses",
    cancelled: "Ok, annulé.",
    noTasks: "Aucune tâche.",
    noEvents: "Aucun événement.",
    advice: "Je peux gérer tâches, événements et dépenses. Essaie : \"réunion demain à 15h\" ou \"déjeuner 12 euros\".",
    done: "Fait.",
    missingTime: "À quelle heure ?",
    missingDate: "Quel jour ?",
    missingAmount: "Combien ?",
  },
  de: {
    howCanIHelp: "Was brauchst du?",
    showTasks: "Aufgaben zeigen",
    addEvent: "Termin hinzufügen",
    showExpenses: "Ausgaben zeigen",
    cancelled: "Ok, abgebrochen.",
    noTasks: "Keine Aufgaben.",
    noEvents: "Keine Termine.",
    advice: "Ich kann Aufgaben, Termine und Ausgaben verwalten. Versuch: \"Meeting morgen um 15 Uhr\" oder \"Mittagessen 12 Euro\".",
    done: "Erledigt.",
    missingTime: "Um wie viel Uhr?",
    missingDate: "Welcher Tag?",
    missingAmount: "Wie viel?",
  },
  pt: {
    howCanIHelp: "Diga.",
    showTasks: "Ver tarefas",
    addEvent: "Adicionar evento",
    showExpenses: "Ver despesas",
    cancelled: "Ok, cancelado.",
    noTasks: "Sem tarefas.",
    noEvents: "Sem eventos.",
    advice: "Posso gerir tarefas, eventos e despesas. Tenta: \"reunião amanhã às 15h\" ou \"almoço 12 euros\".",
    done: "Feito.",
    missingTime: "Que horas?",
    missingDate: "Que dia?",
    missingAmount: "Quanto?",
  },
  ru: {
    howCanIHelp: "Говори.",
    showTasks: "Показать задачи",
    addEvent: "Добавить событие",
    showExpenses: "Показать расходы",
    cancelled: "Ок, отменено.",
    noTasks: "Нет задач.",
    noEvents: "Нет событий.",
    advice: "Могу управлять задачами, событиями и расходами. Попробуй: \"встреча завтра в 15:00\" или \"обед 12 евро\".",
    done: "Готово.",
    missingTime: "Во сколько?",
    missingDate: "Какого числа?",
    missingAmount: "Сколько?",
  },
  zh: {
    howCanIHelp: "说吧。",
    showTasks: "显示任务",
    addEvent: "添加事件",
    showExpenses: "显示支出",
    cancelled: "好的，已取消。",
    noTasks: "没有任务。",
    noEvents: "没有事件。",
    advice: "我可以管理任务、事件和支出。试试：\"明天下午3点开会\" 或 \"午饭12欧元\"。",
    done: "完成。",
    missingTime: "几点？",
    missingDate: "哪天？",
    missingAmount: "多少？",
  },
  ja: {
    howCanIHelp: "何でしょう？",
    showTasks: "タスクを表示",
    addEvent: "イベントを追加",
    showExpenses: "支出を表示",
    cancelled: "了解、キャンセルしました。",
    noTasks: "タスクはありません。",
    noEvents: "イベントはありません。",
    advice: "タスク、イベント、支出を管理できます。「明日15時に会議」や「ランチ12ユーロ」と試してみてください。",
    done: "完了。",
    missingTime: "何時ですか？",
    missingDate: "いつですか？",
    missingAmount: "いくらですか？",
  },
  ko: {
    howCanIHelp: "말씀하세요.",
    showTasks: "작업 보기",
    addEvent: "이벤트 추가",
    showExpenses: "지출 보기",
    cancelled: "확인, 취소되었습니다.",
    noTasks: "작업이 없습니다.",
    noEvents: "이벤트가 없습니다.",
    advice: "작업, 이벤트, 지출을 관리할 수 있습니다. \"내일 오후 3시 회의\" 또는 \"점심 12유로\"를 시도해보세요.",
    done: "완료.",
    missingTime: "몇 시요?",
    missingDate: "언제요?",
    missingAmount: "얼마요?",
  },
  hi: {
    howCanIHelp: "बताइए।",
    showTasks: "कार्य दिखाएं",
    addEvent: "इवेंट जोड़ें",
    showExpenses: "खर्च दिखाएं",
    cancelled: "ठीक है, रद्द किया।",
    noTasks: "कोई कार्य नहीं।",
    noEvents: "कोई इवेंट नहीं।",
    advice: "मैं कार्य, इवेंट और खर्च प्रबंधित कर सकता हूं। कोशिश करें: \"कल दोपहर 3 बजे मीटिंग\" या \"लंच 12 यूरो\"।",
    done: "हो गया।",
    missingTime: "कितने बजे?",
    missingDate: "कब?",
    missingAmount: "कितना?",
  },
  nl: {
    howCanIHelp: "Zeg het maar.",
    showTasks: "Taken tonen",
    addEvent: "Evenement toevoegen",
    showExpenses: "Uitgaven tonen",
    cancelled: "Ok, geannuleerd.",
    noTasks: "Geen taken.",
    noEvents: "Geen evenementen.",
    advice: "Ik kan taken, evenementen en uitgaven beheren. Probeer: \"vergadering morgen om 15u\" of \"lunch 12 euro\".",
    done: "Gedaan.",
    missingTime: "Hoe laat?",
    missingDate: "Welke dag?",
    missingAmount: "Hoeveel?",
  },
  pl: {
    howCanIHelp: "Mów.",
    showTasks: "Pokaż zadania",
    addEvent: "Dodaj wydarzenie",
    showExpenses: "Pokaż wydatki",
    cancelled: "Ok, anulowano.",
    noTasks: "Brak zadań.",
    noEvents: "Brak wydarzeń.",
    advice: "Mogę zarządzać zadaniami, wydarzeniami i wydatkami. Spróbuj: \"spotkanie jutro o 15\" lub \"obiad 12 euro\".",
    done: "Gotowe.",
    missingTime: "O której?",
    missingDate: "Kiedy?",
    missingAmount: "Ile?",
  },
  sv: {
    howCanIHelp: "Berätta.",
    showTasks: "Visa uppgifter",
    addEvent: "Lägg till händelse",
    showExpenses: "Visa utgifter",
    cancelled: "Ok, avbrutet.",
    noTasks: "Inga uppgifter.",
    noEvents: "Inga händelser.",
    advice: "Jag kan hantera uppgifter, händelser och utgifter. Prova: \"möte imorgon kl 15\" eller \"lunch 12 euro\".",
    done: "Klart.",
    missingTime: "Vilken tid?",
    missingDate: "Vilket datum?",
    missingAmount: "Hur mycket?",
  },
  no: {
    howCanIHelp: "Si ifra.",
    showTasks: "Vis oppgaver",
    addEvent: "Legg til hendelse",
    showExpenses: "Vis utgifter",
    cancelled: "Ok, avbrutt.",
    noTasks: "Ingen oppgaver.",
    noEvents: "Ingen hendelser.",
    advice: "Jeg kan håndtere oppgaver, hendelser og utgifter. Prøv: \"møte i morgen kl 15\" eller \"lunsj 12 euro\".",
    done: "Ferdig.",
    missingTime: "Når?",
    missingDate: "Hvilken dato?",
    missingAmount: "Hvor mye?",
  },
  da: {
    howCanIHelp: "Sig til.",
    showTasks: "Vis opgaver",
    addEvent: "Tilføj begivenhed",
    showExpenses: "Vis udgifter",
    cancelled: "Ok, annulleret.",
    noTasks: "Ingen opgaver.",
    noEvents: "Ingen begivenheder.",
    advice: "Jeg kan håndtere opgaver, begivenheder og udgifter. Prøv: \"møde i morgen kl 15\" eller \"frokost 12 euro\".",
    done: "Færdig.",
    missingTime: "Hvornår?",
    missingDate: "Hvilken dato?",
    missingAmount: "Hvor meget?",
  },
  ro: {
    howCanIHelp: "Spune.",
    showTasks: "Arată sarcini",
    addEvent: "Adaugă eveniment",
    showExpenses: "Arată cheltuieli",
    cancelled: "Ok, anulat.",
    noTasks: "Nicio sarcină.",
    noEvents: "Niciun eveniment.",
    advice: "Pot gestiona sarcini, evenimente și cheltuieli. Încearcă: \"întâlnire mâine la 15\" sau \"prânz 12 euro\".",
    done: "Gata.",
    missingTime: "La ce oră?",
    missingDate: "Ce zi?",
    missingAmount: "Cât?",
  },
  hr: {
    howCanIHelp: "Reci.",
    showTasks: "Prikaži zadatke",
    addEvent: "Dodaj događaj",
    showExpenses: "Prikaži troškove",
    cancelled: "Ok, otkazano.",
    noTasks: "Nema zadataka.",
    noEvents: "Nema događaja.",
    advice: "Mogu upravljati zadacima, događajima i troškovima. Probaj: \"sastanak sutra u 15\" ili \"ručak 12 eura\".",
    done: "Gotovo.",
    missingTime: "U koliko sati?",
    missingDate: "Koji dan?",
    missingAmount: "Koliko?",
  },
  sq: {
    howCanIHelp: "Thuaj.",
    showTasks: "Shfaq detyrat",
    addEvent: "Shto ngjarje",
    showExpenses: "Shfaq shpenzimet",
    cancelled: "Ok, u anulua.",
    noTasks: "Nuk ka detyra.",
    noEvents: "Nuk ka ngjarje.",
    advice: "Mund të menaxhoj detyra, ngjarje dhe shpenzime. Provo: \"takim nesër në 15\" ose \"drekë 12 euro\".",
    done: "U bë.",
    missingTime: "Në çfarë ore?",
    missingDate: "Cilën ditë?",
    missingAmount: "Sa?",
  },
  lt: {
    howCanIHelp: "Sakykite.",
    showTasks: "Rodyti užduotis",
    addEvent: "Pridėti įvykį",
    showExpenses: "Rodyti išlaidas",
    cancelled: "Gerai, atšaukta.",
    noTasks: "Nėra užduočių.",
    noEvents: "Nėra įvykių.",
    advice: "Galiu valdyti užduotis, įvykius ir išlaidas. Pabandykite: \"susitikimas rytoj 15 val.\" arba \"pietūs 12 eurų\".",
    done: "Atlikta.",
    missingTime: "Kelinta valanda?",
    missingDate: "Kada?",
    missingAmount: "Kiek?",
  },
  lv: {
    howCanIHelp: "Sakiet.",
    showTasks: "Rādīt uzdevumus",
    addEvent: "Pievienot notikumu",
    showExpenses: "Rādīt izdevumus",
    cancelled: "Labi, atcelts.",
    noTasks: "Nav uzdevumu.",
    noEvents: "Nav notikumu.",
    advice: "Varu pārvaldīt uzdevumus, notikumus un izdevumus. Pamēģini: \"tikšanās rīt plkst. 15\" vai \"pusdienas 12 eiro\".",
    done: "Gatavs.",
    missingTime: "Cikos?",
    missingDate: "Kurā dienā?",
    missingAmount: "Cik?",
  },
  et: {
    howCanIHelp: "Ütle.",
    showTasks: "Näita ülesandeid",
    addEvent: "Lisa sündmus",
    showExpenses: "Näita kulusid",
    cancelled: "Ok, tühistatud.",
    noTasks: "Ülesandeid pole.",
    noEvents: "Sündmusi pole.",
    advice: "Saan hallata ülesandeid, sündmusi ja kulusid. Proovi: \"kohtumine homme kell 15\" või \"lõuna 12 eurot\".",
    done: "Tehtud.",
    missingTime: "Mis kell?",
    missingDate: "Mis päeval?",
    missingAmount: "Kui palju?",
  },
};

export function t(lang: string, key: string): string {
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS["en"][key] || key;
}

export function defaultSuggestions(lang: string): string[] {
  return [t(lang, "showTasks"), t(lang, "addEvent"), t(lang, "showExpenses")];
}

// ============================================================================
// LOCALE MAP for date formatting
// ============================================================================

const LOCALE_MAP: Record<string, string> = {
  it: "it-IT", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE",
  pt: "pt-PT", ru: "ru-RU", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR",
  hi: "hi-IN", nl: "nl-NL", pl: "pl-PL", sv: "sv-SE", no: "nb-NO",
  da: "da-DK", ro: "ro-RO", hr: "hr-HR", sq: "sq-AL", lt: "lt-LT",
  lv: "lv-LV", et: "et-EE",
};

function getLocale(lang: string): string {
  return LOCALE_MAP[lang] || "en-US";
}

// ============================================================================
// QUERY FORMATTERS
// ============================================================================

export function formatTaskList(todos: any[], lang = "it"): string {
  const pending = todos.filter((t: any) => !t.completed);
  if (pending.length === 0) return t(lang, "noTasks");
  return pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
}

export function formatEventList(events: any[], lang = "it"): string {
  if (events.length === 0) return t(lang, "noEvents");
  const locale = getLocale(lang);
  return events.map((e: any, i: number) => {
    const d = new Date(e.start_time).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
    return `${i + 1}. ${e.title} — ${d}`;
  }).join("\n");
}

export function formatBudget(expenses: any[], budget: any, lang = "it"): string {
  const total = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const budgetAmount = budget?.amount || 0;
  return `${t(lang, "showExpenses")}: ${total.toFixed(2)} / ${budgetAmount} euro.`;
}
