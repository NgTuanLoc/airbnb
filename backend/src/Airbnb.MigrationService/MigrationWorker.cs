using Airbnb.SharedKernel;

namespace Airbnb.MigrationService;

// Runs every module's migrations once, in registration order, then stops the process.
// A non-zero exit code keeps Aspire from starting the API (WaitForCompletion) on a half-migrated database.
internal sealed class MigrationWorker(
    IEnumerable<IModuleMigrator> migrators,
    IHostApplicationLifetime lifetime,
    ILogger<MigrationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            foreach (var migrator in migrators)
            {
                logger.LogInformation("Migrating module {Module}", migrator.Module);
                await migrator.MigrateAsync(stoppingToken);
            }

            logger.LogInformation("All module migrations completed");
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Module migration failed");
            Environment.ExitCode = 1;
        }
        finally
        {
            lifetime.StopApplication();
        }
    }
}
