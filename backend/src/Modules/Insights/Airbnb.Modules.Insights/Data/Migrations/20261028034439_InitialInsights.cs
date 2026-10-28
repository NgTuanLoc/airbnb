using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Airbnb.Modules.Insights.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialInsights : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "insights");

            migrationBuilder.CreateTable(
                name: "consumer_offsets",
                schema: "insights",
                columns: table => new
                {
                    Topic = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Partition = table.Column<int>(type: "integer", nullable: false),
                    NextOffset = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_consumer_offsets", x => new { x.Topic, x.Partition });
                });

            migrationBuilder.CreateTable(
                name: "listing_daily_views",
                schema: "insights",
                columns: table => new
                {
                    ListingId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    Views = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_listing_daily_views", x => new { x.ListingId, x.Day });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "consumer_offsets",
                schema: "insights");

            migrationBuilder.DropTable(
                name: "listing_daily_views",
                schema: "insights");
        }
    }
}
