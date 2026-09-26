namespace Airbnb.SharedKernel;

// Implemented by each module's persistence layer. The MigrationService runs every registered migrator once at startup.
public interface IModuleMigrator
{
    string Module { get; }

    Task MigrateAsync(CancellationToken cancellationToken);
}
