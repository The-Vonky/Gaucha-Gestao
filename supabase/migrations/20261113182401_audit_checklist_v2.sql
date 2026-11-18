begin;

-- As auditorias existentes mantêm a redação que serviu de base para as respostas.
-- Publica uma nova versão com as mesmas chaves, posições e numeração global.
do $$
declare
  previous constant text := 'checklist-geral-2026-09-22-v1';
  revised constant text := 'checklist-geral-2026-11-13-v2';
  copied integer;
  changed integer;
begin
  update audit.checklist_templates set active = false
  where version = previous and active and item_count = 158;
  if not found then
    raise exception 'Versão anterior do Checklist Geral ausente ou inativa';
  end if;

  insert into audit.checklist_templates(version, name, item_count, active)
  select revised, name, item_count, true
  from audit.checklist_templates where version = previous;

  insert into audit.checklist_sections(template_version, key, position, name)
  select revised, key, position, name
  from audit.checklist_sections where template_version = previous;
  get diagnostics copied = row_count;
  if copied <> 9 then
    raise exception 'Quantidade inesperada de seções do Checklist Geral';
  end if;

  with revisions(key, section_key, number, text) as (values
    ('item-014', 'section-02', 14, 'A entrada da cozinha está limpa, livre de objetos sem uso, caixas de madeira ou papelão?'),
    ('item-024', 'section-02', 24, 'A cozinha se encontra livre de caixas de papelão e madeira ?'),
    ('item-057', 'section-04', 57, 'Os freezers e câmaras frias encontram-se em bom funcionamento'),
    ('item-122', 'section-07', 122, 'Não foram identificados sinais e/ou insetos / roedores na área no momento da inspeção?'),
    ('item-125', 'section-07', 125, 'Não existe alimento acondicionado diretamente sobre o chão?'),
    ('item-127', 'section-07', 127, 'Não há caixas de papelão ou madeira no estoque?'),
    ('item-131', 'section-08', 131, 'Não existem alimentos que necessitam de refrigeração acondicionados em temperatura ambiente?'),
    ('item-133', 'section-08', 133, 'Não existem alimentos abertos sem identificação?'),
    ('item-146', 'section-08', 146, 'A unidade não faz uso de pano de prato?'),
    ('item-147', 'section-08', 147, 'Não existem alimentos acondicionados de maneira incorreta?'),
    ('item-148', 'section-08', 148, 'Não há indícios de reaproveitamento de embalagens?'),
    ('item-149', 'section-08', 149, 'Não há indícios de reaproveitamento de sobras?'),
    ('item-152', 'section-09', 152, 'A unidade não realiza pedidos emergenciais regularmente?'),
    ('item-153', 'section-09', 153, 'A unidade não realiza pedido manual de mercadorias?')
  ), inserted as (
    insert into audit.checklist_items(template_version, key, section_key, position, number, text)
    select revised, item.key, item.section_key, item.position, item.number,
           coalesce(revision.text, item.text)
    from audit.checklist_items item
    left join revisions revision using (key, section_key, number)
    where item.template_version = previous
    returning key, section_key, number
  )
  select count(*), count(revision.key) into copied, changed
  from inserted left join revisions revision using (key, section_key, number);
  if copied <> 158 or changed <> 14 then
    raise exception 'Quantidade inesperada de itens ou revisões do Checklist Geral';
  end if;
end $$;

commit;
