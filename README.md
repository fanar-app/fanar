# Fanar فنار

> See what your app is doing. Instantly.

Fanar is a free, open-source debug receiver for any language or runtime. Send any value — objects, errors, SQL queries, timers — and watch them appear in the desktop app in real time. No console.log archaeology. No paid seat licenses.

---

## Download

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | [fanar-darwin-arm64.zip](../../releases/latest) |
| macOS (Intel) | [fanar-darwin-amd64.zip](../../releases/latest) |
| Windows | [fanar-windows-amd64.exe](../../releases/latest) |
| Linux | [fanar-linux-amd64](../../releases/latest) |

Or via Homebrew:

```bash
brew install --cask fanar
```

---

## How it works

Fanar runs a local HTTP server on `localhost:23517`. Any language that can make an HTTP POST request can send payloads to it. Official clients handle the details — but you can also integrate directly with the raw API.

---

## Clients

### Node.js / TypeScript

```bash
npm install fanar
```

```js
import fanar from 'fanar'

fanar('hello')                              // log
fanar({ user, orders })                     // object with collapsible JSON tree
fanar(new Error('oops'))                    // exception with clickable stack frames
fanar.query(sql, { bindings, duration })    // SQL with syntax highlight
fanar.time('render').stop()                 // named timer
```

**NestJS — one import, everything automatic:**

```ts
import { FanarModule } from 'fanar/nestjs'

@Module({
  imports: [FanarModule.forRoot({ enabled: true })],
})
export class AppModule {}
```

Every request shows up as a summary (method, path, status, duration, query count). TypeORM and Prisma queries appear automatically too.

---

### PHP

```bash
composer require fanar/fanar
```

```php
use Fanar\Fanar;

Fanar::log('hello');
Fanar::dump(['user' => $user, 'orders' => $orders]);
Fanar::exception($e);
Fanar::query($sql, ['bindings' => $bindings, 'duration' => $duration]);
```

**Laravel — zero-config service provider:**

```php
// config/app.php
'providers' => [
    Fanar\Laravel\FanarServiceProvider::class,
],
```

All requests, queries, exceptions, and cache events appear automatically.

---

### Raw HTTP API

Any language can send payloads directly — no client library required.

```
POST http://localhost:23517/api/payloads
Content-Type: application/json
```

```json
{
  "id": "optional-unique-id",
  "requestId": "optional-group-id",
  "type": "log",
  "label": "my label",
  "color": "#4ade80",
  "content": "{\"any\": \"json value\"}",
  "origin": {
    "file": "app.py",
    "line": 42,
    "function": "handle_request"
  }
}
```

All fields except `type` are optional. Fanar generates `id` and `timestamp` if omitted.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Clear all payloads |
| `⌘F` / `Ctrl+F` | Focus search |
| `Space` | Pause / resume |

Clicking any file reference in an exception or query opens the exact line in VS Code.

---

## Building from source

Requires [Go 1.22+](https://go.dev) and [Wails v2](https://wails.io/docs/gettingstarted/installation).

```bash
make dev     # live development with hot reload
make build   # production build → build/bin/
make test    # run tests
```

On Linux, also install: `sudo apt install libwebkit2gtk-4.1-dev`

> **Note:** The system tray icon is not available on Linux. The app runs headlessly in the background; use the window directly.

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop framework | Wails v2 |
| HTTP receiver | `net/http` stdlib |
| Storage | `modernc.org/sqlite` (pure Go, no cgo) |
| Frontend | Vanilla JS + plain CSS |

---

## License

MIT
