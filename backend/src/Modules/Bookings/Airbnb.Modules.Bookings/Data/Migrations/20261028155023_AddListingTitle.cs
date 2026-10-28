using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Airbnb.Modules.Bookings.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddListingTitle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ListingTitle",
                schema: "bookings",
                table: "bookings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ListingTitle",
                schema: "bookings",
                table: "bookings");
        }
    }
}
