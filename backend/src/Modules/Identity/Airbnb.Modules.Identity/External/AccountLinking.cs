namespace Airbnb.Modules.Identity.External;

// Which account an external identity signs into, or why not (OAuth spec §1, "Callback rules"). Pure, so every branch
// is unit-tested; the handler only reads the rows these decisions need and carries the outcome out.
internal static class AccountLinking
{
    internal abstract record Outcome;

    // The provider account is already connected to this user.
    internal sealed record SignInAs(string UserId) : Outcome;

    // The identity's verified email is this account's, and the account's email is verified too: connect, then sign in.
    internal sealed record ConnectAndSignIn(string UserId) : Outcome;

    internal sealed record CreateAccount : Outcome;

    internal sealed record Connect : Outcome;

    internal sealed record AlreadyConnected : Outcome;

    internal sealed record Refuse(ExternalLoginError Error) : Outcome;

    // The account that already uses the identity's email.
    internal sealed record EmailOwner(string UserId, bool EmailVerified, bool HasThisProvider);

    // identityOwner: the user this provider account is connected to, if any.
    internal static Outcome ForSignIn(string? identityOwner, EmailOwner? emailOwner) => (identityOwner, emailOwner) switch
    {
        ({ } userId, _) => new SignInAs(userId),
        // Nobody proved they own an unverified email: whoever registered it with a password must not inherit this sign-in.
        (null, { EmailVerified: false }) => new Refuse(ExternalLoginError.AccountExists),
        (null, { HasThisProvider: true }) => new Refuse(ExternalLoginError.ProviderAlreadyConnected),
        (null, { } owner) => new ConnectAndSignIn(owner.UserId),
        (null, null) => new CreateAccount(),
    };

    // A signed-in user connecting a provider account from Login & security.
    internal static Outcome ForConnect(string userId, string? identityOwner, bool userHasThisProvider) => identityOwner switch
    {
        null when userHasThisProvider => new Refuse(ExternalLoginError.ProviderAlreadyConnected),
        null => new Connect(),
        _ when identityOwner == userId => new AlreadyConnected(),
        _ => new Refuse(ExternalLoginError.IdentityInUse),
    };
}
