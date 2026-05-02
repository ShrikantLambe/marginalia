-- Prevent the same URL being saved twice by the same user
alter table reading_list
  add constraint reading_list_user_url_unique unique (user_id, url);
