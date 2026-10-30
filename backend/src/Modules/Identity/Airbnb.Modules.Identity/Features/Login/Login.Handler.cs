using Airbnb.Modules.Identity.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Identity;

internal static partial class Login
{
    internal const string InvalidCredentials = "Email or password is incorrect";

    internal sealed class Handler(IdentityDbContext db, IPasswordHasher<User> hasher, TimeProvider time, LoginThrottle throttle)
    {
        // A real hash to verify against when the email is unknown, so both failures take the same time (spec §1).
        private static readonly Lazy<string> DummyHash = new(() =>
            new PasswordHasher<User>().HashPassword(null!, Guid.NewGuid().ToString()));

        // Session null when the email or password is wrong; Blocked when the email has too many recent failures.
        public async Task<(AuthSessionDto? Session, bool Blocked)> HandleAsync(Command command, CancellationToken cancellationToken)
        {
            var email = Emails.Normalize(command.Email!);
            // The attempt is counted before the password check, so concurrent requests can't all slip past the limit.
            if (!throttle.TryBeginAttempt(email))
            {
                return (null, true);
            }

            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email, cancellationToken);
            // An account created by an external sign-in has no password: same work, same answer as an unknown email.
            if (user?.PasswordHash is null)
            {
                hasher.VerifyHashedPassword(null!, DummyHash.Value, command.Password!);
                return (null, false);
            }

            var result = hasher.VerifyHashedPassword(user, user.PasswordHash, command.Password!);
            if (result == PasswordVerificationResult.Failed)
            {
                return (null, false);
            }
            throttle.Reset(email);
            if (result == PasswordVerificationResult.SuccessRehashNeeded)
            {
                user.PasswordHash = hasher.HashPassword(user, command.Password!);
            }

            return (await SessionStore.StartAsync(db, user, time, cancellationToken), false);
        }
    }
}
