using Airbnb.Api.Errors;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// Registered before AddProblemDetails so it is chosen ahead of the default ProblemDetails JSON writer.
builder.Services.AddSingleton<IProblemDetailsWriter, EnvelopeProblemDetailsWriter>();
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

app.MapDefaultEndpoints();

app.Run();
