"""Publica la procedencia de los logos y los originales que siguen pendientes."""
from html import escape
import json
from pathlib import Path


def build_credits(root: Path, output: Path, manifest):
    path = root / 'logos' / 'catalogo.json'
    catalog = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    cards = []
    for group, entries in manifest.items():
        for entry in entries:
            src = entry if isinstance(entry, str) else entry['src']
            key = src.split('?')[0].removeprefix('logos/')
            details = catalog.get(key, {})
            name = details.get('nombre', Path(key).stem)
            state = {'mejorado': 'Original recuperado o mejorado',
                     'vectorizado': 'SVG vectorizado de la referencia'}.get(
                         details.get('estado'), 'Hace falta un original mejor')
            origin = details.get('origen')
            link = f'<a href="{escape(origin, quote=True)}" target="_blank" rel="noopener">Ver fuente</a>' if origin else ''
            note = details.get('nota', 'Archivo añadido después de la revisión inicial; revisar su calidad.')
            cards.append(f'<article><p class="group">{escape(group.title())}</p><h2>{escape(name)}</h2>'
                         f'<div class="image"><img src="{escape(src, quote=True)}" alt="{escape(name, quote=True)}" loading="lazy"></div>'
                         f'<p class="status">{escape(state)}</p><p>{escape(note)}</p>{link}</article>')
    html = '''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Origen y calidad de los logos · Mantua</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#222;font:16px/1.55 Arial,sans-serif}
main{max-width:1120px;margin:auto;padding:24px 16px}h1{font-size:28px;line-height:1.2}h2{font-size:18px;margin:4px 0}
a{color:#742332;text-underline-offset:3px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
article{padding:18px;background:white;border:1px solid #ddd;border-radius:12px}.group{font-size:13px;color:#555;margin:0}
.image{height:125px;display:flex;align-items:center;justify-content:center}.image img{max-width:220px;max-height:100px;width:auto;height:auto}
.status{font-weight:bold}article p,article a{font-size:14px}footer{padding-top:28px;font-size:14px}
</style><main><a href="./">Volver a los carruseles</a><h1>Origen y calidad de los logos</h1>
<p>Revisión del 3 de septiembre de 2026. Los SVG vectorizados son reconstrucciones de las referencias aportadas, no los archivos originales de las marcas. Residencial ya incluye las siete referencias nuevas; Zäná queda sin fondo y Fontana conserva su imagen. Solo ITESBA sigue pendiente de un original de buena calidad.</p>
<div class="grid">''' + ''.join(cards) + '''</div><footer>
<p>Las marcas pertenecen a sus respectivos titulares. Esta página documenta los archivos utilizados en los carruseles de Mantua.</p>
<p>GKN Automotive Logo 2021: Performance Communications, obtenido de <a href="https://commons.wikimedia.org/wiki/File:GKN_Automotive_Logo_2021.png">Wikimedia Commons</a>, bajo <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Archivo sin modificar; ajustado únicamente al espacio de visualización.</p>
</footer></main></html>'''
    (output / 'creditos.html').write_text(html, encoding='utf-8')
