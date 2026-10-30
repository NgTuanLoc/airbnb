using System.Diagnostics;
using Airbnb.Modules.Identity.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Airbnb.Modules.Identity.External;

internal static partial class CompleteExternalLogin
{
    private const int MaxNameLength = 60;

    internal sealed class Handler(IdentityDbContext db, ExternalProviders providers, TimeProvider time)
    {
        public async Task<ResultDto> HandleAsync(Command command, CancellationToken cancellationToken)
        {
            var flow = await TakeFlowAsync(command.FlowId!, cancellationToken);
            if (flow is null || flow.ExpiresAt <= time.GetUtcNow())
            {
                throw new ExternalLoginException(ExternalLoginError.FlowExpired);
            }
            // The callback URL's provider must be the one the flow went to (IdP mix-up), with the state it was given.
            if (flow.Provider != command.Provider || !Secrets.Equal(command.State, flow.State))
            {
                throw new ExternalLoginException(ExternalLoginError.FlowMismatch);
            }
            var provider = providers.Find(flow.Provider) ?? throw new ExternalLoginException(ExternalLoginError.ProviderUnavailable);
            var identity = await provider.ExchangeAsync(
                new CodeExchange(command.Code!, providers.RedirectUri(provider), flow.CodeVerifier, flow.Nonce, command.Iss),
                cancellationToken);

            return flow.LinkUserId is { } userId
                ? new ResultDto(null, await RetryOnceAsync(() => ConnectAsync(userId, provider, identity, cancellationToken)))
                : new ResultDto(await RetryOnceAsync(() => SignInAsync(provider, identity, cancellationToken)), null);
        }

        // Single use: only the request whose delete removes the row carries on, so neither a replayed callback nor a
        // concurrent one can redeem the same flow twice.
        private async Task<ExternalLoginFlow?> TakeFlowAsync(string flowId, CancellationToken cancellationToken)
        {
            var hash = SessionTokens.Hash(flowId);
            var flow = await db.ExternalLoginFlows.AsNoTracking().SingleOrDefaultAsync(f => f.IdHash == hash, cancellationToken);
            if (flow is null)
            {
                return null;
            }
            return await db.ExternalLoginFlows.Where(f => f.IdHash == hash).ExecuteDeleteAsync(cancellationToken) == 1 ? flow : null;
        }

        // A concurrent sign-in or connect can win a unique index between our reads and our insert; deciding again
        // from fresh rows then finds what it created.
        private async Task<T> RetryOnceAsync<T>(Func<Task<T>> attempt)
        {
            try
            {
                return await attempt();
            }
            catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                db.ChangeTracker.Clear();
                return await attempt();
            }
        }

        private async Task<AuthSessionDto> SignInAsync(IExternalProvider provider, ExternalIdentity identity, CancellationToken cancellationToken)
        {
            var login = await db.ExternalLogins.Include(l => l.User)
                .SingleOrDefaultAsync(l => l.Provider == provider.Key && l.Subject == identity.Subject, cancellationToken);
            var emailOwner = login is null ? await db.Users.SingleOrDefaultAsync(u => u.Email == identity.Email, cancellationToken) : null;
            var ownerHasProvider = emailOwner is not null
                && await db.ExternalLogins.AnyAsync(l => l.UserId == emailOwner.Id && l.Provider == provider.Key, cancellationToken);
            var now = time.GetUtcNow();

            switch (AccountLinking.ForSignIn(
                login?.UserId,
                emailOwner is null ? null : new AccountLinking.EmailOwner(emailOwner.Id, emailOwner.EmailVerifiedAt is not null, ownerHasProvider)))
            {
                case AccountLinking.SignInAs:
                    login!.Email = identity.Email;
                    return await SessionStore.StartAsync(db, login.User, time, cancellationToken);
                case AccountLinking.ConnectAndSignIn:
                    db.ExternalLogins.Add(NewLogin(provider, identity, emailOwner!.Id, now));
                    return await SessionStore.StartAsync(db, emailOwner, time, cancellationToken);
                case AccountLinking.CreateAccount:
                    var user = new User
                    {
                        Id = User.NewId(),
                        Email = identity.Email,
                        Name = AccountName(identity),
                        EmailVerifiedAt = now,
                        CreatedAt = now,
                    };
                    db.Users.Add(user);
                    db.ExternalLogins.Add(NewLogin(provider, identity, user.Id, now));
                    return await SessionStore.StartAsync(db, user, time, cancellationToken);
                case AccountLinking.Refuse refuse:
                    throw new ExternalLoginException(refuse.Error);
                default:
                    throw new UnreachableException();
            }
        }

        private async Task<LinkedDto> ConnectAsync(string userId, IExternalProvider provider, ExternalIdentity identity, CancellationToken cancellationToken)
        {
            var identityOwner = await db.ExternalLogins
                .Where(l => l.Provider == provider.Key && l.Subject == identity.Subject)
                .Select(l => l.UserId)
                .SingleOrDefaultAsync(cancellationToken);
            var userHasProvider = await db.ExternalLogins.AnyAsync(l => l.UserId == userId && l.Provider == provider.Key, cancellationToken);

            switch (AccountLinking.ForConnect(userId, identityOwner, userHasProvider))
            {
                case AccountLinking.AlreadyConnected:
                    return new LinkedDto(provider.Key, identity.Email);
                case AccountLinking.Connect:
                    var user = await db.Users.SingleAsync(u => u.Id == userId, cancellationToken);
                    db.ExternalLogins.Add(NewLogin(provider, identity, userId, time.GetUtcNow()));
                    // The person just proved they control the account's email: later sign-ins may link to it on their own.
                    if (user.EmailVerifiedAt is null && user.Email == identity.Email)
                    {
                        user.EmailVerifiedAt = time.GetUtcNow();
                    }
                    await db.SaveChangesAsync(cancellationToken);
                    return new LinkedDto(provider.Key, identity.Email);
                case AccountLinking.Refuse refuse:
                    throw new ExternalLoginException(refuse.Error);
                default:
                    throw new UnreachableException();
            }
        }

        private static ExternalLogin NewLogin(IExternalProvider provider, ExternalIdentity identity, string userId, DateTimeOffset now) => new()
        {
            Provider = provider.Key,
            Subject = identity.Subject,
            UserId = userId,
            Email = identity.Email,
            CreatedAt = now,
        };

        // The provider's name for the person, else the email's local part; at most the 60 characters an account name allows.
        private static string AccountName(ExternalIdentity identity)
        {
            var name = string.IsNullOrWhiteSpace(identity.Name) ? identity.Email[..identity.Email.IndexOf('@')] : identity.Name.Trim();
            return name.Length <= MaxNameLength ? name : name[..MaxNameLength].TrimEnd();
        }
    }
}
