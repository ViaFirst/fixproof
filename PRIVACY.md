# Fixproof — Privacy Policy

*Last updated: 2 November 2026. Publisher: ViaFirst.*

Fixproof is a browser extension for reporting bugs on web pages. It has no servers of its own, no analytics and no
tracking. It sends data only when **you** press *Send*, and only to the place **you** configured.

## What the extension collects, and when

Only when you open the reporter (toolbar button or Alt+Shift+B) and press *Send*, for the current tab:

- a screenshot of the visible part of the page, with your annotations;
- the page address and title, the window size, device type, browser and operating system names, the page language;
- the element or area you selected: its CSS selector, text and HTML (up to 1,000 characters), position;
- the last console errors and warnings of the page and the last failed network requests (address, status, type) —
  console messages are recorded only on sites you explicitly allowed in the settings;
- the title, details, type and priority you typed, and the name you set as "Your name in tickets".

Nothing is collected in the background, and nothing is collected on sites you did not open the reporter on.

## Where it goes

To the backend you chose for the project, and nowhere else:

- **GitHub** — an issue in the repository you named, through the GitHub API (`api.github.com`), with your token;
- **Mesila** — a card on the board you named, on the Mesila address you entered (or that connected the board when
  you clicked *Connect* in Mesila), with your Mesila token.

The data is then governed by that service's own terms and privacy policy. ViaFirst does not receive a copy.

## What is stored in your browser

If the backend cannot be reached when you press *Send*, the ticket (with its screenshot) is kept in the extension's
local storage and sent automatically later; it is deleted from your device once delivered, or when you delete it
in *Outbox* in the settings.


Your settings — tokens, your name, projects and their site addresses — are kept in the extension's local storage
(`chrome.storage.local`) on your device. They are not synced and not sent anywhere except as the authorization of
the requests above, or when they are synced to your Mesila account (below). Removing the extension deletes them.

## Sync with Mesila (on by default, you can turn it off)

- **Sync** sends your settings, after every change, to your own Mesila account (the Mesila address of your projects, with your
  Mesila key): projects, site addresses, boards, your name. Keys of that Mesila's boards are not sent — Mesila gives
  new ones when you press *Restore*. The GitHub token and keys for other Mesila addresses are sent too and Mesila
  keeps them encrypted; they come back only into the extension, from your signed-in Mesila page. You can delete the
  saved copy in Mesila → AI agents. Turn *Sync* off in the extension settings and nothing is sent.
- **Export to a file** saves the settings, tokens included, to a file on your device; nothing is sent anywhere.

## What we do not do

We do not sell or share data, do not use it for advertising or credit decisions, do not run remote code, and do not
collect browsing history.

## Contact

Questions: open an issue at https://github.com/ViaFirst/fixproof/issues.

---

**Кратко по-русски.** Fixproof ничего не собирает в фоне и не имеет своих серверов. Скриншот, адрес страницы,
выбранный элемент, ошибки консоли (только на разрешённых вами сайтах) и упавшие запросы уходят только по кнопке
«Отправить» и только туда, куда вы настроили: в ваш репозиторий GitHub или на ваш борд Mesila. Токены и настройки
хранятся только в этом браузере — кроме резервной копии, которую вы сами сохраняете в своём аккаунте Mesila
(ключи бордов туда не попадают, остальные токены хранятся зашифрованными) или в файл.

**בקצרה בעברית.** Fixproof לא אוסף דבר ברקע ואין לו שרתים משלו. צילום המסך, כתובת העמוד, האלמנט שנבחר, שגיאות
הקונסול (רק באתרים שאישרתם) ובקשות שנכשלו נשלחים רק בלחיצה על "שליחה", ורק ליעד שהגדרתם: מאגר GitHub או לוח
Mesila שלכם. הטוקנים וההגדרות נשמרים רק בדפדפן הזה — מלבד גיבוי שאתם עצמכם שומרים בחשבון Mesila שלכם
(מפתחות הלוחות לא נשמרים שם, שאר הטוקנים נשמרים מוצפנים) או בקובץ.
