using Airbnb.MigrationService;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHostedService<MigrationWorker>();

builder.Build().Run();
