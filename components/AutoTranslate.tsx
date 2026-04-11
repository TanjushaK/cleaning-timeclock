"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Lang, useI18n } from "./I18nProvider";

type Dict = Record<string, string>;
type PhraseRow = { ru: string; uk: string; en: string; nl: string };
type PatternRule = { re: RegExp; make: (...args: string[]) => string };

type AttrState = {
  original: Record<string, string>;
  last: Record<string, string>;
};

const row = (ru: string, uk: string, en: string, nl: string): PhraseRow => ({ ru, uk, en, nl });

const PHRASES: PhraseRow[] = [
  row("Админ-панель", "Адмін-панель", "Admin panel", "Beheerpaneel"),
  row("Панель администратора", "Панель адміністратора", "Admin panel", "Beheerpaneel"),
  row("Обновить данные", "Оновити дані", "Refresh data", "Gegevens vernieuwen"),
  row("Обновить", "Оновити", "Refresh", "Vernieuwen"),
  row("Обновляю…", "Оновлюю…", "Refreshing…", "Vernieuwen…"),
  row("Выйти", "Вийти", "Log out", "Uitloggen"),
  row("Вы вышли.", "Ви вийшли.", "You are logged out.", "Je bent uitgelogd."),

  row("Объекты", "Об’єкти", "Sites", "Locaties"),
  row("Работники", "Працівники", "Workers", "Medewerkers"),
  row("Смены", "Зміни", "Shifts", "Diensten"),
  row("График", "Графік", "Schedule", "Planning"),
  row("Отчёты", "Звіти", "Reports", "Rapporten"),
  row("Расписание", "Розклад", "Schedule", "Rooster"),
  row("Доска", "Дошка", "Board", "Bord"),
  row("Календарь", "Календар", "Calendar", "Kalender"),
  row("Карточка", "Картка", "Card", "Kaart"),
  row("Карточка объекта", "Картка об’єкта", "Site card", "Locatiekaart"),
  row("Карточка работника", "Картка працівника", "Worker card", "Medewerkerkaart"),
  row("Навигация", "Навігація", "Navigation", "Navigatie"),
  row("Язык", "Мова", "Language", "Taal"),

  row("Контроль рабочего времени", "Контроль робочого часу", "Time tracking", "Tijdregistratie"),
  row("Период:", "Період:", "Period:", "Periode:"),
  row("Выбрать период", "Обрати період", "Select period", "Periode kiezen"),
  row("Правка факта", "Правка факту", "Actual time edit", "Werkelijke tijd bewerken"),
  row("По работникам", "За працівниками", "By workers", "Per medewerkers"),
  row("По объектам", "За об’єктами", "By sites", "Per locaties"),
  row("Итог периода", "Підсумок періоду", "Period total", "Totaal periode"),
  row("Поиск", "Пошук", "Search", "Zoeken"),
  row("Имя работника / объект", "Ім’я працівника / об’єкт", "Worker name / site", "Naam medewerker / locatie"),
  row("Считаю…", "Рахую…", "Calculating…", "Berekenen…"),
  row("Готово", "Готово", "Done", "Gereed"),
  row("Нет данных за выбранный период", "Немає даних за обраний період", "No data for the selected period", "Geen gegevens voor de geselecteerde periode"),
  row("Период отчёта", "Період звіту", "Report period", "Rapportperiode"),
  row("Платёжный период", "Платіжний період", "Payroll period", "Loonperiode"),
  row("Пользовательские даты", "Довільні дати", "Custom dates", "Aangepaste datums"),
  row("Закрыть", "Закрити", "Close", "Sluiten"),

  row("Часы", "Години", "Hours", "Uren"),
  row("Часы работника", "Години працівника", "Worker hours", "Uren medewerker"),
  row("Открыть часы", "Відкрити години", "Open hours", "Uren openen"),
  row("Выбери работника", "Обери працівника", "Choose worker", "Kies medewerker"),
  row("Показать", "Показати", "Show", "Tonen"),
  row("День", "День", "Day", "Dag"),
  row("Неделя", "Тиждень", "Week", "Week"),
  row("Месяц", "Місяць", "Month", "Maand"),
  row("Период", "Період", "Period", "Periode"),
  row("Итого", "Разом", "Total", "Totaal"),
  row("По дням", "За днями", "By day", "Per dag"),
  row("Список смен", "Список змін", "Shift list", "Dienstenlijst"),

  row("Tanija • Admin • Факт", "Tanija • Admin • Факт", "Tanija • Admin • Actual", "Tanija • Admin • Werkelijk"),
  row("Редактирование фактически отработанного времени", "Редагування фактично відпрацьованого часу", "Edit actual worked time", "Werkelijk gewerkte tijd bewerken"),
  row("Сохранить", "Зберегти", "Save", "Opslaan"),
  row("Факт", "Факт", "Actual", "Werkelijk"),
  row("Правка", "Правка", "Edit", "Bewerken"),
  row("Нет завершённых смен в выбранном диапазоне.", "Немає завершених змін у вибраному діапазоні.", "No completed shifts in the selected range.", "Geen voltooide diensten in het geselecteerde bereik."),
  row("Факт обновлён.", "Факт оновлено.", "Actual time updated.", "Werkelijke tijd bijgewerkt."),
  row("Часы удалены.", "Години видалено.", "Hours deleted.", "Uren verwijderd."),
  row("Удалить часы", "Видалити години", "Delete hours", "Uren verwijderen"),

  row("Создать смену", "Створити зміну", "Create shift", "Dienst maken"),
  row("Фильтры", "Фільтри", "Filters", "Filters"),
  row("Новый объект", "Новий об’єкт", "New site", "Nieuwe locatie"),
  row("Название", "Назва", "Name", "Naam"),
  row("Адрес", "Адреса", "Address", "Adres"),
  row("(необязательно)", "(необов’язково)", "(optional)", "(optioneel)"),
  row("Радиус (м)", "Радіус (м)", "Radius (m)", "Straal (m)"),
  row("Категория", "Категорія", "Category", "Categorie"),
  row("Без категории", "Без категорії", "No category", "Geen categorie"),
  row("Заметки", "Нотатки", "Notes", "Notities"),
  row("Создать", "Створити", "Create", "Aanmaken"),
  row("Отмена", "Скасувати", "Cancel", "Annuleren"),
  row("Например: Дом, офис, объект №1", "Наприклад: Дім, офіс, об’єкт №1", "For example: house, office, site №1", "Bijvoorbeeld: huis, kantoor, locatie nr. 1"),
  row("Добавить объект", "Додати об’єкт", "Add site", "Locatie toevoegen"),
  row("Удалить", "Видалити", "Delete", "Verwijderen"),

  row("Профиль", "Профіль", "Profile", "Profiel"),
  row("Сохранить профиль", "Зберегти профіль", "Save profile", "Profiel opslaan"),
  row("Принять", "Прийняти", "Accept", "Accepteren"),
  row("Старт", "Почати", "Start", "Start"),
  row("Стоп", "Завершити", "Stop", "Stop"),
  row("Секундомер", "Секундомір", "Stopwatch", "Stopwatch"),
  row("Секундомер:", "Секундомір:", "Stopwatch:", "Stopwatch:"),
  row("Таймер", "Таймер", "Timer", "Timer"),
  row("Начать", "Почати", "Start", "Start"),
  row("Завершить", "Завершити", "Finish", "Afronden"),
  row("Загрузить", "Завантажити", "Upload", "Uploaden"),
  row("Выберите файл", "Обрати файл", "Choose file", "Bestand kiezen"),
  row("Файл не выбран", "Файл не обрано", "No file selected", "Geen bestand geselecteerd"),
  row("Аватар", "Аватар", "Avatar", "Avatar"),
  row("Нет аватара", "Немає аватара", "No avatar", "Geen avatar"),
  row("Сделать аватаром", "Зробити аватаром", "Set as avatar", "Als avatar instellen"),
  row("Поставь аватар (главное фото)", "Постав аватар (головне фото)", "Set an avatar (main photo)", "Stel een avatar in (hoofdfoto)"),
  row("Фото загружено.", "Фото завантажено.", "Photo uploaded.", "Foto geüpload."),
  row("Фото загружены.", "Фото завантажені.", "Photos uploaded.", "Foto's geüpload."),
  row("Фото удалено.", "Фото видалено.", "Photo deleted.", "Foto verwijderd."),
  row("Фото объекта", "Фото об’єкта", "Site photos", "Locatiefoto's"),
  row("Выбери фото для загрузки.", "Обери фото для завантаження.", "Choose a photo to upload.", "Kies een foto om te uploaden."),
  row("Файл пустой. Выбери фото ещё раз.", "Файл порожній. Обери фото ще раз.", "File is empty. Choose the photo again.", "Bestand is leeg. Kies de foto opnieuw."),
  row("Формат не поддерживается. Используй JPG/PNG/WebP/HEIC/HEIF.", "Формат не підтримується. Використовуй JPG/PNG/WebP/HEIC/HEIF.", "Format not supported. Use JPG/PNG/WebP/HEIC/HEIF.", "Formaat wordt niet ondersteund. Gebruik JPG/PNG/WebP/HEIC/HEIF."),
  row("Лимит: 5 фото. Удали одно и попробуй снова.", "Ліміт: 5 фото. Видали одне й спробуй знову.", "Limit: 5 photos. Delete one and try again.", "Limiet: 5 foto's. Verwijder er één en probeer opnieuw."),
  row("Лимит 5 фото. Удалите одно и повторите.", "Ліміт 5 фото. Видаліть одне та повторіть.", "Limit 5 photos. Delete one and try again.", "Limiet 5 foto's. Verwijder er één en probeer opnieuw."),

  row("Вход", "Вхід", "Sign in", "Inloggen"),
  row("Войти", "Увійти", "Sign in", "Inloggen"),
  row("Вхожу…", "Входжу…", "Signing in…", "Inloggen…"),
  row("Вход выполнен.", "Вхід виконано.", "Signed in.", "Ingelogd."),
  row("Ошибка входа", "Помилка входу", "Sign-in error", "Inlogfout"),
  row("Электронная почта", "Електронна пошта", "Email", "E-mail"),
  row("Email (логин)", "Email (логін)", "Email (login)", "E-mail (login)"),
  row("Email (контактный / для magic link)", "Email (контактний / для magic link)", "Email (contact / for magic link)", "E-mail (contact / voor magic link)"),
  row("Пароль", "Пароль", "Password", "Wachtwoord"),
  row("Телефон (контактный)", "Телефон (контактний)", "Phone (contact)", "Telefoon (contact)"),
  row("Телефон для SMS (например +31612345678)", "Телефон для SMS (наприклад +31612345678)", "Phone for SMS (for example +31612345678)", "Telefoon voor sms (bijvoorbeeld +31612345678)"),
  row("Email или телефон, например +31612345678", "Email або телефон, наприклад +31612345678", "Email or phone, for example +31612345678", "E-mail of telefoon, bijvoorbeeld +31612345678"),
  row("name@domain.com или +31612345678", "name@domain.com або +31612345678", "name@domain.com or +31612345678", "name@domain.com of +31612345678"),
  row("Введи email или телефон", "Введи email або телефон", "Enter email or phone", "Vul e-mail of telefoon in"),
  row("Введите email", "Введи email", "Enter email", "Vul e-mail in"),
  row("Код из SMS", "Код із SMS", "Code from SMS", "Code uit sms"),
  row("Введи код из SMS", "Введи код із SMS", "Enter the code from SMS", "Vul de code uit sms in"),
  row("Код отправлен по SMS.", "Код надіслано через SMS.", "Code sent by SMS.", "Code verzonden via sms."),
  row("Отправить ссылку", "Надіслати посилання", "Send link", "Link versturen"),
  row("Отправляю…", "Надсилаю…", "Sending…", "Verzenden…"),
  row("Ссылка отправлена на email. Открой письмо и перейди по ссылке.", "Посилання надіслано на email. Відкрий лист і перейди за посиланням.", "Link sent to email. Open the email and follow the link.", "Link verzonden naar e-mail. Open de e-mail en volg de link."),
  row("Письмо для восстановления отправлено. Проверь почту.", "Лист для відновлення надіслано. Перевір пошту.", "Recovery email sent. Check your inbox.", "Herstelmail verzonden. Controleer je inbox."),
  row("Новый пароль (мин. 8 символов)", "Новий пароль (мін. 8 символів)", "New password (min. 8 characters)", "Nieuw wachtwoord (min. 8 tekens)"),
  row("Новый пароль (мин. 6 символов)", "Новий пароль (мін. 6 символів)", "New password (min. 6 characters)", "Nieuw wachtwoord (min. 6 tekens)"),
  row("Повтори пароль", "Повтори пароль", "Repeat password", "Herhaal wachtwoord"),
  row("Повторить пароль", "Повторити пароль", "Repeat password", "Herhaal wachtwoord"),
  row("Установить пароль", "Встановити пароль", "Set password", "Wachtwoord instellen"),
  row("Сохранить пароль", "Зберегти пароль", "Save password", "Wachtwoord opslaan"),
  row("Номер подтверждён. Теперь задай новый пароль.", "Номер підтверджено. Тепер задай новий пароль.", "Number confirmed. Now set a new password.", "Nummer bevestigd. Stel nu een nieuw wachtwoord in."),
  row("Пароль обновлён. Можешь входить паролем.", "Пароль оновлено. Можеш входити паролем.", "Password updated. You can sign in with your password.", "Wachtwoord bijgewerkt. Je kunt nu inloggen met je wachtwoord."),
  row("Пароль обновлён. Теперь войди заново.", "Пароль оновлено. Тепер увійди знову.", "Password updated. Sign in again now.", "Wachtwoord bijgewerkt. Log nu opnieuw in."),
  row("Пароль установлен. Теперь можно входить по Email + пароль.", "Пароль встановлено. Тепер можна входити через Email + пароль.", "Password set. You can now sign in with email + password.", "Wachtwoord ingesteld. Je kunt nu inloggen met e-mail + wachtwoord."),

  row("Админ", "Адмін", "Admin", "Beheerder"),
  row("Работник", "Працівник", "Worker", "Medewerker"),
  row("Работник не активен", "Працівник не активний", "Worker is inactive", "Medewerker is inactief"),
  row("Работник не найден", "Працівника не знайдено", "Worker not found", "Medewerker niet gevonden"),
  row("Без имени", "Без імені", "No name", "Geen naam"),
  row("Нет имени", "Немає імені", "No name", "Geen naam"),
  row("Имя и фамилия", "Ім’я та прізвище", "First and last name", "Voor- en achternaam"),
  row("Имя работника", "Ім’я працівника", "Worker name", "Naam medewerker"),
  row("ФИО", "ПІБ", "Full name", "Volledige naam"),
  row("Контакты сохранены.", "Контакти збережено.", "Contacts saved.", "Contacten opgeslagen."),
  row("Профиль обновлён.", "Профіль оновлено.", "Profile updated.", "Profiel bijgewerkt."),
  row("Заявка отправлена. Жди активации админом.", "Заявку надіслано. Чекай активації адміном.", "Request sent. Wait for admin activation.", "Aanvraag verzonden. Wacht op activatie door de beheerder."),
  row("+ подтверждённый email", "+ підтверджений email", "+ confirmed email", "+ bevestigde e-mail"),
  row("Email не подтверждён", "Email не підтверджено", "Email not confirmed", "E-mail niet bevestigd"),
  row("Email подтверждён", "Email підтверджено", "Email confirmed", "E-mail bevestigd"),
  row("• email НЕ подтверждён", "• email НЕ підтверджено", "• email NOT confirmed", "• e-mail NIET bevestigd"),
  row("• активен", "• активний", "• active", "• actief"),
  row("• в архиве", "• в архіві", "• archived", "• gearchiveerd"),
  row("в архиве", "в архіві", "archived", "gearchiveerd"),
  row("да", "так", "yes", "ja"),
  row("нет", "ні", "no", "nee"),
  row("выбран", "вибрано", "selected", "geselecteerd"),
  row("главное", "головне", "main", "hoofd"),
  row("ручной", "ручний", "manual", "handmatig"),

  row("Запланировано", "Заплановано", "Planned", "Gepland"),
  row("В процессе", "У процесі", "In progress", "Bezig"),
  row("Завершено", "Завершено", "Completed", "Voltooid"),
  row("Отменено", "Скасовано", "Cancelled", "Geannuleerd"),
  row("запланировано", "заплановано", "planned", "gepland"),
  row("в работе", "у роботі", "in progress", "bezig"),
  row("завершено", "завершено", "completed", "voltooid"),

  row("Принято.", "Прийнято.", "Accepted.", "Geaccepteerd."),
  row("Принять можно только запланированную смену", "Прийняти можна лише заплановану зміну", "Only a planned shift can be accepted", "Alleen een geplande dienst kan worden geaccepteerd"),
  row("Старт доступен только для запланированных смен.", "Старт доступний лише для запланованих змін.", "Start is available only for planned shifts.", "Start is alleen beschikbaar voor geplande diensten."),
  row("Стоп доступен только для смен в работе.", "Стоп доступний лише для змін у роботі.", "Stop is available only for shifts in progress.", "Stop is alleen beschikbaar voor diensten in uitvoering."),
  row("Старт.", "Старт.", "Started.", "Gestart."),
  row("Стоп.", "Стоп.", "Stopped.", "Gestopt."),
  row("Старт (в очереди)", "Старт (у черзі)", "Start (queued)", "Start (in wachtrij)"),
  row("Стоп (в очереди)", "Стоп (у черзі)", "Stop (queued)", "Stop (in wachtrij)"),
  row("Нет активного старта по этой смене.", "Немає активного старту по цій зміні.", "There is no active start for this shift.", "Er is geen actieve start voor deze dienst."),
  row("Нет доступа к этой смене.", "Немає доступу до цієї зміни.", "No access to this shift.", "Geen toegang tot deze dienst."),
  row("Смена не найдена.", "Зміну не знайдено.", "Shift not found.", "Dienst niet gevonden."),
  row("Смена уже занята", "Зміна вже зайнята", "Shift is already taken", "Dienst is al bezet"),
  row("Нет доступа к объекту", "Немає доступу до об’єкта", "No access to site", "Geen toegang tot locatie"),
  row("Нет назначения на этот объект", "Немає призначення на цей об’єкт", "No assignment for this site", "Geen toewijzing voor deze locatie"),
  row("Нужен id смены.", "Потрібен id зміни.", "Shift id is required.", "Dienst-id is vereist."),
  row("Нужен jobId", "Потрібен jobId", "jobId is required", "jobId is vereist"),
  row("Нужно войти", "Потрібно увійти", "Sign in required", "Inloggen vereist"),
  row("Нет сети. Старт запрещён без проверки GPS.", "Немає мережі. Старт заборонено без перевірки GPS.", "No network. Start is blocked without GPS check.", "Geen netwerk. Start is geblokkeerd zonder GPS-controle."),
  row("Нет сети. Стоп в очереди.", "Немає мережі. Стоп у черзі.", "No network. Stop queued.", "Geen netwerk. Stop staat in wachtrij."),
  row("GPS недоступен.", "GPS недоступний.", "GPS is unavailable.", "GPS is niet beschikbaar."),
  row("GPS недоступен на этом устройстве.", "GPS недоступний на цьому пристрої.", "GPS is unavailable on this device.", "GPS is niet beschikbaar op dit apparaat."),
  row("Не удалось получить корректный GPS.", "Не вдалося отримати коректний GPS.", "Could not get valid GPS.", "Kon geen geldige GPS verkrijgen."),
  row("У объекта не задан радиус. Старт запрещён.", "Для об’єкта не задано радіус. Старт заборонено.", "Site radius is not set. Start is blocked.", "De straal van de locatie is niet ingesteld. Start is geblokkeerd."),
  row("У объекта не задан радиус. Стоп запрещён.", "Для об’єкта не задано радіус. Стоп заборонено.", "Site radius is not set. Stop is blocked.", "De straal van de locatie is niet ingesteld. Stop is geblokkeerd."),
  row("У объекта нет координат. Старт запрещён.", "У об’єкта немає координат. Старт заборонено.", "Site has no coordinates. Start is blocked.", "De locatie heeft geen coördinaten. Start is geblokkeerd."),
  row("У объекта нет координат. Стоп запрещён.", "У об’єкта немає координат. Стоп заборонено.", "Site has no coordinates. Stop is blocked.", "De locatie heeft geen coördinaten. Stop is geblokkeerd."),
  row("Нужны координаты и точность GPS.", "Потрібні координати та точність GPS.", "GPS coordinates and accuracy are required.", "GPS-coördinaten en nauwkeurigheid zijn vereist."),
  row("Открыть навигацию", "Відкрити навігацію", "Open navigation", "Navigatie openen"),

  row("Объект", "Об’єкт", "Site", "Locatie"),
  row("Работник", "Працівник", "Worker", "Medewerker"),
  row("Быстрое назначение: объект", "Швидке призначення: об’єкт", "Quick assignment: site", "Snelle toewijzing: locatie"),
  row("Выбери объект", "Обери об’єкт", "Choose site", "Kies locatie"),
  row("Выбери объект…", "Обери об’єкт…", "Choose site…", "Kies locatie…"),
  row("Выбери работников", "Обери працівників", "Choose workers", "Kies medewerkers"),
  row("Выбери хотя бы одного работника", "Обери хоча б одного працівника", "Choose at least one worker", "Kies minstens één medewerker"),
  row("Поиск работника…", "Пошук працівника…", "Search worker…", "Zoek medewerker…"),
  row("Пригласить", "Запросити", "Invite", "Uitnodigen"),
  row("Обновлено.", "Оновлено.", "Updated.", "Bijgewerkt."),
  row("Создаю…", "Створюю…", "Creating…", "Aanmaken…"),
  row("Сохраняю…", "Зберігаю…", "Saving…", "Opslaan…"),
  row("Сохранение…", "Збереження…", "Saving…", "Opslaan…"),
  row("Удалено.", "Видалено.", "Deleted.", "Verwijderd."),
  row("Ошибка", "Помилка", "Error", "Fout"),
  row("Ошибка загрузки", "Помилка завантаження", "Loading error", "Laadfout"),
  row("Ошибка сохранения", "Помилка збереження", "Save error", "Opslagfout"),
  row("Ошибка удаления", "Помилка видалення", "Delete error", "Verwijderfout"),
  row("Ошибка обновления", "Помилка оновлення", "Update error", "Bijwerkfout"),
  row("Ошибка сервера", "Помилка сервера", "Server error", "Serverfout"),
  row("Ошибка сессии", "Помилка сесії", "Session error", "Sessiefout"),
  row("Ошибка синхронизации", "Помилка синхронізації", "Sync error", "Synchronisatiefout"),
  row("Ошибка назначения", "Помилка призначення", "Assignment error", "Toewijzingsfout"),
  row("Ошибка снятия назначения", "Помилка зняття призначення", "Unassign error", "Fout bij verwijderen van toewijzing"),
  row("Ошибка отправки", "Помилка надсилання", "Send error", "Verzendfout"),
  row("Ошибка приглашения", "Помилка запрошення", "Invitation error", "Uitnodigingsfout"),
  row("Ошибка отчёта", "Помилка звіту", "Report error", "Rapportfout"),
  row("Ошибка удаления смены", "Помилка видалення зміни", "Shift delete error", "Fout bij verwijderen van dienst"),
  row("Ошибка установки пароля", "Помилка встановлення пароля", "Password setup error", "Fout bij instellen van wachtwoord"),
  row("Ошибка активации", "Помилка активації", "Activation error", "Activatiefout"),

  row("Нет доступа", "Немає доступу", "No access", "Geen toegang"),
  row("Доступ запрещён", "Доступ заборонено", "Access denied", "Toegang geweigerd"),
  row("Сессия истекла. Войдите снова.", "Сесія закінчилася. Увійдіть знову.", "Session expired. Sign in again.", "Sessie verlopen. Log opnieuw in."),
  row("Обновление зависло. Обычно это сеть/таймаут. Нажми “Обновить данные” ещё раз.", "Оновлення зависло. Зазвичай це мережа/таймаут. Натисни “Оновити дані” ще раз.", "Refresh got stuck. Usually it is network/timeout. Press “Refresh data” again.", "Vernieuwen is vastgelopen. Meestal is dat netwerk/timeout. Druk nogmaals op “Gegevens vernieuwen”."),
  row("Таймаут запроса (15с). Нажми “Обновить данные” ещё раз.", "Таймаут запиту (15 с). Натисни “Оновити дані” ще раз.", "Request timeout (15s). Press “Refresh data” again.", "Time-out van verzoek (15s). Druk nogmaals op “Gegevens vernieuwen”."),

  row("Пн", "Пн", "Mon", "Ma"),
  row("Вт", "Вт", "Tue", "Di"),
  row("Ср", "Ср", "Wed", "Wo"),
  row("Чт", "Чт", "Thu", "Do"),
  row("Пт", "Пт", "Fri", "Vr"),
  row("Сб", "Сб", "Sat", "Za"),
  row("Вс", "Нд", "Sun", "Zo"),
];

const EXACT_TO_LANG: Record<Lang, Dict> = { ru: {}, uk: {}, en: {}, nl: {} };
const TO_RU_EXACT: Dict = {};

for (const item of PHRASES) {
  EXACT_TO_LANG.uk[item.ru] = item.uk;
  EXACT_TO_LANG.en[item.ru] = item.en;
  EXACT_TO_LANG.nl[item.ru] = item.nl;

  TO_RU_EXACT[item.uk] = item.ru;
  TO_RU_EXACT[item.en] = item.ru;
  TO_RU_EXACT[item.nl] = item.ru;
}

const PATTERNS: Record<Lang, PatternRule[]> = {
  ru: [],
  uk: [
    { re: /^Категория (\d{1,2})$/, make: (n) => `Категорія ${n}` },
    { re: /^Категория должна быть от (\d+) до (\d+)$/, make: (a, b) => `Категорія має бути від ${a} до ${b}` },
    { re: /^Объект (.+)$/, make: (x) => `Об’єкт ${x}` },
    { re: /^Назначены: (\d+)$/, make: (n) => `Призначено: ${n}` },
    { re: /^Объекты: (\d+)$/, make: (n) => `Об’єкти: ${n}` },
    { re: /^и ещё (\d+)$/, make: (n) => `і ще ${n}` },
    { re: /^Загружу (\d+) из (\d+) \(лимит 5\)$/, make: (a, b) => `Завантажу ${a} із ${b} (ліміт 5)` },
    { re: /^Фото слишком большое\. Максимум (.+) MB\.$/, make: (mb) => `Фото занадто велике. Максимум ${mb} MB.` },
    { re: /^Вы далеко от объекта: (\d+) м \(нужно ≤ (\d+) м\)\.$/, make: (a, b) => `Ви далеко від об’єкта: ${a} м (потрібно ≤ ${b} м).` },
    { re: /^Точность GPS слишком низкая: (\d+) м \(нужно ≤ 80 м\)\.$/, make: (a) => `Точність GPS занадто низька: ${a} м (потрібно ≤ 80 м).` },
    { re: /^Создано\. Логин: (.+)\. Временный пароль: (.+) \(при первом входе попросим сменить\)\.$/, make: (login, pw) => `Створено. Логін: ${login}. Тимчасовий пароль: ${pw} (при першому вході попросимо змінити).` },
  ],
  en: [
    { re: /^Категория (\d{1,2})$/, make: (n) => `Category ${n}` },
    { re: /^Категория должна быть от (\d+) до (\d+)$/, make: (a, b) => `Category must be from ${a} to ${b}` },
    { re: /^Объект (.+)$/, make: (x) => `Site ${x}` },
    { re: /^Назначены: (\d+)$/, make: (n) => `Assigned: ${n}` },
    { re: /^Объекты: (\d+)$/, make: (n) => `Sites: ${n}` },
    { re: /^и ещё (\d+)$/, make: (n) => `and ${n} more` },
    { re: /^Загружу (\d+) из (\d+) \(лимит 5\)$/, make: (a, b) => `Uploading ${a} of ${b} (limit 5)` },
    { re: /^Фото слишком большое\. Максимум (.+) MB\.$/, make: (mb) => `Photo is too large. Maximum ${mb} MB.` },
    { re: /^Вы далеко от объекта: (\d+) м \(нужно ≤ (\d+) м\)\.$/, make: (a, b) => `You are too far from the site: ${a} m (required ≤ ${b} m).` },
    { re: /^Точность GPS слишком низкая: (\d+) м \(нужно ≤ 80 м\)\.$/, make: (a) => `GPS accuracy is too low: ${a} m (required ≤ 80 m).` },
    { re: /^Создано\. Логин: (.+)\. Временный пароль: (.+) \(при первом входе попросим сменить\)\.$/, make: (login, pw) => `Created. Login: ${login}. Temporary password: ${pw} (you will be asked to change it on first sign-in).` },
  ],
  nl: [
    { re: /^Категория (\d{1,2})$/, make: (n) => `Categorie ${n}` },
    { re: /^Категория должна быть от (\d+) до (\d+)$/, make: (a, b) => `Categorie moet van ${a} tot ${b} zijn` },
    { re: /^Объект (.+)$/, make: (x) => `Locatie ${x}` },
    { re: /^Назначены: (\d+)$/, make: (n) => `Toegewezen: ${n}` },
    { re: /^Объекты: (\d+)$/, make: (n) => `Locaties: ${n}` },
    { re: /^и ещё (\d+)$/, make: (n) => `en nog ${n}` },
    { re: /^Загружу (\d+) из (\d+) \(лимит 5\)$/, make: (a, b) => `Upload ${a} van ${b} (limiet 5)` },
    { re: /^Фото слишком большое\. Максимум (.+) MB\.$/, make: (mb) => `Foto is te groot. Maximum ${mb} MB.` },
    { re: /^Вы далеко от объекта: (\d+) м \(нужно ≤ (\d+) м\)\.$/, make: (a, b) => `Je bent te ver van de locatie: ${a} m (vereist ≤ ${b} m).` },
    { re: /^Точность GPS слишком низкая: (\d+) м \(нужно ≤ 80 м\)\.$/, make: (a) => `GPS-nauwkeurigheid is te laag: ${a} m (vereist ≤ 80 m).` },
    { re: /^Создано\. Логин: (.+)\. Временный пароль: (.+) \(при первом входе попросим сменить\)\.$/, make: (login, pw) => `Aangemaakt. Login: ${login}. Tijdelijk wachtwoord: ${pw} (bij de eerste keer inloggen word je gevraagd het te wijzigen).` },
  ],
};

const textOriginal = new WeakMap<Node, string>();
const textLast = new WeakMap<Node, string>();
const attrState = new WeakMap<HTMLElement, AttrState>();

function withSpaces(src: string, translated: string) {
  const lead = src.match(/^\s*/)?.[0] ?? "";
  const tail = src.match(/\s*$/)?.[0] ?? "";
  return lead + translated + tail;
}

function normalizeToRu(src: string) {
  const trimmed = src.trim();
  const hit = TO_RU_EXACT[trimmed];
  return hit ? withSpaces(src, hit) : src;
}

function translateTrimmed(srcTrimmedRu: string, lang: Lang) {
  if (lang === "ru") return srcTrimmedRu;
  const exact = EXACT_TO_LANG[lang][srcTrimmedRu];
  if (exact) return exact;
  for (const rule of PATTERNS[lang]) {
    const m = srcTrimmedRu.match(rule.re);
    if (m) return rule.make(...m.slice(1));
  }
  return srcTrimmedRu;
}

function translateString(src: string, lang: Lang) {
  const normalized = normalizeToRu(src);
  const trimmed = normalized.trim();
  if (!trimmed) return src;
  const translated = translateTrimmed(trimmed, lang);
  return withSpaces(normalized, translated);
}

/** DeepL overlay: strings still in source language after static dictionaries */
const deepLMemory = new Map<string, string>();

function deepLCacheKey(lang: Lang, trimmed: string) {
  return `${lang}::${trimmed}`;
}

const DEEPL_SKIP =
  /^[\s\d.:+\-/,%€$−<>=#()[\]{}]*$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function shouldSendToDeepL(trimmed: string, lang: Lang): boolean {
  if (lang === "ru") return false;
  if (trimmed.length < 2) return false;
  if (DEEPL_SKIP.test(trimmed)) return false;
  const t = translateTrimmed(trimmed, lang);
  return t === trimmed;
}

function collectDeepLKeys(lang: Lang): string[] {
  const set = new Set<string>();
  const root = document.body;
  if (!root) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const parent = (node as any).parentElement as HTMLElement | null;
    if (parent && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
      const original = textOriginal.get(node) ?? String(node.nodeValue ?? "");
      const normalized = normalizeToRu(original);
      const trimmed = normalized.trim();
      if (shouldSendToDeepL(trimmed, lang) && !deepLMemory.has(deepLCacheKey(lang, trimmed))) {
        set.add(trimmed);
      }
    }
    node = walker.nextNode();
  }

  const attrs = ["placeholder", "title", "aria-label", "alt", "value"];
  const all = root.querySelectorAll<HTMLElement>("*");
  for (const el of Array.from(all)) {
    for (const attr of attrs) {
      const state = attrState.get(el);
      const original = state?.original[attr] ?? el.getAttribute(attr);
      if (original == null) continue;
      const normalized = normalizeToRu(original);
      const trimmed = normalized.trim();
      if (shouldSendToDeepL(trimmed, lang) && !deepLMemory.has(deepLCacheKey(lang, trimmed))) {
        set.add(trimmed);
      }
    }
  }

  const titleNorm = normalizeToRu(document.title || "");
  const titleTrim = titleNorm.trim();
  if (shouldSendToDeepL(titleTrim, lang) && !deepLMemory.has(deepLCacheKey(lang, titleTrim))) {
    set.add(titleTrim);
  }

  return Array.from(set);
}

function applyDeepLOverlay(lang: Lang) {
  if (lang === "ru") return;
  const root = document.body;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const parent = (node as any).parentElement as HTMLElement | null;
    if (parent && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
      const original = textOriginal.get(node) ?? String(node.nodeValue ?? "");
      const normalized = normalizeToRu(original);
      const trimmed = normalized.trim();
      const tr = deepLMemory.get(deepLCacheKey(lang, trimmed));
      if (tr) {
        const next = withSpaces(normalized, tr);
        if (String(node.nodeValue ?? "") !== next) {
          node.nodeValue = next;
          textLast.set(node, next);
        }
      }
    }
    node = walker.nextNode();
  }

  const attrs = ["placeholder", "title", "aria-label", "alt", "value"];
  const all = root.querySelectorAll<HTMLElement>("*");
  for (const el of Array.from(all)) {
    for (const attr of attrs) {
      const state = attrState.get(el);
      const original = state?.original[attr] ?? el.getAttribute(attr);
      if (original == null) continue;
      const normalized = normalizeToRu(original);
      const trimmed = normalized.trim();
      const tr = deepLMemory.get(deepLCacheKey(lang, trimmed));
      if (tr) {
        const next = withSpaces(normalized, tr);
        if (el.getAttribute(attr) !== next) {
          el.setAttribute(attr, next);
          const st = state ?? { original: {}, last: {} };
          st.last[attr] = next;
          attrState.set(el, st);
        }
      }
    }
  }

  const tNorm = normalizeToRu(document.title || "");
  const tTrim = tNorm.trim();
  const tTr = deepLMemory.get(deepLCacheKey(lang, tTrim));
  if (tTr) document.title = withSpaces(tNorm, tTr);
}

function processTextNode(node: Node, lang: Lang) {
  const current = String(node.nodeValue ?? "");
  const previousOriginal = textOriginal.get(node);
  const previousLast = textLast.get(node);

  let original = previousOriginal;
  if (original == null) {
    original = current;
  } else if (previousLast != null && current !== previousLast && current !== previousOriginal) {
    original = current;
  }

  const translated = translateString(original, lang);
  textOriginal.set(node, original);
  textLast.set(node, translated);
  if (current !== translated) node.nodeValue = translated;
}

function processAttribute(el: HTMLElement, attr: string, lang: Lang) {
  const current = el.getAttribute(attr);
  if (current == null) return;

  const state = attrState.get(el) ?? { original: {}, last: {} };
  let original = state.original[attr];
  const prevLast = state.last[attr];

  if (original == null) {
    original = current;
  } else if (prevLast != null && current !== prevLast && current !== original) {
    original = current;
  }

  const translated = translateString(original, lang);
  state.original[attr] = original;
  state.last[attr] = translated;
  attrState.set(el, state);

  if (current !== translated) el.setAttribute(attr, translated);
}

function translateDocument(lang: Lang) {
  if (typeof document === "undefined") return;

  const root = document.body as HTMLElement | null;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const parent = (node as any).parentElement as HTMLElement | null;
    if (parent && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
      processTextNode(node, lang);
    }
    node = walker.nextNode();
  }

  const attrs = ["placeholder", "title", "aria-label", "alt", "value"];
  const all = root.querySelectorAll<HTMLElement>("*");
  for (const el of Array.from(all)) {
    for (const attr of attrs) processAttribute(el, attr, lang);
  }

  document.title = translateString(document.title || "", lang);
}

export default function AutoTranslate() {
  const { lang } = useI18n();
  const abortRef = useRef<AbortController | null>(null);

  const run = useMemo(() => {
    return () => translateDocument(lang);
  }, [lang]);

  const runDeepL = useCallback(async () => {
    if (lang === "ru") return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let meta: Response;
    try {
      meta = await fetch("/api/translate/deepl", { signal: ac.signal });
    } catch {
      return;
    }
    if (!meta.ok) return;
    const { enabled } = (await meta.json()) as { enabled?: boolean };
    if (!enabled) return;

    const pending = collectDeepLKeys(lang);
    if (pending.length === 0) {
      applyDeepLOverlay(lang);
      return;
    }

    for (let i = 0; i < pending.length; i += 50) {
      const batch = pending.slice(i, i + 50);
      let res: Response;
      try {
        res = await fetch("/api/translate/deepl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: batch, target_lang: lang }),
          signal: ac.signal,
        });
      } catch {
        return;
      }
      if (!res.ok) continue;
      const data = (await res.json()) as { translations?: string[] };
      const tr = data.translations ?? [];
      batch.forEach((key, idx) => {
        const out = tr[idx];
        if (out && String(out).trim()) deepLMemory.set(deepLCacheKey(lang, key), String(out).trim());
      });
    }
    applyDeepLOverlay(lang);
  }, [lang]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    let d: ReturnType<typeof setTimeout> | null = null;

    const scheduleDeepL = () => {
      if (d) clearTimeout(d);
      d = setTimeout(() => {
        d = null;
        void runDeepL();
      }, 450);
    };

    const schedule = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        run();
        scheduleDeepL();
      }, 50);
    };

    run();
    scheduleDeepL();

    const obs = new MutationObserver(() => schedule());
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });

    return () => {
      if (t) clearTimeout(t);
      if (d) clearTimeout(d);
      abortRef.current?.abort();
      obs.disconnect();
    };
  }, [run, runDeepL]);

  return null;
}
