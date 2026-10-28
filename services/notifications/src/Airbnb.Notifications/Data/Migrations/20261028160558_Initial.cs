using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Airbnb.Notifications.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "pending_reminders",
                columns: table => new
                {
                    BookingId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ListingId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ListingTitle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    GuestName = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    GuestEmail = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    CheckOut = table.Column<DateOnly>(type: "date", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Cancelled = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pending_reminders", x => x.BookingId);
                });

            migrationBuilder.CreateTable(
                name: "sent_emails",
                columns: table => new
                {
                    BookingId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SentAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sent_emails", x => new { x.BookingId, x.Kind });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "pending_reminders");

            migrationBuilder.DropTable(
                name: "sent_emails");
        }
    }
}
