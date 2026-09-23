-- Demo locations for local development. Safe to re-run: duplicates are skipped.

INSERT INTO buildings (building_name)
VALUES ('Building A'), ('Building B')
ON CONFLICT DO NOTHING;

-- Building A has floors 1-3, Building B has floors 1-2.
INSERT INTO floors (building_id, floor_number)
SELECT b.building_id, f.floor_number
FROM buildings b
JOIN (VALUES ('Building A', 1), ('Building A', 2), ('Building A', 3),
             ('Building B', 1), ('Building B', 2)) AS f (building_name, floor_number)
  ON f.building_name = b.building_name
ON CONFLICT DO NOTHING;

-- Four seats per demo floor, numbered like hotel rooms: floor 3 gets 301-304.
-- Only floors in the demo buildings, so floors added later through the app are left alone.
INSERT INTO seats (floor_id, seat_number)
SELECT fl.floor_id, (fl.floor_number * 100 + n)::TEXT
FROM floors fl
JOIN buildings b ON b.building_id = fl.building_id
CROSS JOIN generate_series(1, 4) AS n
WHERE b.building_name IN ('Building A', 'Building B')
ON CONFLICT DO NOTHING;
