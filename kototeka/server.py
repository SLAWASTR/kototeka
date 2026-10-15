#!/usr/bin/env python3
import http.server
import socketserver
import socket
import webbrowser
import os
import sys

def get_local_ip():
    """Detects primary local IP address to access from phone on same Wi-Fi."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't even have to be reachable
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def run_server(port=8088):
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    local_ip = get_local_ip()

    Handler = http.server.SimpleHTTPRequestHandler
    # Enable range requests and correct mime types
    Handler.extensions_map.update({
        '.wasm': 'application/wasm',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json',
    })

    while port < 8150:
        try:
            with socketserver.TCPServer(("", port), Handler) as httpd:
                print("=" * 64)
                print("   🐾  КОТОТЕКА: Приложение для коллекционирования котиков  🐾")
                print("=" * 64)
                print(f"  💻 На компьютере:        http://localhost:{port}")
                print(f"  📱 На Android телефоне:  http://{local_ip}:{port}")
                print("=" * 64)
                print("  💡 Как установить на Android как нативное приложение:")
                print(f"     1. Откройте в Chrome на телефоне ссылку: http://{local_ip}:{port}")
                print("     2. Нажмите меню (три точки вверху) -> «Установить приложение»")
                print("        (или «Добавить на главный экран»)")
                print("     3. Приложение появится на рабочем столе с кошачьей иконкой!")
                print("=" * 64)
                print("  Для остановки сервера нажмите Ctrl + C")
                print()

                # Open browser automatically on mac
                try:
                    webbrowser.open(f"http://localhost:{port}")
                except Exception:
                    pass

                httpd.serve_forever()
                break
        except OSError as e:
            if e.errno == 48: # Address already in use
                port += 1
            else:
                raise e

if __name__ == '__main__':
    run_server()
