using Wolverine.Attributes;

namespace Airbnb.Payments.Contracts;

// Published on the "payments" fanout exchange when a payment leaves processing, by whichever path settled it: the
// charge's own answer, the provider's webhook or a refresh. camelCase JSON; the monolith keeps its own copies.
[MessageIdentity("payment-succeeded")]
public sealed record PaymentSucceeded(string BookingId);

[MessageIdentity("payment-declined")]
public sealed record PaymentDeclined(string BookingId, string? DeclineReason);
