# Fixproof — Privacy Policy

*Last updated: 22 October 2026. Publisher: ViaFirst.*

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
- **Mesila** — a card on the board you named, on the Mesila address you entered, with your Mesila token.

The data is then governed by that service's own terms and privacy policy. ViaFirst does not receive a copy.

## What is stored in your browser

Your settings — tokens, your name, projects and their site addresses — are kept in the extension's local storage
(`chrome.storage.local`) on your device. They are not synced and not sent anywhere except as the authorization of
the requests above. Removing the extension deletes them.

## What we do not do

We do not sell or share data, do not use it for advertising or credit decisions, do not run remote code, and do not
collect browsing history.

## Contact

Questions: open an issue at https://github.com/ViaFirst/fixproof/issues.

---

**Кратко по-русски.** Fixproof ничего не собирает в фоне и не имеет своих серверов. Скриншот, адрес страницы,
выбранный элемент, ошибки консоли (только на разрешённых вами сайтах) и упавшие запросы уходят только по кнопке
«Отправить» и только туда, куда вы настроили: в ваш репозиторий GitHub или на ваш борд Mesila. Токены и настройки
хранятся только в этом браузере.

**בקצרה בעברית.** Fixproof לא אוסף דבר ברקע ואין לו שרתים משלו. צילום המסך, כתובת העמוד, האלמנט שנבחר, שגיאות
הקונסול (רק באתרים שאישרתם) ובקשות שנכשלו נשלחים רק בלחיצה על "שליחה", ורק ליעד שהגדרתם: מאגר GitHub או לוח
Mesila שלכם. הטוקנים וההגדרות נשמרים רק בדפדפן הזה.
