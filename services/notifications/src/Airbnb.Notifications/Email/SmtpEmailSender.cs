using System.Data.Common;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace Airbnb.Notifications.Email;

// Sends through the "mailpit" connection (Aspire's Mailpit: "Endpoint=smtp://host:port"), one connection per email:
// emails are rare, and a fresh connection keeps a dropped SMTP server from poisoning later sends.
public sealed class SmtpEmailSender(IConfiguration configuration)
{
    private static readonly MailboxAddress From = new("Airbnb", "no-reply@airbnb.local");

    public async Task SendAsync(EmailMessage email, CancellationToken cancellationToken)
    {
        var endpoint = Endpoint();
        var message = new MimeMessage { Subject = email.Subject };
        message.From.Add(From);
        message.To.Add(new MailboxAddress(email.ToName, email.To));
        message.Body = new BodyBuilder { TextBody = email.TextBody, HtmlBody = email.HtmlBody }.ToMessageBody();

        using var client = new SmtpClient();
        await client.ConnectAsync(endpoint.Host, endpoint.Port, SecureSocketOptions.None, cancellationToken);
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(quit: true, cancellationToken);
    }

    private Uri Endpoint()
    {
        var connectionString = configuration.GetConnectionString("mailpit")
            ?? throw new InvalidOperationException("ConnectionStrings:mailpit is missing (the AppHost references Mailpit)");
        var parts = new DbConnectionStringBuilder { ConnectionString = connectionString };
        return new Uri((string)parts["Endpoint"]);
    }
}
