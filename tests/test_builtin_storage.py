import copy
import http.client
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import builtin_store as store
import folder_store


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT/file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


server_module = module('disk_server', 'disk-storage-server.py')
migration = module('migration', 'migrate-builtin-storage.py')
RECIPE = {'id': 'test-recipe', 'name': 'Zkušební recept', 'description': 'Užitečný popis',
          'planningNote': 'Zachovat poznámku', 'servings': 10, 'pricePerServingCzk': 12.5,
          'popularity': 1, 'rotationDays': 60, 'status': 'active',
          'season': {'availability': 'Celoročně', 'recommended': ['Celoročně'], 'months': 'Leden', 'monthNumbers': [1]},
          'history': ['2026-01-01'], 'lastServedAt': '2026-01-01',
          'menuHistory': [{'date': '2026-01-01', 'meal': 'Oběd', 'importId': 'preserve'}],
          'ingredients': [{'name': 'Voda', 'amount': 1, 'unit': 'l'}], 'nutritionPerServing': {'energyKj': 100}, 'customField': 'preserve'}


class StorageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='builtin-storage-test-')
        self.root = Path(self.temp.name)
        (self.root/'builtin-recipes.json').write_bytes(folder_store.encode([{'id': 'test-recipe'}]))
        self.relative = store.relative_path(self.root, 'test-recipe')
        self.file = self.root/self.relative
        self.file.parent.mkdir(parents=True)
        self.file.write_bytes(folder_store.encode(RECIPE))
        self.start()

    def start(self):
        handler = server_module.handler_for(self.root)
        handler.log_message = lambda *args: None
        self.server = server_module.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def tearDown(self):
        self.stop()
        self.temp.cleanup()

    def request(self, method='GET', data=None, path='/__builtin_recipe?id=test-recipe', headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        defaults = {'Origin': f'http://127.0.0.1:{self.port}', 'Content-Type': 'application/json'}
        if headers:
            defaults.update(headers)
        connection.request(method, path, body=json.dumps(data) if data is not None else None, headers=defaults)
        response = connection.getresponse()
        body = response.read()
        connection.close()
        try:
            body = json.loads(body)
        except ValueError:
            pass
        return response.status, body

    def save(self, patch, revision=None):
        revision = revision or store.load(self.root, 'test-recipe')['revision']
        return self.request('POST', {'id': 'test-recipe', 'patch': patch, 'baseRevision': revision}, '/__builtin_recipe')

    def test_save_restart_and_restore(self):
        original = self.file.read_bytes()
        status, data = self.save({'pricePerServingCzk': 29.75, 'popularity': 3})
        self.assertEqual(status, 200)
        self.assertEqual(data['recipe']['rotationDays'], 120)
        self.assertEqual(json.loads(self.file.read_bytes())['pricePerServingCzk'], 29.75)
        for field in ('menuHistory', 'history', 'ingredients', 'nutritionPerServing', 'customField'):
            self.assertEqual(data['recipe'][field], RECIPE[field])
        self.stop()
        self.start()
        self.assertEqual(self.request()[1]['recipe']['pricePerServingCzk'], 29.75)
        backups = list((self.root/'.recipe-backups').glob('*/'+self.relative))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original)
        folder_store.commit(self.root, {self.relative: backups[0].read_bytes()})
        self.assertEqual(self.file.read_bytes(), original)
        self.assertEqual(self.request()[1]['recipe'], RECIPE)

    def test_stale_editor_and_external_menu_change(self):
        revision = self.request()[1]['revision']
        self.assertEqual(self.save({'pricePerServingCzk': 25}, revision)[0], 200)
        self.assertEqual(self.save({'pricePerServingCzk': 5}, revision)[0], 409)
        revision = self.request()[1]['revision']
        changed = json.loads(self.file.read_bytes())
        changed['menuHistory'].append({'date': '2026-02-01', 'meal': 'Oběd'})
        folder_store.commit(self.root, {self.relative: folder_store.encode(changed)})
        self.assertEqual(self.save({'name': 'Stará kopie'}, revision)[0], 409)
        self.assertEqual(len(self.request()[1]['recipe']['menuHistory']), 2)

    def test_invalid_inputs_leave_bytes_unchanged(self):
        original = self.file.read_bytes()
        for patch in ({'id': 'other'}, {'history': []}, {'menuHistory': []}, {'ingredients': []}, {'name': ''},
                      {'servings': 0}, {'servings': True}, {'pricePerServingCzk': -1}, {'popularity': 4},
                      {'lastServedAt': '2026-02-30'}, {'season': []}, {'season': {'monthNumbers': [99]}}, {'status': 'bad'}):
            with self.subTest(patch=patch):
                self.assertEqual(self.save(patch)[0], 400)
                self.assertEqual(self.file.read_bytes(), original)
        for rid in ('../escape', 'docx-test', '', 'other'):
            self.assertEqual(self.request(path='/__builtin_recipe?id='+rid)[0], 400)

    def test_origin_content_type_and_private_files(self):
        before = self.file.read_bytes()
        # These guards run before body parsing. Do not upload a body to a rejected
        # HTTP/1.0 connection: Windows can reset it before the client reads 403.
        self.assertEqual(self.request('POST', None, '/__builtin_recipe', {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('POST', None, '/__builtin_recipe', {'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request(path='/.recipe-backups/private.json')[0], 403)
        self.assertEqual(self.request(headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.file.read_bytes(), before)

    def test_preserves_menu_date_and_options(self):
        status, result = self.save({'lastServedAt': None, 'preparationType': 'Pečení', 'season': {'months': 'Únor'}})
        self.assertEqual(status, 200)
        self.assertEqual(result['recipe']['lastServedAt'], '2026-01-01')
        self.assertEqual(result['recipe']['preparationType'], 'Pečení')
        self.assertNotIn('monthNumbers', result['recipe']['season'])

    def test_write_failure_never_reports_success(self):
        from unittest.mock import patch
        before = self.file.read_bytes()
        with patch.object(folder_store, 'commit', side_effect=OSError('disk full')):
            self.assertEqual(self.save({'name': 'Cannot save'})[0], 400)
        self.assertEqual(self.file.read_bytes(), before)

    def test_migration_policies_idempotence_and_changed_plan(self):
        snapshot = self.root/'snapshot.json'
        raw_overlay = json.dumps({'description': '', 'planningNote': '', 'preparationType': 'Pečené', 'history': []})
        snapshot.write_bytes(folder_store.encode({'version': 1, 'items': {'receptar:test-recipe': raw_overlay, 'receptar:menu-import-draft:v1': 'keep'}}))
        report, files = migration.plan(self.root, snapshot, 'keep-text')
        migrated = json.loads(files[self.relative])
        self.assertEqual(migrated['description'], RECIPE['description'])
        self.assertEqual(migrated['planningNote'], RECIPE['planningNote'])
        self.assertEqual(migrated['preparationType'], 'Pečené')
        self.assertEqual(migrated['menuHistory'], RECIPE['menuHistory'])
        exact, exact_files = migration.plan(self.root, snapshot, 'exact')
        self.assertEqual(json.loads(exact_files[self.relative])['description'], '')
        disk, disk_files = migration.plan(self.root, snapshot, 'disk')
        self.assertNotIn(self.relative, disk_files)
        self.assertNotEqual(exact['planHash'], report['planHash'])
        self.save({'pricePerServingCzk': 20})
        self.assertNotEqual(migration.plan(self.root, snapshot, 'keep-text')[0]['planHash'], report['planHash'])
        report, files = migration.plan(self.root, snapshot, 'keep-text')
        folder_store.commit(self.root, files)
        self.assertEqual(migration.plan(self.root, snapshot, 'keep-text')[1], {})
        self.assertEqual(self.request()[1]['overlayHash'], store.digest(raw_overlay.encode()))
        self.assertEqual(json.loads(snapshot.read_bytes())['items']['receptar:menu-import-draft:v1'], 'keep')


if __name__ == '__main__':
    unittest.main()
