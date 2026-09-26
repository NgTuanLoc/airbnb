using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace Airbnb.SharedKernel.Persistence;

public static class ModuleDatabase
{
    // Every module DbContext is registered the same way (spec §3): the shared NpgsqlDataSource, its own schema
    // for the migrations history table, seeding that MigrateAsync triggers, and no retrying execution strategy.
    public static IHostApplicationBuilder AddModuleDbContext<TContext>(
        this IHostApplicationBuilder builder,
        string schema,
        Func<TContext, CancellationToken, Task> seedAsync)
        where TContext : DbContext
    {
        builder.Services.AddDbContext<TContext>((services, options) => options
            .UseNpgsql(
                services.GetRequiredService<NpgsqlDataSource>(),
                npgsql => npgsql.MigrationsHistoryTable(HistoryRepository.DefaultTableName, schema))
            .UseAsyncSeeding((context, _, cancellationToken) => seedAsync((TContext)context, cancellationToken)));

        builder.Services.AddSingleton<IModuleMigrator>(services =>
            new DbContextMigrator<TContext>(services.GetRequiredService<IServiceScopeFactory>(), schema));

        return builder;
    }

    // Design-time options for `dotnet ef migrations add`: no database is contacted when generating migrations.
    public static DbContextOptions<TContext> DesignTimeOptions<TContext>(string schema)
        where TContext : DbContext =>
        new DbContextOptionsBuilder<TContext>()
            .UseNpgsql("Host=localhost;Database=design-time", npgsql => npgsql.MigrationsHistoryTable(HistoryRepository.DefaultTableName, schema))
            .Options;
}

// Singleton so the MigrationService's hosted worker can depend on it; each run gets its own scope and DbContext.
internal sealed class DbContextMigrator<TContext>(IServiceScopeFactory scopes, string module) : IModuleMigrator
    where TContext : DbContext
{
    public string Module => module;

    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<TContext>().Database.MigrateAsync(cancellationToken);
    }
}
