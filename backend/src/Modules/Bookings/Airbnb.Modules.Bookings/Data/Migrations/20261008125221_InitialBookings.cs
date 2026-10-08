using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Airbnb.Modules.Bookings.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialBookings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");

            migrationBuilder.EnsureSchema(
                name: "bookings");

            migrationBuilder.CreateTable(
                name: "bookings",
                schema: "bookings",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ListingId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    HostId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    GuestId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    GuestName = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    GuestEmail = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    CheckIn = table.Column<DateOnly>(type: "date", nullable: false),
                    CheckOut = table.Column<DateOnly>(type: "date", nullable: false),
                    Adults = table.Column<int>(type: "integer", nullable: false),
                    Children = table.Column<int>(type: "integer", nullable: false),
                    NightlyPrice = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    Nights = table.Column<int>(type: "integer", nullable: false),
                    CleaningFee = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    ServiceFee = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    Total = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CancelledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bookings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bookings_GuestId",
                schema: "bookings",
                table: "bookings",
                column: "GuestId");

            migrationBuilder.CreateIndex(
                name: "IX_bookings_HostId",
                schema: "bookings",
                table: "bookings",
                column: "HostId");

            migrationBuilder.CreateIndex(
                name: "IX_bookings_ListingId_CheckIn",
                schema: "bookings",
                table: "bookings",
                columns: new[] { "ListingId", "CheckIn" });

            // No two confirmed stays of one listing may share a night; [CheckIn, CheckOut) is half-open, so back-to-back is fine.
            migrationBuilder.Sql("""
                ALTER TABLE bookings.bookings ADD CONSTRAINT bookings_no_overlap
                EXCLUDE USING gist ("ListingId" WITH =, daterange("CheckIn", "CheckOut", '[)') WITH &&)
                WHERE ("Status" = 'confirmed');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE bookings.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;");

            migrationBuilder.DropTable(
                name: "bookings",
                schema: "bookings");
        }
    }
}
