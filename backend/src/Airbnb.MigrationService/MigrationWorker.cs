using Airbnb.SharedKernel;

namespace Airbnb.MigrationService;

// Runs every module's migrations once, in registration order, then stops the process.
// A non-zero exit code keeps Aspire from starting the API (WaitForCompletion) on a half-migrated database.
internal sealed partial class MigrationWorker(
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
                LogMigrating(logger, migrator.Module);
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

    [LoggerMessage(Level = LogLevel.Information, Message = "Migrating module {Module}")]
    private static partial void LogMigrating(ILogger logger, string module);
}
