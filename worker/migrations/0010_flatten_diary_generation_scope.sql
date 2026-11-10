-- The block update trigger queries this view inside another subquery.
-- Express both eligibility paths directly so D1 can compile the trigger.
DROP VIEW diary_generation_scope;
CREATE VIEW diary_generation_scope AS
SELECT p.user_id, d.value AS date
FROM diary_generation_control c
JOIN profiles p
JOIN json_each(c.allowed_dates) d
LEFT JOIN diary_generation_protected_dates protected
 ON protected.user_id=p.user_id AND protected.date=d.value
LEFT JOIN user_ai_feature_settings feature
 ON feature.user_id=p.user_id AND feature.feature_key='diary_format'
WHERE c.singleton=1 AND c.enabled=1 AND protected.user_id IS NULL
 AND COALESCE(feature.enabled,1)=1
UNION
SELECT n.user_id, n.date
FROM diary_generation_control c
JOIN diary_generation_new_dates n
LEFT JOIN diary_generation_protected_dates protected
 ON protected.user_id=n.user_id AND protected.date=n.date
LEFT JOIN user_ai_feature_settings feature
 ON feature.user_id=n.user_id AND feature.feature_key='diary_format'
WHERE c.singleton=1 AND c.enabled=1 AND c.new_records_only=1
 AND protected.user_id IS NULL AND COALESCE(feature.enabled,1)=1;
