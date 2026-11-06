"""Atomic empty-only saves against fictional SQLite rows; no network."""
import importlib.util,json,sqlite3,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('backfill',Path(__file__).with_name('fill-missing-diaries.py'))
backfill=importlib.util.module_from_spec(spec);spec.loader.exec_module(backfill)
commit_statement,expressions=backfill.commit_statement,backfill.expressions

class BackfillTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
        self.owner='fixture';self.date='2000-01-02'
        self.db.executescript("""
        CREATE TABLE entries(id TEXT PRIMARY KEY,user_id TEXT,date TEXT,formatted_content TEXT,summary TEXT,score INTEGER,score_details TEXT,updated_at TEXT DEFAULT 'before',UNIQUE(user_id,date));
        CREATE TABLE blocks(id TEXT PRIMARY KEY,user_id TEXT,occurred_at TEXT,content TEXT,category TEXT,images TEXT);
        CREATE TABLE user_ai_settings(id TEXT,user_id TEXT,day_boundary_hour INTEGER);
        CREATE TABLE user_ai_models(id TEXT,user_id TEXT,model_name TEXT);
        CREATE TABLE user_ai_api_keys(id TEXT,user_id TEXT,api_key TEXT);
        CREATE TABLE user_ai_feature_settings(id TEXT,user_id TEXT,feature_key TEXT);
        INSERT INTO user_ai_settings VALUES('settings','fixture',4);
        INSERT INTO user_ai_models VALUES('model','fixture','fictional-model');
        INSERT INTO blocks VALUES('block','fixture','2000-01-01T20:00:00Z','架空の記録','event','[]');
        """)
        tables=['entries','blocks','user_ai_settings','user_ai_models','user_ai_api_keys','user_ai_feature_settings']
        self.schema={t:[r['name'] for r in self.db.execute('PRAGMA table_info('+t+')')] for t in tables}
        self.output={'result':{'formatted_content':'## 朝\n架空の日記','score':88,'score_details':'架空の採点'}}

    def state(self):
        e,b,a,p=expressions(self.schema,self.owner,self.date)
        return dict(self.db.execute('SELECT '+e+' entry_json,'+b+' blocks_json,'+a+' config_json',p).fetchone())

    def entry(self,text=None):
        self.db.execute('INSERT INTO entries(id,user_id,date,formatted_content,summary)VALUES(?,?,?,?,?)',('entry',self.owner,self.date,text,'preserve-summary'))

    def save(self,state):
        sql,p=commit_statement(self.schema,self.owner,self.date,state,self.output,new_id='new-entry')
        return self.db.execute(sql,p).fetchall()

    def test_blank_entry_is_filled_and_summary_preserved(self):
        self.entry(' \n\t\u3000\u200b');state=self.state();self.assertEqual(len(self.save(state)),1)
        row=self.db.execute('SELECT * FROM entries').fetchone();self.assertEqual(row['summary'],'preserve-summary');self.assertEqual(row['formatted_content'],self.output['result']['formatted_content'])

    def test_existing_body_is_never_replaced_even_with_fresh_snapshot(self):
        self.entry('本人の既存日記');self.assertEqual(self.save(self.state()),[])

    def test_user_edit_during_generation_wins(self):
        self.entry();state=self.state();self.db.execute("UPDATE entries SET formatted_content='本人が追記'")
        self.assertEqual(self.save(state),[])

    def test_changed_or_added_input_rejects_stale_result(self):
        self.entry();state=self.state();self.db.execute("UPDATE blocks SET content='新しい記録'")
        self.assertEqual(self.save(state),[])
        state=self.state();self.db.execute("INSERT INTO blocks VALUES('second','fixture','2000-01-02T01:00:00Z','追加','event','[]')")
        self.assertEqual(self.save(state),[])

    def test_configuration_change_rejects_result(self):
        self.entry();state=self.state();self.db.execute("UPDATE user_ai_models SET model_name='changed-model'")
        self.assertEqual(self.save(state),[])

    def test_missing_entry_is_created_only_once(self):
        state=self.state();self.assertEqual(len(self.save(state)),1);self.assertEqual(self.save(state),[])

    def test_concurrent_creation_is_not_overwritten(self):
        state=self.state();self.entry('別画面で保存');self.assertEqual(self.save(state),[])

    def test_boundary_and_other_owner_are_preserved(self):
        self.entry();self.db.execute("INSERT INTO entries(id,user_id,date,formatted_content)VALUES('other','another','2000-01-02','別所有者の本文')")
        self.assertEqual(len(json.loads(self.state()['blocks_json'])),1)
        self.assertEqual(len(self.save(self.state())),1)
        self.assertEqual(self.db.execute("SELECT formatted_content FROM entries WHERE id='other'").fetchone()[0],'別所有者の本文')

if __name__=='__main__':unittest.main()
