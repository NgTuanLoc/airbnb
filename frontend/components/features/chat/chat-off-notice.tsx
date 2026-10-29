/** What the inbox says in mock mode: chat needs the backend's chat service. */
export function ChatOffNotice() {
  return (
    <p className="text-body-md text-body">
      Messaging needs the backend. Run the app with <code>DATA_SOURCE=api</code> (<code>aspire run</code> does) to message hosts.
    </p>
  );
}
