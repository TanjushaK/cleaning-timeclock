import type { Lang } from "@/lib/i18n-config";

export type LegalDocId =
  | "privacy"
  | "terms"
  | "legal"
  | "support"
  | "contact"
  | "returns"
  | "shipping";

export type LegalSection = { h: string; p: string };

export type LegalDocument = {
  title: string;
  subtitle?: string;
  sections: LegalSection[];
};

function pick<T>(lang: Lang, table: Record<Lang, T>): T {
  return table[lang] ?? table.en;
}

const PRIVACY: Record<Lang, LegalDocument> = {
  en: {
    title: "Privacy Policy",
    subtitle: "Cleaning Timeclock — Van Tanija BV (worker app & web)",
    sections: [
      {
        h: "Who we are",
        p: "This app (“Cleaning Timeclock”) is operated by Van Tanija BV, Netherlands, as the data controller for the worker time-tracking service. Contact for privacy requests: support@tanjusha.nl (subject: Privacy).",
      },
      {
        h: "What data we collect",
        p: "Account & profile: identifier (user id), name, phone, email (if provided), optional notes, activation/onboarding timestamps, role (worker/admin), active flag. Work data: job assignments you accept, shift start/stop times, GPS coordinates and accuracy captured at start/stop for site verification, optional team notes. Photos: optional profile photos you upload (stored as files linked to your account). Technical: access/refresh tokens for your session, device/browser metadata typical for web apps (e.g. user agent, IP in server logs), offline queue events for sync. Biometrics: on supported devices, Face ID / Touch ID unlock uses the OS secure store; we do not upload your biometric template.",
      },
      {
        h: "What we do not collect",
        p: "We do not sell personal data. We do not run in-app advertising or App Tracking Transparency (ATT) tracking frameworks. We do not collect microphone audio, continuous background location tracks, or contacts from your address book. We do not require access to the photo library except when you explicitly choose a file/photo for upload.",
      },
      {
        h: "Why we process data (purposes)",
        p: "To authenticate you, display your assigned shifts, validate that start/stop occurs near the assigned site, maintain accurate time records for payroll/compliance, let administrators manage operations, and provide support. Biometric unlock is optional and only speeds up sign-in on your device.",
      },
      {
        h: "Legal bases (summary)",
        p: "Performance of the employment / contractor relationship and legitimate interests in workforce scheduling, payroll support, and fraud prevention (e.g. verifying location at shift boundaries), balanced against your rights. Where local law requires consent (e.g. certain marketing), we will ask separately — this app is not a marketing channel.",
      },
      {
        h: "Processors & hosting",
        p: "Data is processed on infrastructure you deploy (self-hosted PostgreSQL and file storage) or on Van Tanija BV production servers that power the WebView URL configured in the app build. Subprocessors depend on your deployment (e.g. hosting provider, email/SMS gateway). A current list is available on request from support@tanjusha.nl.",
      },
      {
        h: "Retention & deletion",
        p: "Work records may be retained as required by employment law, accounting, and legitimate business needs. Profile photos can be removed by you in-app. You may request account deletion in the app (Account → Delete account); requests are queued for operator verification and processed asynchronously — you will see a confirmation reference. Email-only deletion requests are not the sole channel.",
      },
      {
        h: "International transfers",
        p: "If servers are located outside your country, transfers rely on appropriate safeguards available under applicable law (e.g. adequacy, SCCs) depending on deployment.",
      },
      {
        h: "Your rights",
        p: "Depending on jurisdiction, you may have rights to access, rectify, erase, restrict, object, and port data, and to lodge a complaint with a supervisory authority. Contact support@tanjusha.nl for requests; we respond within reasonable timelines defined by law.",
      },
      {
        h: "Children",
        p: "The service is intended for adult workers in a professional cleaning workforce context. It is not directed at children.",
      },
      {
        h: "Changes",
        p: "We may update this policy when features or legal requirements change. Material changes will be reflected in-app and on this page with an updated effective date.",
      },
    ],
  },
  uk: {
    title: "Політика конфіденційності",
    subtitle: "Cleaning Timeclock — Van Tanija BV (застосунок для працівників і веб)",
    sections: [
      {
        h: "Хто ми",
        p: "Цей застосунок («Cleaning Timeclock») обробляє Van Tanija BV (Нідерланди) як контролер даних для обліку робочого часу. Запити щодо приватності: support@tanjusha.nl (тема: Privacy).",
      },
      {
        h: "Які дані збираємо",
        p: "Обліковий запис і профіль: ідентифікатор (id користувача), ім’я, телефон, email (за наявності), нотатки, час активації/онбордингу, роль (працівник/адмін), прапорець активності. Робочі дані: призначені зміни, час старту/зупинки, координати GPS і точність на момент старту/зупинки для перевірки «на об’єкті», командні нотатки (за наявності). Фото: опційні фото профілю, які ви завантажуєте. Технічні: токени сесії, типові журнали веб-додатку (User-Agent, IP), офлайн-черга для синхронізації. Біометрія: Face ID / Touch ID використовує захищене сховище ОС; шаблон біометрії не вивантажується.",
      },
      {
        h: "Чого не збираємо",
        p: "Не продаємо персональні дані. Немає реклами в застосунку та немає ATT-трекінгу. Не збираємо аудіо з мікрофона, безперервне фонове геовідстеження чи контакти з адресної книги. Доступ до фотобібліотеки лише коли ви явно обираєте файл.",
      },
      {
        h: "Навіщо обробляємо",
        p: "Автентифікація, показ змін, перевірка місця старту/зупинки біля об’єкта, облік часу для зарплати/вимог, адміністрування, підтримка. Біометричний вхід — опційно для прискорення входу.",
      },
      {
        h: "Правові підстави (коротко)",
        p: "Виконання трудових/підрядних відносин та законні інтереси в плануванні, зарплатних процесах і запобіганні зловживанням (перевірка координат на межах зміни), з балансом ваших прав.",
      },
      {
        h: "Процесори та хостинг",
        p: "Обробка на вашій інфраструктурі (self-host) або на продакшен-серверах Van Tanija BV залежно від збірки. Перелік субпроцесорів — на запит на support@tanjusha.nl.",
      },
      {
        h: "Зберігання та видалення",
        p: "Робочі записи можуть зберігатися згідно з законодавством про працю та облік. Фото можна видалити в профілі. Видалення облікового запису можна ініціювати в застосунку; запит ставиться в чергу з підтвердженням-референсом. Лише email без in-app — недостатньо для фінального процесу.",
      },
      {
        h: "Міжнародні передачі",
        p: "Якщо сервери за межами вашої країни, застосовуються відповідні гарантії згідно з застосовним правом.",
      },
      {
        h: "Ваші права",
        p: "Залежно від юрисдикції: доступ, виправлення, видалення, обмеження, заперечення, переносимість, скарга до наглядового органу. Звертайтесь на support@tanjusha.nl.",
      },
      {
        h: "Діти",
        p: "Сервіс для дорослих працівників професійного клінінгу, не для дітей.",
      },
      {
        h: "Зміни",
        p: "Політика може оновлюватися; суттєві зміни відображаються тут і в застосунку.",
      },
    ],
  },
  ru: {
    title: "Политика конфиденциальности",
    subtitle: "Cleaning Timeclock — Van Tanija BV (приложение и веб для сотрудников)",
    sections: [
      {
        h: "Кто мы",
        p: "Приложение «Cleaning Timeclock» обрабатывает Van Tanija BV (Нидерланды) как оператор персональных данных для учёта рабочего времени. Запросы по конфиденциальности: support@tanjusha.nl (тема: Privacy).",
      },
      {
        h: "Какие данные собираем",
        p: "Учётная запись и профиль: идентификатор пользователя, имя, телефон, email (если указан), заметки, время активации/онбординга, роль (сотрудник/админ), признак активности. Рабочие данные: назначенные смены, время старта/остановки, координаты GPS и точность в момент старта/остановки для проверки «на объекте», командные заметки при наличии. Фото: необязательные фото профиля, которые вы загружаете. Технические: токены сессии, стандартные журналы (User-Agent, IP), офлайн-очередь синхронизации. Биометрия: Face ID / Touch ID использует защищённое хранилище ОС; шаблон биометрии не передаётся на сервер.",
      },
      {
        h: "Какие данные не собираем",
        p: "Не продаём персональные данные. Нет рекламы в приложении и нет ATT-трекинга. Не собираем аудио с микрофона, непрерывное фоновое геолокационное отслеживание и контакты из адресной книги. Доступ к фотобиблиотеке только при явном выборе файла.",
      },
      {
        h: "Зачем обрабатываем",
        p: "Аутентификация, отображение смен, проверка места старта/остановки у объекта, учёт времени для расчёта оплаты и требований закона, администрирование, поддержка. Биометрический вход опционален и ускоряет вход на устройстве.",
      },
      {
        h: "Правовые основания (кратко)",
        p: "Исполнение трудовых/гражданско-правовых отношений и законные интересы в планировании, расчётах и предотвращении злоупотреблений (проверка координат на границах смены) с учётом ваших прав.",
      },
      {
        h: "Обработчики и хостинг",
        p: "Обработка на вашей инфраструктуре (self-host) или на продакшен-серверах Van Tanija BV в зависимости от сборки. Актуальный перечень субпроцессоров — по запросу support@tanjusha.nl.",
      },
      {
        h: "Хранение и удаление",
        p: "Рабочие записи могут храниться согласно трудовому и бухгалтерскому законодательству. Фото можно удалить в профиле. Удаление аккаунта можно инициировать в приложении; запрос ставится в очередь с подтверждением-референсом. Только email без in-app не является финальным каналом.",
      },
      {
        h: "Международные передачи",
        p: "При размещении серверов за рубежом применяются соответствующие механизмы (адекватность, SCC и т.п.) по применимому праву.",
      },
      {
        h: "Ваши права",
        p: "В зависимости от страны: доступ, исправление, удаление, ограничение, возражение, переносимость, жалоба в надзорный орган. Обращайтесь: support@tanjusha.nl.",
      },
      {
        h: "Дети",
        p: "Сервис для взрослых сотрудников клининга, не ориентирован на детей.",
      },
      {
        h: "Изменения",
        p: "Политика может обновляться; существенные изменения отражаются здесь и в приложении.",
      },
    ],
  },
  nl: {
    title: "Privacybeleid",
    subtitle: "Cleaning Timeclock — Van Tanija BV (werknemersapp & web)",
    sections: [
      {
        h: "Wie wij zijn",
        p: "Deze app (“Cleaning Timeclock”) wordt beheerd door Van Tanija BV, Nederland, als verwerkingsverantwoordelijke voor tijdregistratie. Privacyverzoeken: support@tanjusha.nl (onderwerp: Privacy).",
      },
      {
        h: "Welke gegevens wij verzamelen",
        p: "Account & profiel: gebruikers-id, naam, telefoon, e-mail (indien opgegeven), notities, activatiemomenten, rol (werknemer/admin), actief-vlag. Werkgegevens: diensten die u accepteert, start/stop-tijden, GPS-coördinaten en nauwkeurigheid bij start/stop voor locatiecontrole, teamnotities. Foto’s: optionele profielfoto’s die u uploadt. Technisch: sessietokens, standaard serverlogs (user agent, IP), offline synchronisatie-wachtrij. Biometrie: Face ID / Touch ID gebruikt het OS-beveiligde opslagmechanisme; geen upload van uw biometrische sjabloon.",
      },
      {
        h: "Welke gegevens wij niet verzamelen",
        p: "Geen verkoop van persoonsgegevens. Geen in-app advertenties of ATT-tracking. Geen microfoonaudio, geen continue achtergrondlocatie, geen contactenboek. Fotobibliotheek alleen wanneer u expliciet een bestand kiest.",
      },
      {
        h: "Doeleinden",
        p: "Authenticatie, tonen van diensten, controleren dat start/stop nabij de locatie gebeurt, tijdregistratie voor payroll/naleving, beheer door admins, support. Biometrische ontgrendeling is optioneel.",
      },
      {
        h: "Rechtsgronden (kort)",
        p: "Uitvoering van arbeid/overeenkomst en gerechtvaardigde belangen bij planning, payroll en misbruikpreventie (locatiecontrole bij shiftgrenzen), afgewogen tegen uw rechten.",
      },
      {
        h: "Verwerkers & hosting",
        p: "Verwerking op uw eigen infrastructuur (self-host) of op productieservers van Van Tanija BV afhankelijk van de build. Subverwerkerslijst op aanvraag via support@tanjusha.nl.",
      },
      {
        h: "Bewaring & verwijdering",
        p: "Werkgegevens kunnen wettelijk bewaard blijven. Foto’s kunt u in-app verwijderen. Accountverwijdering start u in de app; verzoeken worden in de wachtrij gezet met referentie. Alleen e-mail is niet voldoende als enige route.",
      },
      {
        h: "Internationale doorgifte",
        p: "Indien servers buiten uw land staan, worden passende waarborgen toegepast conform toepasselijk recht.",
      },
      {
        h: "Uw rechten",
        p: "O.a. inzage, rectificatie, wissing, beperking, bezwaar, dataportabiliteit en klacht bij toezichthouder — neem contact op via support@tanjusha.nl.",
      },
      {
        h: "Kinderen",
        p: "De dienst richt zich op volwassen medewerkers in professionele schoonmaak; niet op kinderen.",
      },
      {
        h: "Wijzigingen",
        p: "Dit beleid kan worden bijgewerkt; wezenlijke wijzigingen tonen we hier en in de app.",
      },
    ],
  },
};

const TERMS: Record<Lang, LegalDocument> = {
  en: {
    title: "Terms of Use",
    subtitle: "Cleaning Timeclock worker application",
    sections: [
      {
        h: "Agreement",
        p: "By using the app you agree to these terms and the Privacy Policy. If you do not agree, do not use the service.",
      },
      {
        h: "Service description",
        p: "The app provides access to your assigned cleaning shifts, allows you to accept shifts, start and end work with location validation where configured by your organisation, and manage basic profile information.",
      },
      {
        h: "Account & eligibility",
        p: "Accounts are issued or approved by your organisation. You must provide accurate contact details. You are responsible for safeguarding your password and device.",
      },
      {
        h: "Acceptable use",
        p: "You must not misuse GPS or time records, attempt to bypass site checks, or access data you are not authorised to view. Administrators may suspend access for policy or safety reasons.",
      },
      {
        h: "Availability & changes",
        p: "We aim for high availability but do not guarantee uninterrupted service. Features may evolve; material changes will be communicated in-app or via your organisation.",
      },
      {
        h: "Disclaimer",
        p: "The service is provided “as is” to the extent permitted by law. Liability is limited to the maximum extent permitted by applicable law; nothing excludes liability that cannot be excluded.",
      },
      {
        h: "Governing law",
        p: "These terms are governed by the laws of the Netherlands unless your employment contract specifies otherwise. Courts in the Netherlands have jurisdiction unless mandatory law provides otherwise.",
      },
    ],
  },
  uk: {
    title: "Умови використання",
    subtitle: "Застосунок Cleaning Timeclock для працівників",
    sections: [
      { h: "Угода", p: "Використовуючи застосунок, ви погоджуєтесь з цими умовами та Політикою конфіденційності." },
      { h: "Опис сервісу", p: "Доступ до змін, прийняття, старт/зупинка з перевіркою локації (якщо налаштовано), базовий профіль." },
      { h: "Обліковий запис", p: "Облікові записи видає або затверджує організація. Ви відповідаєте за достовірність даних і безпеку пристрою/пароля." },
      { h: "Дозволена поведінка", p: "Заборонено зловживати GPS/обліком часу, обходити перевірки або отримувати неавторизований доступ." },
      { h: "Доступність", p: "Сервіс надається за можливості; функції можуть змінюватися." },
      { h: "Відмова від гарантій", p: "Сервіс надається «як є» в межах, дозволених законом." },
      { h: "Застосовне право", p: "Право Нідерландів, якщо інше не випливає з обов’язкових норм трудового договору." },
    ],
  },
  ru: {
    title: "Условия использования",
    subtitle: "Приложение Cleaning Timeclock для сотрудников",
    sections: [
      { h: "Соглашение", p: "Используя приложение, вы соглашаетесь с настоящими условиями и Политикой конфиденциальности." },
      { h: "Описание сервиса", p: "Доступ к сменам, принятие, старт/остановка с проверкой места (если настроено организацией), базовый профиль." },
      { h: "Учётная запись", p: "Учётные записи выдаёт или одобряет организация. Вы отвечаете за достоверность данных и безопасность устройства/пароля." },
      { h: "Допустимое использование", p: "Запрещено злоупотреблять GPS/учётом времени, обходить проверки или получать неавторизованный доступ." },
      { h: "Доступность", p: "Сервис предоставляется по мере возможности; функции могут меняться." },
      { h: "Отказ от гарантий", p: "Сервис предоставляется «как есть» в пределах, допустимых законом." },
      { h: "Применимое право", p: "Право Нидерландов, если иное не вытекает из обязательных норм трудового договора." },
    ],
  },
  nl: {
    title: "Gebruiksvoorwaarden",
    subtitle: "Cleaning Timeclock werknemersapp",
    sections: [
      { h: "Overeenkomst", p: "Door de app te gebruiken, accepteert u deze voorwaarden en het privacybeleid." },
      { h: "Dienst", p: "Toegang tot diensten, accepteren, start/stop met locatiecontrole indien ingesteld, basisprofiel." },
      { h: "Account", p: "Accounts worden door uw organisatie verstrekt/goedgekeurd. U bent verantwoordelijk voor juiste gegevens en beveiliging." },
      { h: "Gebruik", p: "Geen misbruik van GPS/tijdregistratie of omzeilen van controles." },
      { h: "Beschikbaarheid", p: "Dienst zonder garantie op ononderbroken beschikbaarheid." },
      { h: "Disclaimer", p: "“As is” voor zover wettelijk toegestaan." },
      { h: "Recht", p: "Nederlands recht, voor zover niet dwingend anders." },
    ],
  },
};

const SUPPORT: Record<Lang, LegalDocument> = {
  en: {
    title: "Support",
    sections: [
      {
        h: "How to get help",
        p: "Email support@tanjusha.nl from the address associated with your account if possible. Include your name, organisation, and a short description of the issue. For urgent access problems, also contact your supervisor.",
      },
      {
        h: "Response times",
        p: "We aim to respond within two business days for general requests. Security-sensitive requests may require additional verification.",
      },
    ],
  },
  uk: {
    title: "Підтримка",
    sections: [
      { h: "Як отримати допомогу", p: "Напишіть на support@tanjusha.nl з email, пов’язаного з обліковим записом (за можливості). Вкажіть ім’я, організацію та суть проблеми. Для термінових питань доступу зверніться також до керівника." },
      { h: "Терміни відповіді", p: "Намагаємось відповісти протягом двох робочих днів; чутливі запити можуть потребувати додаткової перевірки." },
    ],
  },
  ru: {
    title: "Поддержка",
    sections: [
      { h: "Как получить помощь", p: "Напишите на support@tanjusha.nl с адреса, связанного с аккаунтом (по возможности). Укажите имя, организацию и суть проблемы. При срочных проблемах доступа свяжитесь также с руководителем." },
      { h: "Сроки ответа", p: "Стремимся ответить в течение двух рабочих дней; чувствительные запросы могут потребовать дополнительной проверки." },
    ],
  },
  nl: {
    title: "Support",
    sections: [
      { h: "Hulp", p: "Mail support@tanjusha.nl bij voorkeur vanaf het adres gekoppeld aan uw account. Vermeld naam, organisatie en probleem. Bij urgente toegang: neem ook contact op met uw leidinggevende." },
      { h: "Reactietijd", p: "We streven naar antwoord binnen twee werkdagen; gevoelige verzoeken kunnen extra verificatie vereisen." },
    ],
  },
};

const CONTACT: Record<Lang, LegalDocument> = {
  en: {
    title: "Contact",
    sections: [
      {
        h: "Operator",
        p: "Van Tanija BV — Cleaning / workforce timeclock services. General & privacy contact: support@tanjusha.nl. Web: https://timeclock.tanjusha.nl",
      },
    ],
  },
  uk: {
    title: "Контакти",
    sections: [{ h: "Оператор", p: "Van Tanija BV — сервіси обліку часу. Загальні та privacy: support@tanjusha.nl. Веб: https://timeclock.tanjusha.nl" }],
  },
  ru: {
    title: "Контакты",
    sections: [{ h: "Оператор", p: "Van Tanija BV — сервисы учёта времени. Общие и privacy: support@tanjusha.nl. Веб: https://timeclock.tanjusha.nl" }],
  },
  nl: {
    title: "Contact",
    sections: [{ h: "Exploitant", p: "Van Tanija BV — tijdregistratie. Algemeen & privacy: support@tanjusha.nl. Web: https://timeclock.tanjusha.nl" }],
  },
};

const RETURNS: Record<Lang, LegalDocument> = {
  en: {
    title: "Returns & refunds",
    sections: [
      {
        h: "Digital workforce app",
        p: "Cleaning Timeclock is a workforce time-tracking application, not a consumer goods shop. There are no physical products shipped through this app and no return logistics. Refund questions for any separate commercial agreement are handled under that contract — contact support@tanjusha.nl.",
      },
    ],
  },
  uk: {
    title: "Повернення та відшкодування",
    sections: [
      {
        h: "Цифровий сервіс",
        p: "Cleaning Timeclock — застосунок для обліку робочого часу, а не інтернет-магазин. Фізичні товари не відправляються через застосунок. Питання повернень за окремими договорами — згідно з тими договорами; support@tanjusha.nl.",
      },
    ],
  },
  ru: {
    title: "Возвраты и возмещения",
    sections: [
      {
        h: "Цифровой сервис",
        p: "Cleaning Timeclock — приложение для учёта рабочего времени, а не магазин товаров. Физические отправки через приложение не выполняются. Возвраты по отдельным договорам — по условиям этих договоров; support@tanjusha.nl.",
      },
    ],
  },
  nl: {
    title: "Retour & terugbetaling",
    sections: [
      {
        h: "Digitale dienst",
        p: "Cleaning Timeclock is een tijdregistratie-app, geen webwinkel. Geen fysieke levering via deze app. Terugbetalingsvragen onder aparte contracten: support@tanjusha.nl.",
      },
    ],
  },
};

const SHIPPING: Record<Lang, LegalDocument> = {
  en: {
    title: "Shipping",
    sections: [
      {
        h: "Not applicable",
        p: "No physical goods are sold or shipped via Cleaning Timeclock. Location data is used only for operational verification at shift boundaries as described in the Privacy Policy.",
      },
    ],
  },
  uk: {
    title: "Доставка",
    sections: [{ h: "Не застосовується", p: "Фізичні товари через застосунок не продаються і не доставляються. Геодані використовуються лише для операційної перевірки на межах зміни." }],
  },
  ru: {
    title: "Доставка",
    sections: [{ h: "Не применяется", p: "Физические товары через приложение не продаются и не доставляются. Геоданные используются только для операционной проверки на границах смены." }],
  },
  nl: {
    title: "Verzending",
    sections: [{ h: "N.v.t.", p: "Geen fysieke goederen via deze app. Locatiegegevens alleen voor operationele controle bij shiftgrenzen." }],
  },
};

const LEGAL: Record<Lang, LegalDocument> = {
  en: {
    title: "Legal information",
    sections: [
      {
        h: "Documents",
        p: "Use the in-app links to Privacy Policy, Terms of Use, Support, Contact, Returns, and Shipping statements. They are part of the same compliance pack for App Store review.",
      },
    ],
  },
  uk: {
    title: "Юридична інформація",
    sections: [{ h: "Документи", p: "Посилання в застосунку ведуть до Політики конфіденційності, Умов, Підтримки, Контактів, Повернень та Доставки." }],
  },
  ru: {
    title: "Юридическая информация",
    sections: [{ h: "Документы", p: "Ссылки в приложении ведут к Политике конфиденциальности, Условиям, Поддержке, Контактам, Возвратам и Доставке." }],
  },
  nl: {
    title: "Juridische informatie",
    sections: [{ h: "Documenten", p: "Gebruik de in-app links naar privacy, voorwaarden, support, contact, retour en verzending." }],
  },
};

const DOCS: Record<LegalDocId, Record<Lang, LegalDocument>> = {
  privacy: PRIVACY,
  terms: TERMS,
  legal: LEGAL,
  support: SUPPORT,
  contact: CONTACT,
  returns: RETURNS,
  shipping: SHIPPING,
};

export function getLegalDocument(id: LegalDocId, lang: Lang): LegalDocument {
  const bundle = DOCS[id];
  return pick(lang, bundle);
}
