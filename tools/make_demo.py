"""Build a dependency-free visual/functionality preview from v0.1 content data.

This preview is for local review where npm/Astro cannot be installed. The Astro
pages in src/ remain the deployment source of truth; this command doesn't
replace `npm run build` for GitHub Pages.
"""
from pathlib import Path
import json, html, shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'preview'
site = json.loads((ROOT/'src/data/site.json').read_text())
pages = json.loads((ROOT/'src/data/pages.json').read_text())
features = json.loads((ROOT/'src/data/features.json').read_text())

def esc(s): return html.escape(str(s),quote=True)
def local(path,prefix=''):
    return path if path.startswith('https://') else prefix+path.lstrip('/')

def base_html(title,desc,main,prefix=''):
    nav=''.join(f'<a href="{prefix}{p["slug"]}/">{esc("Teaching" if p["slug"]=="teaching" else p["title"])}</a>' for p in pages)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="theme-color" content="#0a1723"/><meta name="description" content="{esc(desc)}"/><title>{esc(title)} — Matthew Payne</title>
<link rel="stylesheet" href="{prefix}css/global.css"/><link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml"/></head><body>
<header class="site-header"><div class="header-inner content-width"><a class="brand" href="{prefix}index.html"><span class="brand-name">Matthew Payne</span><span class="brand-role">Astrophysicist · MPC Director</span></a>
<button class="menu-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="site-navigation"><span></span><span></span><span></span></button>
<nav class="site-nav" id="site-navigation" aria-label="Primary navigation">{nav}<a class="nav-github" href="{site['github']}" target="_blank" rel="noopener noreferrer" aria-label="GitHub profile">GitHub ↗</a></nav></div></header>
<main>{main}</main><footer class="site-footer"><div class="content-width footer-content"><div><strong>Matthew Payne</strong><span>Astrophysics · Small-body dynamics · Scientific computing</span></div><div class="footer-links"><a href="{prefix}teaching/">Tutorials</a><a href="{site['github']}" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="{site['cfaProfile']}" target="_blank" rel="noopener noreferrer">CfA profile ↗</a></div></div></footer>
<script>const b=document.querySelector('.menu-toggle'),n=document.getElementById('site-navigation');b.addEventListener('click',()=>{{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-label',open?'Close navigation':'Open navigation');n.classList.toggle('is-open',open)}});n.addEventListener('click',e=>{{if(e.target.closest('a')){{n.classList.remove('is-open');b.setAttribute('aria-expanded','false')}}}});</script></body></html>'''

def visual(kind):
    header='<svg viewBox="0 0 360 170" class="science-art" role="img" aria-label="Illustrative scientific diagram">'
    if kind=='loops':
        body='<line x1="30" y1="85" x2="334" y2="85" stroke="#d8e4e7"/><line x1="178" y1="14" x2="178" y2="153" stroke="#d8e4e7"/><path d="M44 92 C58 35 109 27 132 79 C145 130 170 138 185 80 C199 30 251 22 287 77 S316 143 321 97" fill="none" stroke="#11949b" stroke-width="2"/><circle cx="178" cy="85" r="6" fill="#ed9956"/><circle cx="284" cy="72" r="4" fill="#098f98"/>'
    elif kind=='scatter':
        dots=''.join(f'<circle cx="{43+((i*71)%285)}" cy="{30+((i*37+i*i*3)%95)}" r="{1+(i%3)*.25}" fill="{("#e4945b" if i%5==0 else "#008b98")}" opacity="{.3+(i%6)*.11}"/>' for i in range(75))
        body='<line x1="34" y1="137" x2="336" y2="137" stroke="#cad8dc"/><line x1="34" y1="20" x2="34" y2="137" stroke="#cad8dc"/>'+dots+'<path d="M43 111 C113 91 162 78 225 71 S307 58 332 42" stroke="#1c7886" stroke-width="1.4" fill="none"/>'
    else:
        body='<ellipse cx="180" cy="87" rx="118" ry="49" transform="rotate(-22 180 87)" stroke="#128f9c" stroke-width="1.8" fill="none"/><ellipse cx="180" cy="87" rx="86" ry="31" transform="rotate(23 180 87)" stroke="#81b3be" stroke-width="1.4" fill="none"/><circle cx="180" cy="87" r="6" fill="#ec9d58"/><circle cx="273" cy="51" r="4" fill="#11949b"/>'
    return header+body+'</svg>'

orbit='''<div class="orbit-lab" id="orbit-lab"><div class="orbit-topline"><span class="lab-label"><span class="signal-dot"></span> ORBITAL LABORATORY</span><span class="lab-subtitle">An experiment in gravity</span></div>
<div class="orbit-stage"><canvas id="orbit-canvas" role="img" aria-label="Integrated trajectories in a Newtonian gravitational model"></canvas><div class="orbit-key" aria-hidden="true"><span><i class="key-sun"></i> Sun</span><span><i class="key-earth"></i> Earth</span><span><i class="key-asteroid"></i> Test particle</span></div><div class="orbit-loading" id="orbit-loading">Preparing simulation…</div></div>
<div class="orbit-controls"><label class="scenario-group">Scenario<select id="orbit-scenario" aria-label="Choose initial conditions"><option value="near">Near-Earth orbit</option><option value="resonant">Near co-orbital</option><option value="eccentric">Eccentric orbit</option></select></label><div class="time-group"><span>Elapsed time</span><output id="orbit-time">0.00 yr</output></div><div class="lab-buttons"><button id="orbit-play" class="sim-button play-button">▶ <span>Play</span></button><button id="orbit-reset" class="sim-button">↺ <span>Reset</span></button></div></div>
<p class="model-note">A simplified 2D Newtonian integration in AU and years. Jupiter's gravity is included although its orbit is outside this view. Not an MPC ephemeris.</p></div>'''

cards=''.join(f'''<a class="feature-card" href="{local(f['link'])}"><div class="feature-illustration">{visual(f['visual'])}</div><div class="feature-copy"><h3>{esc(f['title'])}</h3><p>{esc(f['description'])}</p><span class="small-link">Explore →</span></div></a>''' for f in features)

home=f'''<section class="hero-dark"><div class="content-width hero-layout"><div class="hero-copy"><div class="identity-row"><img class="portrait" src="assets/portrait-placeholder.svg" width="136" height="158" alt="Portrait placeholder; Matthew Payne's photograph has not been provided"/><div class="identity-content"><p class="eyebrow">{esc(site['eyebrow'])}</p><p class="hero-name">Matthew Payne</p><p class="hero-role">Director of the Minor Planet Center</p></div></div><h1>{esc(site['headline'])}</h1><p class="hero-description">{esc(site['introduction'])}</p><div class="hero-actions"><a class="button button-primary" href="research/">Explore my research ↗</a><a class="button button-outline" href="teaching/">Teaching & tutorials →</a></div></div>{orbit}</div></section>
<section class="site-content home-content"><div class="content-width"><div class="section-heading"><div><p class="section-kicker">SELECTED THEMES</p><h2>Research at a glance</h2></div><a class="text-link" href="research/">All research ↗</a></div><div class="feature-grid">{cards}</div>
<div class="discipline-grid"><a href="teaching/" class="discipline-item"><div class="discipline-number">01</div><div><h3>Teaching & tutorials <span>↗</span></h3><p>Jupyter notebooks, numerical experiments and interactive explanations.</p></div></a><a href="software/" class="discipline-item"><div class="discipline-number">02</div><div><h3>Software <span>↗</span></h3><p>Scientific code, tools for orbit analysis and data processing.</p></div></a><a href="mpc/" class="discipline-item"><div class="discipline-number">03</div><div><h3>Minor Planet Center <span>↗</span></h3><p>Connecting observations to orbital knowledge for the astronomical community.</p></div></a></div>
<section class="about-band"><div><p class="section-kicker">ABOUT</p><h2>Science, software, and the people behind the work.</h2><p>My work combines research in orbital dynamics with scientific computing, community infrastructure and the mentorship of younger scientists.</p></div><div class="about-links"><a class="text-link" href="people/">People & collaborators ↗</a><a class="text-link" href="publications/">Publications ↗</a><a class="text-link" href="{site['cfaProfile']}" target="_blank" rel="noopener noreferrer">CfA biography ↗</a></div></section></div></section>
<script src="js/orbital-lab.js"></script>'''
(OUT/'index.html').write_text(base_html('Homepage',site['introduction'],home))

for page in pages:
    resource=''.join(f'''<article class="resource-item"><h3>{esc(item['title'])}</h3><p>{esc(item['text'])}</p>{('<a class="text-link" href="'+local(item['link'],'../')+'" target="_blank" rel="noopener noreferrer">'+esc(item.get('cta','Explore'))+' ↗</a>') if item.get('link') else ''}</article>''' for item in page['items'])
    content=f'''<section class="inner-hero"><div class="content-width inner-hero-content"><p class="eyebrow">{esc(page['eyebrow'])}</p><h1>{esc(page['title'])}</h1><p>{esc(page['lead'])}</p></div></section><section class="site-content page-content"><div class="content-width"><div class="section-heading"><h2>Explore {esc(page['title']).lower()}</h2></div><div class="resource-grid">{resource}</div><div class="editorial-note"><div><span class="status-dot"></span> Version 0.1</div><p>This section is a curated starting point. Research projects, collaborators, publications and notebooks will be added as verified content rather than autogenerated entries.</p></div><p class="back-row"><a href="../index.html">← Return to homepage</a></p></div></section>'''
    d=OUT/page['slug']; d.mkdir(exist_ok=True,parents=True)
    (d/'index.html').write_text(base_html(page['title'],page['summary'],content,'../'))
(OUT/'css').mkdir(exist_ok=True)
shutil.copyfile(ROOT/'src/styles/global.css',OUT/'css/global.css')
for sub in ('js','assets'):
    shutil.copytree(ROOT/'public'/sub,OUT/sub,dirs_exist_ok=True)
print('Wrote dependency-free preview:',OUT)
