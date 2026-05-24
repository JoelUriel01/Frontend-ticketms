import { Suspense } from 'react';
import AcceptInviteClient from './AcceptInviteClient';

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0c0c0d',
        fontFamily: 'system-ui', color: '#8a8a8e'
      }}>
        <p>Cargando...</p>
      </div>
    }>
      <AcceptInviteClient />
    </Suspense>
  );
}
