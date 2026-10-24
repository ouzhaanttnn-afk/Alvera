-- Additive change; existing document records and their access rules remain intact.
alter table public.application_documents
  drop constraint application_documents_kind_check;
alter table public.application_documents
  add constraint application_documents_kind_check
  check (kind in ('front', 'back', 'signature', 'residence'));
alter table public.application_documents
  add constraint residence_document_pdf_only
  check (kind <> 'residence' or mime = 'application/pdf');
