"""Run the Studio's browser checks and report whether they pass.
python run_browser_checks.py                           # then open the printed address in a browser
python run_browser_checks.py --browser google-chrome   # headless, as on GitHub Actions
"""
import argparse
import json
import subprocess
import sys
import tempfile
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
state = {"results": None, "progress": None, "last": None}
done = threading.Event()

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if self.path not in ("/check-results", "/check-progress") or not 0 < length < 1_000_000:
            self.send_error(404)
            return
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            body = None
        self.send_response(204)
        self.end_headers()
        state["last"] = time.monotonic()
        if self.path == "/check-progress":
            if isinstance(body, dict):
                state["progress"] = body
            return
        state["results"] = body if isinstance(body, dict) else {
            "passed": False, "results": [{"name": "report", "ok": False, "detail": "unreadable results"}]}
        done.set()

    def log_message(self, *args):
        pass  # keep the output to the results

def where(progress):
    """Where the page was in its last progress message, in words."""
    if not progress:
        return "the page never reported (the browser did not load it, or stopped at once)"
    finished = ", ".join(r.get("name", "?") for r in progress.get("results") or []) or "none"
    return f"it was running {progress.get('running') or '?'}; finished before that: {finished}"

def attempt(args, url):
    """Run the page once. Returns (results or None, why it stopped or None)."""
    done.clear()
    state.update(results=None, progress=None, last=None)
    start = time.monotonic()
    browser = None
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        if args.browser:
            browser = subprocess.Popen([args.browser, "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
                                        "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}", url],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            print("Open this address in a browser:", url, flush=True)
        stopped = None
        while not done.wait(1):
            now = time.monotonic()
            if now - start > args.timeout:
                stopped = f"no results after {args.timeout:.0f} s"
            # A browser started by this script must answer within --stall seconds, and keep answering.
            elif browser and now - (state["last"] or start) > args.stall:
                stopped = f"no message from the page for {args.stall:.0f} s"
            if stopped:
                stopped += f": {where(state['progress'])}"
                break
        if browser:
            browser.terminate()
            try:
                browser.wait(10)
            except subprocess.TimeoutExpired:
                browser.kill()
    return state["results"], stopped

def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--browser", help="a Chrome or Chromium command to run the page headless")
    parser.add_argument("--timeout", type=float, default=300, help="seconds to wait for the results of one run")
    parser.add_argument("--stall", type=float, default=60, help="with --browser: seconds without a message from the page before it is stopped")
    parser.add_argument("--attempts", type=int, default=2, help="with --browser: runs at most, when the browser stops or a check times out")
    args = parser.parse_args()
    # Results can hold characters such as → that a Windows console cannot print: they become ?.
    sys.stdout.reconfigure(errors="replace")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(SITE)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/scripts/run-browser-checks.html"

    attempts = max(1, args.attempts) if args.browser else 1
    for number in range(1, attempts + 1):
        started = time.monotonic()
        received, stopped = attempt(args, url)
        took = time.monotonic() - started
        timed_out = received and any(r.get("timeout") for r in received.get("results", []))
        if stopped:
            print(f"Run {number}: the browser stopped after {took:.0f} s ({stopped}).", flush=True)
        elif timed_out:
            for result in received.get("results", []):
                print(f"Run {number}: " + ("ok   " if result.get("ok") else "FAIL ") + f"{result.get('name')}: {result.get('detail')}")
        if (stopped or timed_out) and number < attempts:
            print(f"Starting run {number + 1} in a fresh browser.", flush=True)
            continue
        break
    server.shutdown()

    if stopped:
        print("SOME CHECKS FAILED: the page did not finish.")
        return 1
    for result in received.get("results", []):
        print(("ok   " if result.get("ok") else "FAIL ") + f"{result.get('name')}: {result.get('detail')}")
    if number > 1:
        print(f"(These are the results of run {number}: an earlier run stopped or timed out, see above.)")
    print(f"ALL PASSED in {took:.0f} s" if received.get("passed") else "SOME CHECKS FAILED")
    return 0 if received.get("passed") else 1

if __name__ == "__main__":
    sys.exit(main())
