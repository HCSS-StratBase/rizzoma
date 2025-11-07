type Me = { email?: string; id?: string } | null | undefined;
export function StatusBar({ me }: { me: Me }) {
  const rid = (window as unknown as { lastRequestId?: string | undefined }).lastRequestId;
  const email = me?.email;
  const mid = me?.id;
  const userText = (typeof email === 'string' && email !== '')
    ? email
    : ((typeof mid === 'string' && mid !== '') ? mid : 'guest');
  return (
    <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px solid #eee', fontSize: 12, color: '#555' }}>
      <span>User: {userText}</span>
      {(rid !== undefined && rid !== '') ? <span style={{ marginLeft: 12 }}>Last error id: {rid}</span> : null}
    </div>
  );
}
