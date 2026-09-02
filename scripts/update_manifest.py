"""Actualiza el catálogo y su respaldo HTML sin dependencias externas."""
import json
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'}


def update_manifest(root=ROOT):
    manifest = {}
    catalog_path = root / 'logos' / 'catalogo.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8')) if catalog_path.exists() else {}
    for group in sorted((root / 'logos').iterdir()):
        if not group.is_dir():
            continue
        files = []
        for path in sorted(group.iterdir()):
            if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
                continue
            relative = path.relative_to(root).as_posix()
            source = relative + '?v=' + hashlib.sha256(path.read_bytes()).hexdigest()[:16]
            details = catalog.get(path.relative_to(root / 'logos').as_posix(), {})
            name = details.get('nombre')
            files.append({'src': source, 'alt': name} if name else source)
        if files:
            manifest[group.name] = files
    if not manifest:
        raise ValueError('No hay logos para publicar')
    payload = json.dumps(manifest, ensure_ascii=False, indent=2)
    index_path = root / 'index.html'
    index = index_path.read_text(encoding='utf-8')
    safe_payload = payload.replace('<', r'\u003c')
    updated, count = re.subn(
        r'(<script id="logo-manifest" type="application/json">)[\s\S]*?(</script>)',
        lambda match: match[1] + '\n' + safe_payload + '\n  ' + match[2], index)
    if count != 1:
        raise ValueError('Falta el respaldo único del catálogo en index.html')
    for name in ('script.js', 'style.css'):
        revision = hashlib.sha256((root / name).read_bytes()).hexdigest()[:16]
        updated, count = re.subn(
            rf'((?:src|href)="{re.escape(name)})(?:\?v=[^"\s]*)?"',
            lambda match: match[1] + '?v=' + revision + '"', updated)
        if count != 1:
            raise ValueError(f'Falta la referencia única a {name}')
    (root / 'manifest.json').write_text(payload + '\n', encoding='utf-8')
    index_path.write_text(updated, encoding='utf-8')
    return manifest


if __name__ == '__main__':
    result = update_manifest()
    print(f'{sum(map(len, result.values()))} logos; {len(result)} grupos; catálogo y respaldo sincronizados.')
