"""Local helper for the layout-file check: lets the Studio page save the file it writes."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
TARGET = SITE / "scripts" / "gds-cases" / "design.gds"

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        targets = {"/save-reference": TARGET}
        targets.update({f"/save-icon/{name}": SITE / "assets" / "app" / name for name in ("icon-192.png", "icon-512.png", "icon-maskable-512.png")})
        if self.path not in targets or not 0 < length < 1_000_000:
            self.send_error(404)
            return
        targets[self.path].write_bytes(self.rfile.read(length))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(f"saved {length} bytes".encode())

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8769
    ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(SITE))).serve_forever()
