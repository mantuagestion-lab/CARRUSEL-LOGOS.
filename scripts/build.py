"""Copia únicamente los archivos públicos del carrusel a dist/."""
import shutil
import re
from pathlib import Path
from update_manifest import update_manifest
from build_credits import build_credits

ROOT = Path(__file__).resolve().parents[1]
manifest = update_manifest(ROOT)
output = ROOT / 'dist'
if output.exists():
    shutil.rmtree(output)
output.mkdir()
for name in ('index.html', 'script.js', 'style.css', 'manifest.json'):
    shutil.copy2(ROOT / name, output / name)
shutil.copytree(ROOT / 'logos', output / 'logos', ignore=shutil.ignore_patterns('.*'))

# El HTML publicado incluye estilo, lógica y catálogo en una sola respuesta.
# Las fuentes separadas se conservan para mantenimiento y compatibilidad.
html = (output / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'style.css').read_text(encoding='utf-8')
javascript = (ROOT / 'script.js').read_text(encoding='utf-8')
css = re.sub(r'</style', lambda _: r'<\/style', css, flags=re.I)
javascript = re.sub(r'</script', lambda _: r'<\/script', javascript, flags=re.I)
html, styles = re.subn(r'<link rel="stylesheet" href="style\.css\?v=[^"]+">',
                      lambda _: '<style>\n' + css + '\n</style>', html)
html, scripts = re.subn(r'<script src="script\.js\?v=[^"]+" defer></script>',
                       lambda _: '<script>\n' + javascript + '\n</script>', html)
if (styles, scripts) != (1, 1):
    raise ValueError('No se pudo preparar el HTML completo del carrusel')
(output / 'index.html').write_text(html, encoding='utf-8')
build_credits(ROOT, output, manifest)
(output / '.nojekyll').touch()
print('Carrusel preparado para GitHub Pages: HTML completo y logos versionados en dist/.')
