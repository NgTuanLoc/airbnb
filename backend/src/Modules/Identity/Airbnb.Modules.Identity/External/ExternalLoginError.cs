using System.Diagnostics.CodeAnalysis;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Airbnb.Modules.Identity.External;

// Every way an external sign-in can fail, with the envelope's machine-readable code (OAuth spec §1, endpoint table).
// The frontend shows its own text per code; these messages are for API clients and logs.
internal sealed record ExternalLoginError(string Code, string Message, int Status)
{
    internal static readonly ExternalLoginError ProviderUnavailable =
        new("provider_unavailable", "That sign-in option isn't available.", StatusCodes.Status404NotFound);

    internal static readonly ExternalLoginError SsoNotConfigured =
        new("sso_not_configured", "Single sign-on isn't set up for that email's domain.", StatusCodes.Status404NotFound);

    internal static readonly ExternalLoginError FlowExpired =
        new("flow_expired", "Your sign-in attempt expired. Try again.", StatusCodes.Status400BadRequest);

    internal static readonly ExternalLoginError FlowMismatch =
        new("flow_mismatch", "That sign-in attempt doesn't match the one you started. Try again.", StatusCodes.Status400BadRequest);

    internal static readonly ExternalLoginError ProviderError =
        new("provider_error", "The sign-in provider's answer couldn't be verified. Try again.", StatusCodes.Status400BadRequest);

    internal static readonly ExternalLoginError ProviderUnreachable =
        new("provider_unreachable", "The sign-in provider couldn't be reached. Try again.", StatusCodes.Status502BadGateway);

    internal static readonly ExternalLoginError NoVerifiedEmail =
        new("no_verified_email", "That account has no verified email address.", StatusCodes.Status400BadRequest);

    internal static readonly ExternalLoginError EmailDomainNotAllowed =
        new("email_domain_not_allowed", "That account's email isn't on a domain this single sign-on covers.", StatusCodes.Status400BadRequest);

    internal static readonly ExternalLoginError AccountExists =
        new("account_exists", "An account with this email already exists. Log in with your password, then connect this sign-in method from Login & security.", StatusCodes.Status409Conflict);

    internal static readonly ExternalLoginError IdentityInUse =
        new("identity_in_use", "That account is already connected to another user.", StatusCodes.Status409Conflict);

    internal static readonly ExternalLoginError ProviderAlreadyConnected =
        new("provider_already_connected", "Your account is already connected to a different account with this provider. Disconnect it first.", StatusCodes.Status409Conflict);

    internal static readonly ExternalLoginError NotConnected =
        new("not_connected", "That sign-in method isn't connected.", StatusCodes.Status404NotFound);

    internal static readonly ExternalLoginError LastLoginMethod =
        new("last_login_method", "Connect another sign-in method before disconnecting your only one.", StatusCodes.Status409Conflict);

    internal JsonHttpResult<ApiResponse<object>> ToResult() => TypedResults.Json(ApiResponse.Fail(Message, Code), statusCode: Status);
}

// Thrown by providers and handlers; each endpoint turns it into the error envelope. Detail is for logs only.
[SuppressMessage("Sonar", "S3871", Justification = "Never leaves the module: its endpoints catch it, and only the module class is public")]
internal sealed class ExternalLoginException(ExternalLoginError error, string? detail = null, Exception? innerException = null)
    : Exception(detail ?? error.Message, innerException)
{
    public ExternalLoginError Error { get; } = error;
}
