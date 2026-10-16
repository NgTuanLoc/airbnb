# Notebooks

`airbnb-sql-essentials.sql` is a SQL-only notebook that teaches the SQL you use most, with queries against the backend's PostgreSQL database:
- filtering
- `GROUP BY`/`HAVING`
- joins across module schemas
- `CASE`
- CTEs and window functions
- arrays
- date ranges and overlaps
- `EXPLAIN`

Each query is followed by a short analysis of its result. Every query is a read-only `select` or `explain`.

## Run it

1. Start the stack: `aspire run` from `backend/`.
2. In VS Code, install the **SQL Notebook** extension (`cmoog.sqlnotebook`).
3. Right-click `airbnb-sql-essentials.sql` and choose **Open With… → SQL Notebook**.
4. In the **SQL Notebook** side panel, add a PostgreSQL connection:
   - host `127.0.0.1`
   - port from `docker ps --filter name=postgres`
   - database `airbnb`
   - user `postgres`
   - password from the Aspire dashboard (postgres resource)

**Use `127.0.0.1`, not `localhost`.** Docker publishes Postgres on IPv4 only, and `localhost` can resolve to IPv6 first and hang.

The file is also plain SQL, so `psql -f notebooks/airbnb-sql-essentials.sql` runs it top to bottom.

## Editing

One blank line separates cells, so a cell can't contain a blank line. Markdown cells are block comments whose first line is `/*markdown`.
