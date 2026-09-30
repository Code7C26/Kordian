-- AR-PRICE: subcategories are the only logical comparison level.
-- Remove the obsolete comparable-groups layer after products have subcategory_id.

alter table products drop column if exists comparable_group_id;
drop table if exists comparable_groups;
