type Me = { email?: string; id?: string } | null | undefined;
export function StatusBar({ me }: { me: Me }) {
  const rid = (window as unknown as { lastRequestId?: string | undefined }).lastRequestId;
  return (
    <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px solid #eee', fontSize: 12, color: '#555' }}>
      <span>User: {me?.email || me?.id || 'guest'}</span>
      {rid ? <span style={{ marginLeft: 12 }}>Last error id: {rid}</span> : null}
    </div>
  );
}
