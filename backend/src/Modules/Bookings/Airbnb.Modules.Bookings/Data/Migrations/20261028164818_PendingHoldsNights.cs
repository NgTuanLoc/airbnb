using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Airbnb.Modules.Bookings.Data.Migrations
{
    /// <inheritdoc />
    public partial class PendingHoldsNights : Migration
    {
        // A pending booking (saved before its payment) holds its nights too, so two guests can't pay for the same stay.
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder) => Recreate(migrationBuilder, "\"Status\" IN ('pending', 'confirmed')");

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder) => Recreate(migrationBuilder, "\"Status\" = 'confirmed'");

        private static void Recreate(MigrationBuilder migrationBuilder, string holds) =>
            migrationBuilder.Sql($"""
                ALTER TABLE bookings.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
                ALTER TABLE bookings.bookings ADD CONSTRAINT bookings_no_overlap
                EXCLUDE USING gist ("ListingId" WITH =, daterange("CheckIn", "CheckOut", '[)') WITH &&)
                WHERE ({holds});
                """);
    }
}
