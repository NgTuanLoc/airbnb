using Airbnb.Api.Errors;
using Airbnb.Api.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// Registered before AddProblemDetails so it is chosen ahead of the default ProblemDetails JSON writer.
builder.Services.AddSingleton<IProblemDetailsWriter, EnvelopeProblemDetailsWriter>();
builder.Services.AddProblemDetails();
builder.Services.AddApiRateLimiting(builder.Configuration);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();

app.MapDefaultEndpoints();

app.Run();
