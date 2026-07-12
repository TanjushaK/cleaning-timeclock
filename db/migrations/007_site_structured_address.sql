alter table sites add column if not exists street text;
alter table sites add column if not exists house_number text;
alter table sites add column if not exists house_number_addition text;
alter table sites add column if not exists postal_code text;
alter table sites add column if not exists city text;
alter table sites add column if not exists country_code text;
alter table sites add column if not exists formatted_address text;
alter table sites add column if not exists geocode_provider text;
alter table sites add column if not exists coordinates_source text not null default 'legacy_unverified';
alter table sites add column if not exists coordinates_verified_at timestamptz;
alter table sites add column if not exists coordinates_verified_by uuid;

update sites
set coordinates_source = 'legacy_unverified'
where coordinates_source is null or btrim(coordinates_source) = '';

create index if not exists sites_coordinates_source_idx on sites(coordinates_source);
create index if not exists sites_postal_code_idx on sites(postal_code);
