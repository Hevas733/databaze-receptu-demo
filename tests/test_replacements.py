import importlib.util
import json
import tempfile
import unittest
import sys
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import menu_replacements as replacements

class ReplacementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.paths = {'a':'Recepty/a/a.json','b':'Recepty/b/b.json'}
        for rid, path in self.paths.items():
            file = self.root / path
            file.parent.mkdir(parents=True)
            file.write_text(json.dumps({'id':rid,'name':rid,'menuHistory':[{'date':'2026-01-01'}]}))
        self.originals = {path:(self.root/path).read_bytes() for path in self.paths.values()}
        self.target = dict(importId='test-import',sourceFile='Leden.docx',date='2026-01-01',meal='Oběd',originalName='Původní',dietCode='00')

    def save(self, rid='b', revision='', target=None):
        return replacements.save(self.root, {'target':target or self.target,'recipeId':rid,'baseRevision':revision},self.paths)

    def test_persistence_history_and_isolation(self):
        saved = self.save()
        self.assertEqual(saved, replacements.load(self.root))
        second = self.save('a',saved['revision'])
        record = next(iter(second['items'].values()))
        self.assertEqual(record['changes'][0]['recipeId'],'b')
        third = self.save('b',second['revision'],{**self.target,'meal':'Večeře'})
        self.assertEqual(len(third['items']),2)
        self.assertTrue(any((self.root/'.recipe-backups').iterdir()))
        for path, original in self.originals.items():
            self.assertEqual((self.root/path).read_bytes(), original)

    def test_stale_window_rejected(self):
        saved = self.save()
        with self.assertRaises(replacements.Conflict):
            self.save('a')
        self.assertEqual(saved,replacements.load(self.root))

    def test_invalid_recipe_date_and_incomplete_target(self):
        for rid,target in [('not-found',self.target),('b',{**self.target,'date':'2026-02-30'}),('b',{'meal':'Oběd'})]:
            with self.assertRaises(ValueError):
                self.save(rid,target=target)
        self.assertFalse((self.root/replacements.FILE).exists())

    def test_failed_write_keeps_saved_data(self):
        saved = self.save()
        with patch('folder_store.os.replace', side_effect=OSError('denied')):
            with self.assertRaises(OSError):
                self.save('a',saved['revision'])
        self.assertEqual(saved,replacements.load(self.root))

    def test_http_endpoint_and_origin(self):
        spec = importlib.util.spec_from_file_location('recipe_server', ROOT/'disk-storage-server.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        (self.root/'builtin-recipes.json').write_text(json.dumps([{'id':'a'},{'id':'b'}]))
        (self.root/'imported-index.json').write_text('{"version":1,"recipes":[]}')
        server = ThreadingHTTPServer(('127.0.0.1',0),module.handler_for(self.root))
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        origin = 'http://127.0.0.1:'+str(server.server_port)
        url = origin+'/__menu_replacements'
        try:
            with urllib.request.urlopen(url) as response:
                self.assertEqual(json.load(response)['revision'],'')
            payload = json.dumps({'target':self.target,'recipeId':'b','baseRevision':''}).encode()
            # Origin is checked before parsing. Avoid a Windows reset from an unread body.
            request = urllib.request.Request(url,data=b'',headers={'Content-Type':'application/json','Origin':'http://untrusted'})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code,403)
            request = urllib.request.Request(url,data=payload,headers={'Content-Type':'application/json','Origin':origin})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(len(json.load(response)['items']),1)
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code,409)
        finally:
            server.shutdown()
            server.server_close()

if __name__=='__main__':
    unittest.main()
