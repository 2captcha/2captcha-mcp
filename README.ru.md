<div align="center">

<h1>2Captcha MCP: инструменты для AI-агентов, веб-скрейпинга и автоматизации браузера</h1>

<p><strong>Скрейпинг с обходом анти-бот защиты, парсинг маркетплейсов в структурированный JSON и решение CAPTCHA для AI-агентов по протоколу Model Context Protocol.</strong></p>
<p>Работает с Claude, Cursor, кодинг-агентами и любым MCP-совместимым клиентом.</p>

<p>
  <strong>Бесплатный месячный лимит на каждом аккаунте</strong> — зарегистрируйтесь, добавьте
  API-ключ, и первые 200 вызовов в месяц за наш счёт.
  <a href="#бесплатный-лимит-что-входит">Что входит</a>
</p>

<p>
  <a href="https://www.npmjs.com/package/@2captcha/mcp"><img alt="npm version" src="https://img.shields.io/npm/v/@2captcha/mcp?logo=npm&amp;color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@2captcha/mcp"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@2captcha/mcp?color=cb3837&amp;label=downloads"></a>
  <a href="https://github.com/2captcha/2captcha-mcp/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/2captcha/2captcha-mcp/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://registry.modelcontextprotocol.io"><img alt="MCP Registry" src="https://img.shields.io/badge/MCP_Registry-com.2captcha%2Fmcp-1f6feb"></a>
  <img alt="Node" src="https://img.shields.io/node/v/@2captcha/mcp">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@2captcha/mcp?color=blue"></a>
</p>

<p>
  <a href="cursor://anysphere.cursor-deeplink/mcp/install?name=2captcha&amp;config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAMmNhcHRjaGEvbWNwIl0sImVudiI6eyJBUElfVE9LRU4iOiJZT1VSX0FQSV9UT0tFTiJ9fQ=="><img alt="Установить в Cursor" src="https://cursor.com/deeplink/mcp-install-dark.svg" height="28"></a>
  <a href="https://insiders.vscode.dev/redirect/mcp/install?name=2captcha&amp;config=%7B%22name%22%3A%222captcha%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22%402captcha%2Fmcp%22%5D%2C%22env%22%3A%7B%22API_TOKEN%22%3A%22%24%7Binput%3Aapi_token%7D%22%7D%7D"><img alt="Установить в VS Code" src="https://img.shields.io/badge/VS_Code-Install_server-0098FF?logo=visualstudiocode&amp;logoColor=white&amp;style=for-the-badge" height="28"></a>
  <a href="https://github.com/2captcha/2captcha-mcp/releases/latest"><img alt="Бандл для Claude Desktop" src="https://img.shields.io/badge/Claude_Desktop-.mcpb_bundle-D97757?logo=claude&amp;logoColor=white&amp;style=for-the-badge" height="28"></a>
</p>

<p>
  <a href="#бесплатный-лимит-что-входит">Бесплатный лимит</a> •
  <a href="#быстрый-старт">Быстрый старт</a> •
  <a href="#установка">Установка</a> •
  <a href="#выбор-инструментов-группы">Группы инструментов</a> •
  <a href="#справочник-инструментов-40-инструментов">Инструменты</a> •
  <a href="#конфигурация">Конфигурация</a> •
  <a href="#устранение-неполадок">Устранение неполадок</a>
</p>

<p><a href="README.md">English</a> • <b>Русский</b></p>

</div>

> [!IMPORTANT]
> Официальный пакет 2Captcha MCP — **`@2captcha/mcp`** (публикуется в npm-организации [@2captcha](https://www.npmjs.com/org/2captcha)). Пакет `2captcha-mcp` без скоупа **не имеет отношения к 2Captcha** — не вводите в него свой API-ключ.

---

## Обзор

2Captcha MCP-сервер даёт AI-агентам доступ в реальном времени к веб-данным, которые закрыты для обычных HTTP-клиентов. Он предоставляет **40 инструментов**:

- **Веб-поиск** — ранжированная органическая выдача (заголовок, URL, сниппет) по запросу
- **Скрейпинг страниц** — любой URL как чистый Markdown или сырой HTML. Каждый запрос идёт по лестнице анти-бот тиров: скрытые JSON API, HTTP-клиент с имитацией TLS-отпечатка, ротируемые резидентные прокси и управляемый браузер с решением CAPTCHA — эскалация только до той ступени, которой требует страница, поэтому лёгкие страницы остаются быстрыми и дешёвыми.
- **Парсинг маркетплейсов** — карточки товаров и страницы выдачи как структурированный JSON (название, цена, рейтинг, продавец, наличие, офферы). Сначала детерминированные тиры (скрытые API маркетплейсов, JSON-LD, выученные селекторы); LLM-извлечение подключается, только если они не сработали.
- **Структурированное извлечение** — на вход любой URL или текст плюс ваша JSON Schema, на выходе соответствующий ей JSON.
- **Пакетные задачи** — запуск инструментов скрейпинга и парсинга по множеству URL в фоновом режиме: отправить, опросить, отменить.
- **Решение CAPTCHA, в том числе в *вашем* браузере** — любой тип, который поддерживает 2Captcha (reCAPTCHA, Turnstile, hCaptcha, DataDome, картинки, …). `detect_captcha` определяет тип защиты на странице, которую вы уже открыли в Playwright MCP, browser-use или расширении — бесплатно, по HTML, который вы передали, — а `solve_captcha_on_page` решает её и возвращает готовый JavaScript или куку для применения **в вашей собственной сессии**. Ничего никуда переносить не нужно.
- **Логины в браузере** — опционально. Войти на сайт, форма входа которого закрыта капчей, в управляемом браузере и сохранить сессию.

Два варианта развёртывания: **хостинговый удалённый сервер** (один URL, без установки) или **локальный экземпляр** через `npx @2captcha/mcp`.

---

## Бесплатный лимит: что входит

Регистрация в 2Captcha бесплатна, и вместе с аккаунтом вы получаете месячный лимит на этом сервере:
**200 вызовов или $0.50 измеренных трат за 30 дней**, что наступит раньше, на **всю** поверхность
инструментов — скрейпинг, парсинг маркетплейсов, структурированное извлечение, пакетные задачи,
браузерные инструменты и решение CAPTCHA. Без карты, без отдельного тарифа, без урезания функций.

Окно скользящее, а не календарное, поэтому ёмкость возвращается непрерывно, а не сбрасывается
у всех первого числа.

Лимит считается **на аккаунт**, поэтому и нужен токен: идентичность — это то, на что он
списывается. Анонимного режима нет: IP-адрес не является идентичностью, и бесплатный тариф,
привязанный к нему, — это бесплатный тариф, привязанный к пулу прокси.

`get_account` показывает остаток, чтобы агент планировал работу с учётом лимита, а не обнаруживал
его как ошибку на середине задачи:

```json
{"tenant": "2captcha:8f14e45fceea167a",
 "free_tier": {"allowance": {"max_calls": 200, "calls": 12, "remaining_calls": 188,
                             "max_spend_usd": 0.5, "remaining_spend_usd": 0.4871,
                             "window_hours": 720}}}
```

Больше ничего на этом сервере не тарифицируется повызовно: решения CAPTCHA списываются с вашего
баланса 2Captcha, как и раньше, а `include_meta: true` показывает, во что реально обошёлся вызов.
Когда лимит исчерпан, вызовы отклоняются до пополнения окна — в сообщении об этом сказано, как и
то, что оператор может лимит поднять. Нужно больше? Обратитесь к оператору; на хостинговом сервисе
это [поддержка 2Captcha](https://2captcha.com/support).

---

## Быстрый старт

### Хостинговый сервер — без установки

Добавьте URL в MCP-клиент вместе с заголовком `Authorization`:

```
URL:       https://mcp.2captcha.com/mcp
Заголовок: Authorization: Bearer YOUR_API_TOKEN
```

Токен — это ваш **API-ключ 2Captcha** ([настройки аккаунта](https://2captcha.com/setting)) либо
bearer-токен, выданный оператором сервера. Регистрация бесплатна и сразу даёт
[месячный лимит](#бесплатный-лимит-что-входит).

### Локальный сервер через npx

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": {
        "API_TOKEN": "<ваш-api-токен>"
      }
    }
  }
}
```

Локальный сервер зеркалит ту же поверхность инструментов по stdio — используйте его с клиентами,
которые не умеют отправлять заголовки авторизации или запускают только локальные MCP-серверы.

---

## Установка

Всем клиентам ниже нужно одно и то же: команда `npx @2captcha/mcp` с `API_TOKEN` в окружении —
или, если клиент говорит по HTTP, хостинговый URL плюс заголовок `Authorization: Bearer`.
Токен берётся на [2captcha.com/setting](https://2captcha.com/setting); регистрация бесплатна и
приносит [месячный лимит](#бесплатный-лимит-что-входит).

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport http 2captcha https://mcp.2captcha.com/mcp \
  --header "Authorization: Bearer YOUR_API_TOKEN"
```

Или локально:

```bash
claude mcp add 2captcha -e API_TOKEN=YOUR_API_TOKEN -- npx @2captcha/mcp
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

**В один клик:** скачайте `2captcha-mcp-<версия>.mcpb` из
[последнего релиза](https://github.com/2captcha/2captcha-mcp/releases/latest) и откройте файл.
Claude Desktop установит его как расширение и спросит API-токен — без Node, без npx, без
конфигурационных файлов.

**Или вручную:** отредактируйте конфиг (macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`) и перезапустите приложение:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

Добавьте в `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>Codex CLI</b></summary>

```bash
codex mcp add 2captcha --env API_TOKEN=YOUR_API_TOKEN -- npx @2captcha/mcp
```

Или вручную в `~/.codex/config.toml`:

```toml
[mcp_servers.2captcha]
command = "npx"
args = ["@2captcha/mcp"]
env = { API_TOKEN = "YOUR_API_TOKEN" }
```

</details>

<details>
<summary><b>VS Code (GitHub Copilot)</b></summary>

Добавьте в `.vscode/mcp.json`:

```json
{
  "servers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>MCP Inspector (изучить инструменты вручную)</b></summary>

```bash
API_TOKEN=YOUR_API_TOKEN npx @modelcontextprotocol/inspector npx @2captcha/mcp
```

Либо подключите Inspector напрямую к `https://mcp.2captcha.com/mcp` (транспорт **Streamable HTTP**, заголовок `Authorization: Bearer YOUR_API_TOKEN`).

</details>

<details>
<summary><b>Windsurf</b></summary>

Добавьте в `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>Zed</b></summary>

Добавьте в `settings.json` (`cmd`/`ctrl` + `,`):

```json
{
  "context_servers": {
    "2captcha": {
      "source": "custom",
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>Warp</b></summary>

**Settings → AI → Manage MCP servers → + Add**, затем вставьте:

```json
{
  "2captcha": {
    "command": "npx",
    "args": ["@2captcha/mcp"],
    "env": { "API_TOKEN": "YOUR_API_TOKEN" },
    "start_on_launch": true
  }
}
```

</details>

<details>
<summary><b>Gemini CLI</b></summary>

Добавьте в `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>Continue</b></summary>

Добавьте в `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: 2captcha
    command: npx
    args:
      - "@2captcha/mcp"
    env:
      API_TOKEN: YOUR_API_TOKEN
```

</details>

<details>
<summary><b>LM Studio</b></summary>

**Program → Install → Edit mcp.json**:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" }
    }
  }
}
```

</details>

<details>
<summary><b>Cline / Roo Code</b></summary>

**MCP Servers → Configure → Edit** `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": { "API_TOKEN": "YOUR_API_TOKEN" },
      "disabled": false
    }
  }
}
```

</details>

<details>
<summary><b>Goose</b></summary>

```bash
goose session --with-extension "npx @2captcha/mcp"
```

Либо на постоянной основе: `goose configure` → **Add Extension** → **Command-line Extension**,
команда `npx @2captcha/mcp`, переменная окружения `API_TOKEN`.

</details>

<details>
<summary><b>n8n</b></summary>

Используйте ноду **MCP Client Tool** с хостинговым сервером — локальный процесс не нужен:

```
Endpoint:       https://mcp.2captcha.com/mcp
Transport:      HTTP Streamable
Authentication: Header Auth
Header name:    Authorization
Header value:   Bearer YOUR_API_TOKEN
```

Для сценариев скрейпинга достаточно группы `parsing`; как урезать поверхность, которую видит
агент, — см. [Выбор инструментов](#выбор-инструментов-группы).

</details>

<details>
<summary><b>Любой другой MCP-клиент</b></summary>

Это обычный stdio MCP-сервер, поэтому подойдёт всё, что умеет запускать команду:

```
command: npx
args:    ["@2captcha/mcp"]
env:     API_TOKEN=YOUR_API_TOKEN
```

Клиенты, которые умеют Streamable HTTP, могут обойтись без процесса вообще и работать с
`https://mcp.2captcha.com/mcp` по заголовку `Authorization: Bearer`.

</details>

### Попробуйте

Попросите агента:

> Спарси https://www.wildberries.ru/catalog/0/search.aspx?search=coffee как результаты поиска и покажи пять самых дешёвых позиций.

> Собери https://news.ycombinator.com и сделай выжимку по топовым новостям.

> Какой у меня баланс 2Captcha?

---

## Выбор инструментов: группы

По умолчанию сервер отдаёт группы **parsing, batch и captcha** (17 инструментов). Браузерные группы подключаются явно: это единственная часть поверхности, которая стоит клиенту реального контекста на каждом ходу, а большинство задач её не касаются.

Измеренная стоимость каждой группы — это определения инструментов, которые клиент кладёт в каждый
запрос (имя + описание + JSON Schema, tiktoken `o200k_base`; пересчитывается скриптом
`benchmarks/scripts/tool_surface_tokens.py` из репозитория сервиса):

| Группа | Инструментов | Токенов |
|---|---:|---:|
| `parsing` | 7 | 3 936 |
| `batch` | 4 | 1 759 |
| `captcha` | 6 | 2 180 |
| **по умолчанию (три выше)** | **17** | **7 875** |
| `browser` | 11 | +2 842 |
| `browser_full` | 23 | +5 201 |
| `all` | 40 | 13 076 |

| Группа | Инструменты | Для чего |
|---|---|---|
| `parsing` | `scrape_page`, `search_web`, `discover_urls`, `discover_search_params`, `parse_marketplace`, `extract`, `get_account` | Искать в вебе, собирать страницы, находить URL сайта и его параметры поиска, парсить маркетплейсы, извлекать структурированный JSON |
| `batch` | `scrape_pages`, `parse_pages`, `get_job`, `cancel_job` | Те же инструменты парсинга по множеству URL в виде фоновых задач |
| `captcha` | `list_captcha_types`, `solve_captcha`, `detect_captcha`, `solve_captcha_on_page`, `captcha_report`, `captcha_balance` | Решать любой тип CAPTCHA, который поддерживает 2Captcha — включая капчу на странице в **вашем собственном** браузере |
| `browser` | 11 инструментов `browser_*` | Войти на сайт за капчей в управляемом браузере и сохранить сессию |
| `browser_full` | все 23 инструмента `browser_*` | Полная поверхность в стиле Playwright, когда она действительно нужна именно здесь |
| `all` | всё, что объявляет сервер | Без фильтрации — включая инструменты, добавленные на сервере в будущем |

**Почему `captcha` включена по умолчанию, а `browser` — нет.** `detect_captcha` и
`solve_captcha_on_page` работают с HTML из того браузера, который вы *уже* ведёте, поэтому они
полезны клиенту, который никогда не откроет наш, — а это типичный случай. См.
[Работа в вашем браузере](#работа-в-вашем-браузере-рекомендуется).

### Примеры конфигурации

```json
{
  "mcpServers": {
    "2captcha": {
      "command": "npx",
      "args": ["@2captcha/mcp"],
      "env": {
        "API_TOKEN": "YOUR_API_TOKEN",
        "GROUPS": "parsing,browser"
      }
    }
  }
}
```

Отдельные инструменты, без групп:

```json
"env": {
  "API_TOKEN": "YOUR_API_TOKEN",
  "TOOLS": "scrape_page,solve_captcha"
}
```

`GROUPS` и `TOOLS` складываются (объединение). Итоговая доступность инструмента — всегда решение сервера: группа, указанная здесь, лишь фильтрует то, что сервер реально объявляет.

---

## Справочник инструментов (40 инструментов)

### Какой инструмент выбрать

- **Ищете страницы для сбора?** → `search_web` (запрос → ранжированные URL)
- **Нужно просто содержимое страницы?** → `scrape_page` (без LLM, самый дешёвый)
- **Нужен список URL перед пакетной обработкой?** → `discover_urls` (robots.txt + карты сайта, без обхода)
- **Строите поисковый URL для сайта?** → `discover_search_params` (его реальные имена параметров, а не догадка)
- **Карточка или выдача → JSON?** → `parse_marketplace` (сначала детерминированные тиры, LLM как запасной вариант)
- **Своя схема с любой страницы или текста?** → `extract` (всегда один вызов LLM либо кеш)
- **Много URL?** → `scrape_pages` / `parse_pages` + `get_job`
- **Наткнулись на капчу в своём браузере?** → `detect_captcha` (бесплатно), затем `solve_captcha_on_page`
- **Нужен токен капчи для своей автоматизации?** → `list_captcha_types`, затем `solve_captcha`
- **Войти за капчей и сохранить сессию?** → `GROUPS=browser`, затем `browser_navigate` → `browser_fill` → `browser_click` → `browser_save_session`

### Парсинг

| Инструмент | Описание | Тратит деньги? |
|---|---|---|
| `scrape_page` | Получить страницу и вернуть читаемое содержимое как markdown (или сырой HTML с `clean=false`). Опции: `render`, `keep_links`, `structured_data`, `country`, окно `max_chars`/`offset`, кеширование `freshness_seconds` на вызов. | только прокси/браузер |
| `search_web` | Найти URL по запросу: ранжированная органика с заголовком, url и сниппетом. Опции: `count`, `country`, `engine`. | без LLM |
| `discover_urls` | Перечислить URL, которые сайт публикует в robots.txt и XML-картах сайта — проверяемый список для `scrape_pages`/`parse_pages`, с фильтрами `pattern`/`prefix`. Это не краулер. | без LLM |
| `discover_search_params` | Реальные параметры поиска сайта, считанные с одной страницы: параметры запроса, которые использует он сам (со значениями, которые точно работают), плюс контролы из `<form>`. Используйте вместо угадывания URL поиска. | без LLM |
| `parse_marketplace` | Карточка товара (`target="product"`) или выдача (`target="search_results"`) → структурированный JSON. `schema` — своя форма данных, `include_offers` — данные Buy-Box Amazon, `include_meta` — метаданные о стоимости и происхождении. | LLM только когда детерминированные тиры не сработали |
| `extract` | Любой URL или текст + ваша JSON Schema → извлечённый JSON. `instructions` направляет извлечение. | всегда один вызов LLM (или кеш) |
| `get_account` | Идентичность тенанта, доступные возможности, счётчики трат за сессию. | нет |

### Пакетные задачи

| Инструмент | Описание |
|---|---|
| `scrape_pages` / `parse_pages` | Инструменты выше по множеству URL; сразу возвращают `job_id` (или ждут до `wait_seconds`). |
| `get_job` | Опросить статус и забрать результаты по мере готовности. |
| `cancel_job` | Остановить задачу (и прекратить траты). |

### Работа в вашем браузере (рекомендуется)

Если у вас уже есть браузер — Playwright MCP, browser-use, расширение Chrome, собственный скрипт на
Playwright — **оставьте его** и используйте эти два инструмента для той части, где нужен аккаунт
солвера:

```
ваш браузер упёрся в стену
  -> browser_get_html / page.content()       ваша сессия, ваш IP
  -> detect_captcha(url, html=...)           бесплатно: «recaptcha, sitekey 6Lc…, решаемо»
  -> solve_captcha_on_page(url, html=...)    одно решение
  -> выполнить apply.javascript на странице  вернёт 'callback' / 'submit' / 'set'
```

`apply.javascript` — это законченное выражение с уже подставленным токеном, тот же инжектор,
который использует собственный render-тир сервиса, — поэтому оно ложится прямо в `page.evaluate`,
консоль devtools или любой инструмент запуска JS. Когда ответ приходит кукой (DataDome, AWS WAF),
вы получаете разобранную куку и инструкцию повторить запрос, а не перезагружать страницу.

Два важных момента. Передавайте `html` из **вашего** браузера: анти-бот стены поднимаются под
конкретного клиента, и с нашего адреса страница выглядит иначе, чем с вашего. А для DataDome или
CaptchaFox передавайте свои `proxy` и `user_agent`: такие ответы выпускаются под ту идентичность,
которая их решила, поэтому решённое от нашего имени будет отклонено в вашей сессии, даже если
технически оно верное.

### Логины в браузере (`GROUPS=browser`, 11 инструментов)

Управляемый браузер не пытается переиграть Playwright. Та поверхность бесплатна и у вас, скорее
всего, уже есть, а здесь **одна живая страница на аккаунт**, так что для параллельных задач это
неподходящий инструмент. Чего в обычном браузере нет — так это решения капчи прямо в форме входа и
возможности сохранить куки после. Ровно на это группа и рассчитана, за **2 842 токена вместо
5 201**:

| Категория | Инструменты |
|---|---|
| Навигация и действия | `browser_navigate`, `browser_click`, `browser_fill`, `browser_type`, `browser_press_key` |
| Чтение | `browser_snapshot` (дерево доступности с `ref` элементов), `browser_get_text`, `browser_get_html` |
| Сессии | `browser_save_session`, `browser_load_session`, `browser_list_sessions` |

`GROUPS=browser_full` даёт полную поверхность из 23 инструментов — добавляются история
(`browser_go_back`, `browser_go_forward`, `browser_reload`), `browser_scroll`,
`browser_select_option`, `browser_hover`, `browser_drag`, `browser_console_messages`,
`browser_evaluate`, `browser_snapshot_items`, `browser_screenshot` и `browser_save_as_pdf`.

### CAPTCHA

| Инструмент | Описание | Тратит деньги? |
|---|---|---|
| `list_captcha_types` | Каталог решаемых типов с обязательными параметрами — вызывайте перед `solve_captcha`, вместо того чтобы угадывать. | нет |
| `solve_captcha` | Решить CAPTCHA любого поддерживаемого типа; возвращает токен/ответ, `captcha_id` и стоимость. | **да — одно решение на вызов** |
| `detect_captcha` | Определить защиту на странице — тип виджета, sitekey, можно ли построить решаемую задачу, и точный вызов `solve_captcha` для неё. Передавайте `html` из своего браузера. Никогда не решает. | нет (бесплатно с `html`) |
| `solve_captcha_on_page` | Определить и решить за один шаг и вернуть блок `apply`: самодостаточное JS-выражение для `evaluate` либо куку и URL для повторного запроса. | **да — одно решение на вызов** |
| `captcha_report` | Пометить решение как верное/неверное (неверные возвращают деньги). | нет |
| `captcha_balance` | Текущий баланс в USD. | нет |

### Локальные

| Инструмент | Описание |
|---|---|
| `session_stats` | Использование инструментов в этой сессии (вызовов на инструмент, окно рейт-лимита). Обрабатывается локально, бесплатно. |

---

## Конфигурация

### Переменные окружения

| Переменная | Обязательна | По умолчанию | Описание |
|---|---|---|---|
| `API_TOKEN` | **да** | — | Ваш API-ключ 2Captcha либо bearer-токен, выданный оператором сервера. Регистрация бесплатна и включает [месячный лимит](#бесплатный-лимит-что-входит) |
| `GROUPS` | нет | `parsing,batch,captcha` | Группы инструментов через запятую (см. выше): `browser` добавляет 11 логин-инструментов, `browser_full` — все 23, `all` отключает фильтрацию |
| `TOOLS` | нет | — | Имена отдельных инструментов через запятую |
| `MCP_URL` | нет | `https://mcp.2captcha.com/mcp` | Удалённый MCP-эндпоинт — задайте для self-hosted сервера |
| `POLLING_TIMEOUT` | нет | `600` | Таймаут на вызов инструмента в секундах (рендеры, пакетные задачи и решения CAPTCHA могут занимать минуты) |
| `RATE_LIMIT` | нет | — | Клиентский ограничитель вызовов, например `100/1h` или `50/30m` |
| `MAX_SPEND_USD` | нет | — | Лимит трат по стоимости, которую сообщает сам вызов: `5` на всю сессию или `5/1h` на скользящее окно |
| `MAX_CONCURRENCY` | нет | — | Сколько вызовов инструментов может выполняться одновременно. Без него агент, разворачивающийся по списку URL, откроет по соединению на URL |
| `CACHE_DIR` | нет | системный кеш | Где хранится офлайн-кеш списка инструментов |

`MAX_SPEND_USD` — тот лимит, который стоит выставить, если выставлять только один. Лимит по числу вызовов ограничивает не ту величину: один `parse_pages` на 500 URL дороже сотни `scrape_page`. То есть `RATE_LIMIT` защищает от зациклившегося агента, а `MAX_SPEND_USD` — от счёта. Стоимость вызова известна только после ответа сервера, поэтому лимит проверяется по уже потраченному: он ограничивает перерасход одним вызовом, а не притворяется точным.

### Командная строка

```bash
npx @2captcha/mcp --version
npx @2captcha/mcp --help      # все переменные выше, со значениями по умолчанию
```

---

## Что уходит с вашей машины

Это лучше закрыть до того, как пакет попадёт на ревью безопасности, потому что честный ответ — «больше, чем локальный инструмент, и меньше, чем браузерное расширение».

**Куда уходит.** В одно место: `MCP_URL` — это `https://mcp.2captcha.com/mcp`, если вы не указали свой сервер. Ни телеметрии, ни аналитики, ни третьих сторон. Мост не открывает ни одного порта на приём.

**Что уходит вместе с вызовом.** Аргументы этого вызова, дословно — мост их не разбирает и не логирует. Для `scrape_page` это URL. Для `detect_captcha` и `solve_captcha_on_page` это **HTML страницы, который вы передали сами** — а HTML, снятый с залогиненной сессии, содержит всё, что содержит залогиненная страница. Для `extract` — ваша схема и текст, если вы передали его напрямую.

**API-токен** уходит на `MCP_URL` как bearer-токен и больше никуда. На диск этот пакет его не пишет никогда.

**Что хранят браузерные группы.** `browser` и `browser_full` управляют браузером *на сервере*, и `browser_save_session` намеренно сохраняет его куки на стороне сервера, чтобы следующий запуск не проходил логин заново. Это и есть функция — и это же то, о чём стоит подумать дольше всего: сохранённая сессия является живым доступом к тому сайту, и хранится он у нас. `browser_list_sessions` показывает, что сохранено. **Обе группы включаются вручную и по умолчанию выключены.**

Страничные CAPTCHA-инструменты — `detect_captcha` и `solve_captcha_on_page`, оба включены по умолчанию — существуют в том числе чтобы этого избежать: они читают HTML из *вашего* браузера и возвращают JavaScript или куку для применения в *вашей* сессии, так что сессия никуда не переезжает.

**Что остаётся на машине.** Один файл — офлайн-кеш списка инструментов: имена инструментов и JSON-схемы, с ключом по эндпоинту, в `CACHE_DIR` (по умолчанию `~/Library/Caches/2captcha-mcp` на macOS, `$XDG_CACHE_HOME/2captcha-mcp` на Linux, `%LOCALAPPDATA%\2captcha-mcp` на Windows). Ни аргументов, ни результатов, ни учётных данных. Удаление стоит одного сетевого запроса при следующем старте.

**Хранение и удаление.** Данные запросов хранятся на сервере согласно [политике конфиденциальности 2Captcha](https://2captcha.com/privacy-policy). Чтобы убрать сохранённую браузерную сессию — загрузите её и очистите либо напишите на support@2captcha.com. Чтобы удалить всё локальное — удалите каталог кеша; чтобы отозвать доступ — смените ключ на [2captcha.com/setting](https://2captcha.com/setting).

---

## Как это работает

Этот пакет — тонкий stdio-мост к удалённому сервису: схемы инструментов читаются с сервера живьём и держатся 60 секунд, поэтому пакет никогда не расходится с развёрнутой поверхностью, а новые серверные инструменты появляются автоматически при `GROUPS=all`. Вызовы пробрасываются дословно — включая `structuredContent`, изображения (скриншоты) и ошибки инструментов — с автоматическим переподключением, если связь оборвалась посреди сессии, и с повторами по экспоненциальной задержке на `429` и `5xx` с учётом `Retry-After`.

**Он стартует независимо от того, стартовала ли сеть.** Список инструментов кешируется на диск, поэтому ноутбук, проснувшийся без Wi-Fi, всё равно регистрирует рабочий сервер и восстанавливает инструменты уведомлением, как только связь появится, — вместо того чтобы клиент пометил сервер сломанным до ручного перезапуска. Единственный отказ, на котором он по-прежнему не стартует, — отклонённый токен: этот сам собой не пройдёт.

Стоимость считается на сервере по вашему токену: скрейпинг тратит ресурсы прокси и браузера, `solve_captcha` — одно решение за вызов, а LLM-извлечение в `parse_marketplace`/`extract` списывается с вашего собственного ключа LLM, если он у вас привязан (BYOK), иначе с серверного по умолчанию. Передайте `include_meta: true` в инструменты парсинга, чтобы увидеть, во что обошёлся конкретный вызов, — этот сервис единственный сообщает цену вызова самому агенту, который его сделал, а не только в дашборде постфактум.

[Бесплатный лимит](#бесплатный-лимит-что-входит) работает на том же счётчике, привязан к вашему аккаунту и его собственному 30-дневному окну — поэтому `get_account` и может точно сказать, сколько вызовов и трат у вас осталось.

---

## Устранение неполадок

### «Cannot run without the API_TOKEN env»

Задайте `API_TOKEN` в блоке `env` конфигурации клиента — это ваш API-ключ 2Captcha
([настройки аккаунта](https://2captcha.com/setting)). Бесплатный лимит считается на аккаунт,
поэтому токен обязателен; регистрация бесплатна.

### «Authentication to … failed»

Сервер отклонил токен. Проверьте пробелы и уточните, какой именно токен принимает ваш сервер
(API-ключ 2Captcha или токен, выданный оператором).

### «has used N of N calls allowed per 720h»

[Месячный лимит](#бесплатный-лимит-что-входит) аккаунта исчерпан. Окно скользящее, поэтому ёмкость
возвращается по мере устаревания старых вызовов; `get_account` показывает остаток и когда он
появится. На self-hosted сервере оператор поднимает `WEBPARSE_FREE_TIER_MAX_CALLS` /
`WEBPARSE_FREE_TIER_MAX_SPEND_USD` или снимает лимит с аккаунта целиком.

### «is outside this server's allowance, which covers: …»

Оператор сузил лимит до подмножества инструментов (`WEBPARSE_FREE_TIER_TOOLS`). Это ограничение
уровня сервера, другой токен его не снимает — попросите оператора расширить список.
`get_account` покажет, какие инструменты доступны вашему аккаунту.

### «spawn npx ENOENT»

MCP-клиент не находит Node. Установите [Node.js ≥ 18](https://nodejs.org) и убедитесь, что `npx`
есть в том PATH, который видит клиент (для GUI-приложений на macOS укажите абсолютный путь к
`npx`). Для Claude Desktop эта проблема снимается
[бандлом `.mcpb`](https://github.com/2captcha/2captcha-mcp/releases/latest) — он приносит всё с
собой.

### Таймауты на сложных сайтах

Страницы, которые заставляют пройти всю лестницу (управляемый браузер + решение CAPTCHA), могут
занимать минуты. Увеличьте `POLLING_TIMEOUT` (в секундах), а для множества URL используйте
`scrape_pages`/`parse_pages`, чтобы ожидание происходило на сервере.

### Нужного инструмента нет

По умолчанию доступны `parsing,batch,captcha`. Для браузерного инструмента задайте
`GROUPS=browser` (11 логин-инструментов) или `GROUPS=browser_full` (все 23); `GROUPS=all`
отключает фильтрацию совсем. Если инструмент всё равно отсутствует — он отключён на самом сервере
либо оператор сузил лимит до подмножества инструментов (`get_account` это покажет).

---

## Лицензия

MIT — © 2Captcha. См. [LICENSE](./LICENSE).
