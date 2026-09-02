import hashlib
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from update_manifest import update_manifest


class PublicationTest(unittest.TestCase):
    def test_replace_add_and_remove_logos_updates_catalog_and_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            group = root / 'logos' / 'INDUSTRIA'
            group.mkdir(parents=True)
            (root / 'index.html').write_text(
                '<link rel="stylesheet" href="style.css?v=2">'
                '<script src="script.js?v=2" defer></script>'
                '<script id="logo-manifest" type="application/json">{}</script>', encoding='utf-8')
            (root / 'script.js').write_text('/* primera versión */', encoding='utf-8')
            (root / 'style.css').write_text('body {}', encoding='utf-8')
            logo = group / 'Honda.png'
            logo.write_bytes(b'logo-original')
            first = update_manifest(root)['INDUSTRIA'][0]
            logo.write_bytes(b'logo-original-de-mayor-resolucion')
            second = update_manifest(root)['INDUSTRIA'][0]
            self.assertEqual(first.split('?')[0], second.split('?')[0])
            self.assertNotEqual(first, second)
            another = group / 'Otra marca.svg'
            another.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
            (root / 'logos' / 'catalogo.json').write_text(json.dumps({
                'INDUSTRIA/Honda.png': {'nombre': 'Honda'},
                'INDUSTRIA/Otra marca.svg': {'nombre': 'Otra marca'}
            }), encoding='utf-8')
            update_manifest(root)
            logo.unlink()
            update_manifest(root)
            manifest = json.loads((root / 'manifest.json').read_text())
            fallback = json.loads(re.search(
                r'<script id="logo-manifest" type="application/json">([\s\S]*?)</script>',
                (root / 'index.html').read_text())[1])
            self.assertEqual(manifest, fallback)
            self.assertEqual(len(manifest['INDUSTRIA']), 1)
            self.assertTrue(manifest['INDUSTRIA'][0]['src'].startswith('logos/INDUSTRIA/Otra marca.svg?v='))
            self.assertEqual(manifest['INDUSTRIA'][0]['alt'], 'Otra marca')

    def test_publication_contains_complete_html_and_correct_image_revisions(self):
        output = ROOT / 'dist'
        html = (output / 'index.html').read_text(encoding='utf-8')
        self.assertNotRegex(html, r'<script\s+src=')
        self.assertNotRegex(html, r'<link\s+rel="stylesheet"')
        self.assertIn('function createCarousel', html)
        self.assertIn('.logos-viewport', html)
        manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
        fallback = json.loads(re.search(
            r'<script id="logo-manifest" type="application/json">([\s\S]*?)</script>', html)[1])
        self.assertEqual(manifest, fallback)
        self.assertTrue((output / 'creditos.html').exists())
        for sources in manifest.values():
            for entry in sources:
                source = entry if isinstance(entry, str) else entry['src']
                relative, version = source.split('?v=')
                self.assertEqual(hashlib.sha256((output / relative).read_bytes()).hexdigest()[:16], version)


if __name__ == '__main__':
    unittest.main()
