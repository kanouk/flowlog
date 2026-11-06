"""Fictional three-way migration cases. No credentials, network or live records."""
import unittest
from cutover import merge_rows,normalize_row

class MergeTests(unittest.TestCase):
    def setUp(self):
        self.before={'id':'fictional','content':'元の架空記録','images':[],'revision':1}

    def test_disjoint_edits_are_both_preserved(self):
        left=dict(self.before,content='元環境の架空編集')
        right=dict(self.before,images=['https://example.com/fixture.png'])
        rows,conflicts=merge_rows([self.before],[left],[right])
        self.assertEqual(conflicts,[])
        self.assertEqual(rows,[dict(left,images=right['images'])])

    def test_conflicting_text_is_never_silently_selected(self):
        _,conflicts=merge_rows([self.before],[dict(self.before,content='source')],[dict(self.before,content='staging')])
        self.assertEqual(conflicts,[('fictional','content')])

    def test_deletion_cannot_discard_an_edit(self):
        _,conflicts=merge_rows([self.before],[],[dict(self.before,content='edited')])
        self.assertEqual(conflicts,[('fictional','delete-edit')])

    def test_unchanged_copy_does_not_resurrect_deleted_records(self):
        self.assertEqual(merge_rows([self.before],[],[self.before]),([],[]))
        self.assertEqual(merge_rows([self.before],[self.before],[]),([],[]))

    def test_new_record_collision_is_reported(self):
        _,conflicts=merge_rows([],[self.before],[dict(self.before,content='different')])
        self.assertEqual(conflicts,[('fictional','new-record-collision')])
        self.assertEqual(merge_rows([],[self.before],[self.before]),([self.before],[]))

    def test_normalization_keeps_array_order_and_unrelated_text(self):
        raw={'images':'["https://new/second.png","https://new/first.png"]','formatted_content':'写真 https://new/first.png','content':'literal https://new/first.png','is_done':0,'occurred_at':'2026-01-01T00:00:00.123456+00:00'}
        row=normalize_row(raw,{'https://new/':'https://old/'})
        self.assertEqual(row['images'],['https://old/second.png','https://old/first.png'])
        self.assertEqual(row['formatted_content'],'写真 https://old/first.png')
        self.assertEqual(row['content'],raw['content'])
        self.assertEqual(row['occurred_at'],raw['occurred_at'])
        self.assertIs(row['is_done'],False)

if __name__=='__main__':unittest.main()
