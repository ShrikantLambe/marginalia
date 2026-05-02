-- Prevent the same URL being saved twice by the same user
-- Prerequisite: 004_fix_embedding_dimension.sql
alter table reading_list
  add constraint reading_list_user_url_unique unique (user_id, url);
