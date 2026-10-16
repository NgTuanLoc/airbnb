# Notebooks

`airbnb-sql-essentials.ipynb` teaches the SQL you use most, using queries against the backend's PostgreSQL database:
- filtering
- `GROUP BY`/`HAVING`
- joins across module schemas
- `CASE`
- CTEs and window functions
- arrays
- date ranges and overlaps
- `EXPLAIN`

Each query is followed by a short analysis of its result. The connection is read-only.

## Run it

1. Start the stack: `aspire run` from `backend/`.
2. Install the packages: `pip install -r notebooks/requirements.txt`.
3. Point it at the database. The password is in the Aspire dashboard (postgres resource) and the port is in `docker ps --filter name=postgres`:

   ```powershell
   $env:AIRBNB_DB_URL = "postgresql://postgres:<url-encoded password>@127.0.0.1:<port>/airbnb"
   jupyter notebook notebooks/airbnb-sql-essentials.ipynb
   ```

   - **Use `127.0.0.1`, not `localhost`.** Docker publishes Postgres on IPv4 only, and `localhost` can resolve to IPv6 first and hang.
   - **URL-encode special characters in the password**, for example `!` → `%21` and `)` → `%29`.
