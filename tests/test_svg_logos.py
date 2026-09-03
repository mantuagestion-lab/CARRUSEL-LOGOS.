"""The two replacement logos must remain self-contained vectors, not wrappers."""
import re
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = '{http://www.w3.org/2000/svg}'
PAIRS = ('COMERCIAL/19-dif-apaseo-el-grande.svg', 'INDUSTRIA/25-usabiaga.svg')


class ReplacementVectorTests(unittest.TestCase):
    def test_native_self_contained_vectors(self):
        for name in PAIRS:
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


if __name__ == '__main__':
    unittest.main()
