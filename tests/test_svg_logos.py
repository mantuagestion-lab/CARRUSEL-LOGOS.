"""Replacement logos remain self-contained vectors, not raster wrappers."""
import hashlib
import json
import re
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = '{http://www.w3.org/2000/svg}'
RESIDENTIAL = (
    '28-la-serena-residencial.svg', '29-senda-real.svg',
    '30-nueva-escondida.svg', '31-magno-home-towers.svg', '32-el-secreto.svg',
    '33-fontana-residencial.jpeg', '34-hacienda-la-presita.svg',
    '35-zana-entorno-residencial.svg',
)
REPLACEMENTS = ('COMERCIAL/19-dif-apaseo-el-grande.svg', 'INDUSTRIA/25-usabiaga.svg') + tuple(
    'RESIDENCIAL/' + name for name in RESIDENTIAL if name.endswith('.svg'))


class ReplacementVectorTests(unittest.TestCase):
    def test_native_self_contained_vectors(self):
        for name in REPLACEMENTS:
            with self.subTest(logo=name):
                document = ET.fromstring((ROOT / 'logos' / name).read_bytes())
                self.assertEqual(document.tag, NS + 'svg')
                values = list(map(float, document.attrib['viewBox'].split()))
                self.assertEqual(len(values), 4)
                self.assertGreater(min(values[2:]), 0)
                self.assertIsNotNone(document.find(NS + 'title'))
                self.assertTrue(document.findall('.//' + NS + 'path'))
                ids = {element.attrib['id'] for element in document.iter() if 'id' in element.attrib}
                for element in document.iter():
                    tag = element.tag.removeprefix(NS).lower()
                    self.assertNotIn(tag, {'image', 'script', 'foreignobject', 'text'})
                    for key, value in element.attrib.items():
                        self.assertFalse(key.lower().startswith('on'))
                        if key.endswith('href'):
                            self.assertTrue(value.startswith('#'))
                            self.assertIn(value[1:], ids)
                        for ref in re.findall(r'url\((.*?)\)', value):
                            self.assertTrue(ref.startswith('#'))
                            self.assertIn(ref[1:], ids)

    def test_usabiaga_has_one_file(self):
        matches = sorted((ROOT / 'logos' / 'INDUSTRIA').glob('25-*'))
        self.assertEqual([p.name for p in matches], ['25-usabiaga.svg'])

    def test_residential_replacements_keep_order_and_have_no_duplicates(self):
        files = sorted(p.name for p in (ROOT / 'logos' / 'RESIDENCIAL').iterdir() if p.is_file())
        self.assertEqual(files, list(RESIDENTIAL))
        catalog = json.loads((ROOT / 'logos' / 'catalogo.json').read_text())
        self.assertEqual(sorted(key for key in catalog if key.startswith('RESIDENCIAL/')),
                         ['RESIDENCIAL/' + name for name in RESIDENTIAL])
        manifest = json.loads((ROOT / 'manifest.json').read_text())['RESIDENCIAL']
        self.assertEqual([Path(item['src'].split('?')[0]).name for item in manifest], files)
        self.assertEqual([item['alt'] for item in manifest], [
            catalog['RESIDENCIAL/' + name]['nombre'] for name in RESIDENTIAL])

    def test_fontana_is_only_renamed(self):
        data = (ROOT / 'logos' / 'RESIDENCIAL' / '33-fontana-residencial.jpeg').read_bytes()
        git_blob = b'blob ' + str(len(data)).encode() + b'\0' + data
        self.assertEqual(hashlib.sha1(git_blob).hexdigest(), 'abdb45f297f0f4cd2f86e527476ef24ca3810cc2')

    def test_zana_has_no_background_and_keeps_the_compact_logo(self):
        document = ET.fromstring((ROOT / 'logos' / 'RESIDENCIAL' /
                                  '35-zana-entorno-residencial.svg').read_bytes())
        self.assertFalse(document.findall('.//' + NS + 'rect'))
        self.assertFalse(document.findall('.//' + NS + 'image'))
        self.assertEqual(document.find(NS + 'title').text, 'Zäná Entorno Residencial')
        _, _, width, height = map(float, document.attrib['viewBox'].split())
        self.assertGreater(width / height, 2)
        self.assertLess(width / height, 2.5)


if __name__ == '__main__':
    unittest.main()
