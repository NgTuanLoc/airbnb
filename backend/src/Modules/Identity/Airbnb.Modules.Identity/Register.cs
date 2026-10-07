using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Airbnb.Modules.Identity;

internal static class Register
{
    internal const string DuplicateEmail = "An account with that email already exists";

    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Command(
        [property: Required, StringLength(60, MinimumLength = 1)] string? Name,
        [property: Required, EmailAddress, StringLength(254)] string? Email,
        [property: Required, StringLength(128, MinimumLength = 8)] string? Password);

    internal sealed class Handler(IdentityDbContext db, IPasswordHasher<User> hasher, TimeProvider time)
    {
        // Null when the email is taken.
        public async Task<AuthSessionDto?> HandleAsync(Command command, CancellationToken cancellationToken)
        {
            var email = Emails.Normalize(command.Email!);
            if (await db.Users.AnyAsync(u => u.Email == email, cancellationToken))
            {
                return null;
            }

            var user = new User
            {
                Id = "usr_" + Guid.CreateVersion7().ToString("N"),
                Email = email,
                Name = command.Name!.Trim(),
                CreatedAt = time.GetUtcNow(),
            };
            user.PasswordHash = hasher.HashPassword(user, command.Password!);
            db.Users.Add(user);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                // A concurrent registration won the unique index between our check and insert.
                return null;
            }

            return await SessionStore.StartAsync(db, user, time, cancellationToken);
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/register", async Task<Results<Created<ApiResponse<AuthSessionDto>>, Conflict<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) is { } session
                ? TypedResults.Created((string?)null, ApiResponse.Ok(session))
                : TypedResults.Conflict(ApiResponse.Fail(DuplicateEmail)));
}
