/*markdown
# Essential SQL on the Airbnb clone database
This notebook covers the SQL you reach for most often: filtering, aggregating, joining, CTEs, window functions, arrays, date ranges and query plans. Every query runs against the real PostgreSQL database behind the .NET backend, and each one ends with a short analysis of what the result says.
*/

/*markdown
**How to open it.** Install the VS Code extension **SQL Notebook** (`cmoog.sqlnotebook`). Right-click this file, choose **Open With… → SQL Notebook**, then add a PostgreSQL connection in the **SQL Notebook** side panel:
*/

/*markdown
| Field | Value |
|---|---|
| Host | `127.0.0.1` (not `localhost`: Docker publishes Postgres on IPv4 only) |
| Port | from `docker ps --filter name=postgres` |
| Database | `airbnb` |
| User | `postgres` |
| Password | from the Aspire dashboard (postgres resource); never typed into this file |
*/

/*markdown
**Format rules for editing.** Cells are separated by one blank line, so a cell can't contain a blank line inside it. Markdown cells are block comments whose opening line is the comment start followed by the word `markdown`. Every query here is a read-only `select` (or `explain`).
*/

/*markdown
**What's in the database.** The backend is a modular monolith: each module owns its own **schema** inside the one `airbnb` database.
*/

/*markdown
| Schema | Owns | Main table |
|---|---|---|
| `stays` | homes and cities | `stays.listings`, `stays.cities` |
| `experiences` | activities | `experiences.experiences` |
| `services` | bookable services | `services.services` |
| `hosts` | host profiles | `hosts.hosts` |
| `reviews` | guest reviews | `reviews.reviews` |
| `identity` | accounts and sessions | `identity.users`, `identity.sessions` |
| `bookings` | reservations | `bookings.bookings` |
*/

/*markdown
## 0. A naming rule you'll hit immediately
EF Core created the columns in **PascalCase** (`PricePerNight`, `HostId`). PostgreSQL folds unquoted names to lower case, so these columns **must be double-quoted**: `select "PricePerNight" from stays.listings` works, while `select PricePerNight from stays.listings` fails with *column "pricepernight" does not exist*. Owned types are flattened into prefixed columns such as `"Location_City"`.
*/

select current_database() as database, version() as server;

/*markdown
## 1. Getting oriented: how much data is there?
`count(*)` per table, stitched together with `union all`. This is the first query to run against any unfamiliar database.
*/

select 'stays.listings'          as "table", count(*) as "rows" from stays.listings
union all select 'stays.cities',            count(*) from stays.cities
union all select 'hosts.hosts',             count(*) from hosts.hosts
union all select 'experiences.experiences', count(*) from experiences.experiences
union all select 'services.services',       count(*) from services.services
union all select 'reviews.reviews',         count(*) from reviews.reviews
union all select 'identity.users',          count(*) from identity.users
union all select 'bookings.bookings',       count(*) from bookings.bookings;

/*markdown
**Analysis.** The catalog is small and fixed: 16 stays, 12 experiences and 12 services, all seeded from the frontend's mock data. `reviews`, `identity` and `bookings` hold what people actually do in the app, so their counts grow with use. While `bookings` is empty, the booking query in section 8 returns no rows; the same date logic is then shown on inline sample data.
*/

/*markdown
## 2. `SELECT … WHERE … ORDER BY … LIMIT`: the everyday query
The five cheapest stays that fit a party of 4. In application code the `4` would be a bound **parameter** rather than text pasted into the SQL; parameters are what keep SQL injection out.
*/

select "Id", "Title", "Location_City" as city, "PricePerNight" as price, "MaxGuests" as max_guests, "Rating"
from stays.listings
where "MaxGuests" >= 4
order by "PricePerNight", "Rating" desc
limit 5;

/*markdown
**Analysis.** For four guests, Lisbon's city loft ($145) is the cheapest option. Price alone flatters small places, though: to compare value fairly you need **price per guest** (section 5).
*/

/*markdown
## 3. `GROUP BY` and `HAVING`: summarising by city
Aggregates collapse rows into one row per group. `WHERE` filters rows **before** grouping; `HAVING` filters groups **after**.
*/

select "Location_City"                 as city,
       count(*)                        as listings,
       round(avg("PricePerNight"), 0)  as avg_price,
       min("PricePerNight")            as min_price,
       max("PricePerNight")            as max_price,
       round(avg("Rating"), 2)         as avg_rating
from stays.listings
group by "Location_City"
having count(*) >= 2
order by avg_price desc;

/*markdown
**Analysis.**
- **Malibu is the premium market.** Its average nightly price (about $442) is roughly three times Wilmington's (about $134).
- **Ratings barely move with price.** Every city averages between 4.75 and 4.89, so in this catalog paying more buys location, not higher satisfaction.
- **Kyoto has the widest spread** ($95–$285): one budget option and one premium option, with nothing in between.
*/

/*markdown
## 4. `JOIN` across schemas: are superhosts different?
Modules can't read each other's tables in the application code, but SQL can join across schemas freely, which is exactly what analysis needs. `stays.listings."HostId"` points at `hosts.hosts."Id"`.
*/

select h."IsSuperhost"                    as superhost,
       count(*)                           as listings,
       round(avg(l."Rating"), 3)          as avg_rating,
       round(avg(l."PricePerNight"), 0)   as avg_price,
       round(avg(h."ResponseRate"), 0)    as avg_response_rate
from stays.listings l
join hosts.hosts h on h."Id" = l."HostId"
group by h."IsSuperhost"
order by superhost desc;

/*markdown
**Analysis.** Superhosts run 10 of the 16 listings. Their listings rate higher (about **4.90 vs 4.77**), cost about **twice as much** (about $315 vs $145 a night), and the hosts answer more messages (**98% vs 89%** response rate). With only 16 rows this is a **correlation, not proof**: the premium Malibu villas may simply belong to superhosts. Section 6 shows how much price depends on city alone.
*/

/*markdown
## 5. `CASE`: turning numbers into categories
`CASE` buckets a continuous value into labels. Combined with `GROUP BY`, it gives a distribution. Here it also shows **price per guest**, a fairer measure of value.
*/

select case
         when "PricePerNight" < 150 then '1. budget (< $150)'
         when "PricePerNight" < 300 then '2. mid ($150-299)'
         else                            '3. premium ($300+)'
       end                                                  as price_band,
       count(*)                                             as listings,
       round(avg("PricePerNight"), 0)                       as avg_price,
       round(avg("PricePerNight" / "MaxGuests"), 1)         as avg_price_per_guest,
       round(avg("Rating"), 2)                              as avg_rating
from stays.listings
group by price_band
order by price_band;

/*markdown
**Analysis.** Half the catalog (8 of 16) sits in the mid band. A premium night costs about **3.6×** a budget one (roughly $393 vs $109), but **per guest only about 1.4×** ($61 vs $43), because premium places sleep more people. For group trips, value per guest is the better ranking. Ratings rise slightly with price (4.75 → 4.89).
*/

/*markdown
## 6. CTEs and window functions: ranking within a group
A **CTE** (`with … as`) names an intermediate result so the query reads top-down. **Window functions** (`over (partition by …)`) compute across related rows *without* collapsing them, unlike `GROUP BY`. Here each listing is compared with its own city's average.
*/

with priced as (
    select "Id", "Title", "Location_City" as city, "PricePerNight" as price,
           avg("PricePerNight") over (partition by "Location_City")             as city_avg,
           rank()               over (partition by "Location_City"
                                      order by "PricePerNight" desc)           as price_rank_in_city
    from stays.listings
)
select city, price_rank_in_city as "rank", "Title", price,
       round(city_avg, 0)                              as city_avg,
       round(100.0 * (price - city_avg) / city_avg, 0) as pct_vs_city_avg
from priced
order by city, price_rank_in_city;

/*markdown
**Analysis.** Within a city, prices still vary widely. Kyoto's top listing is about 50% above its city average while its budget option is about 50% below it. This per-city view is what the host earnings estimate needs: comparing a new Kyoto listing with the *overall* average would mislead.
*/

/*markdown
## 7. Arrays: `unnest` and data-quality checks
`"Amenities"` is a PostgreSQL `text[]`. `unnest` expands an array into one row per element, so ordinary aggregates work on it.
*/

select amenity, count(*) as listings
from stays.listings, unnest("Amenities") as amenity
group by amenity
order by listings desc, amenity;

/*markdown
Next, check a **denormalised counter** (`"ReviewCount"`) against the review rows that actually exist. The `left join` keeps listings that have no review rows; an inner join would silently drop them.
*/

select l."Id", l."Title", l."ReviewCount" as review_count_column,
       count(r."Id")                    as review_rows_stored,
       round(avg(r."Rating"), 2)        as avg_stored_rating
from stays.listings l
left join reviews.reviews r on r."SubjectType" = 'stay' and r."SubjectId" = l."Id"
group by l."Id", l."Title", l."ReviewCount"
order by l."ReviewCount" desc
limit 8;

/*markdown
**Analysis.**
- **Amenities have no variance.** All 16 listings share the same six amenities, so amenity filters can't distinguish anything yet. This comes from the seed data; listings created by hosts can add more.
- **`ReviewCount` is not a count of stored rows.** The cliffside home shows 201 reviews while 2 rows exist. The seeded counts are display numbers, and only *new* reviews increment them through the review messaging flow. Treat the column as the figure for display and the `reviews` table as a sample.
- **Ratings are uniformly high.** Stored reviews average 5.0, so they carry no signal for ranking yet.
*/

/*markdown
## 8. Dates and ranges: bookings and overlaps
Bookings are half-open date ranges `[CheckIn, CheckOut)`: the check-out day isn't a night stayed. PostgreSQL has a native **`daterange`** type with an overlap operator **`&&`**. The database uses exactly this in an exclusion constraint, so two confirmed stays on one listing can never share a night. First, the live booking summary (empty until someone books in api mode):
*/

select date_trunc('month', "CheckIn")::date as month,
       count(*)                            as bookings,
       sum("Nights")                       as nights,
       sum("Total")                        as revenue,
       round(avg("Nights"), 1)             as avg_stay_nights
from bookings.bookings
where "Status" = 'confirmed'
group by month
order by month;

/*markdown
The same date logic on **inline sample rows** (`values (…)`), so you can see it work without writing anything. The query pairs every two stays of one listing and reports whether their nights overlap.
*/

with sample(id, listing, check_in, check_out) as (
    values ('A', 'l1', date '2031-02-01', date '2031-02-05'),
           ('B', 'l1', date '2031-02-05', date '2031-02-08'),  -- starts on A's check-out day
           ('C', 'l1', date '2031-02-03', date '2031-02-06'),  -- inside A
           ('D', 'l2', date '2031-02-03', date '2031-02-06')   -- another listing
)
select a.id as stay, b.id as other_stay, a.listing,
       daterange(a.check_in, a.check_out, '[)') && daterange(b.check_in, b.check_out, '[)') as overlaps
from sample a
join sample b on a.listing = b.listing and a.id < b.id
order by stay, other_stay;

/*markdown
**Analysis.** A–B **don't** overlap: B checks in the day A checks out, which is a valid back-to-back turnover. A–C and B–C **do**, so the database would refuse C. D is on another listing and is never compared. This is the same rule as the `bookings_no_overlap` exclusion constraint, which also enforces it under concurrent inserts.
*/

/*markdown
`generate_series` expands each stay into the individual nights it occupies, which is how an occupancy calendar is built:
*/

with sample(id, check_in, check_out) as (
    values ('A', date '2031-02-01', date '2031-02-05'),
           ('B', date '2031-02-05', date '2031-02-08')
)
select id, night::date as night
from sample, generate_series(check_in, check_out - 1, interval '1 day') as night
order by night;

/*markdown
## 9. Reading query plans with `EXPLAIN`
`EXPLAIN` shows how PostgreSQL will run a query: which indexes it uses and what the joins cost. Below is the plan for the availability lookup the calendar runs on every listing page.
*/

explain
select "CheckIn", "CheckOut"
from bookings.bookings
where "ListingId" = 'l1' and "Status" = 'confirmed' and "CheckOut" > current_date
order by "CheckIn";

/*markdown
**Analysis.** The planner uses an **index scan** on `IX_bookings_ListingId_CheckIn`. The `Index Cond` jumps straight to one listing's rows, which already come back sorted by `CheckIn`, so the `order by` costs nothing extra. `Status` and `CheckOut` are applied as a `Filter` on those few rows, which is cheap because one listing has few bookings. On a tiny table the planner may switch to a sequential scan, which is fine. Use `explain analyze` (it really executes the query) to compare estimated and actual row counts when tuning.
*/

/*markdown
The indexes on the bookings table. `bookings_no_overlap` is the **GiST index behind the exclusion constraint** from section 8; the B-tree indexes serve the guest, host and listing lookups.
*/

select indexname, indexdef
from pg_indexes
where schemaname = 'bookings' and tablename = 'bookings'
order by indexname;

/*markdown
## 10. Cheat sheet
| Need | Reach for |
|---|---|
| Filter rows | `where`, with **parameters** in application code |
| One row per group | `group by` + aggregates, `having` to filter groups |
| Combine tables (even across schemas) | `join`; `left join` to keep rows with no match |
| Categories from numbers | `case when … then … end` |
| Compare a row with its group | window functions: `avg(…) over (partition by …)`, `rank()` |
| Readable multi-step logic | CTEs: `with step as (…) select …` |
| Array columns | `unnest(...)` |
| Date ranges and overlaps | `daterange(start, end, '[)')` with `&&`, and `generate_series` |
| Why is it slow? | `explain` / `explain analyze`, and `pg_indexes` |
*/

/*markdown
## What the data says
- **City drives price far more than quality.** Malibu costs about three times Wilmington, while ratings stay between 4.75 and 4.89 everywhere.
- **Superhost listings rate higher and cost about twice as much.** The sample is small; control for city before drawing conclusions.
- **Watch the denormalised counters.** `ReviewCount` is a display figure; the `reviews` table is a sample. Seeded amenities and ratings carry no signal yet.
- **Bookings are empty until people book.** The overlap rule is enforced by the database itself, so the analysis can trust there are no double bookings.
*/