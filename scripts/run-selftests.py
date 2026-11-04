#!/usr/bin/env python3
"""Runs Prism's built-in self-tests (the same ones as the Run self-tests button) in headless Chrome and prints the result.

    python3 scripts/run-selftests.py

Set CHROME to the browser binary if it is not found automatically. Exit code 0 means every test passed.
It writes _dbg.html next to index.html (ignored by git) with the tests wired to a start-up hook, then removes it.
"""
import html, os, pathlib, re, shutil, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "index.html").read_text(encoding="utf-8")
hook = "renderAll();\nupdateFreshLabel();\ndetectRoute();\n})();"
if hook not in src:
    sys.exit("The start-up lines at the end of index.html changed. Update `hook` in scripts/run-selftests.py to match.")
src = src.replace(hook, "window.__dbg={runSelfTests};\n" + hook)
probe = ("<script>window.addEventListener('load',function(){setTimeout(function(){var o;try{"
         "var r=window.__dbg.runSelfTests();var l=Array.isArray(r)?r:(r&&r.out)||[];"
         "var f=l.filter(function(x){return !x.pass});"
         "o=l.filter(function(x){return x.pass}).length+'/'+l.length+' pass'+(f.length?'\\nFAILED:\\n'+f.map(function(x){return ' - '+x.name+' => '+x.got}).join('\\n'):'')"
         "}catch(e){o='ERROR '+e.message}"
         "var p=document.createElement('pre');p.id='out';p.textContent=o;document.body.appendChild(p)},500)})</script>")
i = src.rindex("</body>")
page = root / "_dbg.html"
page.write_text(src[:i] + probe + src[i:], encoding="utf-8")

candidates = [os.environ.get("CHROME"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chromium-browser")]
chrome = next((c for c in candidates if c and os.path.exists(c)), None)
if not chrome:
    page.unlink(missing_ok=True)
    sys.exit("Chrome was not found. Set CHROME to its path.")
try:
    dom = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--virtual-time-budget=6000", "--dump-dom", page.as_uri()],
                         capture_output=True, text=True, timeout=120).stdout
finally:
    page.unlink(missing_ok=True)
m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
result = html.unescape(m.group(1)) if m else "No result: the page did not finish loading."
print(result)
sys.exit(0 if re.match(r"(\d+)/\1 pass$", result.split("\n")[0]) else 1)
