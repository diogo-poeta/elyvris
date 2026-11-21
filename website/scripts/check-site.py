from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
root=Path(__file__).resolve().parent.parent
class Page(HTMLParser):
    def __init__(self,p):
        super().__init__(); self.path=p; self.ids=set(); self.links=[]; self.headings=0
        self.feed(p.read_text(encoding='utf-8'))
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids, f'Duplicate id {a["id"]} in {self.path.name}'
            self.ids.add(a['id'])
        if tag=='h1':self.headings+=1
        for attr in ['href','src']:
            if attr in a:self.links.append(a[attr])
pages={p.name:Page(p) for p in root.glob('*.html')}
SCRIPT_HEADINGS={'play.html'}
checked=0
for page in pages.values():
    expected=0 if page.path.name in SCRIPT_HEADINGS else 1
    assert page.headings==expected, f'{page.path.name}: expected {expected} primary heading(s), found {page.headings}'
    for href in page.links:
        u=urlsplit(href)
        if u.scheme or u.netloc or href.startswith('data:'):continue
        target=(page.path.parent/unquote(u.path)).resolve() if u.path else page.path.resolve()
        assert target.exists(), f'{page.path.name}: missing {href}'
        if u.fragment and target.suffix=='.html':
            assert unquote(u.fragment) in pages[target.name].ids, f'{page.path.name}: missing anchor {href}'
        checked+=1
home=(root/'index.html').read_text(encoding='utf-8')
research=(root/'research.html').read_text(encoding='utf-8')
assert 'lab.html' not in home, 'The legacy calculator must not return to the homepage'
assert all(x in research for x in ['research-reader.js','10.5281/zenodo.6346240','OL.536925','OME.611814','OE.564577','eti.2026.104895','unibi/3020621']), 'List the MSc thesis, all four articles and the PhD thesis'
assert research.count('class="paper"')==6, 'Six papers to read in the page'
assert research.count('Optica Publishing Group')==3 and 'CC BY-NC-ND' in research and 'CC BY 4.0' in research, 'Keep the copyright notices required to post the PDFs'
assert not (root/'cv.html').exists() and 'cv.html' not in home, 'The CV page stays removed'
assert (root/'publications.bib').read_text(encoding='utf-8').count('@article{')==4
print(json.dumps({'status':'passed','pages':list(pages),'local_links_checked':checked,'research':'retained','publication_exports':4}))
