"""Exercise Notes with an isolated browser profile (requires Python Playwright).

python website/scripts/check-studio-notes.py --browser /path/to/chromium
Optional --screenshots DIR writes desktop and mobile review images.
"""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright, expect

SITE = Path(__file__).resolve().parent.parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run(browser_path, screenshots):
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(SITE)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    if screenshots:
        screenshots.mkdir(parents=True, exist_ok=True)
    checks = []
    try:
        with sync_playwright() as p:
            kwargs = {"args": ["--enable-unsafe-swiftshader"]}
            if browser_path:
                kwargs["executable_path"] = browser_path
            browser = p.chromium.launch(**kwargs)
            context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(origin + "/studio.html")
            expect(page.locator("#studio-notes")).to_be_hidden()
            page.evaluate("""() => new Promise((resolve, reject) => {
              const request = indexedDB.open('elyvris-notes', 1);
              request.onupgradeneeded = () => request.result.createObjectStore('notes', {keyPath:'id'});
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db=request.result, tx=db.transaction('notes','readwrite');
                tx.objectStore('notes').put({id:'legacy-note',title:'Existing notebook',created:1,updated:1,
                  blocks:[{id:'legacy-text',type:'text',text:'Preserve this existing note.'}]});
                tx.oncomplete=()=>{db.close();resolve();};
              };
            })""")
            page.locator("#notes-open").click()
            panel = page.locator("#studio-notes")
            frame = page.frame_locator("#notes-frame")
            expect(frame.get_by_text("Existing notebook", exact=True)).to_be_visible()
            frame.get_by_text("Existing notebook", exact=True).click()
            expect(frame.get_by_role("textbox", name="Text", exact=True)).to_have_value("Preserve this existing note.")
            checks.append("Existing IndexedDB notes remain readable")
            frame.locator("#note-back").click()
            frame.locator("#note-new").click()
            frame.locator("#note-title").fill("Fabrication test")
            frame.get_by_role("textbox", name="Text", exact=True).fill("Check minimum feature size before simulation. λ = 532 nm.")
            # Close before the debounce expires, then reopen without losing edits.
            page.locator("#notes-close").click()
            expect(panel).to_be_hidden()
            page.locator("#notes-open").click()
            expect(frame.get_by_role("textbox", name="Text", exact=True)).to_have_value("Check minimum feature size before simulation. λ = 532 nm.")
            expect(frame.locator("#note-status")).to_have_text("Saved in this browser")
            checks.append("Close/reopen keeps unsaved text and flushes it to IndexedDB")

            handle = page.locator("#notes-handle")
            before = panel.bounding_box()
            h = handle.bounding_box()
            page.mouse.move(h["x"] + 60, h["y"] + 20)
            page.mouse.down()
            page.mouse.move(h["x"] - 180, h["y"] + 100, steps=12)
            page.mouse.up()
            after = panel.bounding_box()
            assert after["x"] < before["x"] - 100 and after["y"] > before["y"] + 40
            handle.focus()
            handle.press("ArrowLeft")
            assert panel.bounding_box()["x"] < after["x"]
            assert after["width"] <= 460 and after["height"] <= 500
            checks.append("Compact panel moves by dragging and keyboard")

            frame.locator('[data-add="calc"]').click()
            frame.get_by_role("textbox", name="Calculation, one line at a time").fill("feature = 120\nfeature / 2")
            expect(frame.locator(".calc-out")).to_contain_text("= 60")
            with page.expect_download() as download:
                frame.locator("#note-save-text").click()
            txt = download.value
            assert txt.suggested_filename.endswith(".txt")
            text = Path(txt.path()).read_text(encoding="utf-8")
            assert "λ = 532 nm" in text and "feature / 2" in text and "= 60" in text
            checks.append("TXT download contains Unicode text and calculation results")

            frame.locator('[data-add="drawing"]').click()
            canvas = frame.locator(".draw-canvas")
            canvas.scroll_into_view_if_needed()
            box = canvas.bounding_box()
            page.mouse.move(box["x"] + 30, box["y"] + 35)
            page.mouse.down()
            page.mouse.move(box["x"] + 160, box["y"] + 95, steps=20)
            page.mouse.up()
            drawing = frame.locator(".block").filter(has=frame.locator(".draw-canvas"))
            expect(drawing.get_by_role("button", name="Undo", exact=True)).to_be_enabled()
            drawing.get_by_role("button", name="Undo", exact=True).click()
            expect(drawing.get_by_role("button", name="Redo", exact=True)).to_be_enabled()
            drawing.get_by_role("button", name="Redo", exact=True).click()
            drawing.get_by_role("combobox", name="Paper", exact=True).select_option("grid")
            with page.expect_download() as download:
                drawing.get_by_role("button", name="Save PNG", exact=True).click()
            png = download.value
            png_bytes = Path(png.path()).read_bytes()
            assert png.suggested_filename.endswith(".png") and png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
            assert len(png_bytes) > 5000
            checks.append("Drawing, undo/redo, paper selection and PNG export work")

            # The PNG just exported is also a real fixture for the retained image tool.
            frame.locator("#image-pick").set_input_files({"name":"drawing.png", "mimeType":"image/png", "buffer":png_bytes})
            expect(frame.locator(".img-shown")).to_be_visible()
            frame.get_by_role("textbox", name="Caption", exact=True).fill("Design sketch")
            frame.locator("#note-back").click()
            with page.expect_download() as download:
                frame.locator("#notes-export").click()
            backup = json.loads(Path(download.value.path()).read_text(encoding="utf-8"))
            assert len(backup["notes"]) == 2
            note = next(n for n in backup["notes"] if n["title"] == "Fabrication test")
            assert {b["type"] for b in note["blocks"]} == {"text", "calc", "drawing", "image"}
            assert next(b for b in note["blocks"] if b["type"] == "drawing")["strokes"]
            checks.append("Images and JSON backups preserve all note content")

            page.reload()
            page.locator("#notes-open").click()
            frame.get_by_text("Fabrication test", exact=True).click()
            expect(frame.locator("#note-title")).to_have_value("Fabrication test")
            expect(frame.locator(".draw-canvas")).to_have_count(1)
            expect(frame.locator(".img-shown")).to_have_count(1)
            if screenshots:
                frame.locator("#note-title").scroll_into_view_if_needed()
                page.screenshot(path=str(screenshots / "studio-notes-desktop.png"))
            checks.append("Reload preserves written notes, drawings and images")

            page.set_viewport_size({"width":390,"height":844})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile page overflows horizontally"
            for selector in ("#notes-open", "#start-fab", 'nav[aria-label="Main navigation"]'):
                header_bounds = page.locator(selector).bounding_box()
                assert header_bounds["x"] >= 0 and header_bounds["x"] + header_bounds["width"] <= 390
            bounds = panel.bounding_box()
            assert 0 <= bounds["x"] and bounds["x"] + bounds["width"] <= 390
            assert 0 <= bounds["y"] and bounds["y"] + bounds["height"] <= 844
            if screenshots:
                page.screenshot(path=str(screenshots / "studio-notes-mobile.png"))
            page.locator("#notes-close").click()
            expect(panel).to_be_hidden()
            checks.append("Mobile panel fits the viewport and closes")

            page.set_viewport_size({"width":1440,"height":1000})
            page.evaluate("navigator.serviceWorker.ready")
            page.wait_for_function("navigator.serviceWorker.controller !== null")
            context.set_offline(True)
            page.reload()
            page.locator("#notes-open").click()
            frame.get_by_text("Fabrication test", exact=True).click()
            expect(frame.locator("#note-title")).to_have_value("Fabrication test")
            checks.append("Studio Notes and saved content open offline")
            context.set_offline(False)
            page.goto(origin + "/notes.html")
            page.wait_for_url("**/studio.html#notes")
            expect(panel).to_be_visible()
            checks.append("Old Notes bookmarks open the floating Studio notebook")
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
    print(json.dumps({"status":"passed", "checks":checks}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", help="Existing Chromium executable (otherwise Playwright default)")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    run(args.browser, args.screenshots)
