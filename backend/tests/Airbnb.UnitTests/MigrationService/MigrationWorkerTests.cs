using Airbnb.MigrationService;
using Airbnb.SharedKernel;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace Airbnb.UnitTests.MigrationService;

public sealed class MigrationWorkerTests
{
    [Fact]
    public async Task Runs_every_migrator_in_registration_order_then_stops_the_host()
    {
        var log = new List<string>();
        var lifetime = new FakeLifetime();

        await RunAsync(lifetime, new RecordingMigrator("stays", log), new RecordingMigrator("reviews", log));

        Assert.Equal(["stays", "reviews"], log);
        Assert.True(lifetime.StopRequested);
    }

    [Fact]
    public async Task A_failing_migrator_stops_the_run_and_exits_non_zero()
    {
        var log = new List<string>();
        var lifetime = new FakeLifetime();
        try
        {
            await RunAsync(lifetime, new FailingMigrator(), new RecordingMigrator("after-failure", log));

            Assert.Empty(log);
            Assert.Equal(1, Environment.ExitCode);
            Assert.True(lifetime.StopRequested);
        }
        finally
        {
            Environment.ExitCode = 0;
        }
    }

    [Fact]
    public async Task With_no_migrators_the_host_still_stops()
    {
        var lifetime = new FakeLifetime();

        await RunAsync(lifetime);

        Assert.True(lifetime.StopRequested);
    }

    private static async Task RunAsync(FakeLifetime lifetime, params IModuleMigrator[] migrators)
    {
        var worker = new MigrationWorker(migrators, lifetime, NullLogger<MigrationWorker>.Instance);

        await worker.StartAsync(TestContext.Current.CancellationToken);
        await worker.ExecuteTask!;
    }

    private sealed class RecordingMigrator(string module, List<string> log) : IModuleMigrator
    {
        public string Module => module;

        public Task MigrateAsync(CancellationToken cancellationToken)
        {
            log.Add(module);
            return Task.CompletedTask;
        }
    }

    private sealed class FailingMigrator : IModuleMigrator
    {
        public string Module => "broken";

        public Task MigrateAsync(CancellationToken cancellationToken) =>
            throw new InvalidOperationException("migration failed");
    }

    private sealed class FakeLifetime : IHostApplicationLifetime
    {
        public bool StopRequested { get; private set; }

        public CancellationToken ApplicationStarted => CancellationToken.None;

        public CancellationToken ApplicationStopping => CancellationToken.None;

        public CancellationToken ApplicationStopped => CancellationToken.None;

        public void StopApplication() => StopRequested = true;
    }
}
