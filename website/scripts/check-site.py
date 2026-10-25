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
checked=0
for page in pages.values():
    assert page.headings==1, f'{page.path.name}: expected one primary heading'
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
assert all(x in research for x in ['anapole-field-cycle','anapole-temporal','OL.536925','OME.611814','OE.564577','eti.2026.104895']), 'Retain the research viewers and all four papers'
assert all(x in (root/'cv.html').read_text(encoding='utf-8') for x in ['Research Intern','Invited Researcher in Proteomics']), 'Preserve the CV research history'
assert 'Jolivet' in research and 'apsusc.2022.155214' in research, 'Show the field-map optical-property source'
assert (root/'publications.bib').read_text(encoding='utf-8').count('@article{')==4
print(json.dumps({'status':'passed','pages':list(pages),'local_links_checked':checked,'research_and_cv':'retained','publication_exports':4}))
