using Airbnb.Modules.Identity.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Airbnb.Modules.Identity;

internal static partial class Register
{
    internal const string DuplicateEmail = "An account with that email already exists";

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
                Id = User.NewId(),
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
}
