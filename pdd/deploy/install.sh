#!/usr/bin/env bash
# Устанавливает тренажёр ПДД на Linux-сервер как systemd-сервис на свободном порту.
# Запуск из корня репозитория:  sudo bash pdd/deploy/install.sh [порт]
# Повторный запуск обновляет файлы и перезапускает сервис на том же порту.
set -euo pipefail

APP=pdd-trainer
DEST=/opt/$APP
UNIT=/etc/systemd/system/$APP.service
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Запустите через sudo"; exit 1; }
[ -f "$SRC/index.html" ] && [ -d "$SRC/data" ] || { echo "Не найден сайт в $SRC"; exit 1; }
command -v python3 >/dev/null || {
  echo "Ставлю python3…"
  if command -v apt-get >/dev/null; then apt-get update -qq && apt-get install -y -qq python3
  elif command -v dnf >/dev/null; then dnf install -y -q python3
  elif command -v yum >/dev/null; then yum install -y -q python3
  elif command -v apk >/dev/null; then apk add --quiet python3
  else echo "Установите python3 вручную"; exit 1; fi
}

port_busy() {
  if command -v ss >/dev/null; then ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
  else python3 - "$1" <<'PY'
import socket, sys
s = socket.socket()
try:
    s.bind(("0.0.0.0", int(sys.argv[1])))
except OSError:
    sys.exit(0)
sys.exit(1)
PY
  fi
}

PORT="${1:-}"
if [ -z "$PORT" ] && [ -f "$UNIT" ]; then
  PORT="$(grep -oE -- '--port [0-9]+' "$UNIT" | awk '{print $2}' || true)"
  systemctl stop "$APP" 2>/dev/null || true
fi
if [ -z "$PORT" ]; then
  for p in 8080 8081 8088 8090 8181 8282 8383 8484 8585 8686 8787 8888 8989 9090; do
    if ! port_busy "$p"; then PORT=$p; break; fi
  done
fi
[ -n "$PORT" ] || { echo "Нет свободного порта в списке, укажите: sudo bash $0 9123"; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || { echo "Неверный порт: $PORT"; exit 1; }
if port_busy "$PORT"; then echo "Порт $PORT занят, укажите другой"; exit 1; fi

mkdir -p "$DEST/site"
rm -rf "$DEST/site.new"
mkdir -p "$DEST/site.new"
cp -r "$SRC/index.html" "$SRC/app.css" "$SRC/app.js" "$SRC/data" "$DEST/site.new/"
rm -rf "$DEST/site.old"
mv "$DEST/site" "$DEST/site.old"
mv "$DEST/site.new" "$DEST/site"
rm -rf "$DEST/site.old"

cat > "$DEST/server.py" <<'PY'
import argparse, functools, http.server, socketserver

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".json": "application/json; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                      ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8"}
    def end_headers(self):
        cache = "no-cache" if self.path.split("?")[0] in ("/", "/index.html", "/app.js", "/app.css") else "public, max-age=604800"
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()
    def log_message(self, *args):
        pass

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, required=True)
ap.add_argument("--dir", required=True)
a = ap.parse_args()
Server(("0.0.0.0", a.port), functools.partial(Handler, directory=a.dir)).serve_forever()
PY

id "$APP" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$APP" 2>/dev/null || useradd -r -s /sbin/nologin "$APP"
chown -R root:root "$DEST"
chmod -R a+rX "$DEST"

cat > "$UNIT" <<UNITEOF
[Unit]
Description=PDD tickets trainer (static site)
After=network.target

[Service]
User=$APP
ExecStart=$(command -v python3) $DEST/server.py --port $PORT --dir $DEST/site
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable --now "$APP" >/dev/null
systemctl restart "$APP"

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow "$PORT/tcp" >/dev/null; fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --quiet --permanent --add-port="$PORT/tcp" && firewall-cmd --quiet --reload
fi

for i in 1 2 3 4 5 6 7 8 9 10; do
  if python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:$PORT/data/ab/q.json', timeout=2).status == 200 else 1)" 2>/dev/null; then OK=1; break; fi
  sleep 1
done
[ "${OK:-0}" = 1 ] || { echo "Сервис не ответил. Лог: journalctl -u $APP -n 50"; exit 1; }

IP="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Готово. Тренажёр ПДД: http://${IP:-<IP-сервера>}:$PORT/"
echo "Статус: systemctl status $APP   Лог: journalctl -u $APP -f   Удалить: systemctl disable --now $APP && rm -rf $DEST $UNIT"
echo "Если не открывается снаружи — откройте порт $PORT/tcp в панели хостинга (Security Group / фаервол провайдера)."
