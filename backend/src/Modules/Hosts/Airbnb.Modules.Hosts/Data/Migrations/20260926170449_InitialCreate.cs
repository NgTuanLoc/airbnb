using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Airbnb.Modules.Hosts.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "hosts");

            migrationBuilder.CreateTable(
                name: "hosts",
                schema: "hosts",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Avatar = table.Column<string>(type: "text", nullable: false),
                    IsSuperhost = table.Column<bool>(type: "boolean", nullable: false),
                    ResponseRate = table.Column<int>(type: "integer", nullable: false),
                    JoinedYear = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hosts", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "hosts",
                schema: "hosts");
        }
    }
}
