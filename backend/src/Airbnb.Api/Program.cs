var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

var app = builder.Build();

app.MapDefaultEndpoints();

app.Run();
