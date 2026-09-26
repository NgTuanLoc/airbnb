using Airbnb.MigrationService;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// Every module's database; each registers an IModuleMigrator that the worker runs.
builder.AddStaysModuleDatabase();
builder.AddHostsModuleDatabase();
builder.AddExperiencesModuleDatabase();
builder.AddServicesModuleDatabase();

builder.Services.AddHostedService<MigrationWorker>();

builder.Build().Run();
