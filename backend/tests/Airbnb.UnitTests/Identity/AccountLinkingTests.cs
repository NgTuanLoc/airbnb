using Airbnb.Modules.Identity.External;
using static Airbnb.Modules.Identity.External.AccountLinking;

namespace Airbnb.UnitTests.Identity;

public sealed class AccountLinkingTests
{
    [Fact]
    public void A_connected_identity_signs_into_its_user_whatever_the_email() =>
        Assert.Equal(new SignInAs("usr_1"), ForSignIn("usr_1", new EmailOwner("usr_2", EmailVerified: false, HasThisProvider: false)));

    [Fact]
    public void A_new_identity_with_a_new_email_creates_an_account() =>
        Assert.IsType<CreateAccount>(ForSignIn(null, null));

    [Fact]
    public void A_verified_account_with_that_email_gets_the_identity_connected() =>
        Assert.Equal(new ConnectAndSignIn("usr_1"), ForSignIn(null, new EmailOwner("usr_1", EmailVerified: true, HasThisProvider: false)));

    [Fact]
    public void An_unverified_account_with_that_email_is_never_taken_over() =>
        Assert.Equal(new Refuse(ExternalLoginError.AccountExists), ForSignIn(null, new EmailOwner("usr_1", EmailVerified: false, HasThisProvider: false)));

    [Fact]
    public void A_verified_account_already_holding_another_account_of_this_provider_is_refused() =>
        Assert.Equal(new Refuse(ExternalLoginError.ProviderAlreadyConnected), ForSignIn(null, new EmailOwner("usr_1", EmailVerified: true, HasThisProvider: true)));

    [Fact]
    public void Connecting_a_free_identity_connects_it() =>
        Assert.IsType<Connect>(ForConnect("usr_1", identityOwner: null, userHasThisProvider: false));

    [Fact]
    public void Connecting_your_own_identity_again_changes_nothing() =>
        Assert.IsType<AlreadyConnected>(ForConnect("usr_1", identityOwner: "usr_1", userHasThisProvider: true));

    [Fact]
    public void Connecting_someone_elses_identity_is_refused() =>
        Assert.Equal(new Refuse(ExternalLoginError.IdentityInUse), ForConnect("usr_1", identityOwner: "usr_2", userHasThisProvider: false));

    [Fact]
    public void Connecting_a_second_account_of_one_provider_is_refused() =>
        Assert.Equal(new Refuse(ExternalLoginError.ProviderAlreadyConnected), ForConnect("usr_1", identityOwner: null, userHasThisProvider: true));
}
