-- Migration: Merge duplicate hospitals
-- Groups definition:
-- Group 1: Caracas (b7cae288-d24b-479a-8dbe-aaf3378e6a4b) <- (a3cf2b8b-bf24-467b-b2c7-dbbf52f42836, 0c6cd935-822d-46fc-80fb-de1459018505)
-- Group 2: Perez Carreño (d918426b-bcbd-4bc8-868e-f466d034481d) <- (02310fab-d555-42a3-a2b8-626100546797)
-- Group 3: Domingo Luciani (682ee4c2-202d-4b25-81e1-384ce4e8274f) <- (cde1c3d6-233c-41f5-9fed-c1fe251eb752, e0396a2a-57af-4461-ba1b-67923fc55300, ab4d1a78-a68b-46cc-954b-da6be024d51f)
-- Group 4: Magallanes de Carla (30f4e008-9516-4172-b757-6694af884607) <- (6a26febd-5eda-48cb-a8c4-8c833747aa74)

DO $$
DECLARE
  grp RECORD;
  correct_id UUID;
  dup_ids UUID[];
BEGIN
  FOR grp IN 
    SELECT 'b7cae288-d24b-479a-8dbe-aaf3378e6a4b'::UUID AS correct_id, ARRAY['a3cf2b8b-bf24-467b-b2c7-dbbf52f42836', '0c6cd935-822d-46fc-80fb-de1459018505']::UUID[] AS dup_ids
    UNION ALL
    SELECT 'd918426b-bcbd-4bc8-868e-f466d034481d'::UUID, ARRAY['02310fab-d555-42a3-a2b8-626100546797']::UUID[]
    UNION ALL
    SELECT '682ee4c2-202d-4b25-81e1-384ce4e8274f'::UUID, ARRAY['cde1c3d6-233c-41f5-9fed-c1fe251eb752', 'e0396a2a-57af-4461-ba1b-67923fc55300', 'ab4d1a78-a68b-46cc-954b-da6be024d51f']::UUID[]
    UNION ALL
    SELECT '30f4e008-9516-4172-b757-6694af884607'::UUID, ARRAY['6a26febd-5eda-48cb-a8c4-8c833747aa74']::UUID[]
  LOOP
    correct_id := grp.correct_id;
    dup_ids := grp.dup_ids;

    -- Update simple FK reference tables
    UPDATE personas SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE persona_historial SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE insumos SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE donaciones_monetarias SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE profiles SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE match_sugerencias SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE ofertas SET refugio_id = correct_id WHERE refugio_id = ANY(dup_ids);
    UPDATE cargas SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE solicitudes SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE entregas SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);
    UPDATE entregas SET refugio_id = correct_id WHERE refugio_id = ANY(dup_ids);

    -- Unique constraint tables:
    -- membresias (user_id, hospital_id)
    DELETE FROM membresias WHERE hospital_id = ANY(dup_ids) AND EXISTS (
      SELECT 1 FROM membresias m2 WHERE m2.user_id = membresias.user_id AND m2.hospital_id = correct_id
    );
    UPDATE membresias SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);

    -- centro_hospital (centro_id, hospital_id)
    DELETE FROM centro_hospital WHERE hospital_id = ANY(dup_ids) AND EXISTS (
      SELECT 1 FROM centro_hospital ch2 WHERE ch2.centro_id = centro_hospital.centro_id AND ch2.hospital_id = correct_id
    );
    UPDATE centro_hospital SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);

    -- hospital_refugio (hospital_id, refugio_id)
    -- As hospital_id
    DELETE FROM hospital_refugio WHERE hospital_id = ANY(dup_ids) AND EXISTS (
      SELECT 1 FROM hospital_refugio hr2 WHERE hr2.refugio_id = hospital_refugio.refugio_id AND hr2.hospital_id = correct_id
    );
    UPDATE hospital_refugio SET hospital_id = correct_id WHERE hospital_id = ANY(dup_ids);

    -- As refugio_id
    DELETE FROM hospital_refugio WHERE refugio_id = ANY(dup_ids) AND EXISTS (
      SELECT 1 FROM hospital_refugio hr2 WHERE hr2.hospital_id = hospital_refugio.hospital_id AND hr2.refugio_id = correct_id
    );
    UPDATE hospital_refugio SET refugio_id = correct_id WHERE refugio_id = ANY(dup_ids);

    -- Finally, delete from hospitales
    DELETE FROM hospitales WHERE id = ANY(dup_ids);
  END LOOP;
END $$;
